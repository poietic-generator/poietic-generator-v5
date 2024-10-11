require "json"

module PoieticGenerator
  class Grid
    GRID_SIZE = 40  # Définissez la taille de la grille selon vos besoins

    class Cell
      include JSON::Serializable
      property color : String
      property last_updated_by : String

      def initialize(@color = "#FFFFFF", @last_updated_by = "")
      end
    end

    @cells : Array(Array(Cell))
    @occupied_positions : Hash(String, Tuple(Int32, Int32))

    def initialize
      @cells = Array.new(GRID_SIZE) { Array.new(GRID_SIZE) { Cell.new } }
      @occupied_positions = {} of String => Tuple(Int32, Int32)
    end

    def update(x : Int32, y : Int32, color : String, user_id : String)
      if valid_coordinates?(x, y) && is_user_position?(user_id, x, y)
        @cells[y][x] = Cell.new(color, user_id)
        @occupied_positions[user_id] = {x, y}
      end
    end

    def get_cell(x : Int32, y : Int32) : Cell?
      @cells[y][x] if valid_coordinates?(x, y)
    end

    def to_json
      @cells.to_json
    end

    def is_user_position?(user_id : String, x : Int32, y : Int32) : Bool
      @occupied_positions[user_id]? == {x, y}
    end

    def remove_user(user_id : String)
      @occupied_positions.delete(user_id)
    end

    def self.spiral_position(index : Int32, width : Int32, height : Int32) : Tuple(Int32, Int32)
      return {width // 2, height // 2} if index == 0

      x = y = 0
      dx = 0
      dy = -1
      
      (1..index).each do
        if (-width/2 < x <= width/2) && (-height/2 < y <= height/2)
          x += dx
          y += dy
          next
        end
        
        if (x == y) || (x < 0 && x == -y) || (x > 0 && x == 1-y)
          dx, dy = -dy, dx
        end
        
        x += dx
        y += dy
      end

      {x + width // 2, y + height // 2}
    end

    private def valid_coordinates?(x : Int32, y : Int32)
      x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE
    end
  end
end
