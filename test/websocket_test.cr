require "http/web_socket"
require "../src/models/messages"

def create_websocket_client(name)
  puts "Creating WebSocket client #{name}..."
  ws = HTTP::WebSocket.new("ws://localhost:3000/updates")
  puts "WebSocket client #{name} created successfully"
  ws
end

client1 = create_websocket_client("Client 1")
client2 = create_websocket_client("Client 2")

spawn do
  client1.on_message do |message|
    puts "Client 1 received: #{message}"
    parsed_message = PoieticGenerator::Messages::Message.from_json(message)
    puts "Parsed message type: #{parsed_message.type}"
  end
  client1.run
end

spawn do
  client2.on_message do |message|
    puts "Client 2 received: #{message}"
    parsed_message = PoieticGenerator::Messages::Message.from_json(message)
    puts "Parsed message type: #{parsed_message.type}"
  end
  client2.run
end

sleep 2.seconds

# Test CONNECTION message
connection_message = PoieticGenerator::Messages::ConnectionMessage.new(
  PoieticGenerator::Messages::ConnectionPayload.new("user1", "Alice")
)
puts "Sending CONNECTION message from Client 1..."
client1.send(connection_message.to_json)

sleep 1.second

# Test GRID_UPDATE message
grid_update_message = PoieticGenerator::Messages::GridUpdateMessage.new(
  PoieticGenerator::Messages::GridUpdatePayload.new("user1", 10, 20, "#FF0000")
)
puts "Sending GRID_UPDATE message from Client 1..."
client1.send(grid_update_message.to_json)

sleep 1.second

# Test CHAT_MESSAGE
chat_message = PoieticGenerator::Messages::ChatMessage.new(
  PoieticGenerator::Messages::ChatPayload.new("user1", "Hello, everyone!")
)
puts "Sending CHAT_MESSAGE from Client 1..."
client1.send(chat_message.to_json)

sleep 5.seconds

puts "Closing connections..."
client1.close
client2.close

puts "Test completed."
