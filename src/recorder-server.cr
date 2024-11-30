require "./poietic-recorder"

puts "=== Démarrage du recorder ==="
recorder = PoieticRecorder.new
port = if ARGV.includes?("--port")
  port_index = ARGV.index("--port")
  if port_index && (port_index + 1) < ARGV.size
    ARGV[port_index + 1].to_i
  else
    3002
  end
else
  3002
end
puts "=== Port du recorder: #{port} ==="
recorder.start_server(port) 