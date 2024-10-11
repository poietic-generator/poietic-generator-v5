require "kemal"
require "db"
require "pg"
require "json"
require "yaml"
require "uuid"
require "./models/user"
require "./models/messages"
require "./models/grid"

puts "Starting application..."

module PoieticGenerator
  class Session
    property id : String
    property start_time : Time
    property grid : Grid
    property users : Hash(String, HTTP::WebSocket)
    property zoom_level : Int32
    property center : Tuple(Int32, Int32)
    property user_colors : Hash(String, String)

    ZOOM_THRESHOLDS = [1, 9, 25, 49, 81]

    def initialize
      @id = Time.utc.to_s("%Y%m%d%H%M%S")
      @start_time = Time.utc
      @grid = Grid.new
      @users = {} of String => HTTP::WebSocket
      @zoom_level = 0
      @center = {0, 0}
      @user_colors = {} of String => String
    end

    def add_user(socket : HTTP::WebSocket) : String
      user_id = UUID.random.to_s
      position = calculate_next_position
      @users[user_id] = socket
      @user_colors[user_id] = generate_random_color
      @grid.set_user_position(user_id, position)
      update_zoom_and_center
      user_id
    end

    def remove_user(user_id : String)
      if @grid.remove_user(user_id)
        @users.delete(user_id)
        @user_colors.delete(user_id)
        update_zoom_and_center
      end
    end

    def update_zoom_and_center
      @zoom_level = calculate_zoom_level
      @center = calculate_center
    end

    def get_user_position(user_id : String) : Tuple(Int32, Int32)?
      @grid.get_user_position(user_id)
    end

    def broadcast(message : String, exclude : Array(HTTP::WebSocket) = [] of HTTP::WebSocket)
      @users.each_value do |client_socket|
        client_socket.send(message) unless exclude.includes?(client_socket)
      end
    end

    private def calculate_next_position : Tuple(Int32, Int32)
      Grid.spiral_position(@users.size, 0, 0)
    end

    private def calculate_zoom_level : Int32
      zoom = 0
      while zoom < ZOOM_THRESHOLDS.size - 1 && @users.size > ZOOM_THRESHOLDS[zoom]
        zoom += 1
      end
      zoom
    end

    private def calculate_center : Tuple(Int32, Int32)
      {0, 0}  # Pour l'instant, on garde le centre fixe
    end

    private def generate_random_color : String
      "#" + (0...6).map { rand(16).to_s(16) }.join
    end

    def self.calculate_zoom_threshold(index : Int32) : Int32
      ZOOM_THRESHOLDS[index]? || ((Math.sqrt(calculate_zoom_threshold(index - 1)) + 2) ** 2).to_i
    end
  end

  class_property current_session : Session = Session.new

  def self.reset_session
    @@current_session = Session.new
  end
end

# Database configuration
def init_database
  puts "Initializing database connection..."
  config = YAML.parse(File.read("config/database.yml"))
  username = config["development"]["username"].as_s
  password = config["development"]["password"].as_s
  host = config["development"]["host"].as_s
  database = config["development"]["database"].as_s
  DB.open("postgres://#{username}:#{password}@#{host}/#{database}")
end

DATABASE = init_database()
puts "Database connection established."

# Middleware for JSON parsing
before_all do |env|
  if env.request.body
    env.set "body", env.request.body.not_nil!.gets_to_end
  end
end

# User routes
get "/api/users" do |env|
  puts "GET /api/users called"
  users = User.all(DATABASE)
  env.response.content_type = "application/json"
  users.map { |user| {id: user.id, username: user.username} }.to_json
end

post "/api/users" do |env|
  puts "POST /api/users called"
  body = env.get("body").as(String)
  payload = JSON.parse(body)
  username = payload["username"].as_s
  password = payload["password"].as_s
  puts "Attempting to create user: #{username}"
  user, error = User.create(DATABASE, username, password)
  if user
    env.response.status_code = 201
    env.response.content_type = "application/json"
    {id: user.id, username: user.username}.to_json
  else
    env.response.status_code = 422
    {error: error || "Could not create user"}.to_json
  end
end

get "/api/users/:id" do |env|
  puts "GET /api/users/:id called"
  id = env.params.url["id"].to_i64
  user = User.find_by_id(DATABASE, id)
  if user
    env.response.content_type = "application/json"
    {id: user.id, username: user.username}.to_json
  else
    env.response.status_code = 404
    {error: "User not found"}.to_json
  end
end

put "/api/users/:id" do |env|
  puts "PUT /api/users/:id called"
  id = env.params.url["id"].to_i64
  body = env.get("body").as(String)
  payload = JSON.parse(body)
  username = payload["username"].as_s
  password = payload["password"].as_s
  user, error = User.update(DATABASE, id, username, password)
  if user
    env.response.content_type = "application/json"
    {id: user.id, username: user.username}.to_json
  else
    env.response.status_code = 422
    {error: error || "Could not update user"}.to_json
  end
end

delete "/api/users/:id" do |env|
  puts "DELETE /api/users/:id called"
  id = env.params.url["id"].to_i64
  success, error = User.delete(DATABASE, id)
  if success
    env.response.status_code = 204
  else
    env.response.status_code = 422
    {error: error || "Could not delete user"}.to_json
  end
end

post "/api/login" do |env|
  puts "POST /api/login called"
  body = env.get("body").as(String)
  payload = JSON.parse(body)
  username = payload["username"].as_s
  password = payload["password"].as_s
  user, error = User.authenticate(DATABASE, username, password)
  if user
    env.response.content_type = "application/json"
    {id: user.id, username: user.username}.to_json
  else
    env.response.status_code = 401
    {error: error || "Authentication failed"}.to_json
  end
end

# WebSocket route
ws "/updates" do |socket|
  user_id = PoieticGenerator.current_session.add_user(socket)
  user_position = PoieticGenerator.current_session.get_user_position(user_id)
  user_color = PoieticGenerator.current_session.user_colors[user_id]
  puts "New WebSocket connection established for user #{user_id}"

  # Envoyer l'état initial au nouvel utilisateur
  initial_state = {
    type: "initial_state",
    zoom_level: PoieticGenerator.current_session.zoom_level,
    grid_state: PoieticGenerator.current_session.grid.to_json,
    user_colors: PoieticGenerator.current_session.user_colors
  }
  socket.send(initial_state.to_json)

  # Informer tous les autres utilisateurs du nouvel arrivant
  new_user_message = {
    type: "new_user",
    user_id: user_id,
    position: user_position,
    color: user_color
  }
  PoieticGenerator.current_session.broadcast(new_user_message.to_json, exclude: [socket])

  welcome_message = PoieticGenerator::Messages::ChatMessage.new(
    PoieticGenerator::Messages::ChatPayload.new("server", "Welcome to the Poietic Generator! Session: #{PoieticGenerator.current_session.id}")
  )
  socket.send(welcome_message.to_json)

  socket.on_message do |message|
    puts "Received message: #{message}"
    
    begin
      parsed_message = PoieticGenerator::Messages::Message.from_json(message)
      
      case parsed_message
      when PoieticGenerator::Messages::GridUpdateMessage
        payload = parsed_message.payload
        if PoieticGenerator.current_session.grid.is_user_position?(user_id, payload.x, payload.y)
          puts "Grid updated at (#{payload.x}, #{payload.y}) with color #{payload.color}"
          PoieticGenerator.current_session.grid.update(payload.x, payload.y, payload.color, user_id)
          
          # Broadcast the update to all users
          update_message = {
            type: "grid_update",
            payload: {
              user_id: payload.user_id,
              x: payload.x,
              y: payload.y,
              color: payload.color
            }
          }
          PoieticGenerator.current_session.broadcast(update_message.to_json)
        else
          puts "Invalid update attempt by user #{user_id} at position (#{payload.x}, #{payload.y})"
        end
      when PoieticGenerator::Messages::ChatMessage
        puts "Chat message from #{parsed_message.payload.user_id}: #{parsed_message.payload.message}"
        # Broadcast chat message to all users
        PoieticGenerator.current_session.broadcast(message)
      else
        puts "Received message of type: #{parsed_message.type}"
      end
    rescue ex
      puts "Error parsing message: #{ex.message}"
      error_message = PoieticGenerator::Messages::ErrorMessage.new(
        PoieticGenerator::Messages::ErrorPayload.new(400, "Invalid message format")
      )
      socket.send(error_message.to_json)
    end
  end

  socket.on_close do
    puts "WebSocket connection closed for user #{user_id}"
    PoieticGenerator.current_session.remove_user(user_id)
    
    # Informer tous les autres utilisateurs du départ
    user_left_message = {
      type: "user_left",
      user_id: user_id
    }
    PoieticGenerator.current_session.broadcast(user_left_message.to_json)

    if PoieticGenerator.current_session.users.empty?
      puts "All users disconnected. Starting a new session."
      PoieticGenerator.reset_session
    end
  end
end

# Add a new route to get the current grid state
get "/grid" do |env|
  env.response.content_type = "application/json"
  PoieticGenerator.current_session.grid.to_json
end

# Configurer Kemal pour servir les fichiers statiques du dossier public
public_folder "#{__DIR__}/../public"

# Rediriger la racine vers index.html
get "/" do |env|
  env.response.content_type = "text/html"
  send_file env, "public/index.html"
end

puts "Routes defined. Starting server..."

Kemal.run do |config|
  server = config.server.not_nil!
  server.bind_tcp "0.0.0.0", 3000, reuse_port: true
end

puts "Server should be running now..."
