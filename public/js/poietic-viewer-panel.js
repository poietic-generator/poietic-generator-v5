class PoieticViewerPanel {
    constructor(container) {
        this.container = container;
        this.setupGrid();
        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;

        this.connect();
        this.addResizeListener();
    }

    setupGrid() {
        this.grid = document.createElement('div');
        this.grid.style.width = '100%';
        this.grid.style.height = '100%';
        this.grid.style.position = 'relative';
        this.grid.style.backgroundColor = 'black';
        this.grid.style.aspectRatio = '1';
        this.grid.style.margin = 'auto';
        this.container.appendChild(this.grid);

        this.container.classList.add('viewer-content');
    }

    connect() {
        if (this.isConnected) {
            return;
        }

        this.socket = new WebSocket('ws://localhost:3001/updates?mode=monitoring');
        this.socket.onopen = () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
        };
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onclose = () => {
            this.isConnected = false;
            this.handleDisconnection();
        };
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(message) {
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
        }
    }

    initializeState(state) {
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
        const containerSize = Math.min(this.container.clientWidth, this.container.clientHeight);
        this.cellSize = containerSize / this.gridSize;
        this.subCellSize = this.cellSize / 20;

        const gridSize = containerSize;
        this.grid.style.width = `${gridSize}px`;
        this.grid.style.height = `${gridSize}px`;

        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    addResizeListener() {
        const resizeObserver = new ResizeObserver(() => {
            this.updateGridSize();
        });
        resizeObserver.observe(this.container);
    }

    handleDisconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        }
    }
} 