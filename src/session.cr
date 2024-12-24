
class Session
  INACTIVITY_TIMEOUT = 3.minutes

  property users : Hash(String, HTTP::WebSocket)
  property observers : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property user_colors : Hash(String, String)
  property last_activity : Hash(String, Time)
  property recorders : Array(HTTP::WebSocket)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @observers = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @user_colors = Hash(String, String).new
    @last_activity = Hash(String, Time).new
    @recorders = [] of HTTP::WebSocket
  end

  def add_user(socket : HTTP::WebSocket, forced_id : String? = nil) : String
    user_id = forced_id || UUID.random.to_s
    @users[user_id] = socket
    @user_colors[user_id] = generate_random_color
    @last_activity[user_id] = Time.utc
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    send_initial_state(user_id)
    broadcast_new_user(user_id)
    broadcast_zoom_update
    user_id
  end

  def add_observer(socket : HTTP::WebSocket) : String
    observer_id = "observer_#{UUID.random}"
    @observers[observer_id] = socket
    send_initial_state(observer_id)
    observer_id
  end

  def remove_observer(observer_id : String)
    @observers.delete(observer_id)
    puts "=== Observer removed: #{observer_id} ==="
  end

  def send_initial_state(user_id : String)
    grid_size = calculate_grid_size

    # État commun pour tous les clients
    base_state = {
      type: "initial_state",
      grid_size: grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }

    if user_id.starts_with?("observer_")
      # Pour les observateurs, on envoie juste l'état sans my_user_id
      @observers[user_id].send(base_state.to_json)
    else
      # Pour les utilisateurs réguliers, on ajoute my_user_id
      client_state = base_state.merge({my_user_id: user_id})
      @users[user_id].send(client_state.to_json)

      # Enregistrement pour le recorder
      recorder_state = {
        type: "initial_state",
        timestamp: Time.utc.to_unix_ms,
        grid_size: grid_size,
        user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] },
        user_colors: @user_colors,
        sub_cell_states: serialize_sub_cell_states
      }

      puts "=== Enregistrement de l'état initial pour le recorder ==="
      puts "=== État: #{recorder_state.inspect} ==="

      API.recorder.record_event(JSON.parse(recorder_state.to_json))
    end
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
      color: @user_colors[new_user_id]
    }.to_json
    broadcast(new_user_message)
  end

  def generate_random_color
    "#" + "%06x" % (Random.new.rand(0xffffff))
  end

  def calculate_grid_size
    @grid.effective_size
  end

  def broadcast_initial_state(user)
    puts "=== Envoi de l'état initial ==="
    state = {
      type: "initial_state",
      timestamp: Time.utc.to_unix_ms,  # Ajout du timestamp ici
      grid_size: calculate_grid_size,
      user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] },
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }
    puts "=== État initial: #{state.inspect} ==="
    broadcast(state.to_json)
  end

  def remove_user(user_id : String)
    if position = @grid.get_user_position(user_id)
      # Enregistrer d'abord la déconnexion
      API.recorder.record_user_left(user_id)

      # Envoyer la notification avant de supprimer l'utilisateur
      broadcast_user_left(user_id, position)

      # Puis effectuer les modifications d'état
      @grid.remove_user(user_id)
      @users.delete(user_id)
      @user_colors.delete(user_id)
      @last_activity.delete(user_id)

      # Mettre à jour le zoom après les modifications
      broadcast_zoom_update

      # Vérifier si c'était le dernier utilisateur
      if @users.empty?
        puts "=== Dernier utilisateur déconnecté, fin de la session ==="
        API.recorder.end_current_session
      end
    end
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      timestamp: Time.utc.to_unix_ms,
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }

    # Enregistrer explicitement dans le recorder
    API.recorder.record_event(JSON.parse(zoom_update_message.to_json))

    # Puis broadcaster aux clients et observers
    message = zoom_update_message.to_json
    broadcast(message)
    send_to_observers(message)
  end

  def broadcast_user_left(user_id : String, position : Tuple(Int32, Int32))
    message = {
      type: "user_left",
      user_id: user_id,
      position: position,
      timestamp: Time.utc.to_unix_ms
    }.to_json

    # S'assurer que le message est envoyé à tous (utilisateurs et observateurs)
    broadcast(message)
  end

  def broadcast(message)
    # Broadcast aux utilisateurs réguliers
    @users.each do |user_id, socket|
      begin
        socket.send(message)
      rescue ex
        puts "Error sending to user #{user_id}: #{ex.message}"
      end
    end

    # Broadcast aux observateurs (maintenant sans risque de déconnexion)
    @observers.each do |observer_id, socket|
      begin
        socket.send(message)
      rescue ex
        puts "Error sending to observer #{observer_id}: #{ex.message}"
      end
    end
  end

  def send_to_observers(message)
    @observers.each do |observer_id, socket|
      begin
        socket.send(message)
      rescue ex
        puts "Error sending to observer #{observer_id}: #{ex.message}"
      end
    end
  end

  # Modifiez ces méthodes pour envoyer les mises à jour aux observateurs
  def handle_cell_update(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    @grid.update_sub_cell(user_id, sub_x, sub_y, color)
    update_message = {
      type: "cell_update",
      user_id: user_id,
      sub_x: sub_x,
      sub_y: sub_y,
      color: color,
      timestamp: Time.utc.to_unix_ms
    }.to_json
    broadcast(update_message)
    # Enregistrer l'événement dans le recorder
    API.recorder.record_event(JSON.parse(update_message))
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
      color: @user_colors[new_user_id]
    }.to_json
    broadcast(new_user_message)
    send_to_observers(new_user_message)
  end

  def broadcast_user_left(user_id : String)
    begin
      @users.each do |id, socket|
        next if socket.closed?  # Vérifier si le socket est fermé
        socket.send({
          type: "user_left",
          user_id: user_id
        }.to_json)
      end
    rescue ex
      puts "Erreur lors de la diffusion du départ d'un utilisateur: #{ex.message}"
    end
  end

  def serialize_sub_cell_states
    @grid.sub_cell_states.transform_values do |user_sub_cells|
      user_sub_cells.transform_keys do |key|
        "#{key[0]},#{key[1]}"
      end
    end
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      user_colors: @user_colors,
      sub_cell_states: serialize_sub_cell_states
    }.to_json
    broadcast(zoom_update_message)
    send_to_observers(zoom_update_message)
  end

  def update_user_activity(user_id : String)
    @last_activity[user_id] = Time.utc
  end

  def check_inactivity
    now = Time.utc
    @last_activity.each do |user_id, last_active|
      if now - last_active > INACTIVITY_TIMEOUT
        remove_user(user_id)
      end
    end
  end

  private def broadcast_to_recorders(message : String)
    @recorders.each do |recorder|
      begin
        recorder.send(message)
      rescue ex
        puts "Erreur d'envoi au recorder: #{ex.message}"
        @recorders.delete(recorder)
      end
    end
  end
end
