import { ImageImporter } from './poietic-import.js';
import { ShareManager } from './poietic-share.js';
import { ColorGenerator } from './poietic-color-generator.js';
import { generateRandomColor } from './poietic-random-color.js';

class PoieticClient {
    constructor() {
        if (PoieticClient.instance) {
            return PoieticClient.instance;
        }
        PoieticClient.instance = this;

        // Initialisation des références DOM
        this.grid = document.getElementById('poietic-grid');
        this.colorPreview = document.getElementById('color-preview');
        this.gradientPalette = document.getElementById('gradient-palette');
        this.userPalette = document.getElementById('user-palette');
        this.activityCursor = document.getElementById('activity-cursor');
        this.reconnectButton = document.getElementById('reconnect-button');
        this.themeButton = document.querySelector('#zone-2c1 .tool-circle');

        // État de l'application
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

        // Timers et états de connexion
        this.lastActivity = Date.now();  // Pour avoir le curseur initialisé dès le début
        this.disconnectedAt = null;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;
        this.inactivityTimer = null;
        this.inactivityTimeout = 180 * 1000;  // 3 * 60 * 1000
        this.isLocalUpdate = false;

        // Propriétés de layout
        this.layoutOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        this.gridScale = 1.0; // Pour le futur zoom        

        // Propriétés de zoom
        this.zoomState = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isZoomed: false,
            isAutoZoom: false,
            lastActivityTime: Date.now()
        };

        // Référence à la zone de dessin
        this.drawingArea = document.getElementById('poietic-grid');
        
        // Initialisation des gestionnaires d'événements de zoom
        this.initZoomHandlers();

        // Initialisation
        this.initialize();

        // Séparer les timers
        this.connectionInactivityTimer = null;
        this.zoomInactivityTimer = null;
        this.connectionInactivityTimeout = 180 * 1000;  // 3 minutes
        this.zoomInactivityTimeout = 4000;  // 4 secondes

        // Constantes pour la gestion des interactions
        this.DRAG_START_DELAY = 100;    // Délai pour détecter un drag
        this.DRAG_MOVE_THRESHOLD = 5;   // Distance minimale pour considérer un mouvement
        this.DRAG_IDLE_TIMEOUT = 250;   // Délai sans mouvement avant arrêt du drag

        // Initialiser l'importateur d'images
        this.imageImporter = new ImageImporter(this);

        this.shareManager = new ShareManager(this);

        this.lastUpdates = new Map();
    }

    initialize() {
        // Afficher l'overlay de bienvenue
        document.body.classList.add('welcoming');
        
        // Le retirer après 1 seconde
        setTimeout(() => {
            document.body.classList.remove('welcoming');
        }, 1000);

        this.initializeLayout();
        this.initializeColorPalette();
        this.initializeActivityMonitoring();
        this.connect();
        this.addEventListeners();

        // Initialisation du bouton de thème
        this.initializeThemeButton();

        // Initialiser le ShareManager après que tout est prêt
        this.shareManager = new ShareManager(this);

        // Initialiser les dimensions des canvas
        const buttonSize = 160; // Correspond à --main-button-size
        this.gradientPalette.width = buttonSize;
        this.gradientPalette.height = buttonSize;
        this.userPalette.width = buttonSize;
        this.userPalette.height = buttonSize;
    }

    initializeLayout() {
        this.updateLayout();
        window.addEventListener('resize', () => {
            // Détecter le changement d'orientation
            const newOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
            if (newOrientation !== this.layoutOrientation) {
                this.layoutOrientation = newOrientation;
                this.updateLayout();
            } else {
                // Juste un redimensionnement dans la même orientation
                this.updateLayout();
            }
        });
    }

    updateLayout() {
        if (!this.grid || !this.grid.parentElement) return;
    
        const mainZone = this.grid.parentElement;
        const isLandscape = this.layoutOrientation === 'landscape';
    
        // La taille devrait correspondre à la plus petite dimension
        const availableSpace = Math.min(window.innerHeight, window.innerWidth);
    
        // Appliquer directement à la main-zone
        mainZone.style.width = `${availableSpace}px`;
        mainZone.style.height = `${availableSpace}px`;
    
        // La grille prend la même taille
        const totalGridSize = availableSpace;
        this.grid.style.width = `${totalGridSize}px`;
        this.grid.style.height = `${totalGridSize}px`;
    
        // La taille d'une cellule dépend du nombre de cellules
        this.cellSize = totalGridSize / this.gridSize;
        this.subCellSize = this.cellSize / 20;
    
        // Le reste du code pour les cellules...
        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    updateCellPositions() {
        this.cells.forEach((cell, userId) => {
            const position = this.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    // Préparation pour le futur zoom
    setZoom(scale) {
        this.gridScale = scale;
        this.updateLayout();
    }

    // SECTION: Gestion de la connexion WebSocket
    connect() {
        if (this.isConnected) {
            this.disconnect();
        }

        this.socket = new WebSocket('ws://localhost:3001/updates');
        this.socket.onopen = () => {
            this.isConnected = true;
            this.startHeartbeat();
        };
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onclose = () => {
            this.isConnected = false;
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        };
        this.socket.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
        };
    }

    disconnect() {
        clearInterval(this.heartbeatInterval);
        if (this.socket) {
            this.socket.close();
        }
        this.isConnected = false;
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 20000);
    }

    // SECTION: Gestion des messages
    handleMessage(message) {
        this.isLocalUpdate = false;
        switch (message.type) {
            case 'initial_state':
                this.initializeState(message);
                this.resetInactivityTimer();
                break;
            case 'new_user':
                this.addNewUser(message.user_id, message.position);
                break;
            case 'user_left':
                this.removeUser(message.user_id);
                this.handlePositionFree(message.position);
                if (message.user_id === this.myUserId) {
                    this.handleInactivityTimeout();
                }
                break;
            case 'cell_update':
                this.updateSubCell(message.user_id, message.sub_x, message.sub_y, message.color);
                break;
            case 'zoom_update':
                this.handleZoomUpdate(message);
                break;
            case 'user_disconnected':
                this.handleUserDisconnected(message);
                break;
            default:
                console.warn('Received unknown message type:', message.type);
        }
    }

    handleZoomUpdate(message) {
        // Éviter les mises à jour inutiles si la taille de grille n'a pas changé
        if (this.gridSize === message.grid_size) {
            const gridState = JSON.parse(message.grid_state);
            // Mettre à jour uniquement les positions
            Object.entries(gridState.user_positions).forEach(([userId, position]) => {
                const cell = this.cells.get(userId);
                if (cell) {
                    this.positionCell(cell, position[0], position[1]);
                }
            });
            return;
        }

        // Si la taille a changé, faire la mise à jour complète
        this.gridSize = message.grid_size;
        const gridState = JSON.parse(message.grid_state);
        
        // Mettre à jour le layout une seule fois
        this.updateLayout();
        
        // Calculer la nouvelle taille de cellule une seule fois
        const cellSize = this.drawingArea.clientWidth / this.gridSize;
        
        // Mettre à jour toutes les cellules en une seule passe
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            const cell = this.cells.get(userId);
            if (cell) {
                // Appliquer les nouvelles dimensions
                cell.style.width = `${cellSize}px`;
                cell.style.height = `${cellSize}px`;
                // Mettre à jour la position
                this.positionCell(cell, position[0], position[1]);
            }
        });
    }

    // SECTION: Gestion de l'état
    initializeState(state) {
        this.gridSize = state.grid_size;
        this.myUserId = state.my_user_id;
        
        // Générer les couleurs de la palette
        this.initialColors = new Map();
        this.initialColors.set(this.myUserId, ColorGenerator.generateInitialColors(this.myUserId));
    
        // Utiliser une couleur aléatoire comme couleur initiale
        this.currentColor = generateRandomColor();
        this.lastSelectedColor = this.currentColor;
        this.updateColorPreview();
    
        // Nettoyer la grille existante
        if (this.grid) {
            this.grid.innerHTML = '';
        }
        
        // Mise à jour du layout
        this.updateLayout();
        
        // Parser le grid_state qui est une chaîne JSON
        const gridState = JSON.parse(state.grid_state);
        
        // Initialiser toutes les cellules
        Object.entries(gridState.user_positions).forEach(([userId, position]) => {
            this.updateCell(userId, position[0], position[1]);
        });

        // Initialiser les sous-cellules
        if (state.sub_cell_states) {
            Object.entries(state.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }
    }

    // SECTION: Gestion des cellules et de la grille
 
    positionCell(cell, x, y) {
        const totalSize = this.grid.offsetWidth; // taille totale de la grille
        const cellSize = totalSize / this.gridSize; // taille d'une cellule
        
        const centerOffset = Math.floor(this.gridSize / 2);
        const relativeX = x + centerOffset;
        const relativeY = y + centerOffset;
        
        const position = {
            left: `${(relativeX * cellSize)}px`,
            top: `${(relativeY * cellSize)}px`,
            width: `${cellSize}px`,
            height: `${cellSize}px`
        };
        
        Object.assign(cell.style, position);
        this.cache.set(`cell_position_${x}_${y}`, position);
    }

    updateCell(userId, x, y) {
        let cell = this.cells.get(userId);
        const isNewCell = !cell;
        
        if (isNewCell) {
            cell = document.createElement('div');
            cell.className = 'user-cell';
            
            // Créer le fragment pour améliorer les performances
            const fragment = document.createDocumentFragment();
            const colors = ColorGenerator.generateInitialColors(userId);
            
            // Créer toutes les sous-cellules en une fois
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
            
            // Ajouter les événements seulement si nécessaire
            if (userId !== this.myUserId) {
                cell.addEventListener('click', (event) => this.handleColorBorrowing(event, userId));
                cell.addEventListener('touchstart', (event) => this.handleColorBorrowing(event, userId));
            }
        }

        // Mettre à jour la position
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
    
        if (userId === this.myUserId && this.isLocalUpdate) {
            this.updateLastActivity();
        }
    }

    // SECTION: Gestion des couleurs

    updateCurrentColor(color) {
        this.currentColor = color;
        this.lastSelectedColor = color;
        this.updateColorPreview();
        
        if (this.gradientPalette) {
            this.gradientPalette.style.display = 'none';
        }
    }

    initializeColorPalette() {
        if (!this.gradientPalette || !this.colorPreview) return;

        // Initialisation explicite des états
        this.colorPreview.innerHTML = `
            <div class="color-preview-left"></div>
            <div class="color-preview-right"></div>
        `;
        this.setupColorPreviewListeners();
        this.updateColorPreview();
        
        // Forcer les styles initiaux des palettes
        this.gradientPalette.style.cssText = 'display: none;';
        this.userPalette.style.cssText = 'display: none;';
        
        // Vérifier la structure DOM
        this.checkDOMStructure();
    }

    updateColorPreview() {
        if (this.colorPreview && this.currentColor) {
            // Au lieu de réécrire le HTML, on met à jour les styles des divs existants
            const leftPreview = this.colorPreview.querySelector('.color-preview-left');
            const rightPreview = this.colorPreview.querySelector('.color-preview-right');
            
            if (leftPreview && rightPreview) {
                leftPreview.style.backgroundColor = this.currentColor;
                rightPreview.style.backgroundColor = this.currentColor;
            } else {
                // Si les divs n'existent pas encore, on les crée une seule fois
                this.colorPreview.innerHTML = `
                    <div class="color-preview-left"></div>
                    <div class="color-preview-right"></div>
                `;
                // On ajoute les event listeners
                this.setupColorPreviewListeners();
                // On met à jour les couleurs
                this.updateColorPreview();
            }
        }
    }

    setupColorPreviewListeners() {
        const leftPreview = this.colorPreview.querySelector('.color-preview-left');
        const rightPreview = this.colorPreview.querySelector('.color-preview-right');
        const colorPalette = document.getElementById('color-palette');

        // Ajout des gestionnaires de survol
        colorPalette.addEventListener('mouseleave', () => {
            this.gradientPalette.style.display = 'none';
            this.userPalette.style.display = 'none';
        });

        leftPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            this.userPalette.style.display = 'none';
            if (this.gradientPalette.style.display === 'none') {
                this.gradientPalette.style.cssText = `
                    display: block !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: ${this.colorPreview.offsetWidth}px;
                    height: ${this.colorPreview.offsetHeight}px;
                    z-index: 450;
                    background-color: #000000;
                `;
                this.updateGradientPalette();
            } else {
                this.gradientPalette.style.display = 'none';
            }
        });

        rightPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            this.gradientPalette.style.display = 'none';
            if (this.userPalette.style.display === 'none') {
                this.userPalette.style.cssText = `
                    display: block !important;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: ${this.colorPreview.offsetWidth}px;
                    height: ${this.colorPreview.offsetHeight}px;
                    z-index: 450;
                    background-color: #000000;
                `;
                this.updateUserPalette();
            } else {
                this.userPalette.style.display = 'none';
            }
        });

        this.gradientPalette.addEventListener('click', (e) => {
            const rect = this.gradientPalette.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ctx = this.gradientPalette.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            this.currentColor = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
            
            this.updateColorPreview();
            this.updateUserPalette();
            this.gradientPalette.style.display = 'none';
        });

        this.userPalette.addEventListener('click', (e) => {
            const rect = this.userPalette.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ctx = this.userPalette.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            this.currentColor = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
            
            this.updateColorPreview();
            this.updateUserPalette();
            this.userPalette.style.display = 'none';
        });
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
            const computedStyle = window.getComputedStyle(subCell);
            const rgb = computedStyle.backgroundColor.match(/\d+/g);
            if (rgb) {
                const borrowedColor = this.rgbToHex(parseInt(rgb[0]), parseInt(rgb[1]), parseInt(rgb[2]));
                this.updateCurrentColor(borrowedColor);
            }
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
        const newColors = Array(100).fill().map(() => {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        });
        this.cache.set(cacheKey, newColors);
        return newColors.pop();
    }

    // Nouvelle fonction utilitaire pour parser les couleurs hex
    parseHex(color) {
        const hex = color.replace('#', '');
        return [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16)
        ];
    }

    // SECTION: Gestion du dessin
    startDrawing(event) {
        if (!this.isConnected || !this.myUserId) return;
        
        this.isDrawing = true;
        
        // Si on commence à dessiner en mode zoom manuel,
        // on arrête immédiatement tout drag en cours
        if (this.zoomState.isZoomed && !this.zoomState.isAutoZoom) {
            this.endDrag();
            this.drawingArea.style.cursor = '';
        }

        // Mise à jour du timestamp d'activité
        if (this.zoomState.isZoomed) {
            this.zoomState.lastActivityTime = Date.now();
        }
        
        this.draw(event);
    }

    draw(event) {
        if (!this.isDrawing || !this.isConnected || !this.myUserId) return;

        // Mise à jour du timestamp pendant le dessin
        if (this.zoomState.isAutoZoom) {
            this.zoomState.lastActivityTime = Date.now();
        }

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

            this.isLocalUpdate = true;
            this.updateSubCell(this.myUserId, subX, subY, this.currentColor);
            this.updateLastActivity();
            this.sendCellUpdate(subX, subY, this.currentColor);
        }
    }

    stopDrawing() {
        this.isDrawing = false;
        // Mise à jour du timestamp à la fin du dessin
        if (this.zoomState.isAutoZoom) {
            this.zoomState.lastActivityTime = Date.now();
            this.startZoomInactivityTimer();
        }
    }

    sendCellUpdate(subX, subY, color) {
        if (this.isConnected) {
            // Vérifier si la dernière mise à jour pour cette cellule est identique
            const lastUpdateKey = `${subX},${subY}`;
            const lastUpdate = this.lastUpdates.get(lastUpdateKey);

            if (lastUpdate && lastUpdate.color === color) {
                return; // Ne pas envoyer si la couleur est la même
            }

            const message = {
                type: 'cell_update',
                sub_x: subX,
                sub_y: subY,
                color: color
            };
            this.socket.send(JSON.stringify(message));

            // Mémoriser la dernière mise à jour
            this.lastUpdates.set(lastUpdateKey, { color });
        }
    }

    // SECTION: Gestion des utilisateurs
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
        this.userColors.delete(userId);
        this.initialColors.delete(userId);
    }

    // SECTION: Gestion du zoom et de la mise à jour
    updateZoom(newGridSize, gridState, userColors, subCellStates) {
        // Mettre à jour d'abord la taille de la grille
        this.gridSize = newGridSize;
        this.userColors = new Map(Object.entries(userColors));
    
        // Récupérer les nouvelles positions
        const parsedGridState = JSON.parse(gridState);
        const userPositions = parsedGridState.user_positions;
    
        // Supprimer d'abord les cellules qui n'existent plus
        this.cells.forEach((cell, userId) => {
            if (!userPositions[userId]) {
                this.grid.removeChild(cell);
                this.cells.delete(userId);
                this.userPositions.delete(userId);
            }
        });
    
        // Mettre à jour toutes les cellules avec leurs nouvelles positions
        Object.entries(userPositions).forEach(([userId, position]) => {
            // Mettre à jour ou créer la cellule
            this.updateCell(userId, position[0], position[1]);
            
            // Mise à jour des positions stockées
            this.userPositions.set(userId, {
                x: position[0],
                y: position[1]
            });
        });
    
        // Mettre à jour les sous-cellules après le repositionnement
        if (subCellStates) {
            Object.entries(subCellStates).forEach(([userId, subCells]) => {
                if (this.cells.has(userId)) {
                    Object.entries(subCells).forEach(([coords, color]) => {
                        const [subX, subY] = coords.split(',').map(Number);
                        this.updateSubCell(userId, subX, subY, color);
                    });
                }
            });
        }
    
        // Recalculer les dimensions de la grille
        this.updateLayout();
    }

    // SECTION: Gestion de l'activité et de l'inactivité
    initializeActivityMonitoring() {
        if (!this.activityCursor) return;

        setInterval(() => {
            this.updateActivityDisplay();
        }, 1000);

        if (this.reconnectButton) {
            this.reconnectButton.addEventListener('click', () => this.reconnect());
        }

        this.startInactivityTimer();
    }

    updateActivityDisplay() {
        if (!this.activityCursor) return;

        // Ne rien afficher si pas encore d'activité
        if (!this.lastActivity && !this.disconnectedAt) {
            this.activityCursor.style.height = '100%';
            return;
        }

        const activityTime = this.disconnectedAt || this.lastActivity;
        const inactiveTime = (Date.now() - activityTime) / 1000;
        const remainingTime = Math.max(180 - inactiveTime, 0);
        const heightPercentage = (remainingTime / 180) * 100;

        this.activityCursor.style.height = `${heightPercentage}%`;

        if (remainingTime === 0 && this.isConnected) {
            this.handleInactivityTimeout();
        }
    }

    updateLastActivity() {
        this.lastActivity = Date.now();
        this.updateActivityDisplay();
        
        // Réinitialiser aussi le timer d'inactivité
        this.resetInactivityTimer();
    }

    startInactivityTimer() {
        this.resetInactivityTimer();
    }

    resetInactivityTimer() {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(
            () => this.handleInactivityTimeout(), 
            this.inactivityTimeout
        );
    }

    handleInactivityTimeout() {
        this.disconnect();
        
        // Afficher l'overlay avec transition
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) {
            overlay.style.display = 'block';
            // Force un reflow pour que la transition fonctionne
            overlay.offsetHeight;
            document.body.classList.add('disconnected');
        }
        
        this.showReconnectButton();
    }

    // SECTION: Gestion de l'interface graphique
    showReconnectButton() {
        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'block';
            // Force un reflow pour que la transition fonctionne
            this.reconnectButton.offsetHeight;
            this.reconnectButton.style.opacity = '1';
        }
    }

    addOverlay() {
        let overlay = document.getElementById('disconnect-overlay');
        const mainZone = document.querySelector('.main-zone');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'disconnect-overlay';
            // Ajout de l'overlay directement sur la zone principale
            mainZone.appendChild(overlay);
        }
        overlay.style.display = 'block';
    }

    // SECTION: Gestion des événements
    addEventListeners() {
        if (this.grid) {
            this.grid.addEventListener('mouseenter', () => this.handleGridEnter());
            this.grid.addEventListener('mouseleave', () => this.handleGridLeave());
            this.grid.addEventListener('mousemove', (e) => {
                this.handleGridMove(e);
                // Ajouter l'appel à draw pendant le mouvement de la souris
                if (this.isDrawing) {
                    this.draw(e);
                }
            });
            this.grid.addEventListener('mousedown', (e) => this.startDrawing(e));
            this.grid.addEventListener('mouseup', () => this.stopDrawing());
            this.grid.addEventListener('mouseleave', () => this.stopDrawing());

            this.grid.addEventListener('touchstart', (e) => this.startDrawing(e));
            this.grid.addEventListener('touchmove', (e) => this.draw(e));
            this.grid.addEventListener('touchend', () => this.stopDrawing());
        }

        // Ajouter l'écouteur pour le bouton zoom
        const zoomButton = document.getElementById('zone-2a1');
        if (zoomButton) {
            zoomButton.addEventListener('click', () => this.toggleZoom());
        }
    }

    handleGridEnter() {
        this.isOverGrid = true;
        if (this.zoomState.isAutoZoom && !this.isOverOwnCell) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                myCell.classList.add('highlighted');
            }
        }
        this.updateHighlight();
    }

    handleGridLeave() {
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        if (this.zoomState.isAutoZoom) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                myCell.classList.remove('highlighted');
            }
        }
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
        
        // Mise à jour de la surbrillance en fonction du mode zoom et de la position
        if (this.zoomState.isAutoZoom) {
            const myCell = this.cells.get(this.myUserId);
            if (myCell) {
                if (this.isOverOwnCell) {
                    myCell.classList.remove('highlighted');
                } else if (this.isOverGrid) {
                    myCell.classList.add('highlighted');
                }
            }
        } else {
            this.updateHighlight();
        }
    }

    updateHighlight() {
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            if (this.isOverGrid && !this.isOverOwnCell && !this.zoomState.isAutoZoom) {
                myCell.classList.add('highlighted');
            } else {
                myCell.classList.remove('highlighted');
            }
        }
    }

    // SECTION: Utilitaires
    reconnect() {
        // Retirer l'overlay sans transition
        document.body.classList.remove('disconnected');
        const overlay = document.getElementById('disconnect-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }

        if (this.reconnectButton) {
            this.reconnectButton.style.display = 'none';
        }

        this.resetClientState();
        this.connect();
    }

    resetClientState() {
        this.cells.clear();
        this.userPositions.clear();
        this.userColors.clear();
        this.gridSize = 1;
        this.cellSize = 0;
        this.subCellSize = 0;
        this.currentColor = null;
        this.lastSelectedColor = null;
        this.isDrawing = false;
        this.myUserId = null;
        this.isOverGrid = false;
        this.isOverOwnCell = false;
        this.initialColors.clear();
        this.isConnected = false;
        this.cache.clear();

        if (this.grid) {
            this.grid.innerHTML = '';
        }

        clearInterval(this.heartbeatInterval);
        clearTimeout(this.inactivityTimer);
        this.lastActivity = Date.now();
        this.disconnectedAt = null;
    }

    handleUserDisconnected(message) {
        if (message.user_id === this.myUserId) {
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        }
    }

    handlePositionFree(position) {
    }

    toggleZoom() {
        const zoomButton = document.getElementById('zone-2a1');
        zoomButton.classList.toggle('zoomed');
    }

    initializeThemeButton() {
        const themeButton = document.querySelector('#zone-2c1 .tool-circle');
        if (themeButton) {
            themeButton.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');
            });
        }
    }

    initZoomHandlers() {
        // Conserver les gestionnaires existants pour le zoom automatique
        const zoomButton = document.querySelector('#zone-2a1 .tool-circle');
        zoomButton.addEventListener('mouseenter', () => this.highlightUserCell(true));
        zoomButton.addEventListener('mouseleave', () => {
            if (!this.zoomState.isAutoZoom) this.highlightUserCell(false);
        });
        zoomButton.addEventListener('click', () => this.toggleAutoZoom());

        // Zoom manuel (molette)
        this.drawingArea.addEventListener('wheel', (e) => {
            if (!this.zoomState.isAutoZoom) this.handleManualZoom(e);
        });

        // Nouveaux gestionnaires pour le drag and drop
        this.drawingArea.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.drawingArea.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.drawingArea.addEventListener('mouseup', () => this.handleMouseUp());
        this.drawingArea.addEventListener('mouseleave', () => this.handleMouseUp());

        // Empêcher le drag and drop par défaut
        this.drawingArea.addEventListener('dragstart', (e) => e.preventDefault());
    }

    toggleAutoZoom() {
        if (this.zoomState.isAutoZoom) {
            // Désactiver le zoom auto
            this.resetZoom();
            // Garder la surbrillance pendant 1 seconde après la fin du zoom
            setTimeout(() => {
                this.highlightUserCell(false);
            }, 1000);
        } else {
            // Activer le zoom auto et la surbrillance
            this.zoomState.isAutoZoom = true;
            this.highlightUserCell(true);
            this.zoomToUserAndNeighbors();
        }
        this.updateZoomVisuals();
    }

    zoomToUserAndNeighbors() {
        if (!this.myUserId || !this.userPositions.has(this.myUserId)) return;

        const rect = this.drawingArea.getBoundingClientRect();
        const myPosition = this.userPositions.get(this.myUserId);

        // Calculer l'échelle pour voir la cellule utilisateur et la moitié des voisins
        const targetScale = rect.width / (this.cellSize * 2); // 2 au lieu de 3 pour voir la moitié des voisins
        const newScale = Math.min(targetScale, this.getMaxZoom());

        // Position du centre de la viewport
        const viewportCenterX = rect.width / 2;
        const viewportCenterY = rect.height / 2;

        // Position de la cellule de l'utilisateur dans l'espace non zoomé
        const userX = (myPosition.x + this.gridSize/2) * this.cellSize;
        const userY = (myPosition.y + this.gridSize/2) * this.cellSize;

        // Calculer les offsets pour centrer la cellule de l'utilisateur
        this.zoomState.offsetX = viewportCenterX - (userX * newScale);
        this.zoomState.offsetY = viewportCenterY - (userY * newScale);
        this.zoomState.scale = newScale;
        this.zoomState.isZoomed = true;
        this.zoomState.isAutoZoom = true;

        this.updateZoomVisuals();
        this.startZoomInactivityTimer();
    }

    resetZoom(animate = true) {
        const duration = animate ? 500 : 0;
        
        this.zoomState.isAutoZoom = false;
        this.zoomState.scale = 1;
        this.zoomState.offsetX = 0;
        this.zoomState.offsetY = 0;
        this.zoomState.isZoomed = false;

        if (animate) {
            this.drawingArea.style.transition = `transform ${duration}ms ease-out`;
            requestAnimationFrame(() => {
                this.updateZoomVisuals();
                setTimeout(() => {
                    this.drawingArea.style.transition = '';
                }, duration);
            });
        } else {
            this.updateZoomVisuals();
        }
    }

    // Mise à jour de updateZoomVisuals pour gérer correctement l'état du bouton SVG
    updateZoomVisuals() {
        const transform = `scale(${this.zoomState.scale}) translate(${this.zoomState.offsetX / this.zoomState.scale}px, ${this.zoomState.offsetY / this.zoomState.scale}px)`;
        this.drawingArea.style.transformOrigin = '0 0';
        this.drawingArea.style.transform = transform;

        // Mise à jour de l'état visuel du bouton
        const zoomButton = document.querySelector('#zone-2a1');
        if (zoomButton) {
            if (this.zoomState.isAutoZoom || this.zoomState.isZoomed) {
                zoomButton.setAttribute('data-state', 'zoomed');
            } else {
                zoomButton.setAttribute('data-state', 'normal');
            }
        }
    }

    handleManualZoom(e) {
        e.preventDefault();
        
        // Mise à jour du timestamp d'activité
        this.zoomState.lastActivityTime = Date.now();

        // Calcul du facteur de zoom basé sur la molette
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(this.zoomState.scale * zoomFactor, 1), this.getMaxZoom());

        if (newScale !== this.zoomState.scale) {
            const rect = this.drawingArea.getBoundingClientRect();
            
            // Position de la souris dans l'espace transformé actuel
            const transformedX = (e.clientX - rect.left) / this.zoomState.scale;
            const transformedY = (e.clientY - rect.top) / this.zoomState.scale;

            // Calcul des nouveaux offsets
            const dx = transformedX * (newScale - this.zoomState.scale);
            const dy = transformedY * (newScale - this.zoomState.scale);

            this.zoomState.offsetX -= dx;
            this.zoomState.offsetY -= dy;
            this.zoomState.scale = newScale;
            this.zoomState.isZoomed = newScale > 1;
            
            this.updateZoomVisuals();
            this.startZoomInactivityTimer();
        }
    }

    handleMouseDown(e) {
        const initialX = e.clientX;
        const initialY = e.clientY;

        if (this.isOverOwnCell) {
            this.isDrawing = true;
            this.draw(e);
            this.zoomState.lastActivityTime = Date.now();
            return;
        }

        if (!this.zoomState.isZoomed || this.zoomState.isAutoZoom) return;

        this.dragState = {
            isPending: true,
            startX: initialX,
            startY: initialY,
            lastX: initialX,
            lastY: initialY,
            hasStartedDragging: false
        };
        
        e.preventDefault();
    }

    handleMouseMove(e) {
        this.zoomState.lastActivityTime = Date.now();

        if (this.isOverOwnCell && this.isDrawing) {
            this.draw(e);
            return;
        }

        if (this.dragState && e.buttons === 1) {
            const deltaX = Math.abs(e.clientX - this.dragState.startX);
            const deltaY = Math.abs(e.clientY - this.dragState.startY);
            
            if (deltaX > this.DRAG_MOVE_THRESHOLD || deltaY > this.DRAG_MOVE_THRESHOLD) {
                // Ajouter le bloqueur seulement quand on commence à drag
                if (!this.clickBlocker) {
                    this.clickBlocker = document.createElement('div');
                    this.clickBlocker.style.position = 'absolute';
                    this.clickBlocker.style.top = '0';
                    this.clickBlocker.style.left = '0';
                    this.clickBlocker.style.width = '100%';
                    this.clickBlocker.style.height = '100%';
                    this.clickBlocker.style.zIndex = '1000';
                    this.drawingArea.appendChild(this.clickBlocker);
                }
                
                this.dragState.isPending = false;
                this.dragState.hasStartedDragging = true;
                this.drawingArea.style.cursor = 'grabbing';
                
                const moveDeltaX = e.clientX - this.dragState.lastX;
                const moveDeltaY = e.clientY - this.dragState.lastY;
                
                this.zoomState.offsetX += moveDeltaX;
                this.zoomState.offsetY += moveDeltaY;
                
                this.dragState.lastX = e.clientX;
                this.dragState.lastY = e.clientY;
                
                this.updateZoomVisuals();
            }
        } else if (!e.buttons) {
            if (this.clickBlocker) {
                this.clickBlocker.remove();
                this.clickBlocker = null;
            }
            this.dragState = null;
            this.drawingArea.style.cursor = '';
        }
    }

    handleMouseUp(e) {
        if (this.isOverOwnCell) {
            this.isDrawing = false;
            return;
        }

        // Sélection de couleur uniquement si on n'a pas fait de drag
        if (!this.dragState?.hasStartedDragging) {
            const targetCell = e.target.closest('.user-cell');
            if (targetCell) {
                const userId = [...this.cells.entries()].find(([_, cell]) => cell === targetCell)?.[0];
                if (userId && userId !== this.myUserId) {
                    this.handleColorBorrowing(e, userId);
                }
            }
        }
        
        // Nettoyage
        if (this.clickBlocker) {
            this.clickBlocker.remove();
            this.clickBlocker = null;
        }
        this.dragState = null;
        this.drawingArea.style.cursor = '';
    }

    startZoomInactivityTimer() {
        if (this.zoomInactivityTimer) {
            clearTimeout(this.zoomInactivityTimer);
        }

        this.zoomInactivityTimer = setTimeout(() => {
            if (this.zoomState.isAutoZoom || this.zoomState.isZoomed) {
                const inactivityDuration = Date.now() - this.zoomState.lastActivityTime;
                if (inactivityDuration >= this.zoomInactivityTimeout) {
                    this.resetZoom();
                } else {
                    this.startZoomInactivityTimer();
                }
            }
        }, this.zoomInactivityTimeout);
    }

    getMaxZoom() {
        const gridSize = this.gridSize;
        const cellSize = this.drawingArea.clientWidth / gridSize;
        return this.drawingArea.clientWidth / cellSize;
    }

    highlightUserCell(highlight) {
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            if (highlight) {
                myCell.classList.add('highlighted');
            } else {
                if (!this.zoomState.isAutoZoom) {
                    myCell.classList.remove('highlighted');
                }
            }
        }
    }

    updateLocalCell(x, y, colorIndex) {
        if (!this.myUserId || !this.cells.has(this.myUserId)) return;
        
        const cell = this.cells.get(this.myUserId);
        const subCell = cell.children[y * 20 + x];
        if (subCell) {
            subCell.style.backgroundColor = this.palette[colorIndex];
        }
    }

    sendGridUpdate(updates) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'batch_update',
                updates: updates
            }));
        }
    }

    initializeWebSocket() {
        this.connect();
        // Initialiser le ShareManager après la connexion
        this.shareManager = new ShareManager(this);
    }

    // Ajoutons une méthode pour vérifier la structure DOM
    checkDOMStructure() {
        const colorPalette = document.getElementById('color-palette');
        const rect = colorPalette.getBoundingClientRect();
    }

    updateGradientPalette() {
        const ctx = this.gradientPalette.getContext('2d');
        if (!ctx) {
            return;
        }

        // Récupérer les dimensions réelles du canvas
        const rect = this.gradientPalette.getBoundingClientRect();
        this.gradientPalette.width = rect.width;
        this.gradientPalette.height = rect.height;

        // Effacer le canvas
        ctx.clearRect(0, 0, rect.width, rect.height);

        try {
            // Dégradé horizontal (couleurs)
            const gradientH = ctx.createLinearGradient(0, 0, rect.width, 0);
            gradientH.addColorStop(0, "#FF0000");    // Rouge
            gradientH.addColorStop(0.17, "#FFFF00"); // Jaune
            gradientH.addColorStop(0.33, "#00FF00"); // Vert
            gradientH.addColorStop(0.5, "#00FFFF");  // Cyan
            gradientH.addColorStop(0.67, "#0000FF"); // Bleu
            gradientH.addColorStop(0.83, "#FF00FF"); // Magenta
            gradientH.addColorStop(1, "#FF0000");    // Rouge

            // Appliquer le dégradé horizontal
            ctx.fillStyle = gradientH;
            ctx.fillRect(0, 0, rect.width, rect.height);

            // Dégradé vertical (luminosité)
            const gradientV = ctx.createLinearGradient(0, 0, 0, rect.height);
            gradientV.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradientV.addColorStop(0.5, "rgba(255, 255, 255, 0)");
            gradientV.addColorStop(0.5, "rgba(0, 0, 0, 0)");
            gradientV.addColorStop(1, "rgba(0, 0, 0, 1)");

            // Appliquer le dégradé vertical
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = gradientV;
            ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.globalCompositeOperation = 'source-over';

        } catch (error) {
        }
    }

    // Modifier rgbToHsl pour accepter une couleur hex
    hexToHsl(hexColor) {
        const [r, g, b] = this.parseHex(hexColor);
        return this.rgbToHsl(r, g, b);
    }

    // Nouvelle fonction utilitaire pour convertir RGB en HSL
    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatique
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h * 360, s * 100, l * 100];
    }

    // Fonction pour extraire les valeurs RGB d'une chaîne de couleur
    parseRgb(color) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return [
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3])
            ];
        }
        return [0, 0, 0];
    }

    updateUserPalette() {
        const ctx = this.userPalette.getContext('2d');
        if (!ctx) return;

        const width = this.colorPreview.offsetWidth;
        const height = this.colorPreview.offsetHeight;
        
        this.userPalette.width = width;
        this.userPalette.height = height;
        ctx.clearRect(0, 0, width, height);

        // Collecter les couleurs
        const colors = new Set();
        const myCell = this.cells.get(this.myUserId);
        if (myCell) {
            Array.from(myCell.children).forEach(subCell => {
                const color = subCell.style.backgroundColor;
                if (color && color !== 'transparent') {
                    // Vérifier luminosité et saturation avant d'ajouter la couleur
                    const [r, g, b] = this.parseRgb(color);
                    const [h, s, l] = this.rgbToHsl(r, g, b);
                    
                    // Filtrer les couleurs :
                    // - trop claires (l > 95%) ou trop foncées (l < 5%)
                    // - trop saturées (s > 95%) ou trop peu saturées (s < 15%)
                    if (l < 95 && l > 10 && s < 95 && s > 10) {
                        colors.add(color);
                    }
                }
            });
        }

        // Ajouter des couleurs par défaut si nécessaire
        if (colors.size === 0) {
            colors.add('#FF0000');
            colors.add('#00FF00');
            colors.add('#0000FF');
        }

        // Convertir les couleurs en tableau et trier
        const colorArray = Array.from(colors).sort((a, b) => {
            const [r1, g1, b1] = this.parseRgb(a);
            const [r2, g2, b2] = this.parseRgb(b);
            
            const [h1, s1, l1] = this.rgbToHsl(r1, g1, b1);
            const [h2, s2, l2] = this.rgbToHsl(r2, g2, b2);
            
            // Trier par teinte
            if (h1 !== h2) return h1 - h2;
            // Puis par luminosité
            if (l1 !== l2) return l2 - l1;
            // Enfin par saturation
            return s2 - s1;
        });

        // Afficher les couleurs triées
        const gridSize = Math.ceil(Math.sqrt(colorArray.length));
        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;

        colorArray.forEach((color, index) => {
            const x = (index % gridSize) * cellWidth;
            const y = Math.floor(index / gridSize) * cellHeight;
            
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth, cellHeight);
            
            ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        });
    }

    handleDrawing(event) {
        if (!this.isDrawing || !this.isOverGrid || !this.currentColor) return;

        const cell = event.target;
        if (cell.style.backgroundColor !== this.currentColor) {
            cell.style.backgroundColor = this.currentColor;
            this.sendUpdate(cell);
            this.updateUserPalette();
        }
    }

    // Nouvelle fonction utilitaire pour convertir RGB en HEX
    rgbToHex(r, g, b) {
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.poieticClient = new PoieticClient();
});