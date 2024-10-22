class PoieticViewer {
    constructor() {
        if (PoieticViewer.instance) {
            return PoieticViewer.instance;
        }
        PoieticViewer.instance = this;

        this.grid = document.getElementById('poietic-grid');
        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;

        this.connect();
        this.addResizeListener();
    }

    connect() {
        if (this.isConnected) {
            console.log('Already connected, skipping reconnection');
            return;
        }

        this.socket = new WebSocket('ws://localhost:3000/updates?mode=full');
        this.socket.onopen = () => {
            console.log('WebSocket connection established');
            this.isConnected = true;
        };
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onclose = () => {
            console.log('WebSocket connection closed');
            this.isConnected = false;
        };
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(message) {
        console.log('Received message:', message);
        switch (message.type) {
            case 'initial_state':
                this.initializeState(message);
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position, message.color);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                break;
            case 'cell_update':
                this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
                break;
            case 'zoom_update':
                this.updateZoom(message.grid_size, message.grid_state, message.user_colors, message.sub_cell_states);
                break;
            default:
                console.warn('Received unknown message type:', message.type);
        }
    }

    initializeState(state) {
        console.log('Initializing state:', state);
        this.gridSize = state.grid_size;
        this.userColors = new Map(Object.entries(state.user_colors));

        const gridState = JSON.parse(state.grid_state);
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

        if (state.sub_cell_states) {
            Object.entries(state.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }

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

        cell.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            for (let j = 0; j < 20; j++) {
                const subCell = document.createElement('div');
                subCell.className = 'sub-cell';
                subCell.dataset.x = i;
                subCell.dataset.y = j;
                cell.appendChild(subCell);
            }
        }

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
    }

    updateSubCell(userId, subX, subY, color) {
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.children[subY * 20 + subX];
            if (subCell) {
                subCell.style.backgroundColor = color;
            }
        }
    }

    addNewUser(userId, position, color) {
        this.userColors.set(userId, color);
        this.updateCell(userId, position[0], position[1]);
    }

    removeUser(userId) {
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
        this.userPositions.delete(userId);
        this.userColors.delete(userId);
    }

    updateZoom(newGridSize, gridState, userColors, subCellStates) {
        this.gridSize = newGridSize;
        this.userColors = new Map(Object.entries(userColors));

        const parsedGridState = JSON.parse(gridState);
        Object.entries(parsedGridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

        Object.entries(subCellStates).forEach(([userId, subCells]) => {
            Object.entries(subCells).forEach(([coords, color]) => {
                const [subX, subY] = coords.split(',').map(Number);
                this.updateSubCell(userId, subX, subY, color);
            });
        });

        this.updateGridSize();
    }

    updateGridSize() {
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        this.cellSize = screenSize / this.gridSize;
        this.subCellSize = this.cellSize / 20;

        this.grid.style.width = `${screenSize}px`;
        this.grid.style.height = `${screenSize}px`;

        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            this.updateGridSize();
        });
    }
}

// Initialisation du visualiseur
document.addEventListener('DOMContentLoaded', () => {
    window.poieticViewer = new PoieticViewer();
});
