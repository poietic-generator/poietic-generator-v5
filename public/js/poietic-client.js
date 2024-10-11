class PoieticClient {
    constructor() {
        this.grid = document.getElementById('poietic-grid');
        this.users = new Map();
        this.zoomLevel = 0;
        this.userColors = new Map();
        this.connect();
        this.addResizeListener();
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:3000/updates');
        this.socket.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    }

    handleMessage(message) {
        console.log('Received message:', message);
        switch (message.type) {
            case 'initial_state':
                this.initializeGrid(message);
                break;
            case 'grid_update':
                this.updateCell(message.payload);
                break;
            case 'zoom_update':
                this.updateZoom(message.zoom_level);
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position, message.color);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                break;
            case 'chat_message':
                console.log('Chat message:', message.payload);
                break;
        }
    }

    initializeGrid(state) {
        this.zoomLevel = state.zoom_level;
        this.userColors = new Map(Object.entries(state.user_colors));
        const gridState = JSON.parse(state.grid_state);
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            this.updateCell({ user_id: userId, x: position[0], y: position[1], color: this.userColors.get(userId) });
        });
        this.updateGridSize();
    }

    updateCell(cellData) {
        let cell = this.users.get(cellData.user_id);
        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            this.grid.appendChild(cell);
            this.users.set(cellData.user_id, cell);
        }
        
        cell.style.backgroundColor = cellData.color || this.userColors.get(cellData.user_id);
        this.positionCell(cell, cellData.x, cellData.y);
    }

    positionCell(cell, x, y) {
        const cellSize = this.calculateCellSize();
        const pixelX = (x + this.zoomLevel) * cellSize;
        const pixelY = (y + this.zoomLevel) * cellSize;
        cell.style.left = `${pixelX}px`;
        cell.style.top = `${pixelY}px`;
        cell.style.width = `${cellSize}px`;
        cell.style.height = `${cellSize}px`;
    }

    updateZoom(newZoomLevel) {
        this.zoomLevel = newZoomLevel;
        this.updateGridSize();
        this.users.forEach((cell, userId) => {
            const position = this.getPositionFromStyle(cell);
            this.positionCell(cell, position.x, position.y);
        });
    }

    updateGridSize() {
        const gridSize = (this.zoomLevel * 2 + 1) * this.calculateCellSize();
        this.grid.style.width = `${gridSize}px`;
        this.grid.style.height = `${gridSize}px`;
    }

    calculateCellSize() {
        const gridSize = Math.min(window.innerWidth, window.innerHeight) * 0.9;
        return gridSize / (this.zoomLevel * 2 + 1);
    }

    getPositionFromStyle(cell) {
        const cellSize = this.calculateCellSize();
        const x = parseInt(cell.style.left) / cellSize - this.zoomLevel;
        const y = parseInt(cell.style.top) / cellSize - this.zoomLevel;
        return { x, y };
    }

    addNewUser(userId, position, color) {
        this.userColors.set(userId, color);
        this.updateCell({ user_id: userId, x: position[0], y: position[1], color: color });
    }

    removeUser(userId) {
        const cell = this.users.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.users.delete(userId);
            this.userColors.delete(userId);
        }
    }

    addResizeListener() {
        window.addEventListener('resize', () => {
            this.updateGridSize();
            this.users.forEach((cell, userId) => {
                const position = this.getPositionFromStyle(cell);
                this.positionCell(cell, position.x, position.y);
            });
        });
    }
}

const client = new PoieticClient();
