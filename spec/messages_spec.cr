require "spec"
require "../src/models/messages"

describe PoieticGenerator::Messages do
  it "serializes and deserializes ConnectionMessage correctly" do
    payload = PoieticGenerator::Messages::ConnectionPayload.new("user1", "Alice")
    message = PoieticGenerator::Messages::ConnectionMessage.new(payload)
    json = message.to_json

    parsed_message = PoieticGenerator::Messages::Message.from_json(json)
    parsed_message.should be_a(PoieticGenerator::Messages::ConnectionMessage)
    if parsed_message.is_a?(PoieticGenerator::Messages::ConnectionMessage)
      parsed_message.payload.user_id.should eq "user1"
      parsed_message.payload.username.should eq "Alice"
    end
  end

  it "serializes and deserializes GridUpdateMessage correctly" do
    payload = PoieticGenerator::Messages::GridUpdatePayload.new("user1", 5, 10, "#FF0000")
    message = PoieticGenerator::Messages::GridUpdateMessage.new(payload)
    json = message.to_json

    parsed_message = PoieticGenerator::Messages::Message.from_json(json)
    parsed_message.should be_a(PoieticGenerator::Messages::GridUpdateMessage)
    if parsed_message.is_a?(PoieticGenerator::Messages::GridUpdateMessage)
      parsed_message.payload.user_id.should eq "user1"
      parsed_message.payload.x.should eq 5
      parsed_message.payload.y.should eq 10
      parsed_message.payload.color.should eq "#FF0000"
    end
  end

  it "serializes and deserializes ChatMessage correctly" do
    payload = PoieticGenerator::Messages::ChatPayload.new("user1", "Hello, world!")
    message = PoieticGenerator::Messages::ChatMessage.new(payload)
    json = message.to_json

    parsed_message = PoieticGenerator::Messages::Message.from_json(json)
    parsed_message.should be_a(PoieticGenerator::Messages::ChatMessage)
    if parsed_message.is_a?(PoieticGenerator::Messages::ChatMessage)
      parsed_message.payload.user_id.should eq "user1"
      parsed_message.payload.message.should eq "Hello, world!"
    end
  end

  it "raises an error for unknown message types" do
    invalid_json = {type: "UnknownType", payload: {} of String => String}.to_json
    expect_raises(JSON::ParseException) do
      PoieticGenerator::Messages::Message.from_json(invalid_json)
    end
  end
end
