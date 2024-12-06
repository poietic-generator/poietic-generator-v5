require "kemal"
require "uuid"
require "json"
require "./poietic-recorder"

class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))
  property sub_cell_states : Hash(String, Hash(Tuple(Int32, Int32), String))

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
    @sub_cell_states = Hash(String, Hash(Tuple(Int32, Int32), String)).new
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
  end

  def get_user_position(user_id : String)
    @user_positions[user_id]?
  end

  def to_json(json : JSON::Builder)
    json.object do
      json.field "user_positions" do
        json.object do
          @user_positions.each do |user_id, position|
            json.field user_id do
              json.array do
                json.number position[0]
                json.number position[1]
              end
            end
          end
        end
      end
    end
  end

  def remove_user(user_id : String)
    @user_positions.delete(user_id)
    @sub_cell_states.delete(user_id)
  end

  def find_next_available_position : Tuple(Int32, Int32)
    return {0, 0} if @user_positions.empty?

    spiral_positions = generate_spiral_positions(@user_positions.size + 1)
    spiral_positions.find { |pos| !@user_positions.values.includes?(pos) } || {0, 0}
  end

  def update_sub_cell(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    if position = @user_positions[user_id]?
      @sub_cell_states[user_id] ||= Hash(Tuple(Int32, Int32), String).new
      @sub_cell_states[user_id][{sub_x, sub_y}] = color
    end
  end

  def get_sub_cell_states(user_id : String)
    @sub_cell_states[user_id]? || Hash(Tuple(Int32, Int32), String).new
  end

  private def generate_spiral_positions(count : Int32)
    positions = [{0, 0}]
    return positions if count == 1

    x = y = 0
    dx = 1
    dy = 0
    steps = 0
    step_size = 1

    (count - 1).times do
      x += dx
      y += dy
      positions << {x, y}
      steps += 1

      if steps == step_size
        steps = 0
        dx, dy = -dy, dx  # Rotation de 90 degrés
        step_size += 1 if dy == 0  # Augmente la taille du pas après un tour complet
      end
    end

    positions
  end

  def effective_size
    return 1 if @user_positions.empty?
    max_position = @user_positions.values.map { |pos| [pos[0].abs, pos[1].abs].max }.max
    next_odd(2 * max_position + 1)
  end

  private def next_odd(n : Int32) : Int32  # Ajout du type de retour explicite
    n.even? ? n + 1 : n
  end
end

class Session
  INACTIVITY_TIMEOUT = 3.minutes

  property users : Hash(String, HTTP::WebSocket)
  property observers : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property last_activity : Hash(String, Time)
  property recorders : Array(HTTP::WebSocket)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @observers = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @last_activity = Hash(String, Time).new
    @recorders = [] of HTTP::WebSocket
  end

  def add_user(socket : HTTP::WebSocket, forced_id : String? = nil) : String
    user_id = forced_id || UUID.random.to_s
    @users[user_id] = socket
    @last_activity[user_id] = Time.utc
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    send_initial_state(user_id)
    broadcast_new_user(user_id)
    broadcast_zoom_update
    user_id
  end

  def add_observer(socket : HTTP::WebSocket) : String
    observer_id = "observer_#{UUID.random}"
    @observers[observer_id] = socket
    send_initial_state(observer_id)
    observer_id
  end

  def remove_observer(observer_id : String)
    @observers.delete(observer_id)
    puts "=== Observer removed: #{observer_id} ==="
  end

  def send_initial_state(user_id : String)
    grid_size = calculate_grid_size
    
    # État commun pour tous les clients
    base_state = {
      type: "initial_state",
      grid_size: grid_size,
      grid_state: @grid.to_json
    }

    if user_id.starts_with?("observer_")
      @observers[user_id].send(base_state.to_json)
    else
      client_state = base_state.merge({my_user_id: user_id})
      @users[user_id].send(client_state.to_json)
      
      # Enregistrement pour le recorder
      recorder_state = {
        type: "initial_state",
        timestamp: Time.utc.to_unix_ms,
        grid_size: grid_size,
        user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] }
      }
      
      API.recorder.record_event(JSON.parse(recorder_state.to_json))
    end
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
    }.to_json
    broadcast(new_user_message)
  end

  def generate_random_color
    "#" + "%06x" % (Random.new.rand(0xffffff))
  end

  def calculate_grid_size
    @grid.effective_size
  end

  def broadcast_initial_state(user)
    puts "=== Envoi de l'état initial ==="
    state = {
      type: "initial_state",
      timestamp: Time.utc.to_unix_ms,  # Ajout du timestamp ici
      grid_size: calculate_grid_size,
      user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] },
    }
    puts "=== État initial: #{state.inspect} ==="
    broadcast(state.to_json)
  end

  def remove_user(user_id : String)
    if position = @grid.get_user_position(user_id)
      # Enregistrer d'abord la déconnexion
      API.recorder.record_user_left(user_id)
      
      # Envoyer la notification avant de supprimer l'utilisateur
      broadcast_user_left(user_id, position)
      
      # Puis effectuer les modifications d'état
      @grid.remove_user(user_id)
      @users.delete(user_id)
      @last_activity.delete(user_id)
      
      # Mettre à jour le zoom après les modifications
      broadcast_zoom_update
      
      # Vérifier si c'était le dernier utilisateur
      if @users.empty?
        puts "=== Dernier utilisateur déconnecté, fin de la session ==="
        API.recorder.end_current_session
      end
    end
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      timestamp: Time.utc.to_unix_ms,
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
    }
    
    # Enregistrer explicitement dans le recorder
    API.recorder.record_event(JSON.parse(zoom_update_message.to_json))
    broadcast(zoom_update_message.to_json)
    send_to_observers(zoom_update_message.to_json)
  end

  def broadcast_user_left(user_id : String, position : Tuple(Int32, Int32))
    message = {
      type: "user_left",
      user_id: user_id,
      position: position,
      timestamp: Time.utc.to_unix_ms
    }.to_json
    
    # S'assurer que le message est envoyé à tous (utilisateurs et observateurs)
    broadcast(message)
  end

  def broadcast(message)
    # Broadcast aux utilisateurs réguliers
    @users.each do |user_id, socket|
      begin
        socket.send(message)
      rescue ex
        puts "Error sending to user #{user_id}: #{ex.message}"
      end
    end

    # Broadcast aux observateurs (maintenant sans risque de déconnexion)
    @observers.each do |observer_id, socket|
      begin
        socket.send(message)
      rescue ex
        puts "Error sending to observer #{observer_id}: #{ex.message}"
      end
    end
  end

  def send_to_observers(message)
    @users.each do |user_id, socket|
      if user_id.starts_with?("observer_")
        socket.send(message)
      end
    end
  end

  # Modifiez ces méthodes pour envoyer les mises à jour aux observateurs
  def handle_cell_update(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    @grid.update_sub_cell(user_id, sub_x, sub_y, color)
    update_message = {
      type: "cell_update",
      user_id: user_id,
      sub_x: sub_x,
      sub_y: sub_y,
      color: color,
      timestamp: Time.utc.to_unix_ms
    }.to_json
    broadcast(update_message)
    # Enregistrer l'événement dans le recorder
    API.recorder.record_event(JSON.parse(update_message))
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
    }.to_json
    broadcast(new_user_message)
    send_to_observers(new_user_message)
  end

  def broadcast_user_left(user_id : String)
    begin
      @users.each do |id, socket|
        next if socket.closed?  # Vérifier si le socket est fermé
        socket.send({
          type: "user_left",
          user_id: user_id
        }.to_json)
      end
    rescue ex
      puts "Erreur lors de la diffusion du départ d'un utilisateur: #{ex.message}"
    end
  end

  def update_user_activity(user_id : String)
    @last_activity[user_id] = Time.utc
  end

  def check_inactivity
    now = Time.utc
    @last_activity.each do |user_id, last_active|
      if now - last_active > INACTIVITY_TIMEOUT
        remove_user(user_id)
      end
    end
  end

  private def broadcast_to_recorders(message : String)
    @recorders.each do |recorder|
      begin
        recorder.send(message)
      rescue ex
        puts "Erreur d'envoi au recorder: #{ex.message}"
        @recorders.delete(recorder)
      end
    end
  end
end

module PoieticGenerator
  @@current_session = Session.new

  def self.current_session
    @@current_session
  end
end

# Au début du fichier, après les requires
class PoieticGeneratorApi
  property sockets : Array(HTTP::WebSocket)
  property observers : Array(HTTP::WebSocket)
  property recorders : Array(HTTP::WebSocket)
  property recorder : PoieticRecorder
  property grid : Grid
  property last_activity : Hash(String, Time)
  
  def initialize
    @sockets = [] of HTTP::WebSocket
    @observers = [] of HTTP::WebSocket
    @recorders = [] of HTTP::WebSocket
    @recorder = PoieticRecorder.new
    @grid = Grid.new
    @last_activity = Hash(String, Time).new
  end

  def calculate_grid_size
    Math.sqrt(@sockets.size).ceil.to_i
  end

  def broadcast(message : String)
    @sockets.each do |socket|
      begin
        socket.send(message)
      rescue ex
        puts "Erreur d'envoi: #{ex.message}"
        @sockets.delete(socket)
      end
    end
  end

  private def broadcast_to_recorders(message : String)
    @recorders.each do |recorder|
      begin
        recorder.send(message)
      rescue ex
        puts "Erreur d'envoi au recorder: #{ex.message}"
        @recorders.delete(recorder)
      end
    end
  end
end

# Créer l'instance de l'API
API = PoieticGeneratorApi.new

# Ajouter avant les routes
before_all do |env|
  env.response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  env.response.headers["Pragma"] = "no-cache"
  env.response.headers["Expires"] = "0"
  env.response.headers["Last-Modified"] = Time.utc.to_rfc2822
  env.response.headers["ETag"] = Random.new.hex(8)
  env.response.headers["Vary"] = "*"
end

get "/css/:file" do |env|
  file = env.params.url["file"]
  env.response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  env.response.headers["Pragma"] = "no-cache"
  env.response.headers["Expires"] = "0"
  env.response.headers["Content-Type"] = "text/css"
  send_file env, "public/css/#{file}"
end

# Route générique pour tous les fichiers JavaScript
get "/js/:file" do |env|
  file = env.params.url["file"]
  env.response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  env.response.headers["Pragma"] = "no-cache"
  env.response.headers["Expires"] = "0"
  env.response.headers["Content-Type"] = "application/javascript"
  send_file env, "public/js/#{file}"
end

# Route pour les fichiers JS des bots
get "/js/bots/:file" do |env|
  file = env.params.url["file"]
  env.response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
  env.response.headers["Pragma"] = "no-cache"
  env.response.headers["Expires"] = "0"
  env.response.headers["Content-Type"] = "application/javascript"
  send_file env, "public/js/bots/#{file}"
end

get "/" do |env|
  send_file env, "public/index.html"
end

get "/monitoring" do |env|
  send_file env, "public/monitoring.html"
end

get "/viewer" do |env|
  send_file env, "public/viewer.html"
end

get "/addbot" do |env|
  send_file env, "public/addbot.html"
end

get "/bot" do |env|
  send_file env, "public/bot.html"
end

get "/images/:file" do |env|
  file = env.params.url["file"]
  send_file env, "public/images/#{file}"
end

ws "/updates" do |socket, context|
  puts "=== Nouvelle connexion WebSocket sur /updates ==="
  
  mode = context.request.query_params["mode"]?
  connection_type = context.request.query_params["type"]?
  is_observer = mode == "full" && connection_type == "observer"

  user_id = if is_observer
    puts "=== Adding observer with mode: #{mode} ==="
    observer_id = PoieticGenerator.current_session.add_observer(socket)
    puts "=== Observer added with ID: #{observer_id} ==="
    observer_id
  else
    puts "=== Adding regular user ==="
    # Démarrer une nouvelle session si c'est le premier utilisateur régulier
    if PoieticGenerator.current_session.users.empty?
      puts "=== Premier utilisateur connecté, démarrage d'une nouvelle session ==="
      API.recorder.start_new_session
    end
    PoieticGenerator.current_session.add_user(socket)
  end

  socket.on_message do |message|
    begin
      parsed_message = JSON.parse(message)
      if parsed_message["type"] == "cell_update" && !is_observer
        PoieticGenerator.current_session.update_user_activity(user_id)
        PoieticGenerator.current_session.handle_cell_update(
          user_id,
          parsed_message["sub_x"].as_i,
          parsed_message["sub_y"].as_i,
          parsed_message["color"].as_s
        )
      elsif parsed_message["type"] == "heartbeat"
        PoieticGenerator.current_session.update_user_activity(user_id)
      end
    rescue ex
      puts "Error processing message: #{ex.message}"
    end
  end

  socket.on_close do
    puts "=== Socket closed for #{user_id} ==="
    if is_observer
      PoieticGenerator.current_session.remove_observer(user_id)
    else
      PoieticGenerator.current_session.remove_user(user_id)
      # Vérifier si c'était le dernier utilisateur régulier
      if PoieticGenerator.current_session.users.empty?
        puts "=== Dernier utilisateur déconnecté, fin de la session ==="
        API.recorder.end_current_session
      end
    end
  end
end

# Ajoutez cette tâche périodique pour vérifier l'inactivité
spawn do
  loop do
    sleep 30.seconds
    PoieticGenerator.current_session.check_inactivity
  end
end

ws "/record" do |socket, context|
  puts "=== Nouvelle connexion WebSocket sur /record ==="
  
  token = context.ws_route_lookup.params["token"]?
  unless token == "secret_token_123"
    socket.close
    next
  end
  
  API.sockets << socket
  if API.sockets.size == 1
    puts "=== Premier utilisateur connecté, démarrage d'une nouvelle session ==="
    API.recorder.start_new_session
  end
  
  API.recorders << socket
  puts "=== Recorder authentifié et connecté (total users: #{API.sockets.size}) ==="
  
  socket.on_close do
    API.sockets.delete(socket)
    API.recorders.delete(socket)
    
    if API.sockets.empty?
      puts "=== Dernier utilisateur déconnecté, fin de la session ==="
      API.recorder.end_current_session
    end
    puts "=== Socket closed (remaining users: #{API.sockets.size}) ==="
  end
end

# Routes du recorder
get "/api/stats" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_stats.to_json
end

get "/api/sessions" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_sessions.to_json
end

get "/api/events/recent" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_recent_events.to_json
end

get "/api/sessions/:id/events" do |env|
  session_id = env.params.url["id"]
  env.response.content_type = "application/json"
  API.recorder.get_session_events(session_id).to_json
end

get "/api/current-session" do |env|
  env.response.content_type = "application/json"
  if current = API.recorder.get_current_session
    current.to_json
  else
    "{}"
  end
end

# Configuration du port
port = if ARGV.includes?("--port")
  port_index = ARGV.index("--port")
  if port_index && (port_index + 1) < ARGV.size
    ARGV[port_index + 1].to_i
  else
    3001
  end
else
  3001
end

Kemal.config.port = port
puts "=== Démarrage du serveur principal sur le port #{port} ==="

# Démarrer le serveur
Kemal.run