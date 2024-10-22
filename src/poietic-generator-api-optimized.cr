require "kemal"
require "uuid"
require "json"

class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))
  property sub_cell_states : Hash(String, Hash(Tuple(Int32, Int32), String))
  property initial_colors : Hash(String, Array(String))

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
    @sub_cell_states = Hash(String, Hash(Tuple(Int32, Int32), String)).new
    @initial_colors = Hash(String, Array(String)).new
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
    @initial_colors[user_id] = generate_initial_colors unless @initial_colors.has_key?(user_id)
    unless @sub_cell_states.has_key?(user_id)
      @sub_cell_states[user_id] = Hash(Tuple(Int32, Int32), String).new
      400.times do |i|
        @sub_cell_states[user_id][{i % 20, i // 20}] = @initial_colors[user_id][i]
      end
    end
  end

  def get_user_position(user_id : String)
    @user_positions[user_id]
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
    @initial_colors.delete(user_id)
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

  private def next_odd(n)
    n.even? ? n + 1 : n
  end

  private def generate_initial_colors
    Array.new(400) { random_color }
  end

  private def random_color
    r = Random.rand(256)
    g = Random.rand(256)
    b = Random.rand(256)
    "rgb(#{r},#{g},#{b})"
  end
end

class Session
  INACTIVITY_TIMEOUT = 3.minutes

  property users : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property user_colors : Hash(String, String)
  property last_activity : Hash(String, Time)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @user_colors = Hash(String, String).new
    @last_activity = Hash(String, Time).new
  end

  def add_user(socket : HTTP::WebSocket) : String
    user_id = UUID.random.to_s
    @users[user_id] = socket
    @user_colors[user_id] = generate_random_color
    @last_activity[user_id] = Time.utc
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    send_initial_state(user_id)
    broadcast_new_user(user_id)
    broadcast_zoom_update
    user_id
  end

  def add_observer(socket : HTTP::WebSocket)
    observer_id = "observer_#{UUID.random}"
    @users[observer_id] = socket
    send_initial_state(observer_id)
    observer_id
  end

  def send_initial_state(user_id : String)
    initial_state = {
      type: "initial_state",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states,
      my_user_id: user_id
    }.to_json
    @users[user_id].send(initial_state)
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
      color: @user_colors[new_user_id]
    }.to_json
    broadcast(new_user_message)
  end

  def generate_random_color
    "#" + "%06x" % (Random.new.rand(0xffffff))
  end

  def calculate_grid_size
    @grid.effective_size
  end

  def remove_user(user_id : String)
    position = @grid.get_user_position(user_id)
    @grid.remove_user(user_id)
    @users.delete(user_id)
    @user_colors.delete(user_id)
    @last_activity.delete(user_id)
    broadcast_user_left(user_id, position)
    broadcast_zoom_update
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }.to_json
    broadcast(zoom_update_message)
  end

  def broadcast_user_left(user_id : String, position : Tuple(Int32, Int32))
    message = {
      type: "user_left",
      user_id: user_id,
      position: position
    }.to_json
    broadcast(message)
  end

  def broadcast(message)
    @users.each do |user_id, socket|
      socket.send(message)
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
      color: color
    }.to_json
    broadcast(update_message)
  end

  def broadcast(message)
    @users.each do |_, socket|
      socket.send(message)
    end
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
      color: @user_colors[new_user_id]
    }.to_json
    broadcast(new_user_message)
    send_to_observers(new_user_message)
  end

  def broadcast_user_left(user_id : String)
    user_left_message = {
      type: "user_left",
      user_id: user_id,
      grid_state: @grid.to_json
    }.to_json
    broadcast(user_left_message)
    send_to_observers(user_left_message)
  end

  def serialize_sub_cell_states
    @grid.sub_cell_states.transform_values do |user_sub_cells|
      user_sub_cells.transform_keys do |key|
        "#{key[0]},#{key[1]}"
      end
    end
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }.to_json
    broadcast(zoom_update_message)
    send_to_observers(zoom_update_message)
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
end

module PoieticGenerator
  @@current_session = Session.new

  def self.current_session
    @@current_session
  end
end

get "/" do |env|
  send_file env, "public/optimized/index.html"
end

get "/full" do |env|
  send_file env, "public/optimized/full.html"
end

get "/monitoring" do |env|
  send_file env, "public/optimized/monitoring.html"
end

get "/viewer" do |env|
  send_file env, "public/optimized/viewer.html"
end

get "/optimized/js/:file" do |env|
  file = env.params.url["file"]
  send_file env, "public/optimized/js/#{file}", "application/javascript"
end

get "/optimized/css/:file" do |env|
  file = env.params.url["file"]
  send_file env, "public/optimized/css/#{file}", "text/css"
end

ws "/updates" do |socket, context|
  mode = context.request.query_params["mode"]?
  is_observer = mode == "full" || mode == "monitoring"

  user_id = if is_observer
    PoieticGenerator.current_session.add_observer(socket)
  else
    PoieticGenerator.current_session.add_user(socket)
  end

  socket.on_message do |message|
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
  end

  socket.on_close do
    PoieticGenerator.current_session.remove_user(user_id) unless is_observer
  end
end

# Ajoutez cette tâche périodique pour vérifier l'inactivité
spawn do
  loop do
    sleep 30.seconds
    PoieticGenerator.current_session.check_inactivity
  end
end

Kemal.config.port = 3001
Kemal.run do |config|
  server = config.server.not_nil!
  server.bind_tcp "0.0.0.0", 3001
end
