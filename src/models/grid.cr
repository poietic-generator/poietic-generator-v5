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

    @cells : Hash(String, Cell)
    @user_positions : Hash(String, Tuple(Int32, Int32))

    def initialize
      @cells = {} of String => Cell
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
        @cells.delete(position_to_key(position))
        true
      else
        false
      end
    end

    def update(x : Int32, y : Int32, color : String, user_id : String)
      if @user_positions[user_id]? == {x, y}
        @cells[position_to_key({x, y})] = Cell.new(color, user_id)
      end
    end

    def get_cell(x : Int32, y : Int32) : Cell?
      @cells[position_to_key({x, y})]?
    end

    def is_user_position?(user_id : String, x : Int32, y : Int32) : Bool
      @user_positions[user_id]? == {x, y}
    end

    def to_json(json : JSON::Builder)
      json.object do
        json.field "cells", @cells
        json.field "user_positions" do
          json.object do
            @user_positions.each do |user_id, position|
              json.field user_id, position.to_a
            end
          end
        end
      end
    end

    def to_json
      JSON.build do |json|
        to_json(json)
      end
    end

    def self.spiral_position(index : Int32, width : Int32, height : Int32) : Tuple(Int32, Int32)
      return {0, 0} if index == 0  # Le premier utilisateur est au centre

      layer = 1
      positions_in_layer = 0
      while positions_in_layer < index
        positions_in_layer += 8 * layer
        layer += 1
      end
      layer -= 1

      position_in_current_layer = index - (4 * layer * (layer - 1))
      side = position_in_current_layer // (2 * layer)
      position_on_side = position_in_current_layer % (2 * layer)

      x, y = case side
      when 0  # Côté droit
        {layer, -layer + position_on_side}
      when 1  # Côté bas
        {layer - position_on_side, layer}
      when 2  # Côté gauche
        {-layer, layer - position_on_side}
      else    # Côté haut
        {-layer + position_on_side, -layer}
      end

      {x, y}
    end

    private def position_to_key(position : Tuple(Int32, Int32)) : String
      "#{position[0]}_#{position[1]}"
    end
  end
end
