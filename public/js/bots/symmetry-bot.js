window.PoieticBots.SymmetryBot = class {
    constructor(parent) {
        this.parent = parent;
        this.updateRate = 10;
        this.userInterval = 2;
        this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
        this.symmetrySource = null;
        this.symmetryType = 'translation';
        this.symmetryTypes = ['translation', 'Y mirror', 'X mirror'];
        
        // Intervalles
        this.updateInterval = null;
        this.sourceUpdateInterval = null;

        this.initializeControls();
        this.updateInterface();
        this.startIntervals();
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.sourceUpdateInterval) {
            clearInterval(this.sourceUpdateInterval);
            this.sourceUpdateInterval = null;
        }

        // Réinitialiser les valeurs
        this.symmetrySource = null;
        this.symmetryType = 'translation';
        
        // Mettre à jour l'interface
        this.updateInterface();
    }

    startIntervals() {
        // Choisir une source initiale
        this.chooseSymmetrySource();
        
        // Intervalle pour le changement de source et type de symétrie
        this.sourceUpdateInterval = setInterval(() => {
            this.chooseSymmetrySource();
        }, this.USER_UPDATE_INTERVAL);

        // Intervalle pour le dessin
        this.startDrawing();
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

        console.log('Starting drawing with interval:', newInterval);
        console.log('Current source:', this.symmetrySource);

        this.updateInterval = setInterval(() => {
            if (!this.symmetrySource) {
                console.log('No source selected, skipping draw');
                return;
            }

            const sourceX = Math.floor(Math.random() * 20);
            const sourceY = Math.floor(Math.random() * 20);
            const {x, y} = this.applySymmetry(sourceX, sourceY);
            
            // Obtenir la couleur de la source
            const sourceColor = this.getSourceColor(sourceX, sourceY);
            console.log('Drawing:', {sourceX, sourceY, x, y, sourceColor});
            
            if (sourceColor) {
                this.parent.updateCell(x, y, sourceColor);
                if (this.parent.socket && this.parent.socket.readyState === WebSocket.OPEN) {
                    this.parent.socket.send(JSON.stringify({
                        type: 'cell_update',
                        sub_x: x,
                        sub_y: y,
                        color: sourceColor
                    }));
                }
            }
        }, newInterval);
    }

    getSourceColor(x, y) {
        if (!this.symmetrySource || !this.parent.sub_cell_states) {
            console.log('No source or cell states available');
            return null;
        }
        
        const sourceStates = this.parent.sub_cell_states[this.symmetrySource];
        if (!sourceStates) {
            console.log('No states for source:', this.symmetrySource);
            return null;
        }
        
        const key = `${x},${y}`;
        const color = sourceStates[key];
        console.log('Getting color for', key, ':', color);
        return color || '#000000';
    }

    initializeControls() {
        const panel = document.querySelector('#symmetry-panel');
        
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
            if (this.userInterval < 10) {
                this.userInterval++;
                panel.querySelector('#color-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        };

        panel.querySelector('#interval-minus').onclick = () => {
            if (this.userInterval > 1) {
                this.userInterval--;
                panel.querySelector('#color-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        };
    }

    updateInterface() {
        const panel = document.querySelector('#symmetry-panel');
        panel.querySelector('#user-position').textContent = this.parent.userPosition ? 
            `(${this.parent.userPosition.x}, ${this.parent.userPosition.y})` : '-';
        panel.querySelector('#color-source').textContent = this.symmetrySource ? 
            `User at (${this.parent.userPositions.get(this.symmetrySource).x}, ${this.parent.userPositions.get(this.symmetrySource).y})` : '-';
        panel.querySelector('#symmetry-type').textContent = this.symmetryType;
        panel.querySelector('#update-rate').textContent = this.updateRate;
        panel.querySelector('#color-interval').textContent = this.userInterval;
    }

    chooseSymmetrySource() {
        console.log('Choosing symmetry source from:', this.parent.userPositions);
        const availableUsers = Array.from(this.parent.userPositions.keys())
            .filter(id => id !== this.parent.myUserId);
        
        if (availableUsers.length === 0) {
            console.log('No available users');
            this.symmetrySource = null;
            document.querySelector('#symmetry-panel #color-source').textContent = 'None (stopped)';
            return false;
        }

        this.symmetrySource = availableUsers[Math.floor(Math.random() * availableUsers.length)];
        console.log('Selected source:', this.symmetrySource);
        
        const sourcePos = this.parent.userPositions.get(this.symmetrySource);
        if (sourcePos) {
            document.querySelector('#symmetry-panel #color-source').textContent = 
                `User at (${sourcePos.x}, ${sourcePos.y})`;
        }
        
        this.symmetryType = this.symmetryTypes[
            Math.floor(Math.random() * this.symmetryTypes.length)
        ];
        document.querySelector('#symmetry-panel #symmetry-type').textContent = this.symmetryType;
        
        return true;
    }

    applySymmetry(sourceX, sourceY) {
        switch(this.symmetryType) {
            case 'translation':
                return { x: sourceX, y: sourceY };
            case 'Y mirror':
                return { x: 19 - sourceX, y: sourceY };
            case 'X mirror':
                return { x: sourceX, y: 19 - sourceY };
            default:
                return { x: sourceX, y: sourceY };
        }
    }

    onInitialState(message) {
        this.updateInterface();
        this.chooseSymmetrySource();
    }

    onUserUpdate(message) {
        if (message.user_positions) {
            this.parent.userPositions = new Map(Object.entries(message.user_positions)
                .map(([id, pos]) => [id, {x: pos[0], y: pos[1]}]));
            this.chooseSymmetrySource();
        }
    }
}