require "kemal"
require "uuid"
require "json"
require "../poietic-recorder"
require "../file_storage"
require "../grid"
require "../session"

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
  property user_colors : Hash(String, Array(String))
  property last_activity : Hash(String, Time)

  def initialize
    @sockets = [] of HTTP::WebSocket
    @observers = [] of HTTP::WebSocket
    @recorders = [] of HTTP::WebSocket
    @recorder = PoieticRecorder.new
    @grid = Grid.new
    @user_colors = Hash(String, Array(String)).new
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

# Headers communs pour toutes les routes
before_all do |env|
  env.response.headers.merge!({
    "Cache-Control" => "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma" => "no-cache",
    "Expires" => "0",
    "Last-Modified" => Time.utc.to_rfc2822,
    "ETag" => Random.new.hex(8),
    "Vary" => "*"
  })
end

["", "monitoring", "viewer", "bot", "addbot"].each do |page|
  get "/#{page}" do |env|
    env.response.headers["Content-Type"] = "text/html"
    file = FileStorage.get("#{page.empty? ? "index" : page}.html")
    file.gets_to_end
  end
end

# Route générique pour CSS
get "/css/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "text/css"
  file = FileStorage.get("css/#{file}")
  file.gets_to_end
end

# Route générique pour JavaScript
get "/js/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "application/javascript"
  file = FileStorage.get("js/#{file}")
  file.gets_to_end
end

# Route pour les bots JavaScript
get "/js/bots/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "application/javascript"
  file = FileStorage.get("js/bots/#{file}")
  file.gets_to_end
end

# Redirection des anciennes routes bot vers les nouvelles
get "/bot/css/:file" do |env|
  env.redirect "/css/#{env.params.url["file"]}"
end

get "/bot/js/bots/:file" do |env|
  env.redirect "/js/bots/#{env.params.url["file"]}"
end

# Route pour les images
get "/images/:file" do |env|
  file = env.params.url["file"]
  env.response.headers["Content-Type"] = MIME.from_filename(file)
  file = FileStorage.get("images/#{file}")
  file.gets_to_end
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

# Configuration de Kemal avec les valeurs par défaut
Kemal.config.port = port
Kemal.config.env = "development"  # Forcer le mode développement pour l'instant
Kemal.config.host_binding = "0.0.0.0"  # Écouter sur toutes les interfaces

puts "=== Configuration du serveur principal ==="
puts "  Port: #{port}"
puts "  Environment: #{Kemal.config.env}"
puts "  Host: #{Kemal.config.host_binding}"
puts "  Logging: enabled"

# Activer les logs pour le débogage
logging true

# Garder toutes les routes et configurations existantes
serve_static false
Kemal.run
