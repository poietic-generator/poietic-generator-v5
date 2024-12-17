import { ColorGenerator } from './poietic-color-generator.js';

export class PoieticViewer {
    constructor(gridId = 'poietic-grid', isObserver = true) {
        const instanceId = `viewer-${Math.random().toString(36).substr(2, 9)}`;

        if (!window.poieticViewerInstances) {
            window.poieticViewerInstances = {};
        }
        window.poieticViewerInstances[instanceId] = this;

        this.gridId = gridId;
        this.isObserver = isObserver;
        this.instanceId = instanceId;

        // Initialiser les structures de données
        this.cells = new Map();
        this.userPositions = new Map();
        this.userColors = new Map();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        console.log(`Initializing viewer for grid: ${this.gridId}`);
        this.grid = document.getElementById(this.gridId);
        if (!this.grid) {
            console.error(`Grid element with id ${this.gridId} not found`);
            return;
        }

        this.overlay = document.getElementById('qr-overlay');
        if (!this.overlay) {
            console.error(`Overlay element not found for ${this.gridId}`);
            return;
        }

        console.log(`Initializing viewer for ${this.gridId}...`);
        this.resetViewerState();
        this.connect();
        this.addResizeListener();
    }

    resetViewerState() {
        console.log('Resetting viewer state');
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        if (this.grid) {
            this.grid.innerHTML = '';
        }

        this.cells.clear();
        this.userPositions.clear();
        this.userColors.clear();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.isConnected = false;

        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
    }

    connect() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.host;
        
        const wsUrl = `${wsProtocol}//${wsHost}/updates?mode=full&type=observer`;
        console.log('Tentative de connexion WebSocket:', wsUrl);

        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                console.log('WebSocket connection established in viewer mode');
                this.isConnected = true;
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket connection closed:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    timestamp: new Date().toISOString()
                });
                this.isConnected = false;

                setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('Attempting to reconnect...');
                        this.connect();
                    }
                }, 1000);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', {
                    error: error,
                    readyState: this.socket.readyState,
                    timestamp: new Date().toISOString()
                });
            };

            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Received message:', message.type, message);

                    switch (message.type) {
                        case 'initial_state':
                            this.handleInitialState(message);
                            break;
                        case 'user_update':
                            this.handleUserUpdate(message);
                            break;
                        case 'cell_update':
                            this.handleCellUpdate(message);
                            break;
                        case 'user_left':
                            this.handleUserLeft(message);
                            break;
                        case 'zoom_update':
                            this.handleZoomUpdate(message);
                            break;
                        default:
                            console.log('Unknown message type:', message.type);
                    }
                } catch (e) {
                    console.error('Error processing message:', e, event.data);
                }
            };
        } catch (e) {
            console.error('Error creating WebSocket:', e);
        }
    }

    handleInitialState(message) {
        console.log('Processing initial state');
        this.gridSize = message.grid_size;

        // Traiter le grid_state
        if (message.grid_state) {
            const gridState = typeof message.grid_state === 'string' ?
                JSON.parse(message.grid_state) : message.grid_state;

            // Mettre à jour les positions des utilisateurs
            if (gridState.user_positions) {
                Object.entries(gridState.user_positions).forEach(([userId, position]) => {
                    this.updateCell(userId, position[0], position[1]);
                });
            }
        }

        // Générer les couleurs des utilisateurs localement
        if (message.user_colors) {
            this.userColors = new Map();
            Object.keys(message.user_colors).forEach(userId => {
                const colors = ColorGenerator.generateInitialColors(userId);
                this.userColors.set(userId, colors);
            });
        }

        // Mettre à jour les états des sous-cellules
        if (message.sub_cell_states) {
            Object.entries(message.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }

        this.updateGridSize();
    }

    handleUserUpdate(message) {
        if (message.user_positions) {
            Object.entries(message.user_positions).forEach(([userId, position]) => {
                this.updateCell(userId, position[0], position[1]);
            });
        }
    }

    handleCellUpdate(message) {
        if (message.user_id && typeof message.sub_x === 'number' &&
            typeof message.sub_y === 'number' && message.color) {
            this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
        }
    }

    handleUserLeft(message) {
        console.log('User left:', message.user_id);
        if (message.user_id) {
            this.removeUser(message.user_id);
        }
    }

    handleZoomUpdate(message) {
        if (typeof message.grid_size === 'number') {
            this.updateZoom(
                message.grid_size,
                message.grid_state,
                message.user_colors,
                message.sub_cell_states
            );
        }
    }

    updateCell(userId, x, y) {
        console.log(`Creating/updating cell for user ${userId} at (${x}, ${y})`);
        let cell = this.cells.get(userId);

        if (!cell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';

            for (let y = 0; y < 20; y++) {
                for (let x = 0; x < 20; x++) {
                    const subCell = document.createElement('div');
                    subCell.className = 'sub-cell';
                    subCell.dataset.x = x.toString();
                    subCell.dataset.y = y.toString();
                    cell.appendChild(subCell);
                }
            }

            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }

        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);

        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
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
        console.log(`Updating subcell for user ${userId} at (${subX}, ${subY}) with color ${color}`);
        const cell = this.cells.get(userId);
        if (cell) {
            const subCell = cell.querySelector(`[data-x="${subX}"][data-y="${subY}"]`);
            if (subCell) {
                subCell.style.backgroundColor = color;
            } else {
                console.warn(`SubCell not found at ${subX},${subY} for user ${userId}`);
            }
        } else {
            console.warn(`Cell not found for user ${userId}`);
        }
    }

    addNewUser(userId, position, color) {
        console.log(`Adding new user ${userId} at position (${position[0]}, ${position[1]})`);
        this.userColors.set(userId, color);
        this.updateCell(userId, position[0], position[1]);

        if (this.overlay && this.cells.size > 0) {
            this.overlay.classList.remove('visible');
        }
    }

    removeUser(userId) {
        console.log(`Removing user ${userId}`);
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
            this.userPositions.delete(userId);
            this.userColors.delete(userId);
        }

        if (this.cells.size === 0 && this.overlay) {
            this.overlay.classList.add('visible');
        }
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