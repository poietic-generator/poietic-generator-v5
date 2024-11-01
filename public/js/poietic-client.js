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
        this.inactivityTimeout = 18 * 1000;  // 18 secondes au lieu de 3 * 60 * 1000
        this.isLocalUpdate = false;

        // Propriétés de layout
        this.layoutOrientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        this.gridScale = 1.0; // Pour le futur zoom        

        // Initialisation
        this.initialize();
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
            console.log('Déjà connecté, déconnexion avant reconnexion');
            this.disconnect();
        }

        this.socket = new WebSocket('ws://localhost:3001/updates');
        this.socket.onopen = () => {
            console.log('Connexion WebSocket établie');
            this.isConnected = true;
            this.startHeartbeat();
            this.resetInactivityTimer();  // Garder celui-ci
        };
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
        this.socket.onclose = () => {
            console.log('Connexion WebSocket fermée');
            this.isConnected = false;
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        };
        this.socket.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
        };
    }

    disconnect() {
        console.log('Dconnexion...');
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
                this.handlePositionFree(message.position);
                if (message.user_id === this.myUserId) {
                    this.handleInactivityTimeout();
                }
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

    // SECTION: Gestion de l'état
    initializeState(state) {
        console.log('Initializing state:', state);
        this.gridSize = state.grid_size;
        this.userColors = new Map(Object.entries(state.user_colors));
        this.myUserId = state.my_user_id;
        this.initialColors = state.initial_colors ? new Map(Object.entries(state.initial_colors)) : new Map();
    
        // Initialiser la couleur courante
        if (this.userColors.has(this.myUserId)) {
            this.currentColor = this.userColors.get(this.myUserId);
        } else if (this.initialColors.has(this.myUserId)) {
            this.currentColor = this.initialColors.get(this.myUserId)[0];
        } else {
            this.currentColor = this.getRandomColor();
        }
        this.lastSelectedColor = this.currentColor;
        this.updateColorPreview();
    
        // Nettoyer la grille existante
        if (this.grid) {
            this.grid.innerHTML = '';
        }
    
        // Ajouter ici l'appel à updateLayout
        this.updateLayout();  // <-- ICI !
    
        // Initialiser toutes les cellules
        const gridState = JSON.parse(state.grid_state);
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
        this.colorPreview.style.backgroundColor = '#fff';
        this.colorPreview.style.display = 'block';
        this.gradientPalette.style.display = 'none';  // Dfinir explicitement l'état initial

        // Gestionnaire pour afficher/masquer la palette
        this.colorPreview.addEventListener('click', () => {
            if (this.gradientPalette.style.display === 'none') {
                this.gradientPalette.style.display = 'block';
                this.updateGradientPalette();
            } else {
                this.gradientPalette.style.display = 'none';
            }
        });

        // Gestionnaire de sélection de couleur
        this.gradientPalette.addEventListener('click', (event) => {
            const rect = this.gradientPalette.getBoundingClientRect();
            // Calculer les coordonnées relatives au canvas
            const x = Math.floor((event.clientX - rect.left) * (this.gradientPalette.width / rect.width));
            const y = Math.floor((event.clientY - rect.top) * (this.gradientPalette.height / rect.height));
            
            const ctx = this.gradientPalette.getContext('2d');
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            this.currentColor = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
            
            // Mettre à jour le carré de couleur courante
            this.colorPreview.style.backgroundColor = this.currentColor;
            
            // Masquer la palette
            this.gradientPalette.style.display = 'none';
            
            // Mettre à jour l'activité
            this.updateLastActivity();
        });

        // Fonction de mise à jour du gradient
        this.updateGradientPalette = () => {
            const ctx = this.gradientPalette.getContext('2d');
            const width = this.gradientPalette.width;
            const height = this.gradientPalette.height;

            // Dégradé horizontal (couleurs)
            const gradientH = ctx.createLinearGradient(0, 0, width, 0);
            gradientH.addColorStop(0, "rgb(255, 0, 0)");
            gradientH.addColorStop(1/6, "rgb(255, 255, 0)");
            gradientH.addColorStop(2/6, "rgb(0, 255, 0)");
            gradientH.addColorStop(3/6, "rgb(0, 255, 255)");
            gradientH.addColorStop(4/6, "rgb(0, 0, 255)");
            gradientH.addColorStop(5/6, "rgb(255, 0, 255)");
            gradientH.addColorStop(1, "rgb(255, 0, 0)");

            // Dégradé vertical (luminosité)
            const gradientV = ctx.createLinearGradient(0, 0, 0, height);
            gradientV.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradientV.addColorStop(0.5, "rgba(255, 255, 255, 0)");
            gradientV.addColorStop(0.5, "rgba(0, 0, 0, 0)");
            gradientV.addColorStop(1, "rgba(0, 0, 0, 1)");

            // Application des dégradés
            ctx.fillStyle = gradientH;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = gradientV;
            ctx.fillRect(0, 0, width, height);
        };

        // Initialisation
        this.updateGradientPalette();
    }

    updateColorPreview() {
        if (this.colorPreview && this.currentColor) {
            this.colorPreview.style.backgroundColor = this.currentColor;
        }
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
            return `rgb(${r},${g},${b})`;
        });
        this.cache.set(cacheKey, newColors);
        return newColors.pop();
    }

    // SECTION: Gestion du dessin
    startDrawing(event) {
        this.isDrawing = true;
        this.isLocalUpdate = true;
        this.draw(event);
        // Ajouter l'écouteur mousemove uniquement pendant le dessin
        this.grid.addEventListener('mousemove', this.boundDraw = (e) => this.draw(e));
        this.resetInactivityTimer();
        this.updateLastActivity();
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
            this.isLocalUpdate = true;
            this.updateLastActivity();
            this.sendCellUpdate(subX, subY, this.currentColor);
        }
    }

    stopDrawing() {
        this.isDrawing = false;
        // Ne pas mettre isLocalUpdate à true ici
        this.updateLastActivity();
    }

    sendCellUpdate(subX, subY, color) {
        if (this.isConnected) {
            const message = {
                type: 'cell_update',
                sub_x: subX,
                sub_y: subY,
                color: color
            };
            this.socket.send(JSON.stringify(message));
        }
    }

    // SECTION: Gestion des utilisateurs
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
        const remainingTime = Math.max(18 - inactiveTime, 0);
        const heightPercentage = (remainingTime / 18) * 100;

        this.activityCursor.style.height = `${heightPercentage}%`;

        if (remainingTime === 0 && this.isConnected) {
            this.handleInactivityTimeout();
        }
    }

    updateLastActivity() {
        // Ne mettre à jour lastActivity que si c'est une action locale (dessin ou sélection de couleur)
        if (this.isLocalUpdate) {
            this.lastActivity = Date.now();
            this.updateActivityDisplay();
        }
    }

    startInactivityTimer() {
        this.resetInactivityTimer();
    }

    resetInactivityTimer() {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => this.handleInactivityTimeout(), this.inactivityTimeout);
    }

    handleInactivityTimeout() {
        console.log('Inactivité détectée, déconnexion...');
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
            this.grid.addEventListener('mousemove', (e) => this.handleGridMove(e));
            this.grid.addEventListener('mousedown', (e) => this.startDrawing(e));
            // Supprimer l'écouteur mousemove pour draw
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

    // SECTION: Utilitaires
    reconnect() {
        console.log('Tentative de reconnexion...');
        
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

        console.log('État du client réinitialisé');
    }

    handleUserDisconnected(message) {
        if (message.user_id === this.myUserId) {
            this.disconnectedAt = Date.now();
            this.updateActivityDisplay();
        }
    }

    handlePositionFree(position) {
        console.log('Position libre:', position);
    }

    toggleZoom() {
        const zoomButton = document.getElementById('zone-2a1');
        zoomButton.classList.toggle('zoomed');
        console.log('Zoom toggled'); // Pour débugger
    }

    initializeThemeButton() {
        const themeButton = document.querySelector('#zone-2c1 .tool-circle');
        if (themeButton) {
            themeButton.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');
            });
        }
    }
}

// Initialisation du client
document.addEventListener('DOMContentLoaded', () => {
    window.poieticClient = new PoieticClient();
});

