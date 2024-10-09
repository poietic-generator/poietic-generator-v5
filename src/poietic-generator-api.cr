require "kemal"
require "db"
require "pg"
require "json"
require "yaml"
require "./models/user"

puts "Starting application..."

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

puts "Routes defined. Starting server..."

# Run Kemal
Kemal.run do |config|
  server = config.server.not_nil!
  server.bind_tcp "0.0.0.0", 3000, reuse_port: true
end

puts "Server should be running now..."
