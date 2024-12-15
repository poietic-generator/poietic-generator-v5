#!/bin/bash

# Produire les binaires
shards build --production

cat > ./bin/run.sh <<-MARK
# Lancer le serveur d'enregistrement sur le port 3002

./recorder-server --port=3002 &
PID_RECORDER=\$!

# Attendre un peu que le recorder démarre
sleep 2

# Lancer le serveur principal sur le port 3001
./poietic-generator-api --port=3001 &
PID_MAIN=\$!

# Fonction pour arrêter proprement les processus
cleanup() {
    echo "Arrêt des serveurs..."
    kill \$PID_MAIN \$PID_RECORDER 2>/dev/null
    exit 0
}

# Capturer Ctrl+C
trap cleanup INT

echo "Recorder démarré sur le port 3002"
echo "Serveur principal démarré sur le port 3001"

# Attendre la fin des deux processus
wait \$PID_MAIN \$PID_RECORDER
MARK

chmod +x ./bin/run.sh
tar czvf poietic_generator_bin.tgz ./bin/

