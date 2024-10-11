require "./spec_helper"

describe PoieticGenerator::Session do
  it "adds users and updates zoom level" do
    session = PoieticGenerator::Session.new
    session.zoom_level.should eq 0

    9.times do
      session.add_user(HTTP::WebSocket.new(IO::Memory.new))
    end
    session.zoom_level.should eq 1

    16.times do
      session.add_user(HTTP::WebSocket.new(IO::Memory.new))
    end
    session.zoom_level.should eq 2
  end

  it "removes users and updates zoom level" do
    session = PoieticGenerator::Session.new
    
    25.times do
      session.add_user(HTTP::WebSocket.new(IO::Memory.new))
    end
    session.zoom_level.should eq 2

    17.times do
      session.remove_user(session.users.keys.first)
    end
    session.zoom_level.should eq 1
  end
  
  it "calculates user positions" do
	session = PoieticGenerator::Session.new
	user_id = session.add_user(HTTP::WebSocket.new(IO::Memory.new))
	position = session.get_user_position(user_id)
	position.should_not be_nil
	position.not_nil!.should eq({0, 0})  # Premier utilisateur au centre

	second_user_id = session.add_user(HTTP::WebSocket.new(IO::Memory.new))
	second_position = session.get_user_position(second_user_id)
	second_position.should_not be_nil
	second_position.not_nil!.should eq({1, 0})  # Deuxième utilisateur à droite du premier

	third_user_id = session.add_user(HTTP::WebSocket.new(IO::Memory.new))
	third_position = session.get_user_position(third_user_id)
	third_position.should_not be_nil
	third_position.not_nil!.should eq({1, -1})  # Troisième utilisateur en dessous du deuxième
  end
end
