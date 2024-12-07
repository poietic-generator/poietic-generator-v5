import { ColorGenerator } from './poietic-color-generator.js';

export class PoieticViewer {
    constructor(gridId, isViewer = false) {
        console.log('Initialisation du PoieticViewer');
        this.grid = document.getElementById(gridId);
        this.qrOverlay = document.getElementById('qr-overlay');
        this.isViewer = isViewer;
        this.cells = new Map();
        this.userPositions = new Map();
        this.gridSize = 1;
        this.activeUsers = 0;

        // Montrer le QR code par défaut au chargement
        this.showQRCode();

        // Initialisation
        this.initializeLayout();

        // Créer l'élément de message d'erreur
        this.errorOverlay = document.createElement('div');
        this.errorOverlay.className = 'error-message';
        this.errorOverlay.style.display = 'none';
        this.qrOverlay.appendChild(this.errorOverlay);

        this.connect();
        this.requestFullscreen();

        // Gestion du redimensionnement avec debounce
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateLayout();
                this.updateAllCellPositions();
            }, 250);
        });
    }

    initializeLayout() {
        this.updateLayout();
        window.addEventListener('resize', () => this.updateLayout());
    }

    updateLayout() {
        if (!this.grid || !this.grid.parentElement) return;

        const windowRatio = window.innerWidth / window.innerHeight;
        const mainZone = this.grid.parentElement;
        let containerSize;

        // Calcul de la taille optimale du conteneur
        if (windowRatio < 1) { // Portrait
            containerSize = Math.min(window.innerWidth, window.innerHeight);
            mainZone.style.width = '100vw';
            mainZone.style.height = '100vw';
        } else { // Paysage
            containerSize = Math.min(window.innerWidth, window.innerHeight);
            mainZone.style.width = '100vh';
            mainZone.style.height = '100vh';
        }

        // Appliquer les dimensions au grid
        const size = `${containerSize}px`;
        this.grid.style.width = size;
        this.grid.style.height = size;

        // Centrer la grille dans la fenêtre
        mainZone.style.position = 'relative';
        mainZone.style.display = 'flex';
        mainZone.style.justifyContent = 'center';
        mainZone.style.alignItems = 'center';

        // Ajuster l'overlay QR pour qu'il soit exactement superposé à la grille
        if (this.qrOverlay) {
            Object.assign(this.qrOverlay.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: size,
                height: size,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                pointerEvents: 'none'
            });

            // Ajuster l'image QR
            const qrCode = this.qrOverlay.querySelector('#qr-code');
            if (qrCode) {
                Object.assign(qrCode.style, {
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                });
            }
        }

        // Mettre à jour la taille des cellules
        this.updateCellSizes(containerSize);

        // Ajuster aussi la taille du message d'erreur
        if (this.errorOverlay) {
            const errorSize = Math.min(containerSize * 0.4, 300); // 40% de la taille du conteneur ou 300px max
            Object.assign(this.errorOverlay.style, {
                width: `${errorSize}px`,
                height: `${errorSize * 0.3}px`, // Rectangle plus adapté pour le texte
            });
        }
    }

    updateCellSizes(containerSize) {
        const cellSize = containerSize / this.gridSize;
        this.cells.forEach(cell => {
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
        });
    }

    updateAllCellPositions() {
        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/updates?mode=full&type=observer`;
    
        try {
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('WebSocket connecté');
                this.isConnected = true;
                this.hideErrorMessage();
            };
    
            this.socket.onmessage = (event) => {
                console.log('Message reçu:', event.data);
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Erreur lors du traitement du message:', error);
                }
            };
    
            this.socket.onclose = (event) => {
                console.log('WebSocket déconnecté, code:', event.code);
                const wasConnected = this.isConnected; // Sauvegarder l'état avant de le changer
                this.isConnected = false;
                
                // Nettoyer l'affichage
                this.grid.innerHTML = '';
                this.cells.clear();
                this.userPositions.clear();
                this.activeUsers = 0;
                this.showQRCode();
    
                // Si on était connecté avant la déconnexion,
                // c'est que le serveur a été arrêté
                if (wasConnected) {
                    this.showErrorMessage('Server stopped (connection refused)');
                } else {
                    // Sinon c'est probablement un problème réseau
                    this.showErrorMessage('Server unavailable (network issue)');
                }
                
                setTimeout(() => this.connect(), 5000);
            };
    
            this.socket.onerror = (error) => {
                console.error('Erreur WebSocket:', error);
            };
    
        } catch (error) {
            this.showErrorMessage('Server stopped (connection refused)');
            setTimeout(() => this.connect(), 5000);
        }
    }

    handleMessage(message) {
        try {
            switch (message.type) {
                case 'initial_state':
                    this.initializeState(message);
                    break;
                case 'new_user':
                    this.activeUsers++;
                    this.hideQRCode();
                    this.addNewUser(message.user_id, message.position);
                    break;
                case 'user_left':
                    this.activeUsers--;
                    this.removeUser(message.user_id);
                    if (this.activeUsers <= 0) {
                        this.showQRCode();
                    }
                    break;
                case 'cell_update':
                    this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
                    break;
                case 'zoom_update':
                    this.handleZoomUpdate(message);
                    break;
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message:', error);
        }
    }

    initializeState(state) {
        this.gridSize = state.grid_size;
        this.grid.innerHTML = '';
        this.updateLayout();
        
        const gridState = JSON.parse(state.grid_state);
        const userPositions = gridState.user_positions || {};
        this.activeUsers = Object.keys(userPositions).length;
        
        // Mettre à jour la visibilité du QR code en fonction du nombre d'utilisateurs
        if (this.activeUsers > 0) {
            this.hideQRCode();
        } else {
            this.showQRCode();
        }

        Object.entries(userPositions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });
    }

    handleZoomUpdate(message) {
        if (this.gridSize === message.grid_size) {
            const gridState = JSON.parse(message.grid_state);
            Object.entries(gridState.user_positions).forEach(([userId, position]) => {
                const cell = this.cells.get(userId);
                if (cell) {
                    this.positionCell(cell, position[0], position[1]);
                }
            });
            return;
        }

        this.gridSize = message.grid_size;
        const gridState = JSON.parse(message.grid_state);
        this.updateLayout();
        
        const cellSize = this.grid.clientWidth / this.gridSize;
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            const cell = this.cells.get(userId);
            if (cell) {
                cell.style.width = `${cellSize}px`;
                cell.style.height = `${cellSize}px`;
                this.positionCell(cell, position[0], position[1]);
            }
        });
    }

    updateCell(userId, x, y) {
        let cell = this.cells.get(userId);
        const isNewCell = !cell;
        
        if (isNewCell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            
            const fragment = document.createDocumentFragment();
            const colors = ColorGenerator.generateInitialColors(userId);
            
            for (let i = 0; i < 400; i++) {
                const subCell = document.createElement('div');
                subCell.className = 'sub-cell';
                subCell.dataset.x = Math.floor(i / 20).toString();
                subCell.dataset.y = (i % 20).toString();
                subCell.style.backgroundColor = colors[i];
                fragment.appendChild(subCell);
            }
            
            cell.appendChild(fragment);
            this.grid.appendChild(cell);
            this.cells.set(userId, cell);
        }

        this.userPositions.set(userId, {x, y});
        this.positionCell(cell, x, y);
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

    positionCell(cell, x, y) {
        const totalSize = this.grid.offsetWidth;
        const cellSize = totalSize / this.gridSize;
        
        const centerOffset = Math.floor(this.gridSize / 2);
        const relativeX = x + centerOffset;
        const relativeY = y + centerOffset;
        
        Object.assign(cell.style, {
            position: 'absolute',
            transform: `translate(${relativeX * cellSize}px, ${relativeY * cellSize}px)`,
            width: `${cellSize}px`,
            height: `${cellSize}px`,
            transition: 'none'
        });
    }

    addNewUser(userId, position) {
        this.updateCell(userId, position[0], position[1]);
    }

    removeUser(userId) {
        const cell = this.cells.get(userId);
        if (cell) {
            this.grid.removeChild(cell);
            this.cells.delete(userId);
        }
        this.userPositions.delete(userId);
    }

    requestFullscreen() {
        // Vérifier si le viewer n'est pas dans une iframe
        if (window.self === window.top) {
            const requestFullscreen = this.grid.requestFullscreen || this.grid.webkitRequestFullscreen || this.grid.mozRequestFullScreen || this.grid.msRequestFullscreen;
            if (requestFullscreen) {
                requestFullscreen.call(this.grid);
            }
        }
    }

    showQRCode() {
        if (this.qrOverlay) {
            this.qrOverlay.classList.add('visible');
        }
    }

    hideQRCode() {
        if (this.qrOverlay) {
            this.qrOverlay.classList.remove('visible');
        }
    }

    showErrorMessage(message) {
        this.errorOverlay.textContent = message;
        this.errorOverlay.style.display = 'flex';
    }

    hideErrorMessage() {
        this.errorOverlay.style.display = 'none';
    }
}