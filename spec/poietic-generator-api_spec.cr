require "./spec_helper"
require "../src/poietic-generator-api"

describe PoieticGenerator do
  it "initializes a session" do
    session = PoieticGenerator.current_session
    session.should be_a(PoieticGenerator::Session)
    session.users.should be_empty
    session.zoom_level.should eq(0)
  end
end
