import { ColorGenerator } from './poietic-color-generator.js';

class PoieticBot {
    constructor() {
        this.instanceId = `bot-${Math.random().toString(36).substr(2, 9)}`;
        
        if (window.frameElement) {
            window.frameElement.dataset.botId = this.instanceId;
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
            'random-self': window.PoieticBots.RandomSelfBot,
            mimetism: window.PoieticBots.MimetismBot,
            symmetry: window.PoieticBots.SymmetryBot,
            borderline: window.PoieticBots.BorderlineBot
        };
        
        this.initializeGrid();
        this.initializeBotControls();
    }

    cleanupOldConnections() {
        // Fermer toute connexion existante
        if (window.existingBotSocket) {
            try {
                window.existingBotSocket.close();
            } catch (e) {
                console.log('Error closing existing socket:', e);
            }
            window.existingBotSocket = null;
        }
        
        // Réinitialiser l'état
        this.userPositions = new Map();
        this.sub_cell_states = {};
        this.clearGrid();
    }

    connect() {
        this.cleanupOldConnections();
        
        const url = `ws://localhost:3001/updates?mode=bot&instanceId=${this.instanceId}`;
        this.socket = new WebSocket(url);
        window.existingBotSocket = this.socket;
        
        this.socket.onopen = () => {
            console.log(`Bot ${this.instanceId} connected`);
            this.isConnected = true;
            this.startHeartbeat();
        };
        
        this.socket.onclose = () => {
            if (window.existingBotSocket === this.socket) {
                window.existingBotSocket = null;
            }
            this.handleDisconnection();
        };
        
        this.socket.onerror = (error) => {
            console.error(`Bot ${this.instanceId} WebSocket error:`, error);
            this.handleDisconnection();
        };
        
        this.socket.onmessage = (event) => this.handleMessage(event);
    }

    initializeBotControls() {
        console.log('Initializing bot controls...');
        
        const botSelector = document.getElementById('bot-selector');
        if (!botSelector) {
            console.error('Bot selector not found in DOM');
            return;
        }

        botSelector.addEventListener('change', (event) => {
            const selectedBot = event.target.value;
            this.startBot(selectedBot);
        });
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
            case 'random-self':
                this.currentBot = new window.PoieticBots.RandomSelfBot(this);
                document.getElementById('random-self-panel').classList.add('active');
                document.getElementById('mimetism-panel').classList.remove('active');
                document.getElementById('symmetry-panel').classList.remove('active');
                document.getElementById('borderline-panel').classList.remove('active');
                break;
            case 'mimetism':
                this.currentBot = new window.PoieticBots.MimetismBot(this);
                document.getElementById('mimetism-panel').classList.add('active');
                document.getElementById('symmetry-panel').classList.remove('active');
                document.getElementById('borderline-panel').classList.remove('active');
                document.getElementById('random-self-panel').classList.remove('active');
                break;
            case 'symmetry':
                this.currentBot = new window.PoieticBots.SymmetryBot(this);
                document.getElementById('symmetry-panel').classList.add('active');
                document.getElementById('mimetism-panel').classList.remove('active');
                document.getElementById('borderline-panel').classList.remove('active');
                document.getElementById('random-self-panel').classList.remove('active');
                break;
            case 'borderline':
                this.currentBot = new window.PoieticBots.BorderlineBot(this);
                document.getElementById('borderline-panel').classList.add('active');
                document.getElementById('mimetism-panel').classList.remove('active');
                document.getElementById('symmetry-panel').classList.remove('active');
                document.getElementById('random-self-panel').classList.remove('active');
                break;
        }

        // Démarrer la connexion WebSocket
        this.connect();
    }

    disconnect() {
        console.log(`Bot ${this.instanceId} disconnecting...`);
        if (this.socket) {
            this.socket.close();
            if (window.existingBotSocket === this.socket) {
                window.existingBotSocket = null;
            }
            this.socket = null;
        }
        this.cleanupOldConnections();
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
        try {
            const message = JSON.parse(event.data);
            console.log('Parsed message:', message);

            switch (message.type) {
                case 'initial_state':
                    console.log('Processing initial state...');
                    const gridState = JSON.parse(message.grid_state);
                    this.myUserId = message.my_user_id;
                    
                    // Générer les couleurs initiales avec ColorGenerator
                    const initialColors = ColorGenerator.generateInitialColors(this.myUserId);
                    
                    // Initialiser la grille avec les couleurs générées
                    for (let y = 0; y < 20; y++) {
                        for (let x = 0; x < 20; x++) {
                            const colorIndex = y * 20 + x;
                            const color = initialColors[colorIndex];
                            this.updateCell(x, y, color);
                        }
                    }

                    // Mettre à jour les positions
                    this.userPositions = new Map(Object.entries(gridState.user_positions)
                        .map(([id, pos]) => [id, {x: pos[0], y: pos[1]}]));
                    
                    if (gridState.user_positions[this.myUserId]) {
                        const pos = gridState.user_positions[this.myUserId];
                        this.userPosition = {x: pos[0], y: pos[1]};
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