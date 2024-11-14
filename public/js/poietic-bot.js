class PoieticBot {
    constructor() {
        this.instanceId = `bot-${Math.random().toString(36).substr(2, 9)}`;
        
        // Fermer toute connexion WebSocket existante sur le même endpoint
        if (window.existingBotSocket) {
            console.log('Closing existing WebSocket connection');
            window.existingBotSocket.close();
            window.existingBotSocket = null;
        }

        this.userGrid = document.getElementById('user-grid');
        this.userIdElement = document.getElementById('user-id');
        this.userPositionElement = document.getElementById('user-position');
        
        this.currentBot = null;
        this.socket = null;
        this.isConnected = false;
        
        this.userPositions = new Map();
        this.sub_cell_states = {};

        // Définir les types de bots disponibles
        this.bots = {
            mimetism: window.PoieticBots.MimetismBot,
            symmetry: window.PoieticBots.SymmetryBot,
            borderline: window.PoieticBots.BorderlineBot
        };
        
        this.initializeGrid();
        this.initializeBotControls();
    }

    connect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        const url = `ws://localhost:3001/updates?mode=bot&instanceId=${this.instanceId}`;
        this.socket = new WebSocket(url);
        window.existingBotSocket = this.socket;
        
        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.startHeartbeat();
        };
        
        this.socket.onclose = () => {
            window.existingBotSocket = null;
            this.handleDisconnection();
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            window.existingBotSocket = null;
            this.handleDisconnection();
        };
        
        this.socket.onmessage = (event) => this.handleMessage(event);
    }

    initializeBotControls() {
        console.log('Initializing bot controls...');
        
        const mimetismButton = document.getElementById('mimetism-button');
        const symmetryButton = document.getElementById('symmetry-button');
        const borderlineButton = document.getElementById('borderline-button');

        console.log('Buttons found:', {
            mimetism: !!mimetismButton,
            symmetry: !!symmetryButton,
            borderline: !!borderlineButton
        });

        if (!borderlineButton) {
            console.error('Borderline button not found in DOM');
            return;
        }

        mimetismButton.onclick = () => {
            if (this.currentBot instanceof window.PoieticBots.MimetismBot) return;
            this.startBot('mimetism');
            mimetismButton.classList.add('active');
            symmetryButton.classList.remove('active');
            borderlineButton.classList.remove('active');
        };

        symmetryButton.onclick = () => {
            if (this.currentBot instanceof window.PoieticBots.SymmetryBot) return;
            this.startBot('symmetry');
            symmetryButton.classList.add('active');
            mimetismButton.classList.remove('active');
            borderlineButton.classList.remove('active');
        };

        borderlineButton.onclick = () => {
            if (this.currentBot instanceof window.PoieticBots.BorderlineBot) return;
            this.startBot('borderline');
            borderlineButton.classList.add('active');
            mimetismButton.classList.remove('active');
            symmetryButton.classList.remove('active');
        };

        // S'assurer que les boutons sont initialement inactifs
        mimetismButton.classList.remove('active');
        symmetryButton.classList.remove('active');
        borderlineButton.classList.remove('active');
    }

    startBot(botType) {
        // Nettoyer l'ancien bot si nécessaire
        if (this.currentBot) {
            if (typeof this.currentBot.cleanup === 'function') {
                this.currentBot.cleanup();
            }
            this.disconnect();
        }

        // Réinitialiser la grille
        this.initializeGrid();

        // Créer et démarrer le nouveau bot
        switch(botType) {
            case 'mimetism':
                this.currentBot = new window.PoieticBots.MimetismBot(this);
                document.getElementById('mimetism-panel').classList.add('active');
                document.getElementById('symmetry-panel').classList.remove('active');
                document.getElementById('borderline-panel').classList.remove('active');
                break;
            case 'symmetry':
                this.currentBot = new window.PoieticBots.SymmetryBot(this);
                document.getElementById('symmetry-panel').classList.add('active');
                document.getElementById('mimetism-panel').classList.remove('active');
                document.getElementById('borderline-panel').classList.remove('active');
                break;
            case 'borderline':
                this.currentBot = new window.PoieticBots.BorderlineBot(this);
                document.getElementById('borderline-panel').classList.add('active');
                document.getElementById('mimetism-panel').classList.remove('active');
                document.getElementById('symmetry-panel').classList.remove('active');
                break;
        }

        // Démarrer la connexion WebSocket
        this.connect();
    }

    disconnect() {
        console.log('Disconnecting...');
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        window.existingBotSocket = null;
        this.isConnected = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Réinitialiser les états
        this.myUserId = null;
        this.userPosition = null;
        this.userPositions = new Map();
        this.sub_cell_states = {};
    }

    initializeWebSocket() {
        console.log('Initializing WebSocket...');
        return new Promise((resolve, reject) => {
            if (this.socket) {
                this.socket.close();
            }

            this.socket = new WebSocket('ws://localhost:8080/ws');
            window.existingBotSocket = this.socket;

            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.startHeartbeat();
                resolve();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket disconnected', event.code);
                this.isConnected = false;
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                }
            };

            this.socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            };
        });
    }

    handleMessage(event) {
        // S'assurer que nous avons une chaîne JSON valide
        if (typeof event.data !== 'string') {
            console.error('Invalid message format:', event);
            return;
        }

        try {
            const message = JSON.parse(event.data);
            console.log('Parsed message:', message);

            switch (message.type) {
                case 'initial_state':
                    console.log('Processing initial state...');
                    // Parse grid state
                    const gridState = JSON.parse(message.grid_state);
                    this.myUserId = message.my_user_id;
                    
                    // Mettre à jour les positions
                    this.userPositions = new Map(Object.entries(gridState.user_positions)
                        .map(([id, pos]) => [id, {x: pos[0], y: pos[1]}]));
                    
                    if (gridState.user_positions[this.myUserId]) {
                        const pos = gridState.user_positions[this.myUserId];
                        this.userPosition = {x: pos[0], y: pos[1]};
                    }

                    // Initialiser la grille avec des couleurs aléatoires
                    for (let x = 0; x < 20; x++) {
                        for (let y = 0; y < 20; y++) {
                            const color = `rgb(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0})`;
                            this.updateCell(x, y, color);
                        }
                    }

                    // Mettre à jour les états des cellules
                    if (message.sub_cell_states) {
                        this.sub_cell_states = message.sub_cell_states;
                        
                        // Afficher les cellules existantes
                        if (this.sub_cell_states[this.myUserId]) {
                            Object.entries(this.sub_cell_states[this.myUserId]).forEach(([coords, color]) => {
                                const [x, y] = coords.split(',').map(Number);
                                this.updateCell(x, y, color);
                            });
                        }
                    }

                    // Mettre à jour l'interface du bot
                    if (this.currentBot) {
                        console.log('Updating bot interface...');
                        this.currentBot.updateInterface();
                        if (typeof this.currentBot.startIntervals === 'function') {
                            this.currentBot.startIntervals();
                        }
                    }
                    break;

                case 'user_update':
                case 'new_user':
                    if (message.user_positions) {
                        this.userPositions = new Map(Object.entries(message.user_positions)
                            .map(([id, pos]) => [id, {x: pos[0], y: pos[1]}]));
                    }
                    if (this.currentBot && typeof this.currentBot.onUserUpdate === 'function') {
                        this.currentBot.onUserUpdate(message);
                    }
                    break;

                case 'zoom_update':
                case 'cell_update':
                    if (this.currentBot) {
                        this.currentBot.handleMessage(message);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    initializeGrid() {
        // Vider la grille existante
        this.userGrid.innerHTML = '';
        
        // Créer 400 cellules (20x20)
        for (let i = 0; i < 400; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            this.userGrid.appendChild(cell);
        }
    }

    updateCell(x, y, color) {
        if (x < 0 || x >= 20 || y < 0 || y >= 20) return;
        const index = y * 20 + x;
        const cell = this.userGrid.children[index];
        if (cell) {
            cell.style.backgroundColor = color;
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000);
    }

    handleDisconnection() {
        this.isConnected = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        window.existingBotSocket = null;
        console.log('WebSocket disconnected');

        this.clearGrid();
        this.userPositions = new Map();
        this.sub_cell_states = {};
        this.myUserId = null;
        this.userPosition = null;

        // Nettoyage du bot sans redémarrage
        if (this.currentBot && typeof this.currentBot.cleanup === 'function') {
            this.currentBot.cleanup();
        }
    }

    clearGrid() {
        if (!this.userGrid) return;
        
        Array.from(this.userGrid.children).forEach(cell => {
            cell.style.backgroundColor = '#000000';
        });
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.bot = new PoieticBot();
});