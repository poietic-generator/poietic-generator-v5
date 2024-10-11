require "json"

module PoieticGenerator
  module Messages
    enum MessageType
      Connection
      Disconnection
      GridUpdate
      CursorUpdate
      ChatMessage
      Error
    end

    abstract class Message
      include JSON::Serializable
      
      property type : MessageType

      def initialize(@type)
      end

      abstract def payload : JSON::Serializable

      def to_json(json : JSON::Builder)
        json.object do
          json.field "type", @type
          json.field "payload", payload
        end
      end

      def self.from_json(json : String)
        parsed = JSON.parse(json)
        type = MessageType.parse?(parsed["type"].as_s)
        payload = parsed["payload"]

        raise JSON::ParseException.new("Unknown message type: #{parsed["type"]}", 0, 0) if type.nil?

        case type
        when .connection?
          ConnectionMessage.new(ConnectionPayload.from_json(payload.to_json))
        when .disconnection?
          DisconnectionMessage.new(DisconnectionPayload.from_json(payload.to_json))
        when .grid_update?
          GridUpdateMessage.new(GridUpdatePayload.from_json(payload.to_json))
        when .cursor_update?
          CursorUpdateMessage.new(CursorUpdatePayload.from_json(payload.to_json))
        when .chat_message?
          ChatMessage.new(ChatPayload.from_json(payload.to_json))
        when .error?
          ErrorMessage.new(ErrorPayload.from_json(payload.to_json))
        else
          raise JSON::ParseException.new("Unknown message type: #{type}", 0, 0)
        end
      end
    end

    class ConnectionMessage < Message
      @payload : ConnectionPayload

      def initialize(@payload : ConnectionPayload)
        super(MessageType::Connection)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class DisconnectionMessage < Message
      @payload : DisconnectionPayload

      def initialize(@payload : DisconnectionPayload)
        super(MessageType::Disconnection)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class GridUpdateMessage < Message
      @payload : GridUpdatePayload

      def initialize(@payload : GridUpdatePayload)
        super(MessageType::GridUpdate)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class CursorUpdateMessage < Message
      @payload : CursorUpdatePayload

      def initialize(@payload : CursorUpdatePayload)
        super(MessageType::CursorUpdate)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class ChatMessage < Message
      @payload : ChatPayload

      def initialize(@payload : ChatPayload)
        super(MessageType::ChatMessage)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class ErrorMessage < Message
      @payload : ErrorPayload

      def initialize(@payload : ErrorPayload)
        super(MessageType::Error)
      end

      def payload : JSON::Serializable
        @payload
      end
    end

    class ConnectionPayload
      include JSON::Serializable

      property user_id : String
      property username : String

      def initialize(@user_id, @username)
      end
    end

    class DisconnectionPayload
      include JSON::Serializable

      property user_id : String

      def initialize(@user_id)
      end
    end

    class GridUpdatePayload
      include JSON::Serializable

      property user_id : String
      property x : Int32
      property y : Int32
      property color : String

      def initialize(@user_id, @x, @y, @color)
      end
    end

    class CursorUpdatePayload
      include JSON::Serializable

      property user_id : String
      property x : Int32
      property y : Int32

      def initialize(@user_id, @x, @y)
      end
    end

    class ChatPayload
      include JSON::Serializable

      property user_id : String
      property message : String

      def initialize(@user_id, @message)
      end
    end

    class ErrorPayload
      include JSON::Serializable

      property code : Int32
      property message : String

      def initialize(@code, @message)
      end
    end
  end
end
