require "json"

module PoieticGenerator
  class Grid
    class Cell
      include JSON::Serializable
      property color : String
      property last_updated_by : String

      def initialize(@color = "#FFFFFF", @last_updated_by = "")
      end
    end

    @cells : Hash(Tuple(Int32, Int32), Cell)
    @user_positions : Hash(String, Tuple(Int32, Int32))

    def initialize
      @cells = {} of Tuple(Int32, Int32) => Cell
      @user_positions = {} of String => Tuple(Int32, Int32)
    end

    def set_user_position(user_id : String, position : Tuple(Int32, Int32))
      @user_positions[user_id] = position
    end

    def get_user_position(user_id : String) : Tuple(Int32, Int32)?
      @user_positions[user_id]?
    end

    def remove_user(user_id : String) : Bool
      if position = @user_positions.delete(user_id)
        @cells.delete(position)
        true
      else
        false
      end
    end

    def update(x : Int32, y : Int32, color : String, user_id : String)
      if @user_positions[user_id]? == {x, y}
        @cells[{x, y}] = Cell.new(color, user_id)
      end
    end

    def get_cell(x : Int32, y : Int32) : Cell?
      @cells[{x, y}]?
    end

    def to_json
      @cells.to_json
    end

    def self.spiral_position(index : Int32, width : Int32, height : Int32) : Tuple(Int32, Int32)
      return {width // 2, height // 2} if index == 0

      x = y = 0
      dx = 1
      dy = 0
      segment_length = 1
      segment_passed = 0

      (0...index).each do
        x += dx
        y += dy
        segment_passed += 1
        if segment_passed == segment_length
          segment_passed = 0
          dx, dy = -dy, dx
          segment_length += 1 if dy == 0
        end
      end

      {x + width // 2, height // 2 - y}
    end
  end
end
