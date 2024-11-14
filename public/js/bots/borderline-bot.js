window.PoieticBots.BorderlineBot = class {
    constructor(parent) {
        console.log('BorderlineBot: Constructor started');
        this.parent = parent;
        this.updateRate = 10;
        this.userInterval = 2;
        this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
        this.currentSource = null;
        this.currentColor = null;
        this.neighbors = new Map();

        console.log('BorderlineBot: Parent state:', {
            myUserId: this.parent.myUserId,
            userPosition: this.parent.userPosition,
            userPositions: this.parent.userPositions
        });

        // Intervalles
        this.updateInterval = null;
        this.sourceUpdateInterval = null;

        // État de la propagation en cours
        this.currentPath = [];
        this.visitedCells = new Set();

        try {
            console.log('BorderlineBot: Initializing controls');
            this.initializeControls();
            console.log('BorderlineBot: Controls initialized');

            console.log('BorderlineBot: Updating interface');
            this.updateInterface();
            console.log('BorderlineBot: Interface updated');

            console.log('BorderlineBot: Starting intervals');
            this.startIntervals();
            console.log('BorderlineBot: Intervals started');
        } catch (error) {
            console.error('BorderlineBot: Error during initialization:', error);
        }

        console.log('BorderlineBot: Constructor completed');
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

        this.currentSource = null;
        this.currentColor = null;
        this.neighbors.clear();
        this.currentPath = [];
        this.visitedCells.clear();
        
        this.updateInterface();
    }

    findAdjacentNeighbors() {
        console.log('BorderlineBot: Finding adjacent neighbors');
        this.neighbors.clear();
        
        if (!this.parent.userPositions || !this.parent.userPosition) {
            console.log('BorderlineBot: No positions available', {
                userPositions: this.parent.userPositions,
                userPosition: this.parent.userPosition
            });
            return;
        }
        
        const myPos = this.parent.userPosition;
        this.parent.userPositions.forEach((pos, id) => {
            if (id !== this.parent.myUserId) {
                const dx = Math.abs(pos.x - myPos.x);
                const dy = Math.abs(pos.y - myPos.y);
                if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                    console.log('BorderlineBot: Found adjacent neighbor:', {id, pos});
                    this.neighbors.set(id, { position: pos });
                }
            }
        });
        
        console.log('BorderlineBot: Adjacent neighbors found:', this.neighbors);
    }

    getBorderCellsWithNeighbor(neighborId) {
        const neighbor = this.neighbors.get(neighborId);
        if (!neighbor) return [];

        const myPos = this.parent.userPosition;
        const nPos = neighbor.position;
        const borderCells = [];

        // Déterminer la frontière commune
        if (nPos.x === myPos.x + 1) { // Voisin à droite
            for (let y = 0; y < 20; y++) {
                borderCells.push({x: 19, y: y, neighborCell: {x: 0, y: y}});
            }
        } else if (nPos.x === myPos.x - 1) { // Voisin à gauche
            for (let y = 0; y < 20; y++) {
                borderCells.push({x: 0, y: y, neighborCell: {x: 19, y: y}});
            }
        } else if (nPos.y === myPos.y + 1) { // Voisin en bas
            for (let x = 0; x < 20; x++) {
                borderCells.push({x: x, y: 19, neighborCell: {x: x, y: 0}});
            }
        } else if (nPos.y === myPos.y - 1) { // Voisin en haut
            for (let x = 0; x < 20; x++) {
                borderCells.push({x: x, y: 0, neighborCell: {x: x, y: 19}});
            }
        }

        return borderCells;
    }

    getNeighborColor(neighborId, x, y) {
        if (!this.parent.sub_cell_states[neighborId]) return null;
        return this.parent.sub_cell_states[neighborId][`${x},${y}`];
    }

    startNewPropagation() {
        if (!this.currentSource) return false;

        // Obtenir les cellules frontières avec le voisin actuel
        const borderCells = this.getBorderCellsWithNeighbor(this.currentSource);
        if (borderCells.length === 0) return false;

        // Choisir une cellule frontière aléatoire
        const startCell = borderCells[Math.floor(Math.random() * borderCells.length)];
        
        // Obtenir la couleur du pixel correspondant chez le voisin
        const color = this.getNeighborColor(
            this.currentSource, 
            startCell.neighborCell.x, 
            startCell.neighborCell.y
        );

        if (!color) return false;

        // Initialiser la nouvelle propagation
        this.currentColor = color;
        this.currentPath = [startCell];
        this.visitedCells = new Set([`${startCell.x},${startCell.y}`]);

        return true;
    }

    propagateOneStep() {
        if (!this.currentPath.length) {
            return this.startNewPropagation();
        }

        const currentCell = this.currentPath[this.currentPath.length - 1];
        const possibleMoves = this.getValidAdjacentCells(currentCell.x, currentCell.y);

        if (possibleMoves.length === 0) {
            // Si pas de mouvement possible, on recommence une nouvelle propagation
            this.currentPath = [];
            this.visitedCells.clear();
            return this.startNewPropagation();
        }

        // Choisir une cellule adjacente aléatoire
        const nextCell = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        
        // Dessiner la cellule
        this.parent.updateCell(nextCell.x, nextCell.y, this.currentColor);
        if (this.parent.socket && this.parent.socket.readyState === WebSocket.OPEN) {
            this.parent.socket.send(JSON.stringify({
                type: 'cell_update',
                sub_x: nextCell.x,
                sub_y: nextCell.y,
                color: this.currentColor
            }));
        }

        // Mettre à jour le chemin
        this.currentPath.push(nextCell);
        this.visitedCells.add(`${nextCell.x},${nextCell.y}`);

        return true;
    }

    getValidAdjacentCells(x, y) {
        const moves = [];
        const directions = [
            {dx: 0, dy: -1}, // haut
            {dx: 1, dy: 0},  // droite
            {dx: 0, dy: 1},  // bas
            {dx: -1, dy: 0}  // gauche
        ];

        for (const dir of directions) {
            const newX = x + dir.dx;
            const newY = y + dir.dy;
            
            // Vérifier les limites
            if (newX < 0 || newX >= 20 || newY < 0 || newY >= 20) continue;
            
            // Vérifier si déjà visitée
            if (this.visitedCells.has(`${newX},${newY}`)) continue;
            
            moves.push({x: newX, y: newY});
        }

        return moves;
    }

    startIntervals() {
        console.log('BorderlineBot: Starting intervals');
        // Choisir une source initiale
        this.findAdjacentNeighbors();
        this.updateColorSource();
        
        // Intervalle pour le changement de source
        this.sourceUpdateInterval = setInterval(() => {
            console.log('BorderlineBot: Interval - updating neighbors and source');
            this.findAdjacentNeighbors();
            this.updateColorSource();
        }, this.USER_UPDATE_INTERVAL);

        // Intervalle pour le dessin
        this.startDrawing();
    }

    startDrawing() {
        console.log('BorderlineBot: Starting drawing');
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        if (this.updateRate === 0) {
            console.log('BorderlineBot: Update rate is 0, not starting drawing');
            this.updateInterval = null;
            return;
        }

        const baseInterval = 1000;
        const pixelsPerMinute = (400 * this.updateRate) / 100;
        const pixelsPerSecond = pixelsPerMinute / 60;
        const newInterval = Math.max(baseInterval / pixelsPerSecond, 50);

        console.log('BorderlineBot: Setting up drawing interval:', newInterval);
        this.updateInterval = setInterval(() => {
            console.log('BorderlineBot: Drawing step');
            this.propagateOneStep();
        }, newInterval);
    }

    updateColorSource() {
        console.log('BorderlineBot: Updating color source...');
        if (this.neighbors.size > 0) {
            const neighborIds = Array.from(this.neighbors.keys());
            this.currentSource = neighborIds[Math.floor(Math.random() * neighborIds.length)];
            const neighbor = this.neighbors.get(this.currentSource);
            
            console.log('BorderlineBot: Selected source:', this.currentSource, neighbor);
            
            // Réinitialiser le chemin actuel
            this.currentPath = [];
            this.visitedCells.clear();
            
            const sourceElement = document.querySelector('#borderline-panel #color-source');
            if (sourceElement) {
                sourceElement.textContent = `Neighbor (${neighbor.position.x}, ${neighbor.position.y})`;
            }
        } else {
            console.log('BorderlineBot: No neighbors available');
            this.currentSource = null;
            const sourceElement = document.querySelector('#borderline-panel #color-source');
            if (sourceElement) {
                sourceElement.textContent = 'None';
            }
        }
    }

    initializeControls() {
        const panel = document.querySelector('#borderline-panel');
        if (!panel) {
            console.error('BorderlineBot: Panel not found!');
            return;
        }

        // Gestionnaire pour le taux de mise à jour
        panel.querySelector('#rate-plus').addEventListener('click', () => {
            if (this.updateRate < 100) {
                this.updateRate = Math.min(100, this.updateRate + 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        });

        panel.querySelector('#rate-minus').addEventListener('click', () => {
            if (this.updateRate > 0) {
                this.updateRate = Math.max(0, this.updateRate - 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        });

        // Gestionnaire pour l'intervalle utilisateur
        panel.querySelector('#interval-plus').addEventListener('click', () => {
            if (this.userInterval < 10) {
                this.userInterval++;
                panel.querySelector('#user-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        });

        panel.querySelector('#interval-minus').addEventListener('click', () => {
            if (this.userInterval > 1) {
                this.userInterval--;
                panel.querySelector('#user-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        });
    }

    updateInterface() {
        console.log('BorderlineBot: Updating interface...');
        const panel = document.querySelector('#borderline-panel');
        if (!panel) {
            console.error('BorderlineBot: Could not find panel');
            return;
        }

        const positionElement = panel.querySelector('#user-position');
        if (positionElement) {
            const position = this.parent.userPosition ? 
                `(${this.parent.userPosition.x}, ${this.parent.userPosition.y})` : '-';
            console.log('BorderlineBot: Setting position:', position);
            positionElement.textContent = position;
        } else {
            console.error('BorderlineBot: Could not find position element');
        }

        const rateElement = panel.querySelector('#update-rate');
        if (rateElement) {
            rateElement.textContent = this.updateRate;
        }

        const intervalElement = panel.querySelector('#user-interval');
        if (intervalElement) {
            intervalElement.textContent = this.userInterval;
        }
        
        this.updateNeighborsList();
    }

    updateNeighborsList() {
        const neighborsList = document.querySelector('#borderline-panel #neighbors-list');
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

    // Gestionnaires d'évnements
    onNewUser(message) {
        const newUserPos = {
            x: message.position[0],
            y: message.position[1]
        };
        
        this.findAdjacentNeighbors();
        this.updateInterface();
    }

    onUserLeft(message) {
        if (message.user_id === this.currentSource) {
            this.currentSource = null;
            this.currentPath = [];
            this.visitedCells.clear();
        }
        
        this.neighbors.delete(message.user_id);
        this.findAdjacentNeighbors();
        this.updateInterface();
        
        if (!this.currentSource) {
            this.updateColorSource();
        }
    }

    onUserUpdate(message) {
        this.findAdjacentNeighbors();
        this.updateInterface();
    }

    onInitialState(message) {
        console.log('BorderlineBot: Received initial state:', message);
        // Assurons-nous que le parent a bien traité l'état initial avant de mettre à jour
        setTimeout(() => {
            this.findAdjacentNeighbors();
            this.updateInterface();
            this.startDrawing();
        }, 100);
    }
} 