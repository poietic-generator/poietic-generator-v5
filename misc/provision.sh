#!/bin/sh

set -e
set -u

USERNAME=vagrant
HOSTNAME="$(hostname)"
ID=$(cat /etc/os-release | awk -F= '/^ID=/{print $2}' | tr -d '"')
VERS=$(cat /etc/os-release | awk -F= '/^VERSION_ID=/{print $2}' | tr -d '"')

# Base system
export DEBIAN_FRONTEND=noninteractive
apt-get update --allow-releaseinfo-change
apt-get install -y \
   apt-transport-https \
   ca-certificates \
   git \
   curl \
   wget \
   vim \
   gnupg2 \
   software-properties-common

# Http proxy (facade)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
	| sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
	| sudo tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

# Récupérer la dernière version du code depuis GitHub
wget https://github.com/..../poietic_amd64.tgz
tar xavf poietic_amd64.tgz
mv poietic_amd64/ /usr/local/bin/

# Installer les fichier de config pour systemd et caddy
wget ... 
mv ... /etc/systemd/system/poietic.service 
mv ... /etc/systemd/system/poietic.service
mv ... /etc/caddy.conf

echo "SUCCESS."
