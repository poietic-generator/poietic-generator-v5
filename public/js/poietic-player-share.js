class SessionRenderer {
    constructor(sessionData, config) {
        this.sessionData = sessionData;
        this.config = {
            ...config,
            renderMode: config.renderMode || 'realtime' // 'realtime' ou 'eventtime'
        };
        this.userStates = new Map();
        this.activeUsers = new Set();
        this.state = this.initializeState();
        this.frameCache = new Map();
    }

    initializeState() {
        // Calculer la taille de la grille en fonction du nombre d'utilisateurs actifs
        const activeUsers = this.getActiveUsersAtEvent(0);
        const gridSize = this.calculateGridSize(activeUsers.length);
        console.log('Grid size calculated:', gridSize);
        
        return {
            grid: new Array(gridSize * gridSize).fill().map(() => ({
                pixels: new Array(this.config.gridPixels * this.config.gridPixels).fill('rgb(0,0,0)')
            })),
            zoomLevel: 1,
            gridSize: gridSize,
            userPositions: new Map(),
            userColors: new Map()
        };
    }

    getActiveUsersAtEvent(eventIndex) {
        const activeUsers = new Set();
        this.sessionData.events.slice(0, eventIndex + 1).forEach(event => {
            if (event.type === 'initial_state') {
                Object.keys(event.user_positions).forEach(userId => activeUsers.add(userId));
            } else if (event.type === 'user_left') {
                activeUsers.delete(event.user_id);
            }
        });
        return Array.from(activeUsers);
    }

    calculateGridSize(userCount) {
        if (userCount <= 1) return 1;
        if (userCount <= 9) return 3;
        if (userCount <= 25) return 5;
        return 7;
    }

    processEvents(eventIndex) {
        if (eventIndex === undefined) return false;
        
        console.log(`Processing events up to index ${eventIndex}`);
        
        // Réinitialiser l'état
        this.userStates = new Map();
        this.activeUsers = new Set();
        const newGridSize = 1;
        
        this.state = {
            grid: new Array(newGridSize * newGridSize).fill().map(() => ({
                pixels: new Array(this.config.gridPixels * this.config.gridPixels).fill('rgb(0,0,0)')
            })),
            zoomLevel: 1,
            gridSize: newGridSize,
            userPositions: new Map(),
            userColors: new Map()
        };

        // Traiter les événements jusqu'à l'index spécifié
        this.sessionData.events.slice(0, eventIndex).forEach((event, idx) => {
            console.log(`Processing event ${idx}/${eventIndex}: ${event.type}`);
            
            switch(event.type) {
                case 'session_start':
                    // Ne rien faire de spécial, juste continuer
                    break;

                case 'initial_state':
                    console.log('Processing initial_state event');
                    
                    // Mettre à jour la taille de la grille en fonction des utilisateurs actifs
                    Object.entries(event.user_positions).forEach(([userId, pos]) => {
                        this.activeUsers.add(userId);
                    });
                    
                    const newSize = this.calculateGridSize(this.activeUsers.size);
                    if (newSize > this.state.gridSize) {
                        this.resizeGrid(newSize);
                    }

                    // Mettre à jour les positions et couleurs des utilisateurs
                    Object.entries(event.user_positions).forEach(([userId, pos]) => {
                        const center = Math.floor(this.state.gridSize / 2);
                        const position = {
                            x: pos[0] + center,
                            y: pos[1] + center
                        };
                        
                        console.log(`Setting position for user ${userId}: original=${pos}, adjusted=${JSON.stringify(position)}`);
                        
                        this.state.userPositions.set(userId, position);
                        this.state.userColors.set(userId, event.user_colors[userId]);
                        
                        const gridPosition = position.x + position.y * this.state.gridSize;
                        this.userStates.set(userId, {
                            position: gridPosition,
                            pixels: new Array(this.config.gridPixels * this.config.gridPixels).fill('rgb(0,0,0)')
                        });
                    });

                    // Appliquer les états initiaux des cellules
                    if (event.sub_cell_states) {
                        Object.entries(event.sub_cell_states).forEach(([userId, states]) => {
                            const userState = this.userStates.get(userId);
                            if (userState) {
                                Object.entries(states).forEach(([coords, color]) => {
                                    const [x, y] = coords.split(',').map(Number);
                                    const position = y * this.config.gridPixels + x;
                                    userState.pixels[position] = color;
                                    
                                    const cell = this.state.grid[userState.position];
                                    if (cell) {
                                        cell.pixels[position] = color;
                                    }
                                });
                            }
                        });
                    }
                    break;

                case 'user_left':
                    if (this.activeUsers.has(event.user_id)) {
                        console.log(`User left: ${event.user_id}`);
                        const leftUserState = this.userStates.get(event.user_id);
                        if (leftUserState) {
                            // Effacer la grille de l'utilisateur
                            this.state.grid[leftUserState.position].pixels.fill('rgb(0,0,0)');
                        }
                        this.userStates.delete(event.user_id);
                        this.state.userPositions.delete(event.user_id);
                        this.state.userColors.delete(event.user_id);
                        this.activeUsers.delete(event.user_id);

                        // Si il ne reste qu'un utilisateur, vérifier sa position
                        if (this.activeUsers.size === 1) {
                            const lastUserId = Array.from(this.activeUsers)[0];
                            const lastUserPos = this.state.userPositions.get(lastUserId);
                            const center = Math.floor(this.state.gridSize / 2);
                            
                            console.log('Last user check:', {
                                userId: lastUserId,
                                position: lastUserPos,
                                center: center,
                                originalPosition: this.sessionData.events.find(e => 
                                    e.type === 'initial_state' && 
                                    e.user_positions[lastUserId]
                                )?.user_positions[lastUserId]
                            });

                            // Vérifier si le dernier utilisateur est en position (0,0) dans les coordonnées originales
                            const initialStateEvent = this.sessionData.events.find(e => 
                                e.type === 'initial_state' && 
                                e.user_positions[lastUserId]
                            );

                            if (initialStateEvent) {
                                const originalPos = initialStateEvent.user_positions[lastUserId];
                                if (originalPos[0] === 0 && originalPos[1] === 0) {
                                    console.log('Last user is at (0,0), resetting zoom to 1');
                                    this.state = {
                                        ...this.state,
                                        zoomLevel: 1,
                                        gridSize: 1,
                                        grid: new Array(1).fill().map(() => ({
                                            pixels: this.state.grid[lastUserPos.x + lastUserPos.y * this.state.gridSize].pixels.slice()
                                        }))
                                    };
                                    // Ajuster la position pour la nouvelle grille 1x1
                                    this.state.userPositions.set(lastUserId, {x: 0, y: 0});
                                    const userState = this.userStates.get(lastUserId);
                                    if (userState) {
                                        userState.position = 0;
                                    }
                                } else {
                                    console.log('Last user is not at (0,0), keeping current zoom');
                                }
                            }
                        }
                    }
                    break;

                case 'cell_update':
                    if (this.activeUsers.has(event.user_id)) {
                        const userState = this.userStates.get(event.user_id);
                        if (userState) {
                            const cell = this.state.grid[userState.position];
                            if (cell) {
                                const position = event.sub_y * this.config.gridPixels + event.sub_x;
                                cell.pixels[position] = event.color;
                                userState.pixels[position] = event.color;
                                console.log(`Updated pixel for user ${event.user_id} at position ${position} with color ${event.color}`);
                            }
                        }
                    }
                    break;
            }
        });

        // Ne retourner true que si nous avons traité tous les événements ET qu'il n'y a plus d'utilisateurs actifs
        const isLastEvent = eventIndex >= this.sessionData.events.length;
        return isLastEvent && this.activeUsers.size === 0;
    }

    resizeGrid(newSize) {
        const oldGrid = this.state.grid;
        const oldSize = this.state.gridSize;
        
        this.state.grid = new Array(newSize * newSize).fill().map(() => ({
            pixels: new Array(this.config.gridPixels * this.config.gridPixels).fill('rgb(0,0,0)')
        }));
        this.state.gridSize = newSize;
        
        // Recopier les anciennes cellules dans la nouvelle grille
        this.userStates.forEach((state, userId) => {
            const oldPos = this.state.userPositions.get(userId);
            if (oldPos) {
                const center = Math.floor(newSize / 2);
                const newPos = {
                    x: oldPos.x - Math.floor(oldSize / 2) + center,
                    y: oldPos.y - Math.floor(oldSize / 2) + center
                };
                this.state.userPositions.set(userId, newPos);
                state.position = newPos.x + newPos.y * newSize;
                this.state.grid[state.position].pixels = oldGrid[oldPos.x + oldPos.y * oldSize].pixels.slice();
            }
        });
    }

    renderFinalFrame() {
        // Assurez-vous que le rendu de la dernière frame noire est effectué
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = this.config.gridPixels * this.config.gridPixels;
        canvas.width = size;
        canvas.height = size;

        this.renderToCanvas(ctx, size);

        // Arrêter le mediaRecorder après le rendu de la dernière frame
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
        }
    }

    calculateGridPosition(x, y, oldGridSize, newGridSize) {
        // Calculer le centre de la nouvelle grille
        const center = Math.floor(newGridSize / 2);
        
        // Calculer l'offset pour centrer la position
        const offsetX = center - Math.floor(oldGridSize / 2);
        const offsetY = center - Math.floor(oldGridSize / 2);
        
        // Retourner la nouvelle position
        return {
            x: Math.min(Math.max(x + offsetX, 0), newGridSize - 1),
            y: Math.min(Math.max(y + offsetY, 0), newGridSize - 1)
        };
    }

    renderToCanvas(ctx, size) {
        // Fond noir
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, size, size);

        // Si pas d'utilisateurs actifs, retourner la frame noire
        if (this.userStates.size === 0) {
            console.log('No active users, rendering black frame');
            return;
        }

        const gridSize = this.state.gridSize;
        const cellSize = size / (gridSize * this.state.zoomLevel);
        const pixelSize = cellSize / this.config.gridPixels;

        // Appliquer le zoom
        ctx.save();
        ctx.scale(this.state.zoomLevel, this.state.zoomLevel);

        let coloredPixelsCount = 0;
        this.state.grid.forEach((cell, index) => {
            const x = (index % gridSize) * cellSize;
            const y = Math.floor(index / gridSize) * cellSize;
            
            cell.pixels.forEach((color, pixelIndex) => {
                if (color && color !== 'rgb(0,0,0)') {
                    const px = (pixelIndex % this.config.gridPixels) * pixelSize;
                    const py = Math.floor(pixelIndex / this.config.gridPixels) * pixelSize;
                    ctx.fillStyle = color;
                    ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
                    coloredPixelsCount++;
                }
            });
        });

        console.log(`Rendered frame with ${coloredPixelsCount} colored pixels`);

        ctx.restore();
    }

    generateSpiralPositions(gridSize) {
        const positions = [];
        const center = Math.floor(gridSize / 2);
        
        // Commencer au centre
        positions.push({ x: center, y: center });
        
        let x = center;
        let y = center;
        let dx = 1;  // Commencer vers la droite
        let dy = 0;
        let steps = 0;
        let stepSize = 1;

        // Générer le reste des positions
        while (positions.length < gridSize * gridSize) {
            x += dx;
            y += dy;
            
            // Vérifier si la position est dans la grille
            if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
                positions.push({ x, y });
            }
            
            steps++;
            if (steps === stepSize) {
                steps = 0;
                // Rotation de 90 degrés
                [dx, dy] = [-dy, dx];
                // Augmenter la taille du pas après un tour complet
                if (dy === 0) {
                    stepSize++;
                }
            }
        }

        console.log('Generated spiral positions:', positions);
        return positions;
    }

    handleVideoExport(sessionData, config, dialog) {
        const status = dialog.querySelector('.status');
        const progress = dialog.querySelector('.progress');

        try {
            const renderer = new SessionRenderer(sessionData, {
                ...config,
                renderMode: config.renderMode
            });

            const FPS = 10;
            let totalFrames;
            let timeStep;
            let eventFrames;

            if (config.renderMode === 'eventtime') {
                // Calculer les frames nécessaires pour chaque événement
                eventFrames = this.calculateEventFrames(sessionData.events, FPS);
                totalFrames = eventFrames.length;
                console.log(`Event mode: ${totalFrames} frames to render`);
            } else {
                // Mode realtime existant
                const requestedDuration = config.durationLimit;
                totalFrames = requestedDuration * FPS;
                timeStep = (lastTimestamp - firstTimestamp) / totalFrames;
                console.log(`Realtime mode: ${totalFrames} frames to render`);
            }

            // ... configuration du MediaRecorder ...

            let frame = 0;
            const renderNextFrame = () => {
                if (frame >= totalFrames) {
                    mediaRecorder.stop();
                    return;
                }

                let eventIndex;
                if (config.renderMode === 'eventtime') {
                    eventIndex = eventFrames[frame].eventIndex;
                } else {
                    const currentTime = firstTimestamp + (frame * timeStep);
                    eventIndex = sessionData.events.findIndex(e => e.timestamp > currentTime);
                }

                const isSessionEnded = renderer.processEvents(eventIndex);
                renderer.renderToCanvas(ctx, size);

                const percent = (frame / totalFrames) * 100;
                progress.style.width = `${percent}%`;
                status.textContent = `Generating video: ${Math.floor(percent)}%`;

                frame++;
                
                if (isSessionEnded) {
                    console.log('Session ended, stopping video generation');
                    mediaRecorder.stop();
                    return;
                }

                setTimeout(renderNextFrame, 1000/FPS);
            };

            renderNextFrame();

        } catch (error) {
            console.error('Error during recording:', error);
            status.textContent = 'Error during recording';
        }
    }

    calculateEventFrames(events, FPS) {
        const frames = [];
        const minFramesPerEvent = 5; // Nombre minimum de frames par événement
        let lastEventTime = null;

        events.forEach((event, index) => {
            if (lastEventTime === null) {
                // Premier événement
                frames.push({ eventIndex: index, type: event.type });
                lastEventTime = event.timestamp;
                return;
            }

            const timeSinceLastEvent = event.timestamp - lastEventTime;
            
            if (timeSinceLastEvent > 1000) { // Si plus d'une seconde s'est écoulée
                // Ajouter quelques frames de transition
                for (let i = 0; i < minFramesPerEvent; i++) {
                    frames.push({ eventIndex: index, type: event.type });
                }
            } else {
                // Événements rapprochés, une seule frame
                frames.push({ eventIndex: index, type: event.type });
            }

            lastEventTime = event.timestamp;
        });

        // Ajouter des frames supplémentaires pour le dernier événement
        const lastIndex = events.length - 1;
        for (let i = 0; i < minFramesPerEvent; i++) {
            frames.push({ eventIndex: lastIndex, type: events[lastIndex].type });
        }

        return frames;
    }
}

// Ensuite déclarer le gestionnaire principal qui utilise SessionRenderer
export class PlayerShareManager {
    constructor(player) {
        this.player = player;

        // Constantes pour le rendu
        this.PIXEL_SIZE = 6;
        this.GRID_PIXELS = 20;

        // Détection des capacités
        this.capabilities = {
            canUseWebM: MediaRecorder.isTypeSupported('video/webm;codecs=vp8'),
            canUseMp4: MediaRecorder.isTypeSupported('video/mp4'),
            hasMediaRecorder: 'MediaRecorder' in window
        };

        this.isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        this.setupShareButton();
    }

    setupShareButton() {
        const shareButton = document.querySelector('.share-button');
        if (shareButton) {
            shareButton.addEventListener('click', () => this.handleShare());
        }
    }
    async handleShare() {
        if (!this.player.state?.currentSession) {
            alert('Please select a session before sharing');
            return;
        }
    
        console.log('Current session ID:', this.player.state.currentSession);
        console.log('Player state:', this.player.state);
    
        try {
            // Préparation des données avec tous les utilisateurs
            const sessionData = {
                events: this.player.state.events,
                users: []
            };

            // Parcourir la Map des cellules pour capturer tous les utilisateurs
            this.player.state.cells.forEach((cell, userId) => {
                const position = this.player.state.userPositions.get(userId);
                console.log('Processing user:', {
                    userId,
                    position,
                    cellContent: cell
                });

                if (position) {
                    const gridSize = Math.sqrt(this.player.state.cells.size);
                    sessionData.users.push({
                        id: userId,
                        position: position.x + (position.y * gridSize),
                        color: this.player.state.userColors.get(userId),
                        initialState: Array.from(cell.children).map(subCell => {
                            const color = subCell.style.backgroundColor;
                            console.log(`Initial pixel color for user ${userId}:`, color);
                            return color || 'rgb(0,0,0)';
                        })
                    });
                }
            });

            console.log('Session data prepared:', sessionData);
            console.log('Number of users:', sessionData.users.length);
            console.log('Users positions:', sessionData.users.map(u => ({id: u.id, position: u.position})));
            console.log('Initial states captured:', sessionData.users.map(u => ({
                id: u.id,
                coloredPixels: u.initialState.filter(c => c !== 'rgb(0,0,0)').length
            })));

            this.showConfigDialog(sessionData);
        } catch (error) {
            console.error('Error preparing session data:', error);
            console.error('Error details:', error);
            alert('Unable to prepare session data');
        }
    }

    showConfigDialog(sessionData) {
        const dialog = document.createElement('div');
        dialog.className = 'share-modal';

        const qualityOptions = this.isMobileDevice ? `
            <option value="low" selected>Low (480p)</option>
            <option value="medium">Medium (720p)</option>
        ` : `
            <option value="low">Low (480p)</option>
            <option value="medium" selected>Medium (720p)</option>
            <option value="high">High (1080p)</option>
        `;

        const durationOptions = this.isMobileDevice ? `
            <option value="30" selected>30 seconds</option>
            <option value="60">1 minute</option>
        ` : `
            <option value="30">30 seconds</option>
            <option value="60" selected>1 minute</option>
            <option value="180">3 minutes</option>
            <option value="300">5 minutes</option>
        `;

        const warningMessage = !this.capabilities.hasMediaRecorder ?
            `<div class="warning-message">
                Video export might not work on your device.
                Single image capture is recommended.
             </div>` : '';

        dialog.innerHTML = `
            <div class="modal-overlay">
                <div class="share-preview">
                    <button class="close-button">×</button>
                    <div class="share-config">
                        <h3>Video Export Settings</h3>
                        ${warningMessage}
                        <div class="config-options">
                            <label>
                                Maximum Duration
                                <select id="duration-limit">
                                    ${durationOptions}
                                </select>
                            </label>
                            <label>
                                Quality
                                <select id="quality">
                                    ${qualityOptions}
                                </select>
                            </label>
                            <label>
                                Speed
                                <select id="speed">
                                    <option value="1" selected>1×</option>
                                    <option value="2">2×</option>
                                    ${!this.isMobileDevice ? `
                                        <option value="5">5×</option>
                                        <option value="10">10×</option>
                                    ` : ''}
                                </select>
                            </label>
                        </div>
                        <div class="export-buttons">
                            <button id="start-export" class="primary-button">
                                Start Video Export
                            </button>
                            ${this.isMobileDevice ? `
                                <button id="capture-image" class="secondary-button">
                                    Capture Single Image
                                </button>
                            ` : ''}
                        </div>
                        <div class="progress-bar">
                            <div class="progress"></div>
                            <div class="status">Ready to start...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Event handling
        const startButton = dialog.querySelector('#start-export');
        startButton.addEventListener('click', () => {
            const config = {
                durationLimit: parseInt(dialog.querySelector('#duration-limit').value),
                quality: dialog.querySelector('#quality').value,
                speed: parseFloat(dialog.querySelector('#speed').value)
            };

            if (this.isMobileDevice && config.durationLimit > 60) {
                if (!confirm('Long video export might be slow on mobile devices. Continue?')) {
                    return;
                }
            }

            this.startRecording(sessionData, config, dialog);
        });

        const captureImageButton = dialog.querySelector('#capture-image');
        if (captureImageButton) {
            captureImageButton.addEventListener('click', () => {
                this.captureImage(sessionData, dialog);
            });
        }

        const closeButton = dialog.querySelector('.close-button');
        closeButton.addEventListener('click', () => dialog.remove());

        const overlay = dialog.querySelector('.modal-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dialog.remove();
        });

        document.body.appendChild(dialog);
    }

    async startRecording(sessionData, config, dialog) {
        const progress = dialog.querySelector('.progress');
        const status = dialog.querySelector('.status');
    
        try {
            const renderer = new SessionRenderer(sessionData, {
                pixelSize: this.PIXEL_SIZE,
                gridPixels: this.GRID_PIXELS
            });
    
            const FPS = 10;
            const requestedDuration = config.durationLimit;
            const totalFrames = requestedDuration * FPS;
    
            // Calculer le timeStep en fonction de la durée demandée
            const firstTimestamp = sessionData.events[0].timestamp;
            const lastTimestamp = sessionData.events[sessionData.events.length - 1].timestamp;
            const timeStep = (lastTimestamp - firstTimestamp) / (FPS * requestedDuration);
    
            console.log(`Generating ${totalFrames} frames, compressing ${(lastTimestamp - firstTimestamp)/1000}s into ${requestedDuration}s`);
    
            // Définir la taille selon la qualité choisie
            const size = config.quality === 'low' ? 480 : 
                        config.quality === 'medium' ? 720 : 1080;
    
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', {
                alpha: false,
                imageSmoothingEnabled: false
            });
    
            // Configurer le MediaRecorder
            const stream = canvas.captureStream(FPS);
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 2500000
            });
    
            const chunks = [];
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                console.log('Video blob created:', blob.size, 'bytes');
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `poietic-generator-${new Date().toISOString().slice(0,19)}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                dialog.remove();
            };
    
            mediaRecorder.start();
    
            // Générer les frames
            let frame = 0;
            const renderNextFrame = () => {
                if (frame >= totalFrames) {
                    mediaRecorder.stop();
                    return;
                }
    
                const currentTime = firstTimestamp + (frame * timeStep);
                const eventIndex = sessionData.events.findIndex(e => e.timestamp > currentTime);
                
                const isSessionEnded = renderer.processEvents(eventIndex);
                renderer.renderToCanvas(ctx, size);
    
                const percent = (frame / totalFrames) * 100;
                progress.style.width = `${percent}%`;
                status.textContent = `Generating video: ${Math.floor(percent)}%`;
    
                frame++;
                
                if (isSessionEnded) {
                    console.log('Session ended, stopping video generation');
                    mediaRecorder.stop();
                    return;
                }

                setTimeout(renderNextFrame, 1000/FPS);
            };
    
            renderNextFrame();
    
        } catch (error) {
            console.error('Error during recording:', error);
            status.textContent = 'Error during recording';
        }
    }

    async createVideo(frames, config, dialog) {
        const status = dialog.querySelector('.status');
        const progress = dialog.querySelector('.progress');

        try {
            status.textContent = 'Creating video...';
            progress.style.width = '0%';

            // Définir la taille selon la qualité choisie
            let size;
            switch(config.quality) {
                case 'low': size = 480; break;
                case 'medium': size = 720; break;
                case 'high': size = 1080; break;
                default: size = 720;
            }

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;  // Format carré

            const ctx = canvas.getContext('2d', {
                alpha: false,
                imageSmoothingEnabled: false
            });

            // Tester les formats supportés
            const mimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4'
            ];

            let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
            console.log('Using MIME type:', selectedMimeType);

            if (!selectedMimeType) {
                throw new Error('No supported video format found');
            }

            const stream = canvas.captureStream(30);
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType,
                videoBitsPerSecond: 5000000  // Augmenter le bitrate
            });

            const chunks = [];
            mediaRecorder.ondataavailable = e => chunks.push(e.data);

            mediaRecorder.onstop = () => {
                const now = new Date();
                // Utiliser l'extension appropriée selon le format
                const extension = selectedMimeType.includes('mp4') ? 'mp4' : 'webm';
                const filename = `poietic-generator-${now.toISOString().slice(0,19).replace(/[-:]/g, '')}.${extension}`;

                const blob = new Blob(chunks, { type: selectedMimeType });
                console.log('Video blob created:', blob.size, 'bytes');

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);

                dialog.remove();
            };

            mediaRecorder.start();

            let frameIndex = 0;
            const totalFrames = frames.length;

            const playFrames = () => {
                if (frameIndex >= totalFrames) {
                    mediaRecorder.stop();
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    // Effacer le canvas
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, size, size);

                    // Dessiner l'image en préservant les proportions
                    ctx.drawImage(img, 0, 0, size, size);

                    const percent = (frameIndex / totalFrames) * 100;
                    progress.style.width = `${percent}%`;
                    status.textContent = `Creating video: ${Math.floor(percent)}%`;

                    frameIndex++;
                    setTimeout(playFrames, 1000 / 30);
                };
                img.src = frames[frameIndex];
            };

            playFrames();

        } catch (error) {
            console.error('Error creating video:', error);
            status.textContent = 'Error creating video';
        }
    }

    async captureImage(sessionData, dialog) {
        const status = dialog.querySelector('.status');
        status.textContent = 'Capturing image...';

        try {
            const renderer = new SessionRenderer(sessionData, {
                pixelSize: this.PIXEL_SIZE,
                gridPixels: this.GRID_PIXELS,
                includeText: true  // Pour l'image fixe, inclure le texte
            });

            // Traiter tous les événements
            renderer.processEventsUntil(sessionData.events.length - 1);

            // Capturer l'image finale
            const canvas = renderer.captureFrame();

            const now = new Date();
            const filename = `poietic-generator-${now.toISOString().slice(0,19).replace(/[-:]/g, '')}.png`;

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas;
            link.click();

            dialog.remove();
        } catch (error) {
            console.error('Error during capture:', error);
            status.textContent = 'Error while capturing image';
        }
    }
    async handleVideoExport(sessionData, config, dialog) {
        const status = dialog.querySelector('.status');
        const progress = dialog.querySelector('.progress');

        try {
            const renderer = new SessionRenderer(sessionData, {
                pixelSize: this.PIXEL_SIZE,
                gridPixels: this.GRID_PIXELS
            });

            const FPS = 10;
            const requestedDuration = config.durationLimit;
            const totalFrames = requestedDuration * FPS;

            console.log('Session data prepared:', sessionData);
            console.log('Number of users:', sessionData.users.length);
            console.log('Users positions:', sessionData.users);
            console.log('Initial states captured:', sessionData.users);

            // Définir la taille selon la qualité choisie
            const size = config.quality === 'low' ? 480 : 
                        config.quality === 'medium' ? 720 : 1080;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', {
                alpha: false,
                imageSmoothingEnabled: false
            });

            // Configurer le MediaRecorder
            const stream = canvas.captureStream(FPS);
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp8',
                videoBitsPerSecond: 2500000
            });

            const chunks = [];
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                console.log('Video blob created:', blob.size, 'bytes');
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `poietic-generator-${new Date().toISOString().slice(0,19)}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                dialog.remove();
            };

            mediaRecorder.start();

            // Générer les frames
            let frame = 0;
            const renderNextFrame = () => {
                if (frame >= totalFrames) {
                    mediaRecorder.stop();
                    return;
                }

                const currentTime = firstTimestamp + (frame * timeStep);
                const eventIndex = sessionData.events.findIndex(e => e.timestamp > currentTime);
                
                const isSessionEnded = renderer.processEvents(eventIndex);
                renderer.renderToCanvas(ctx, size);

                const percent = (frame / totalFrames) * 100;
                progress.style.width = `${percent}%`;
                status.textContent = `Generating video: ${Math.floor(percent)}%`;

                frame++;
                
                if (isSessionEnded) {
                    console.log('Session ended, stopping video generation');
                    mediaRecorder.stop();
                    return;
                }

                setTimeout(renderNextFrame, 1000/FPS);
            };

            renderNextFrame();

        } catch (error) {
            console.error('Error during recording:', error);
            status.textContent = 'Error during recording';
        }
    }
}

class ShareDialog {
    constructor(sessionData) {
        this.sessionData = sessionData;
        this.dialog = this.createDialog();
        document.body.appendChild(this.dialog);
    }

    createDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'share-dialog';
        
        dialog.innerHTML = `
            <div class="dialog-content">
                <h2>Exporter la session</h2>
                
                <div class="export-options">
                    <div class="option-group">
                        <label>Format</label>
                        <select name="format">
                            <option value="video">Vidéo</option>
                            <option value="image">Image</option>
                        </select>
                    </div>

                    <div class="video-options">
                        <div class="option-group">
                            <label>Qualité</label>
                            <select name="quality">
                                <option value="low">Basse (480p)</option>
                                <option value="medium" selected>Moyenne (720p)</option>
                                <option value="high">Haute (1080p)</option>
                            </select>
                        </div>

                        <div class="option-group">
                            <label>Mode de rendu</label>
                            <select name="renderMode">
                                <option value="realtime">Temps réel</option>
                                <option value="eventtime">Temps événementiel</option>
                            </select>
                        </div>

                        <div class="option-group realtime-options">
                            <label>Durée maximale</label>
                            <select name="duration">
                                <option value="30">30 secondes</option>
                                <option value="60" selected>1 minute</option>
                                <option value="120">2 minutes</option>
                                <option value="300">5 minutes</option>
                            </select>
                        </div>
                    </div>

                    <div class="progress-container">
                        <div class="progress"></div>
                    </div>
                    <div class="status"></div>

                    <div class="buttons">
                        <button class="export-button">Exporter</button>
                        <button class="cancel-button">Annuler</button>
                    </div>
                </div>
            </div>
        `;

        // Gérer les changements de mode
        const renderModeSelect = dialog.querySelector('select[name="renderMode"]');
        const realtimeOptions = dialog.querySelector('.realtime-options');
        
        renderModeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'realtime') {
                realtimeOptions.style.display = 'block';
            } else {
                realtimeOptions.style.display = 'none';
            }
        });

        // Gérer le bouton d'export
        const exportButton = dialog.querySelector('.export-button');
        exportButton.addEventListener('click', () => {
            const format = dialog.querySelector('select[name="format"]').value;
            const quality = dialog.querySelector('select[name="quality"]').value;
            const renderMode = dialog.querySelector('select[name="renderMode"]').value;
            const duration = parseInt(dialog.querySelector('select[name="duration"]').value);

            const config = {
                format,
                quality,
                renderMode,
                durationLimit: duration
            };

            if (format === 'video') {
                new SessionRenderer().handleVideoExport(this.sessionData, config, dialog);
            } else {
                new SessionRenderer().captureImage(this.sessionData, dialog);
            }
        });

        // Gérer le bouton d'annulation
        const cancelButton = dialog.querySelector('.cancel-button');
        cancelButton.addEventListener('click', () => {
            dialog.remove();
        });

        return dialog;
    }
}