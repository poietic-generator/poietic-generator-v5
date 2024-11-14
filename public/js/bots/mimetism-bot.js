window.PoieticBots.MimetismBot = class {
    constructor(parent) {
        this.parent = parent;
        this.updateRate = 10;
        this.colorInterval = 2;
        this.COLOR_UPDATE_INTERVAL = this.colorInterval * 60 * 1000;
        this.colorSource = 'self';
        this.lastColorUpdateTime = Date.now();
        this.currentColor = this.getRandomColor();
        this.neighbors = new Map();
        
        // Intervalles
        this.updateInterval = null;
        this.colorSourceInterval = null;

        this.initializeControls();
        this.updateInterface();
        this.startIntervals();
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.colorSourceInterval) {
            clearInterval(this.colorSourceInterval);
            this.colorSourceInterval = null;
        }

        // Réinitialiser les valeurs
        this.colorSource = 'self';
        this.currentColor = '#000000';
        this.neighbors.clear();
        
        // Mettre à jour l'interface
        this.updateInterface();
    }

    startIntervals() {
        // Intervalle pour le changement de source de couleur
        this.colorSourceInterval = setInterval(() => {
            this.findNeighbors();
            this.updateColorSource();
        }, this.COLOR_UPDATE_INTERVAL);

        // Démarrer avec une première recherche de voisins
        this.findNeighbors();
        this.updateColorSource();

        // Intervalle pour le dessin
        this.startDrawing();
    }

    updateColorSource() {
        if (this.neighbors.size > 0) {
            const neighborIds = Array.from(this.neighbors.keys());
            this.colorSource = neighborIds[Math.floor(Math.random() * neighborIds.length)];
            const neighbor = this.neighbors.get(this.colorSource);
            document.querySelector('#mimetism-panel #color-source').textContent = 
                `Neighbor (${neighbor.position.x}, ${neighbor.position.y})`;
            
            // Mettre à jour la couleur depuis le voisin
            this.currentColor = this.getNeighborColor(this.colorSource);
        } else {
            this.colorSource = 'self';
            document.querySelector('#mimetism-panel #color-source').textContent = 'Self';
            // Générer une nouvelle couleur aléatoire en mode Self
            this.currentColor = this.getRandomColor();
        }

        // Mettre à jour l'aperçu de la couleur
        const colorPreview = document.querySelector('#mimetism-panel #current-color');
        if (colorPreview) {
            colorPreview.style.backgroundColor = this.currentColor;
        }
    }

    getNeighborColor(neighborId) {
        if (!this.parent.sub_cell_states[neighborId]) {
            return this.getRandomColor();
        }

        const neighborStates = this.parent.sub_cell_states[neighborId];
        const colors = Object.values(neighborStates);
        
        if (colors.length === 0) {
            return this.getRandomColor();
        }

        // Prendre une couleur aléatoire parmi celles du voisin
        return colors[Math.floor(Math.random() * colors.length)];
    }

    startDrawing() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Si le taux est 0%, arrêter le dessin
        if (this.updateRate === 0) {
            this.updateInterval = null;
            return;
        }

        const baseInterval = 1000;
        const pixelsPerMinute = (400 * this.updateRate) / 100;
        const pixelsPerSecond = pixelsPerMinute / 60;
        const newInterval = Math.max(baseInterval / pixelsPerSecond, 50);

        this.updateInterval = setInterval(() => {
            const x = Math.floor(Math.random() * 20);
            const y = Math.floor(Math.random() * 20);
            
            this.parent.updateCell(x, y, this.currentColor);
            if (this.parent.socket && this.parent.socket.readyState === WebSocket.OPEN) {
                this.parent.socket.send(JSON.stringify({
                    type: 'cell_update',
                    sub_x: x,
                    sub_y: y,
                    color: this.currentColor
                }));
            }
        }, newInterval);
    }

    initializeControls() {
        const panel = document.querySelector('#mimetism-panel');
        
        panel.querySelector('#rate-plus').onclick = () => {
            if (this.updateRate < 100) {
                this.updateRate = Math.min(100, this.updateRate + 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        };

        panel.querySelector('#rate-minus').onclick = () => {
            if (this.updateRate > 0) {
                this.updateRate = Math.max(0, this.updateRate - 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        };

        panel.querySelector('#interval-plus').onclick = () => {
            if (this.colorInterval < 10) {
                this.colorInterval++;
                panel.querySelector('#color-interval').textContent = this.colorInterval;
                this.COLOR_UPDATE_INTERVAL = this.colorInterval * 60 * 1000;
            }
        };

        panel.querySelector('#interval-minus').onclick = () => {
            if (this.colorInterval > 1) {
                this.colorInterval--;
                panel.querySelector('#color-interval').textContent = this.colorInterval;
                this.COLOR_UPDATE_INTERVAL = this.colorInterval * 60 * 1000;
            }
        };
    }

    updateInterface() {
        const panel = document.querySelector('#mimetism-panel');
        panel.querySelector('#user-position').textContent = this.parent.userPosition ? 
            `(${this.parent.userPosition.x}, ${this.parent.userPosition.y})` : '-';
        panel.querySelector('#color-source').textContent = this.colorSource === 'self' ? 'Self' : 'Neighbor';
        panel.querySelector('#update-rate').textContent = this.updateRate;
        panel.querySelector('#color-interval').textContent = this.colorInterval;
        
        this.updateNeighborsList();
        
        const colorPreview = panel.querySelector('#current-color');
        if (colorPreview) {
            colorPreview.style.backgroundColor = this.currentColor;
        }
    }

    findNeighbors() {
        console.log('Finding neighbors...');
        this.neighbors.clear();
        
        if (!this.parent.userPositions || !this.parent.userPosition) return;
        
        const myPos = this.parent.userPosition;
        this.parent.userPositions.forEach((pos, id) => {
            if (id !== this.parent.myUserId) {
                const dx = Math.abs(pos.x - myPos.x);
                const dy = Math.abs(pos.y - myPos.y);
                if (dx <= 1 && dy <= 1) {
                    this.neighbors.set(id, { position: pos });
                }
            }
        });
        
        // Mettre à jour la liste des voisins dans l'interface
        this.updateNeighborsList();
        console.log('Current neighbors:', this.neighbors);
    }

    updateNeighborsList() {
        const neighborsList = document.querySelector('#mimetism-panel #neighbors-list');
        if (!neighborsList) return;

        if (this.neighbors.size === 0) {
            neighborsList.textContent = 'None';
            return;
        }

        const neighborTexts = Array.from(this.neighbors.values())
            .map(neighbor => `(${neighbor.position.x}, ${neighbor.position.y})`)
            .join(', ');
        
        neighborsList.textContent = neighborTexts;
    }

    getRandomColor() {
        if (this.colorSource === 'self') {
            return `rgb(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0})`;
        } else {
            const neighbor = this.neighbors.get(this.colorSource);
            if (neighbor && neighbor.cells.size > 0) {
                const colors = Array.from(neighbor.cells.values());
                return colors[Math.floor(Math.random() * colors.length)];
            }
            return `rgb(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0})`;
        }
    }

    onNewUser(message) {
        // Vérifier si le nouvel utilisateur est un voisin potentiel
        const newUserPos = {
            x: message.position[0],
            y: message.position[1]
        };
        
        // Calculer la distance avec le nouvel utilisateur
        const dx = Math.abs(newUserPos.x - this.parent.userPosition.x);
        const dy = Math.abs(newUserPos.y - this.parent.userPosition.y);
        
        // Si c'est un voisin (adjacent)
        if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
            this.neighbors.set(message.user_id, {
                position: newUserPos,
                cells: new Map()
            });
            
            // Si nous n'avions pas de voisins avant, commencer avec celui-ci
            if (this.colorSource === 'self' && this.neighbors.size === 1) {
                this.colorSource = message.user_id;
                document.getElementById('color-source').textContent = 
                    `Neighbor (${newUserPos.x}, ${newUserPos.y})`;
            }
        }
    }

    onUserLeft(message) {
        // Si l'utilisateur qui part était notre source
        if (message.user_id === this.colorSource) {
            this.neighbors.delete(message.user_id);
            
            // Choisir une nouvelle source
            if (this.neighbors.size > 0) {
                const neighborIds = Array.from(this.neighbors.keys());
                this.colorSource = neighborIds[Math.floor(Math.random() * neighborIds.length)];
                const neighbor = this.neighbors.get(this.colorSource);
                document.getElementById('color-source').textContent = 
                    `Neighbor (${neighbor.position.x}, ${neighbor.position.y})`;
            } else {
                // Si plus de voisins, revenir en mode self
                this.colorSource = 'self';
                document.getElementById('color-source').textContent = 'Self';
            }
        } else {
            // Simplement retirer le voisin de la liste
            this.neighbors.delete(message.user_id);
        }
    }

    onUserUpdate(message) {
        this.findNeighbors();
        this.updateInterface();
    }
}