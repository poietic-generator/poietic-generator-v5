class PoieticClientMonitoring {
    constructor() {
        console.log("PoieticClientMonitoring: Constructor called");
        this.grid = document.getElementById('poietic-grid');
        if (!this.grid) {
            console.error("PoieticClientMonitoring: Unable to find #poietic-grid element");
        }
        this.cells = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.colorProfileCanvas = document.getElementById('color-profile-canvas');
        this.statsContent = document.getElementById('stats-content');
        this.initPopups();
        this.connect();
        this.addResizeListener();
    }

    initPopups() {
        this.gridPopup = this.createPopup('grid-popup', 'Dessin collectif');
        this.colorProfilePopup = this.createPopup('color-profile-popup', 'Profil chromatique');

        if (this.grid) {
            this.gridPopup.querySelector('.popup-content').appendChild(this.grid);
        }
        if (this.colorProfileCanvas) {
            this.colorProfilePopup.querySelector('.popup-content').appendChild(this.colorProfileCanvas);
        }

        this.makeDraggable(this.gridPopup);
        this.makeDraggable(this.colorProfilePopup);
    }

    createPopup(id, title) {
        let popup = document.getElementById(id);
        if (!popup) {
            popup = document.createElement('div');
            popup.id = id;
            popup.className = 'popup';
            popup.innerHTML = `
                <div class="popup-header">
                    <span>${title}</span>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="popup-content"></div>
            `;
            document.body.appendChild(popup);
            
            const closeBtn = popup.querySelector('.close-btn');
            closeBtn.addEventListener('click', () => popup.style.display = 'none');
        }
        return popup;
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.querySelector('.popup-header').onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    connect() {
        console.log("PoieticClientMonitoring: Connecting to WebSocket");
        this.socket = new WebSocket('ws://localhost:3000/updates?mode=monitoring');
        this.socket.onopen = () => {
            console.log("PoieticClientMonitoring: WebSocket connection established");
        };
        this.socket.onmessage = (event) => {
            console.log("PoieticClientMonitoring: Message received", event.data);
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onerror = (error) => {
            console.error("PoieticClientMonitoring: WebSocket error", error);
        };
        this.socket.onclose = () => {
            console.log("PoieticClientMonitoring: WebSocket connection closed");
        };
    }

    handleMessage(message) {
        console.log("PoieticClientMonitoring: Handling message", message.type);
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
        this.updateGridSize();
        this.updateMonitoring();
    }

    initializeState(state) {
        console.log("PoieticClientMonitoring: Initializing state");
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
        this.updateMonitoring();
    }

    updateCell(userId, x, y) {
        console.log(`PoieticClientMonitoring: Updating cell for user ${userId} at (${x}, ${y})`);
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
        console.log(`PoieticClientMonitoring: Cell positioned at (${pixelX}, ${pixelY}), size: ${this.cellSize}px`);
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
        console.log(`PoieticClientMonitoring: Adding new user ${userId} at position (${position[0]}, ${position[1]})`);
        this.updateCell(userId, position[0], position[1]);
    }

    removeUser(userId) {
        console.log(`PoieticClientMonitoring: Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
    }

    updateZoom(newGridSize, gridState, subCellStates) {
        console.log(`PoieticClientMonitoring: Updating zoom to grid size ${newGridSize}`);
        this.gridSize = newGridSize;
        const parsedGridState = JSON.parse(gridState);

        Object.entries(parsedGridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

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
        console.log("PoieticClientMonitoring: Updating grid size");
        const popupContent = this.gridPopup.querySelector('.popup-content');
        const gridSize = Math.min(popupContent.clientWidth, popupContent.clientHeight);
        
        this.grid.style.width = `${gridSize}px`;
        this.grid.style.height = `${gridSize}px`;
        
        this.cellSize = Math.max(1, gridSize / this.gridSize);
        
        this.cells.forEach((cell, userId) => {
            const position = this.getCellPosition(cell);
            this.positionCell(cell, position[0], position[1]);
        });
        
        console.log(`PoieticClientMonitoring: Grid size set to ${gridSize}px, cell size: ${this.cellSize}px`);
    }

    getCellPosition(cell) {
        const offset = Math.floor(this.gridSize / 2);
        const x = (parseInt(cell.style.left) / this.cellSize) - offset;
        const y = (parseInt(cell.style.top) / this.cellSize) - offset;
        return [x, y];
    }

    addResizeListener() {
        const resizeObserver = new ResizeObserver(() => {
            console.log("PoieticClientMonitoring: Popup resized");
            this.updateGridSize();
        });
        resizeObserver.observe(this.gridPopup.querySelector('.popup-content'));
    }

    updateMonitoring() {
        console.log("PoieticClientMonitoring: Updating monitoring");
        this.updateColorProfile();
        this.updateStats();
    }

    updateColorProfile() {
        console.log("PoieticClientMonitoring: Updating color profile");
        if (!this.colorProfileCanvas) {
            console.error("PoieticClientMonitoring: Color profile canvas not found");
            return;
        }

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
        console.log("PoieticClientMonitoring: Updating stats");
        if (!this.statsContent) {
            console.error("PoieticClientMonitoring: Stats content element not found");
            return;
        }

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

console.log("poietic-client-monitoring.js: Script loaded");
document.addEventListener('DOMContentLoaded', () => {
    console.log("poietic-client-monitoring.js: DOM content loaded");
    window.poieticClientMonitoring = new PoieticClientMonitoring();
});
