class PoieticSimulator {
    constructor() {
        this.userIdElement = document.getElementById('user-id');
        this.userPositionElement = document.getElementById('user-position');
        this.spiralOrderElement = document.getElementById('spiral-order');
        this.userGrid = document.getElementById('user-grid');

        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.initialColors = new Map();
        this.myUserId = null;
        this.userPosition = { x: 0, y: 0 };
        this.spiralOrder = 0;
        this.isSimulating = false;
        this.isConnected = false;

        this.updateInterval = null;
        this.heartbeatInterval = null;

        this.toggleButton = document.getElementById('toggle-button');
        console.log('Initializing simulator...');
        this.initializeUserGrid();
        this.addEventListeners();
        
        // Démarrage automatique
        setTimeout(() => {
            console.log('Auto-starting simulation...');
            this.startSimulation();
        }, 100);
    }

    initializeUserGrid() {
        if (!this.userGrid) {
            console.error('User grid element not found');
            return;
        }
        
        this.userGrid.innerHTML = '';
        const gridSize = 20;
        
        // Créer un fragment pour améliorer les performances
        const fragment = document.createDocumentFragment();
        
        // Créer les 400 cellules (20x20)
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                fragment.appendChild(cell);
            }
        }
        
        this.userGrid.appendChild(fragment);
        
        // Vérification du nombre de cellules
        console.log(`Nombre de cellules créées: ${this.userGrid.children.length}`);
    }

    updateUserCell(x, y, color) {
        if (x < 0 || x >= 20 || y < 0 || y >= 20) return;

        const index = y * 20 + x;
        const cells = this.userGrid.children;
        
        if (cells[index]) {
            cells[index].style.backgroundColor = color;
        }
    }

    startSimulation() {
        if (this.isSimulating) return;
        console.log('Starting simulation...');
        
        this.socket = new WebSocket('ws://localhost:3001/updates');
        
        this.socket.onopen = () => {
            console.log('WebSocket connection established');
            this.isSimulating = true;
            this.isConnected = true;
            this.startHeartbeat();
        };
        
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
            
            if (message.type === 'initial_state') {
                console.log('Processing initial state...');
                this.handleInitialState(message);
            } else if (message.type === 'cell_update') {
                this.handleCellUpdate(message);
            }
        };
        
        this.socket.onclose = () => {
            console.log('WebSocket connection closed');
            this.isConnected = false;
            if (this.isSimulating) {
                console.log('Attempting reconnection...');
                setTimeout(() => this.startSimulation(), 1000);
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleInitialState(message) {
        console.log('Handling initial state...');
        this.myUserId = message.my_user_id;
        this.userIdElement.textContent = this.myUserId;
        
        const gridState = JSON.parse(message.grid_state);
        
        if (gridState.user_positions && gridState.user_positions[this.myUserId]) {
            const position = gridState.user_positions[this.myUserId];
            this.userPosition = { x: position[0], y: position[1] };
            this.userPositionElement.textContent = `(${this.userPosition.x}, ${this.userPosition.y})`;
            this.userPositions.set(this.myUserId, this.userPosition);
        }

        // Ne pas remplacer la grille existante, juste mettre à jour les couleurs
        if (message.sub_cell_states && message.sub_cell_states[this.myUserId]) {
            const subCellStates = message.sub_cell_states[this.myUserId];
            this.initialColors.set(this.myUserId, new Map(Object.entries(subCellStates)));
            
            // Mettre à jour les couleurs des cellules existantes
            const cells = this.userGrid.children;
            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const index = y * 20 + x;
                    const coords = `${x},${y}`;
                    if (cells[index]) {
                        cells[index].style.backgroundColor = subCellStates[coords] || '#000000';
                    }
                }
            }
        }

        if (message.spiral_order !== undefined) {
            this.spiralOrder = message.spiral_order;
            this.spiralOrderElement.textContent = this.spiralOrder;
        }

        this.startUpdates();
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 20000);
    }

    handleCellUpdate(message) {
        if (message.user_id === this.myUserId) {
            this.updateUserCell(message.sub_x, message.sub_y, message.color);
        }
    }

    stopSimulation() {
        if (!this.isSimulating) return;
        console.log('Stopping simulation...');

        if (this.toggleButton) {
            this.toggleButton.textContent = 'Start';
        }

        // Envoyer un message de départ avant la déconnexion
        if (this.socket && this.myUserId) {
            this.socket.send(JSON.stringify({
                type: 'user_left',
                user_id: this.myUserId
            }));
        }

        clearInterval(this.updateInterval);
        this.updateInterval = null;
        this.isSimulating = false;

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        // Réinitialiser l'interface
        this.cleanup();
    }

    disconnect() {
        console.log('Déconnexion...');
        clearInterval(this.heartbeatInterval);
        clearInterval(this.updateInterval);
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.isConnected = false;
        this.isSimulating = false;
    }

    cleanup() {
        this.cells.clear();
        this.userPositions.clear();
        this.userColors.clear();
        this.initialColors.clear();
        
        this.userIdElement.textContent = '-';
        this.userPositionElement.textContent = '-';
        this.spiralOrderElement.textContent = '-';
        if (this.userGrid) {
            this.userGrid.innerHTML = '';
        }
    }

    startUpdates() {
        this.updateInterval = setInterval(() => {
            if (!this.isSimulating || !this.socket) return;

            const x = Math.floor(Math.random() * 20);
            const y = Math.floor(Math.random() * 20);
            const color = `rgb(${Math.floor(Math.random()*255)},${Math.floor(Math.random()*255)},${Math.floor(Math.random()*255)})`;

            this.updateUserCell(x, y, color);

            this.socket.send(JSON.stringify({
                type: 'cell_update',
                sub_x: x,
                sub_y: y,
                color: color
            }));
        }, 1000);
    }

    addEventListeners() {
        if (this.toggleButton) {
            console.log('Adding toggle button listener');
            this.toggleButton.addEventListener('click', () => {
                if (this.isSimulating) {
                    this.stopSimulation();
                } else {
                    this.startSimulation();
                }
                this.toggleButton.textContent = this.isSimulating ? 'Stop' : 'Start';
            });
        }
    }

    handleDisconnection() {
        console.log('Handling disconnection...');
        this.isConnected = false;
        this.isSimulating = false;
        clearInterval(this.heartbeatInterval);
        clearInterval(this.updateInterval);
        
        if (this.toggleButton) {
            this.toggleButton.textContent = 'Start';
        }

        // Si on est toujours en mode simulation, tenter de se reconnecter
        if (this.isSimulating) {
            setTimeout(() => this.startSimulation(), 1000);
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new PoieticSimulator();
});