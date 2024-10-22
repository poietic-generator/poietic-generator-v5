class PoieticClientMonitoring {
    constructor() {
        this.grid = document.getElementById('poietic-grid');
        this.cells = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.colorProfileCanvas = document.getElementById('color-profile-canvas');
        this.statsContent = document.getElementById('stats-content');
        this.connect();
        this.addResizeListener();
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:3000/updates?mode=monitoring');
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onopen = () => {
            console.log('WebSocket connection established for monitoring');
        };
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        this.socket.onclose = () => {
            console.log('WebSocket connection closed for monitoring');
        };
    }

    handleMessage(message) {
        console.log('Received message:', message);
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
        this.updateMonitoring();
    }

    initializeState(state) {
        console.log('Initializing state:', state);
        this.gridSize = state.grid_size;
        const parsedGridState = JSON.parse(state.grid_state);
        
        // Clear existing cells
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
        this.updateMonitoring();
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

    addNewUser(userId, position) {
        console.log(`Adding new user ${userId} at position (${position[0]}, ${position[1]})`);
        this.updateCell(userId, position[0], position[1]);
    }

    removeUser(userId) {
        console.log(`Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
    }

    updateZoom(newGridSize, gridState, subCellStates) {
        console.log('Updating zoom:', newGridSize);
        this.gridSize = newGridSize;
        const parsedGridState = JSON.parse(gridState);
        
        // Update existing cells and add new ones
        Object.entries(parsedGridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });
        
        // Remove cells that are no longer present
        this.cells.forEach((cell, userId) => {
            if (!parsedGridState.user_positions[userId]) {
                this.removeUser(userId);
            }
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
        const containerSize = Math.min(this.grid.clientWidth, this.grid.clientHeight);
        this.cellSize = containerSize / this.gridSize;
        this.grid.style.width = `${containerSize}px`;
        this.grid.style.height = `${containerSize}px`;
        this.cells.forEach((cell, userId) => {
            const position = this.getCellPosition(cell);
            this.positionCell(cell, position[0], position[1]);
        });
    }

    getCellPosition(cell) {
        const offset = Math.floor(this.gridSize / 2);
        const x = (parseInt(cell.style.left) / this.cellSize) - offset;
        const y = (parseInt(cell.style.top) / this.cellSize) - offset;
        return [x, y];
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            this.updateGridSize();
        });
        const observer = new ResizeObserver(() => this.updateGridSize());
        observer.observe(this.grid);
    }

    updateMonitoring() {
        this.updateColorProfile();
        this.updateStats();
    }

    updateColorProfile() {
        if (!this.colorProfileCanvas) return;

        const ctx = this.colorProfileCanvas.getContext('2d');
        const width = this.colorProfileCanvas.width;
        const height = this.colorProfileCanvas.height;

        ctx.clearRect(0, 0, width, height);

        const colorCounts = {};
        this.cells.forEach(cell => {
            Array.from(cell.children).forEach(subCell => {
                const color = subCell.style.backgroundColor;
                if (color) {
                    colorCounts[color] = (colorCounts[color] || 0) + 1;
                }
            });
        });

        const totalPixels = this.cells.size * 400; // 20x20 sub-cells per cell
        let x = 0;
        Object.entries(colorCounts).forEach(([color, count]) => {
            const percentage = count / totalPixels;
            const barWidth = Math.max(1, Math.floor(width * percentage));
            ctx.fillStyle = color;
            ctx.fillRect(x, 0, barWidth, height);
            x += barWidth;
        });
    }

    updateStats() {
        if (!this.statsContent) return;

        const totalUsers = this.cells.size;
        const totalPixels = totalUsers * 400;
        const uniqueColors = new Set();

        this.cells.forEach(cell => {
            Array.from(cell.children).forEach(subCell => {
                const color = subCell.style.backgroundColor;
                if (color) {
                    uniqueColors.add(color);
                }
            });
        });

        const statsHtml = `
            <p>Nombre total d'utilisateurs : ${totalUsers}</p>
            <p>Nombre total de pixels : ${totalPixels}</p>
            <p>Nombre de couleurs uniques : ${uniqueColors.size}</p>
        `;

        this.statsContent.innerHTML = statsHtml;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.poieticClientMonitoring = new PoieticClientMonitoring();
});