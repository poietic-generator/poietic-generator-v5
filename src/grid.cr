
class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))
  property sub_cell_states : Hash(String, Hash(Tuple(Int32, Int32), String))
  property initial_colors : Hash(String, Array(String))

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
    @sub_cell_states = Hash(String, Hash(Tuple(Int32, Int32), String)).new
    @initial_colors = Hash(String, Array(String)).new
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
    @initial_colors[user_id] = generate_initial_colors(user_id) unless @initial_colors.has_key?(user_id)
    unless @sub_cell_states.has_key?(user_id)
      @sub_cell_states[user_id] = Hash(Tuple(Int32, Int32), String).new
      400.times do |i|
        @sub_cell_states[user_id][{i % 20, i // 20}] = @initial_colors[user_id][i]
      end
    end
  end

  def get_user_position(user_id : String)
    @user_positions[user_id]?  # Ajout du ? pour retourner nil si la clé n'existe pas
  end

  def to_json(json : JSON::Builder)
    json.object do
      json.field "user_positions" do
        json.object do
          @user_positions.each do |user_id, position|
            json.field user_id do
              json.array do
                json.number position[0]
                json.number position[1]
              end
            end
          end
        end
      end
    end
  end

  def remove_user(user_id : String)
    @user_positions.delete(user_id)
    @sub_cell_states.delete(user_id)
    @initial_colors.delete(user_id)
  end

  def find_next_available_position : Tuple(Int32, Int32)
    return {0, 0} if @user_positions.empty?

    spiral_positions = generate_spiral_positions(@user_positions.size + 1)
    spiral_positions.find { |pos| !@user_positions.values.includes?(pos) } || {0, 0}
  end

  def update_sub_cell(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    if position = @user_positions[user_id]?
      @sub_cell_states[user_id] ||= Hash(Tuple(Int32, Int32), String).new
      @sub_cell_states[user_id][{sub_x, sub_y}] = color
    end
  end

  def get_sub_cell_states(user_id : String)
    @sub_cell_states[user_id]? || Hash(Tuple(Int32, Int32), String).new
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

  private def next_odd(n : Int32) : Int32  # Ajout du type de retour explicite
    n.even? ? n + 1 : n
  end

  private def generate_initial_colors(user_id : String)
    # Créer un générateur de nombres pseudo-aléatoires avec l'UUID comme seed
    seed = user_id.bytes.reduce(0) { |acc, b| (acc << 8) + b }
    rng = Random.new(seed)

    # Générer une couleur de base pour cet utilisateur
    base_h = rng.rand # Teinte de base (0.0 - 1.0)
    base_s = 0.6 + (rng.rand * 0.4) # Saturation (0.6 - 1.0)
    base_l = 0.4 + (rng.rand * 0.2) # Luminosité (0.4 - 0.6)

    # Générer 400 variations autour de cette couleur
    Array.new(400) do |i|
      # Faire varier la teinte autour de la teinte de base
      h = (base_h + (rng.rand * 0.2) - 0.1) % 1.0
      # Faire varier la saturation
      s = (base_s + (rng.rand * 0.2) - 0.1).clamp(0.0, 1.0)
      # Faire varier la luminosité
      l = (base_l + (rng.rand * 0.2) - 0.1).clamp(0.0, 1.0)

      # Convertir HSL en RGB puis en hex
      hsl_to_hex(h, s, l)
    end
  end

  private def hue_to_rgb(p : Float64, q : Float64, t : Float64) : Float64
    t += 1.0 if t < 0
    t -= 1.0 if t > 1
    return p + (q - p) * 6 * t if t < 1.0/6
    return q if t < 1.0/2
    return p + (q - p) * (2.0/3 - t) * 6 if t < 2.0/3
    return p
  end

  private def hsl_to_hex(h : Float64, s : Float64, l : Float64) : String
    q = l < 0.5 ? l * (1 + s) : l + s - l * s
    p = 2 * l - q

    r = (hue_to_rgb(p, q, h + 1.0/3) * 255).round.to_i
    g = (hue_to_rgb(p, q, h) * 255).round.to_i
    b = (hue_to_rgb(p, q, h - 1.0/3) * 255).round.to_i

    "#%02x%02x%02x" % [r, g, b]
  end
end
