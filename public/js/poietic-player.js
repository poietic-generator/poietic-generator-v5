class PoieticPlayer {
    constructor() {
        // État du player
        this.state = {
            events: [],
            currentEventIndex: 0,
            isPlaying: false,
            playbackSpeed: 1,
            currentSession: null,
            gridSize: 1,
            cells: new Map(),
            userPositions: new Map(),
            userColors: new Map(),
            playStartTime: null,      // Temps réel de début de lecture
            sessionDuration: 0,       // Durée totale de la session
            elapsedTime: 0           // Temps écoulé dans la lecture
        };

        // Éléments DOM
        this.elements = {
            sessionSelect: document.getElementById('session-select'),
            playButton: document.getElementById('btn-play'),
            pauseButton: document.getElementById('btn-pause'),
            resetButton: document.getElementById('btn-reset'),
            progressBar: document.getElementById('progress-bar'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            speedSelect: document.getElementById('playback-speed'),
            gridContainer: document.getElementById('poietic-grid')
        };

        console.log('Initialisation du player');

        this.initializeGrid();
        this.bindEvents();
        this.loadSessions();
        this.lastTimestamp = null;
        this.animationFrameId = null;
        this.eventLoop = null;
    }

    initializeGrid() {
        const container = this.elements.gridContainer;
        
        // Créer un div pour la grille comme dans le viewer
        this.grid = document.createElement('div');
        this.grid.style.width = '100%';
        this.grid.style.height = '100%';
        this.grid.style.position = 'relative';
        this.grid.style.maxWidth = '100vmin';
        this.grid.style.maxHeight = '100vmin';
        
        container.appendChild(this.grid);
        this.updateGridSize();
    }

    createUserCell(userId) {
        const cell = document.createElement('div');
        cell.className = 'user-cell';
        
        // Créer la grille 20x20 de sous-cellules
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
        this.state.cells.set(userId, cell);
        return cell;
    }

    updateGridSize() {
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        this.cellSize = screenSize / this.state.gridSize;
        this.subCellSize = this.cellSize / 20;

        this.grid.style.width = `${screenSize}px`;
        this.grid.style.height = `${screenSize}px`;

        // Mettre à jour la position de toutes les cellules
        this.state.cells.forEach((cell, userId) => {
            const position = this.state.userPositions.get(userId);
            if (position) {
                this.positionCell(cell, position.x, position.y);
            }
        });
    }

    positionCell(cell, x, y) {
        const offset = Math.floor(this.state.gridSize / 2);
        const pixelX = (x + offset) * this.cellSize;
        const pixelY = (y + offset) * this.cellSize;
        
        cell.style.left = `${pixelX}px`;
        cell.style.top = `${pixelY}px`;
        cell.style.width = `${this.cellSize}px`;
        cell.style.height = `${this.cellSize}px`;
    }

    bindEvents() {
        // Événements des contrôles
        this.elements.sessionSelect.addEventListener('change', (event) => {
            const sessionId = event.target.value;
            if (sessionId) {  // Vérifier que l'ID n'est pas vide
                this.loadSession(sessionId);
            }
        });
        this.elements.playButton.addEventListener('click', () => this.play());
        this.elements.pauseButton.addEventListener('click', () => this.pause());
        this.elements.resetButton.addEventListener('click', () => this.reset());
        this.elements.progressBar.addEventListener('input', () => this.seekTo(this.elements.progressBar.value));
        this.elements.speedSelect.addEventListener('change', () => this.updatePlaybackSpeed());
    }

    async loadSessions() {
        try {
            const response = await fetch('/api/player/sessions');
            const sessions = await response.json();
            this.state.sessions = sessions;

            // Mise à jour du menu déroulant
            this.elements.sessionSelect.innerHTML = `
                <option value="">Sélectionner une session...</option>
                ${sessions.map(session => `
                    <option value="${session.id}">
                        Session ${new Date(session.start_time).toLocaleString()}
                        (${session.event_count} événements)
                    </option>
                `).join('')}
            `;
        } catch (error) {
            console.error('Erreur lors du chargement des sessions:', error);
        }
    }

    loadSession(sessionId) {
        fetch(`/api/player/sessions/${sessionId}/events`)
            .then(response => response.json())
            .then(events => {
                // Logs pour analyser les timestamps
                const firstEvent = events[0];
                const lastEvent = events[events.length - 1];
                console.log('=== Analyse des timestamps ===');
                console.log('Premier événement:', {
                    type: firstEvent.type,
                    timestamp: firstEvent.timestamp,
                    date: new Date(firstEvent.timestamp).toISOString()
                });
                console.log('Dernier événement:', {
                    type: lastEvent.type,
                    timestamp: lastEvent.timestamp,
                    date: new Date(lastEvent.timestamp).toISOString()
                });
                console.log('Durée réelle de la session:', 
                    (lastEvent.timestamp - firstEvent.timestamp) / 1000, 'secondes');
                
                this.state.events = events;
                this.state.currentEventIndex = 0;
                this.initializeFromEvents();
            });
    }

    initializeFromEvents() {
        const initialEvent = this.state.events.find(e => e.type === 'initial_state');
        if (initialEvent) {
            this.applyInitialState(initialEvent);
        }
        
        // Calculer la durée totale de la session
        const firstEvent = this.state.events[0];
        const lastEvent = this.state.events[this.state.events.length - 1];
        this.state.sessionDuration = lastEvent.timestamp - firstEvent.timestamp;
        
        this.updateTimeDisplay();
        this.state.currentSession = this.elements.sessionSelect.value;
    }

    play() {
        console.log('Play demandé');
        if (!this.state.currentSession) {
            console.error('Pas de session sélectionnée');
            return;
        }
        
        if (this.state.currentEventIndex >= this.state.events.length) {
            console.log('Fin de session atteinte, retour au début');
            this.reset();
        }
        
        console.log('Démarrage lecture à l\'index:', this.state.currentEventIndex);
        
        this.state.isPlaying = true;
        this.state.playStartTime = Date.now() - this.state.elapsedTime;
        this.elements.playButton.disabled = true;
        this.elements.pauseButton.disabled = false;
        
        // Démarrer la boucle de mise à jour du temps
        this.startTimeLoop();
        // Démarrer la boucle d'événements
        this.startEventLoop();
    }

    startTimeLoop() {
        if (this.timeLoop) {
            cancelAnimationFrame(this.timeLoop);
        }

        const updateTime = () => {
            if (!this.state.isPlaying) return;

            const now = Date.now();
            this.state.elapsedTime = (now - this.state.playStartTime) * this.state.playbackSpeed;

            // Si on dépasse la durée totale, arrêter la lecture
            if (this.state.elapsedTime >= this.state.sessionDuration) {
                this.pause();
                this.state.elapsedTime = this.state.sessionDuration;
            }

            this.updateTimeDisplay();
            this.updateProgressBar();

            this.timeLoop = requestAnimationFrame(updateTime);
        };

        this.timeLoop = requestAnimationFrame(updateTime);
    }

    startEventLoop() {
        if (this.eventLoop) {
            clearInterval(this.eventLoop);
        }

        let lastTimestamp = Date.now();
        let firstEventTime = this.state.events[0].timestamp;
        let eventCount = 0;
        let totalDelay = 0;
        
        const statsInterval = setInterval(() => {
            if (eventCount > 0) {
                console.log('=== Statistiques de lecture ===', {
                    vitesse: this.state.playbackSpeed,
                    delaiMoyen: totalDelay / eventCount,
                    evenementsTraites: eventCount,
                    tempsEcoule: this.state.elapsedTime / 1000,
                    dureeTotale: this.state.sessionDuration / 1000,
                    evenementsRestants: this.state.events.length - this.state.currentEventIndex
                });
            }
        }, 5000);

        this.eventLoop = setInterval(() => {
            if (!this.state.isPlaying) {
                clearInterval(statsInterval);
                return;
            }
            
            const now = Date.now();
            const sessionElapsed = (now - this.state.playStartTime) * this.state.playbackSpeed;
            
            // Traiter plusieurs événements par cycle si nécessaire
            let eventsProcessed = 0;
            const maxEventsPerCycle = Math.ceil(this.state.playbackSpeed);
            
            while (eventsProcessed < maxEventsPerCycle) {
                const currentEvent = this.state.events[this.state.currentEventIndex];
                const nextEvent = this.state.events[this.state.currentEventIndex + 1];
                
                if (!nextEvent) {
                    if (this.state.elapsedTime >= this.state.sessionDuration) {
                        console.log('=== Fin de session ===', {
                            evenementsTraites: eventCount,
                            dureeReelle: this.state.sessionDuration / 1000,
                            tempsEcoule: this.state.elapsedTime / 1000
                        });
                        this.pause();
                        clearInterval(statsInterval);
                    }
                    break;
                }
                
                const nextEventTime = nextEvent.timestamp - firstEventTime;
                
                if (sessionElapsed >= nextEventTime) {
                    if (this.state.currentEventIndex % 100 === 0) {
                        console.log('=== Progression ===', {
                            tempsSession: sessionElapsed / 1000,
                            tempsEvenement: nextEventTime / 1000,
                            vitesse: this.state.playbackSpeed,
                            index: this.state.currentEventIndex
                        });
                    }

                    this.processNextEvent();
                    eventCount++;
                    eventsProcessed++;
                } else {
                    break;
                }
            }
            
            lastTimestamp = now;
        }, 16);
    }

    processNextEvent() {
        if (this.state.currentEventIndex >= this.state.events.length) {
            console.log('Dernier événement atteint');
            this.pause();
            return;
        }

        const currentEvent = this.state.events[this.state.currentEventIndex];
        
        // Appliquer l'événement
        this.applyEvent(currentEvent);
        this.state.currentEventIndex++;
    }

    applyEvent(event) {
        console.log('Application événement:', event.type);
        
        switch (event.type) {
            case 'initial_state':
                this.applyInitialState(event);
                break;
            case 'cell_update':
                this.applyCellUpdate(event);
                break;
            case 'user_left':
                this.applyUserLeft(event);
                break;
            case 'zoom_update':
                console.log('Traitement zoom_update:', event);
                this.applyZoomUpdate(event);
                break;
            case 'session_start':
                console.log('Début de session');
                break;
            case 'session_end':
                console.log('Fin de session');
                this.pause();
                break;
        }
    }

    pause() {
        console.log('Pause demandée');
        this.state.isPlaying = false;
        
        if (this.eventLoop) {
            clearInterval(this.eventLoop);
            this.eventLoop = null;
        }
        
        if (this.timeLoop) {
            cancelAnimationFrame(this.timeLoop);
        }
        
        this.elements.playButton.disabled = false;
        this.elements.pauseButton.disabled = true;
    }

    reset() {
        console.log('Reset demandé');
        this.pause();
        this.state.currentEventIndex = 0;
        this.clearGrid();
        
        const initialEvent = this.state.events.find(e => e.type === 'initial_state');
        if (initialEvent) {
            console.log('Application état initial');
            this.applyInitialState(initialEvent);
        }
        
        this.updateTimeDisplay();
    }

    updatePlaybackSpeed() {
        const oldSpeed = this.state.playbackSpeed;
        const newSpeed = parseFloat(this.elements.speedSelect.value);
        console.log('=== Changement de vitesse ===', {
            ancien: oldSpeed,
            nouveau: newSpeed,
            tempsEcoule: this.state.elapsedTime,
            dureeSession: this.state.sessionDuration
        });
        
        if (this.state.isPlaying) {
            this.state.playStartTime = Date.now() - (this.state.elapsedTime / newSpeed);
        }
        this.state.playbackSpeed = newSpeed;
    }

    updateProgressBar() {
        const progress = (this.state.elapsedTime / this.state.sessionDuration) * 100;
        this.elements.progressBar.value = progress;
    }

    updateTimeDisplay() {
        const formatTime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        this.elements.currentTime.textContent = formatTime(this.state.elapsedTime);
        this.elements.totalTime.textContent = formatTime(this.state.sessionDuration);
    }

    // Méthodes de dessin à implémenter
    clearGrid() {
        if (!this.ctx) return;
        console.log('Effacement de la grille');
        
        // Effacer avec un fond blanc
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Dessiner la grille de base
        const gridCells = 20;
        const cellSize = Math.floor(this.canvas.width / gridCells);
        
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 1;
        
        // Dessiner les lignes verticales et horizontales
        for (let i = 0; i <= gridCells; i++) {
            const pos = i * cellSize;
            
            this.ctx.beginPath();
            this.ctx.moveTo(pos, 0);
            this.ctx.lineTo(pos, this.canvas.height);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, pos);
            this.ctx.lineTo(this.canvas.width, pos);
            this.ctx.stroke();
        }
    }

    redrawGrid() {
        // À implémenter : redessiner la grille complète
    }

    applyInitialState(event) {
        console.log('Application état initial:', event);
        this.state.gridSize = event.grid_size;
        
        // Nettoyer l'état précédent
        this.grid.innerHTML = '';
        this.state.cells.clear();
        this.state.userPositions.clear();
        this.state.userColors.clear();
        
        // Traiter les positions et couleurs des utilisateurs
        if (event.user_positions) {
            Object.entries(event.user_positions).forEach(([userId, position]) => {
                const cell = this.createUserCell(userId);
                this.state.userPositions.set(userId, {x: position[0], y: position[1]});
                this.state.userColors.set(userId, event.user_colors[userId]);
                this.positionCell(cell, position[0], position[1]);
            });
        }
        
        // Appliquer l'état initial des sous-cellules
        if (event.sub_cell_states) {
            Object.entries(event.sub_cell_states).forEach(([userId, cells]) => {
                Object.entries(cells).forEach(([coords, color]) => {
                    const [x, y] = coords.split(',').map(Number);
                    this.updateSubCell(userId, x, y, color);
                });
            });
        }
        
        this.updateGridSize();
    }

    updateSubCell(userId, x, y, color) {
        const cell = this.state.cells.get(userId);
        if (cell) {
            const subCell = cell.querySelector(`[data-x="${x}"][data-y="${y}"]`);
            if (subCell) {
                subCell.style.backgroundColor = color;
            }
        }
    }

    applyCellUpdate(event) {
        if (!event.user_id || typeof event.sub_x !== 'number' || 
            typeof event.sub_y !== 'number' || !event.color) {
            return;
        }
        
        // Mettre à jour la sous-cellule
        this.updateSubCell(event.user_id, event.sub_x, event.sub_y, event.color);
    }

    applyUserLeft(event) {
        const userId = event.user_id;
        
        // Supprimer l'utilisateur
        const cell = this.state.cells.get(userId);
        if (cell) {
            cell.remove();
            this.state.cells.delete(userId);
            this.state.userPositions.delete(userId);
            this.state.userColors.delete(userId);
        }

        // S'il ne reste qu'un utilisateur, vérifier sa position
        if (this.state.cells.size === 1) {
            // Récupérer le dernier utilisateur
            const [lastUserId] = this.state.cells.keys();
            const lastPosition = this.state.userPositions.get(lastUserId);
            
            // Ne changer la taille que si l'utilisateur est en (0,0)
            if (lastPosition && lastPosition.x === 0 && lastPosition.y === 0) {
                this.state.gridSize = 1;
                this.updateGridSize();
            }
            return;
        }

        // Pour plus d'un utilisateur, appliquer la formule normale
        const remainingUsers = this.state.cells.size;
        if (remainingUsers > 1) {
            let newGridSize;
            if (remainingUsers <= 9) newGridSize = 3;
            else if (remainingUsers <= 25) newGridSize = 5;
            else newGridSize = 7;
            
            if (newGridSize !== this.state.gridSize) {
                this.state.gridSize = newGridSize;
                this.updateGridSize();
            }
        }
    }

    applyZoomUpdate(event) {
        console.log('Mise à jour du zoom:', event);
        
        // Mettre à jour la taille de la grille
        this.state.gridSize = event.grid_size;
        
        // Mettre à jour les couleurs des utilisateurs
        if (event.user_colors) {
            this.state.userColors = new Map(Object.entries(event.user_colors));
        }

        // Mettre à jour les positions des utilisateurs depuis grid_state
        if (event.grid_state) {
            const gridState = typeof event.grid_state === 'string' ? 
                JSON.parse(event.grid_state) : event.grid_state;
            
            if (gridState.user_positions) {
                Object.entries(gridState.user_positions).forEach(([userId, position]) => {
                    this.state.userPositions.set(userId, {x: position[0], y: position[1]});
                    // Créer ou mettre à jour la cellule
                    let cell = this.state.cells.get(userId);
                    if (!cell) {
                        cell = this.createUserCell(userId);
                    }
                    this.positionCell(cell, position[0], position[1]);
                });
            }
        }

        // Mettre à jour les états des sous-cellules
        if (event.sub_cell_states) {
            Object.entries(event.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    const [subX, subY] = coords.split(',').map(Number);
                    this.updateSubCell(userId, subX, subY, color);
                });
            });
        }

        // Recalculer les dimensions de la grille
        this.updateGridSize();
    }

    seekTo(percentage) {
        const targetTime = (percentage / 100) * this.state.sessionDuration;
        this.state.elapsedTime = targetTime;
        this.state.playStartTime = Date.now() - (targetTime / this.state.playbackSpeed);
        
        // Trouver l'index de l'événement correspondant au temps cible
        const firstEventTime = this.state.events[0].timestamp;
        const targetTimestamp = firstEventTime + targetTime;
        
        this.state.currentEventIndex = this.state.events.findIndex(e => 
            e.timestamp > targetTimestamp);
        
        if (this.state.currentEventIndex === -1) {
            this.state.currentEventIndex = this.state.events.length - 1;
        }
        
        this.updateTimeDisplay();
    }
}
// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.poieticPlayer = new PoieticPlayer();
});
