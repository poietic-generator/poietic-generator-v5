require "kemal"
require "uuid"
require "json"

class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
  end

  def get_user_position(user_id : String)
    @user_positions[user_id]
  end

  def to_json
    @user_positions.to_json
  end

  def remove_user(user_id : String)
    @user_positions.delete(user_id)
  end

  def find_next_available_position : Tuple(Int32, Int32)
    return {0, 0} if @user_positions.empty?
    
    spiral_positions = generate_spiral_positions(@user_positions.size + 1)
    spiral_positions.find { |pos| !@user_positions.values.includes?(pos) } || {0, 0}
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
end

class Session
  property users : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property user_colors : Hash(String, String)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @user_colors = Hash(String, String).new
  end

  def add_user(socket : HTTP::WebSocket) : String
    user_id = UUID.random.to_s
    @users[user_id] = socket
    @user_colors[user_id] = generate_random_color
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    send_initial_state(user_id)
    broadcast_new_user(user_id)
    broadcast_zoom_update
    user_id
  end

  def send_initial_state(user_id : String)
    initial_state = {
      type: "initial_state",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors
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
    max_position = @grid.user_positions.values.map { |pos| [pos[0].abs, pos[1].abs].max }.max || 0
    [3, (max_position * 2 + 1)].max
  end

  def remove_user(user_id : String)
    @grid.remove_user(user_id)
    @users.delete(user_id)
    @user_colors.delete(user_id)
    broadcast_user_left(user_id)
    broadcast_zoom_update
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors
    }.to_json
    broadcast(zoom_update_message)
  end

  def broadcast_user_left(user_id : String)
    user_left_message = {
      type: "user_left",
      user_id: user_id,
      grid_state: @grid.to_json
    }.to_json
    broadcast(user_left_message)
  end

  def broadcast(message)
    @users.each do |_, socket|
      socket.send(message)
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
  send_file env, "public/index.html"
end

ws "/updates" do |socket|
  user_id = PoieticGenerator.current_session.add_user(socket)

  socket.on_close do
    PoieticGenerator.current_session.remove_user(user_id)
  end
end

Kemal.run
