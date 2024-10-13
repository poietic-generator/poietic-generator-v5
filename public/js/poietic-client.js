class PoieticClient {
    constructor() {
        this.grid = document.getElementById('poietic-grid');
        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        
        this.connect();
        this.addResizeListener();
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:3000/updates');
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
    }

    handleMessage(message) {
        console.log('Received message:', message);
        switch (message.type) {
            case 'initial_state':
                this.initializeState(message);
                break;
            case 'zoom_update':
                this.updateZoom(message.grid_size, message.grid_state, message.user_colors);
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position, message.color);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                this.updateCells(JSON.parse(message.grid_state));
                break;
        }
    }

    initializeState(state) {
        console.log('Initializing state:', state);
        this.gridSize = state.grid_size;
        this.userColors = new Map(Object.entries(state.user_colors));
        const gridState = JSON.parse(state.grid_state);
        this.updateCells(gridState);
        this.updateGridSize();
    }

    updateCell(userId, x, y) {
        console.log(`Updating cell for user ${userId} at position (${x}, ${y})`);
        let cell = this.cells.get(userId);
        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }

        cell.style.backgroundColor = this.userColors.get(userId) || 'black';
        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);
    }

    positionCell(cell, x, y) {
        const offset = Math.floor(this.gridSize / 2);
        const pixelX = (x + offset) * this.cellSize;
        const pixelY = (y + offset) * this.cellSize;
        cell.style.left = `${pixelX}px`;
        cell.style.top = `${pixelY}px`;
        cell.style.width = `${this.cellSize}px`;
        cell.style.height = `${this.cellSize}px`;
        cell.style.position = 'absolute';
    }

    updateGridSize() {
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        this.cellSize = screenSize / this.gridSize;
        
        const actualGridSize = screenSize;
        this.grid.style.width = `${actualGridSize}px`;
        this.grid.style.height = `${actualGridSize}px`;
        
        this.grid.style.position = 'absolute';
        this.grid.style.left = '50%';
        this.grid.style.top = '50%';
        this.grid.style.transform = 'translate(-50%, -50%)';
        
        console.log(`Updated grid size to ${actualGridSize}px x ${actualGridSize}px, cell size: ${this.cellSize}px`);
        this.positionAllCells();
    }

    positionAllCells() {
        this.userPositions.forEach((position, userId) => {
            const cell = this.cells.get(userId);
            if (cell) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    updateZoom(newGridSize, gridState, userColors) {
        console.log(`Updating zoom to grid size ${newGridSize}`);
        this.gridSize = newGridSize;
        if (userColors) {
            this.userColors = new Map(Object.entries(userColors));
        }
        const gridStateObj = JSON.parse(gridState);
        this.updateCells(gridStateObj);
        this.updateGridSize();
    }

    updateCells(gridState) {
        // Mettre à jour les cellules existantes et ajouter les nouvelles
        Object.entries(gridState).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

        // Supprimer les cellules qui ne sont plus dans l'état de la grille
        this.cells.forEach((cell, userId) => {
            if (!gridState.hasOwnProperty(userId)) {
                this.removeUser(userId);
            }
        });
    }

    addNewUser(userId, position, color) {
        console.log(`Adding new user ${userId} at position ${position} with color ${color}`);
        this.userColors.set(userId, color);
        this.updateCell(userId, position[0], position[1]);
    }

    removeUser(userId) {
        console.log(`Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
        this.userPositions.delete(userId);
        this.userColors.delete(userId);
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            this.updateGridSize();
        });
    }
}

const client = new PoieticClient();
