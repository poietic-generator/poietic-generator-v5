class PoieticClient {
    constructor() {
        if (PoieticClient.instance) {
            return PoieticClient.instance;
        }
        PoieticClient.instance = this;

        this.grid = document.getElementById('poietic-grid');
        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.currentColor = null;
        this.lastSelectedColor = null;
        this.isDrawing = false;
        this.myUserId = null;
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        this.initialColors = new Map();
        this.isConnected = false;
        this.cache = new Map();

        this.lastActivity = Date.now();
        this.disconnectedAt = null;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;

        this.connect();
        this.addResizeListener();
        this.addDrawingListeners();
        this.createColorPalette();
        this.createActivityTimer();
        this.createHeartbeat();
        this.createReconnectButton();
    }

    connect() {
        if (this.isConnected) {
            console.log('Already connected, skipping reconnection');
            return;
        }

        this.socket = new WebSocket('ws://localhost:3001/updates');
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
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
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
            case 'user_disconnected':
                this.handleUserDisconnected(message);
                break;
            default:
                console.warn('Received unknown message type:', message.type);
        }
    }

    initializeState(state) {
        console.log('Initializing state:', state);
        this.gridSize = state.grid_size;
        this.userColors = new Map(Object.entries(state.user_colors));
        this.myUserId = state.my_user_id;
        this.initialColors = state.initial_colors ? new Map(Object.entries(state.initial_colors)) : new Map();

        // Initialiser la couleur de l'utilisateur
        if (this.userColors.has(this.myUserId)) {
            this.currentColor = this.userColors.get(this.myUserId);
        } else if (this.initialColors.has(this.myUserId)) {
            this.currentColor = this.initialColors.get(this.myUserId)[0]; // Prendre la première couleur du tableau
        } else {
            this.currentColor = this.getRandomColor();
        }
        this.lastSelectedColor = this.currentColor;
        this.updateColorPreview();

        console.log('Initial color set to:', this.currentColor);

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

    updateColorPreview() {
        const colorPreview = document.getElementById('color-preview');
        if (colorPreview && this.currentColor) {
            colorPreview.style.backgroundColor = this.currentColor;
        }
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
        const initialColors = this.initialColors.get(userId) || [];
        for (let i = 0; i < 20; i++) {
            for (let j = 0; j < 20; j++) {
                const subCell = document.createElement('div');
                subCell.className = 'sub-cell';
                subCell.dataset.x = i;
                subCell.dataset.y = j;
                subCell.style.backgroundColor = initialColors[i * 20 + j] || this.getRandomColor();
                cell.appendChild(subCell);
            }
        }

        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);

        if (userId !== this.myUserId) {
            cell.addEventListener('click', (event) => this.handleColorBorrowing(event, userId));
            cell.addEventListener('touchstart', (event) => this.handleColorBorrowing(event, userId));
        }
    }

    getRandomColor() {
        const cacheKey = 'random_colors';
        if (!this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, []);
        }
        const cachedColors = this.cache.get(cacheKey);
        if (cachedColors.length > 0) {
            return cachedColors.pop();
        }
        // Générer un lot de nouvelles couleurs
        const newColors = Array(100).fill().map(() => {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            return `rgb(${r},${g},${b})`;
        });
        this.cache.set(cacheKey, newColors);
        return newColors.pop();
    }

    handleColorBorrowing(event, userId) {
        const cell = this.cells.get(userId);
        const rect = cell.getBoundingClientRect();
        const x = (event.clientX || event.touches[0].clientX) - rect.left;
        const y = (event.clientY || event.touches[0].clientY) - rect.top;
        const subX = Math.floor(x / (rect.width / 20));
        const subY = Math.floor(y / (rect.height / 20));
        const subCell = cell.children[subY * 20 + subX];
        if (subCell) {
            const borrowedColor = subCell.style.backgroundColor;
            this.updateCurrentColor(borrowedColor);
        }
    }

    updateCurrentColor(color) {
        this.currentColor = color;
        this.lastSelectedColor = color;
        this.updateColorPreview();
    }

    positionCell(cell, x, y) {
        const cacheKey = `cell_position_${x}_${y}`;
        if (this.cache.has(cacheKey)) {
            const cachedPosition = this.cache.get(cacheKey);
            cell.style.left = cachedPosition.left;
            cell.style.top = cachedPosition.top;
            cell.style.width = cachedPosition.width;
            cell.style.height = cachedPosition.height;
        } else {
            const offset = Math.floor(this.gridSize / 2);
            const pixelX = (x + offset) * this.cellSize;
            const pixelY = (y + offset) * this.cellSize;
            cell.style.left = `${pixelX}px`;
            cell.style.top = `${pixelY}px`;
            cell.style.width = `${this.cellSize}px`;
            cell.style.height = `${this.cellSize}px`;

            this.cache.set(cacheKey, {
                left: cell.style.left,
                top: cell.style.top,
                width: cell.style.width,
                height: cell.style.height
            });
        }
    }

    updateSubCell(userId, subX, subY, color) {
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.children[subY * 20 + subX];
            if (subCell) {
                subCell.style.backgroundColor = color;
            }
        }

        if (userId === this.myUserId) {
            this.lastActivity = Date.now();
            this.updateActivityDisplay();
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
        this.initialColors.delete(userId);
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

        // Vider le cache car les positions ont changé
        this.cache.clear();

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
            this.updatePalettePosition();
        });
    }

    addDrawingListeners() {
        this.grid.addEventListener('mouseenter', this.handleGridEnter.bind(this));
        this.grid.addEventListener('mouseleave', this.handleGridLeave.bind(this));
        this.grid.addEventListener('mousemove', this.handleGridMove.bind(this));
        this.grid.addEventListener('mousedown', this.startDrawing.bind(this));
        this.grid.addEventListener('mousemove', this.draw.bind(this));
        this.grid.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.grid.addEventListener('mouseleave', this.stopDrawing.bind(this));

        this.grid.addEventListener('mousemove', this.hidePalette.bind(this));
        this.grid.addEventListener('mousedown', this.hidePalette.bind(this));

        this.grid.addEventListener('touchstart', this.startDrawing.bind(this));
        this.grid.addEventListener('touchmove', this.draw.bind(this));
        this.grid.addEventListener('touchend', this.stopDrawing.bind(this));
    }

    handleGridEnter() {
        this.isOverGrid = true;
        this.updateHighlight();
    }

    handleGridLeave() {
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        this.updateHighlight();
    }

    handleGridMove(event) {
        const targetCell = event.target.closest('.user-cell');
        if (targetCell) {
            const userId = [...this.cells.entries()].find(([_, cell]) => cell === targetCell)?.[0];
            this.isOverOwnCell = userId === this.myUserId;
        } else {
            this.isOverOwnCell = false;
        }
        this.updateHighlight();
    }

    updateHighlight() {
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            if (this.isOverGrid && !this.isOverOwnCell) {
                myCell.classList.add('highlighted');
            } else {
                myCell.classList.remove('highlighted');
            }
        }
    }

    startDrawing(event) {
        this.isDrawing = true;
        this.draw(event);
    }

    draw(event) {
        if (!this.isDrawing || !this.currentColor) return;

        const myCell = this.cells.get(this.myUserId);
        if (!myCell) return;

        const gridRect = this.grid.getBoundingClientRect();
        const myCellRect = myCell.getBoundingClientRect();

        let x, y;
        if (event.type.startsWith('touch')) {
            x = event.touches[0].clientX - gridRect.left;
            y = event.touches[0].clientY - gridRect.top;
        } else {
            x = event.clientX - gridRect.left;
            y = event.clientY - gridRect.top;
        }

        if (x >= myCellRect.left - gridRect.left && x <= myCellRect.right - gridRect.left &&
            y >= myCellRect.top - gridRect.top && y <= myCellRect.bottom - gridRect.top) {

            const subX = Math.floor((x - (myCellRect.left - gridRect.left)) / (myCellRect.width / 20));
            const subY = Math.floor((y - (myCellRect.top - gridRect.top)) / (myCellRect.height / 20));

            this.updateSubCell(this.myUserId, subX, subY, this.currentColor);
            this.sendCellUpdate(subX, subY, this.currentColor);
        }
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    sendCellUpdate(subX, subY, color) {
        const message = {
            type: 'cell_update',
            sub_x: subX,
            sub_y: subY,
            color: color
        };
        this.socket.send(JSON.stringify(message));
    }

    createColorPalette() {
        const palette = document.createElement('div');
        palette.id = 'color-palette';
        document.body.appendChild(palette);

        const colorPreview = document.createElement('div');
        colorPreview.id = 'color-preview';
        if (this.currentColor) {
            colorPreview.style.backgroundColor = this.currentColor;
        }
        palette.appendChild(colorPreview);

        const gradientPalette = document.createElement('canvas');
        gradientPalette.id = 'gradient-palette';
        gradientPalette.width = 200;
        gradientPalette.height = 200;
        palette.appendChild(gradientPalette);

        const ctx = gradientPalette.getContext('2d');

        const gradientH = ctx.createLinearGradient(0, 0, gradientPalette.width, 0);
        gradientH.addColorStop(0, "rgb(255, 0, 0)");
        gradientH.addColorStop(1/6, "rgb(255, 255, 0)");
        gradientH.addColorStop(2/6, "rgb(0, 255, 0)");
        gradientH.addColorStop(3/6, "rgb(0, 255, 255)");
        gradientH.addColorStop(4/6, "rgb(0, 0, 255)");
        gradientH.addColorStop(5/6, "rgb(255, 0, 255)");
        gradientH.addColorStop(1, "rgb(255, 0, 0)");

        const gradientV = ctx.createLinearGradient(0, 0, 0, gradientPalette.height);
        gradientV.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradientV.addColorStop(0.5, "rgba(255, 255, 255, 0)");
        gradientV.addColorStop(0.5, "rgba(0, 0, 0, 0)");
        gradientV.addColorStop(1, "rgba(0, 0, 0, 1)");

        ctx.fillStyle = gradientH;
        ctx.fillRect(0, 0, gradientPalette.width, gradientPalette.height);

        ctx.fillStyle = gradientV;
        ctx.fillRect(0, 0, gradientPalette.width, gradientPalette.height);

        gradientPalette.addEventListener('click', (e) => {
            const rect = gradientPalette.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const imageData = ctx.getImageData(x, y, 1, 1);
            const [r, g, b] = imageData.data;
            this.updateCurrentColor(`rgb(${r},${g},${b})`);
            gradientPalette.style.display = 'none';
        });

        gradientPalette.addEventListener('mouseleave', () => {
            gradientPalette.style.display = 'none';
        });

        gradientPalette.addEventListener('touchend', (e) => {
            const touch = e.changedTouches[0];
            const rect = gradientPalette.getBoundingClientRect();
            if (touch.clientX < rect.left || touch.clientX > rect.right ||
                touch.clientY < rect.top || touch.clientY > rect.bottom) {
                gradientPalette.style.display = 'none';
            }
        });

        colorPreview.style.width = `${gradientPalette.width}px`;
        colorPreview.style.height = `${gradientPalette.height}px`;
        gradientPalette.style.display = 'none';

        colorPreview.addEventListener('click', () => {
            gradientPalette.style.display = gradientPalette.style.display === 'none' ? 'block' : 'none';
        });

        this.updatePalettePosition();
    }

    updatePalettePosition() {
        const palette = document.getElementById('color-palette');
        if (window.innerWidth > window.innerHeight) {
            palette.style.right = '10px';
            palette.style.top = '50%';
            palette.style.transform = 'translateY(-50%)';
            palette.style.bottom = 'auto';
            palette.style.left = 'auto';
        } else {
            palette.style.bottom = '10px';
            palette.style.left = '50%';
            palette.style.transform = 'translateX(-50%)';
            palette.style.right = 'auto';
            palette.style.top = 'auto';
        }
    }

    hidePalette() {
        const gradientPalette = document.getElementById('gradient-palette');
        if (gradientPalette) {
            gradientPalette.style.display = 'none';
        }
    }

    createActivityTimer() {
        setInterval(() => {
            this.updateActivityDisplay();
        }, 1000);
    }

    createHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 5000);
    }

    updateActivityDisplay() {
        const activityTime = this.disconnectedAt || this.lastActivity;
        const inactiveTime = (Date.now() - activityTime) / 1000;
        const remainingTime = Math.max(180 - inactiveTime, 0);

        const cursorElement = document.getElementById('activity-cursor');
        if (cursorElement) {
            cursorElement.style.height = `${(remainingTime / 180) * 100}%`;
        }

        if (remainingTime === 0 && !this.reconnectTimeout) {
            this.showReconnectButton();
        }
    }

    createReconnectButton() {
        const reconnectButton = document.createElement('button');
        reconnectButton.id = 'reconnect-button';
        reconnectButton.textContent = 'RECONNECT';
        reconnectButton.style.display = 'none';
        reconnectButton.addEventListener('click', () => this.reconnect());

        const cursorContainer = document.createElement('div');
        cursorContainer.id = 'activity-cursor-container';
        const cursor = document.createElement('div');
        cursor.id = 'activity-cursor';

        cursorContainer.appendChild(cursor);
        cursorContainer.appendChild(reconnectButton);
        document.body.appendChild(cursorContainer);

        // Ajoutez les styles CSS nécessaires ici ou dans un fichier CSS séparé
    }

    showReconnectButton() {
        const reconnectButton = document.getElementById('reconnect-button');
        if (reconnectButton) {
            reconnectButton.style.display = 'block';
        }
    }

    reconnect() {
        this.connect();
        this.lastActivity = Date.now();
        this.disconnectedAt = null;
        this.updateActivityDisplay();
        const reconnectButton = document.getElementById('reconnect-button');
        if (reconnectButton) {
            reconnectButton.style.display = 'none';
        }
    }

    handleUserDisconnected(message) {
        if (message.user_id === this.myUserId) {
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        }
    }

    updateLastActivity() {
        this.lastActivity = Date.now();
        this.updateActivityDisplay();
    }
}

// Initialisation du client
document.addEventListener('DOMContentLoaded', () => {
    window.poieticClient = new PoieticClient();
});
