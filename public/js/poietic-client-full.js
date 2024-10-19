class PoieticClientFull {
    constructor() {
        console.log("PoieticClientFull: Constructor called");
        this.grid = document.getElementById('poietic-grid');
        if (!this.grid) {
            console.error("PoieticClientFull: Unable to find #poietic-grid element");
        }
        this.cells = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.connect();
        this.addResizeListener();
    }

    connect() {
        console.log("PoieticClientFull: Connecting to WebSocket");
        this.socket = new WebSocket('ws://localhost:3000/updates?mode=full');
        this.socket.onopen = () => {
            console.log("PoieticClientFull: WebSocket connection established");
        };
        this.socket.onmessage = (event) => {
            console.log("PoieticClientFull: Message received", event.data);
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onerror = (error) => {
            console.error("PoieticClientFull: WebSocket error", error);
        };
        this.socket.onclose = () => {
            console.log("PoieticClientFull: WebSocket connection closed");
        };
    }

    handleMessage(message) {
        console.log("PoieticClientFull: Handling message", message.type);
        switch (message.type) {
            case 'initial_state':
                this.initializeState(message);
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                break;
            case 'cell_update':
                this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
                break;
            case 'zoom_update':
                this.updateZoom(message.grid_size, message.grid_state, message.sub_cell_states);
                break;
        }
    }

    initializeState(state) {
        console.log("PoieticClientFull: Initializing state");
        this.gridSize = state.grid_size;
        const parsedGridState = JSON.parse(state.grid_state);

        this.cells.forEach(cell => this.grid.removeChild(cell));
        this.cells.clear();

        Object.entries(parsedGridState.user_positions).forEach(([userId, position]) => {
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
        console.log(`PoieticClientFull: Updating cell for user ${userId} at (${x}, ${y})`);
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
        console.log(`PoieticClientFull: Cell positioned at (${pixelX}, ${pixelY}), size: ${this.cellSize}px`);
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

    addNewUser(userId, position) {
        console.log(`PoieticClientFull: Adding new user ${userId} at position (${position[0]}, ${position[1]})`);
        this.updateCell(userId, position[0], position[1]);
        this.updateGridSize();
    }

    removeUser(userId) {
        console.log(`PoieticClientFull: Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
        this.updateGridSize();
    }

    updateZoom(newGridSize, gridState, subCellStates) {
        console.log(`PoieticClientFull: Updating zoom to grid size ${newGridSize}`);
        this.gridSize = newGridSize;
        const parsedGridState = JSON.parse(gridState);

        // Supprimer les cellules qui ne sont plus présentes
        this.cells.forEach((cell, userId) => {
            if (!parsedGridState.user_positions[userId]) {
                this.removeUser(userId);
            }
        });

        // Mettre à jour ou ajouter les cellules
        Object.entries(parsedGridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

        if (subCellStates) {
            Object.entries(subCellStates).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }

        this.updateGridSize();
    }

    updateGridSize() {
        console.log("PoieticClientFull: Updating grid size");
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const gridSize = Math.min(windowWidth, windowHeight);
        
        this.grid.style.width = `${gridSize}px`;
        this.grid.style.height = `${gridSize}px`;
        this.grid.style.left = `${(windowWidth - gridSize) / 2}px`;
        this.grid.style.top = `${(windowHeight - gridSize) / 2}px`;
        
        this.cellSize = Math.max(1, gridSize / this.gridSize);
        
        this.cells.forEach((cell, userId) => {
            const position = this.getCellPosition(cell);
            this.positionCell(cell, position[0], position[1]);
        });
        
        console.log(`PoieticClientFull: Grid size set to ${gridSize}px, cell size: ${this.cellSize}px`);
    }

    getCellPosition(cell) {
        const offset = Math.floor(this.gridSize / 2);
        const x = (parseInt(cell.style.left) / this.cellSize) - offset;
        const y = (parseInt(cell.style.top) / this.cellSize) - offset;
        return [x, y];
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            console.log("PoieticClientFull: Window resized");
            this.updateGridSize();
        });
    }
}

console.log("poietic-client-full.js: Script loaded");
document.addEventListener('DOMContentLoaded', () => {
    console.log("poietic-client-full.js: DOM content loaded");
    window.poieticClientFull = new PoieticClientFull();
});
