require "db"
require "crypto/bcrypt/password"

class User
  property id : Int64?
  property username : String
  property password_hash : String

  def initialize(@username : String, password : String)
    @password_hash = Crypto::Bcrypt::Password.create(password).to_s
  end

  def self.create(db : DB::Database, username : String, password : String) : {User?, String?}
    user = User.new(username, password)
    begin
      result = db.exec "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id", 
              user.username, user.password_hash
      if result.rows_affected > 0
        user.id = result.last_insert_id
        {user, nil}
      else
        {nil, "No rows affected when inserting user"}
      end
    rescue ex : DB::Error
      if ex.message.to_s.includes?("unique constraint")
        {nil, "Username already exists"}
      else
        {nil, "Database error: #{ex.message}"}
      end
    rescue ex
      {nil, "Unexpected error: #{ex.message}"}
    end
  end

  def self.all(db : DB::Database) : Array(User)
    users = [] of User
    db.query "SELECT id, username, password_hash FROM users" do |rs|
      rs.each do
        id = rs.read(Int64)
        username = rs.read(String)
        password_hash = rs.read(String)
        user = User.new(username, "")
        user.id = id
        user.password_hash = password_hash
        users << user
      end
    end
    users
  end

  def self.find_by_id(db : DB::Database, id : Int64) : User?
    db.query_one? "SELECT id, username, password_hash FROM users WHERE id = $1", id do |rs|
      id = rs.read(Int64)
      username = rs.read(String)
      password_hash = rs.read(String)
      user = User.new(username, "")
      user.id = id
      user.password_hash = password_hash
      user
    end
  end

  def self.find_by_username(db : DB::Database, username : String) : User?
    db.query_one? "SELECT id, username, password_hash FROM users WHERE username = $1", username do |rs|
      id = rs.read(Int64)
      username = rs.read(String)
      password_hash = rs.read(String)
      user = User.new(username, "")
      user.id = id
      user.password_hash = password_hash
      user
    end
  end

  def self.update(db : DB::Database, id : Int64, username : String, password : String) : {User?, String?}
    user = find_by_id(db, id)
    return {nil, "User not found"} unless user

    new_password_hash = Crypto::Bcrypt::Password.create(password).to_s
    begin
      db.exec "UPDATE users SET username = $1, password_hash = $2 WHERE id = $3", 
              username, new_password_hash, id
      user.username = username
      user.password_hash = new_password_hash
      {user, nil}
    rescue ex : DB::Error
      if ex.message.to_s.includes?("unique constraint")
        {nil, "Username already exists"}
      else
        {nil, "Database error: #{ex.message}"}
      end
    rescue ex
      {nil, "Unexpected error: #{ex.message}"}
    end
  end

  def self.delete(db : DB::Database, id : Int64) : {Bool, String?}
    begin
      result = db.exec "DELETE FROM users WHERE id = $1", id
      if result.rows_affected > 0
        {true, nil}
      else
        {false, "User not found"}
      end
    rescue ex
      {false, "Error deleting user: #{ex.message}"}
    end
  end

  def self.authenticate(db : DB::Database, username : String, password : String) : {User?, String?}
    user = find_by_username(db, username)
    return {nil, "User not found"} unless user

    if Crypto::Bcrypt::Password.new(user.password_hash).verify(password)
      {user, nil}
    else
      {nil, "Invalid password"}
    end
  end
end
