window.PoieticBots.SymmetryBot = class {
    constructor(parent) {
        console.log('SymmetryBot: Constructor started');
        this.parent = parent;
        this.updateRate = 10;
        this.userInterval = 2;
        this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
        this.symmetrySource = null;
        this.symmetryType = 'translation';
        this.symmetryTypes = ['translation', 'Y mirror', 'X mirror'];
        this.initialized = false;
        
        this.updateInterval = null;
        this.sourceUpdateInterval = null;

        this.initializeControls();
        this.updateInterface();
        
        setTimeout(() => {
            this.initialized = true;
            this.startIntervals();
        }, 0);
        
        console.log('SymmetryBot: Constructor completed');
    }

    initialize() {
        console.log('SymmetryBot: Initializing...');
        console.log('Parent positions:', this.parent.userPositions);
        console.log('My ID:', this.parent.myUserId);
        
        if (this.chooseSymmetrySource()) {
            console.log('SymmetryBot: Source selected, starting intervals');
            this.startIntervals();
            this.updateInterface();
            this.initialized = true;
        } else {
            console.log('SymmetryBot: No source available, retrying in 1s');
            setTimeout(() => this.initialize(), 1000);
        }
    }

    handleMessage(message) {
        if (!this.initialized || !this.symmetrySource) {
            console.log('SymmetryBot: Not ready', {
                initialized: this.initialized,
                source: this.symmetrySource
            });
            return;
        }

        if (message.type === 'cell_update') {
            if (!this.symmetrySource || !this.parent.userPositions.has(this.symmetrySource)) {
                console.log('SymmetryBot: Invalid source, choosing new one');
                this.chooseSymmetrySource();
                return;
            }
            
            if (message.user_id === this.symmetrySource) {
                try {
                    const sourcePos = this.parent.userPositions.get(this.symmetrySource);
                    const myPos = this.parent.userPosition;
                    
                    console.log('SymmetryBot: Processing cell update', {
                        sourcePos,
                        myPos,
                        message,
                        type: this.symmetryType
                    });

                    if (!sourcePos || !myPos || 
                        typeof sourcePos.x !== 'number' || 
                        typeof sourcePos.y !== 'number' || 
                        typeof myPos.x !== 'number' || 
                        typeof myPos.y !== 'number') {
                        console.log('SymmetryBot: Invalid positions', {
                            sourcePos,
                            myPos
                        });
                        return;
                    }

                    let targetX = message.sub_x;
                    let targetY = message.sub_y;

                    const result = this.applySymmetry(targetX, targetY);
                    targetX = result.x;
                    targetY = result.y;

                    console.log('SymmetryBot: Drawing at', {
                        original: {x: message.sub_x, y: message.sub_y},
                        target: {x: targetX, y: targetY},
                        color: message.color
                    });

                    this.parent.updateCell(targetX, targetY, message.color);
                    
                    const updateMessage = {
                        type: 'cell_update',
                        sub_x: targetX,
                        sub_y: targetY,
                        color: message.color
                    };

                    if (this.parent.socket?.readyState === WebSocket.OPEN) {
                        this.parent.socket.send(JSON.stringify(updateMessage));
                    }

                } catch (error) {
                    console.error('SymmetryBot: Error in handleMessage', error);
                }
            }
        }
    }

    startIntervals() {
        if (this.sourceUpdateInterval) {
            clearInterval(this.sourceUpdateInterval);
        }

        this.sourceUpdateInterval = setInterval(() => {
            console.log('SymmetryBot: Periodic update starting');
            const availableUsers = Array.from(this.parent.userPositions.keys())
                .filter(id => id !== this.parent.myUserId);
            
            if (availableUsers.length > 0) {
                const oldSource = this.symmetrySource;
                const oldType = this.symmetryType;

                this.symmetrySource = availableUsers[
                    Math.floor(Math.random() * availableUsers.length)
                ];
                
                this.symmetryType = this.symmetryTypes[
                    Math.floor(Math.random() * this.symmetryTypes.length)
                ];
                
                console.log('SymmetryBot: Source/Type changed:', {
                    oldSource,
                    newSource: this.symmetrySource,
                    oldType,
                    newType: this.symmetryType
                });
                
                this.updateInterface();
            }
        }, this.USER_UPDATE_INTERVAL);
    }

    cleanup() {
        if (this.sourceUpdateInterval) {
            clearInterval(this.sourceUpdateInterval);
            this.sourceUpdateInterval = null;
        }

        this.symmetrySource = null;
        this.updateInterface();
    }

    onNewUser(message) {
        if (message.user_id === this.parent.myUserId) return;
    
        if (!this.symmetrySource) {
            this.symmetrySource = message.user_id;
            this.symmetryType = this.symmetryTypes[
                Math.floor(Math.random() * this.symmetryTypes.length)
            ];
            this.initialized = true;
        }
        this.updateInterface();
    }
    
    onUserLeft(message) {
        if (message.user_id === this.symmetrySource) {
            const availableUsers = Array.from(this.parent.userPositions.keys())
                .filter(id => id !== this.parent.myUserId);
    
            if (availableUsers.length > 0) {
                this.symmetrySource = availableUsers[
                    Math.floor(Math.random() * availableUsers.length)
                ];
                this.symmetryType = this.symmetryTypes[
                    Math.floor(Math.random() * this.symmetryTypes.length)
                ];
            } else {
                this.symmetrySource = null;
                this.initialized = false;
            }
            this.updateInterface();
        }
    }
    
    onUserUpdate(message) {
        if (!this.symmetrySource) {
            const availableUsers = Array.from(this.parent.userPositions.keys())
                .filter(id => id !== this.parent.myUserId);
    
            if (availableUsers.length > 0) {
                this.symmetrySource = availableUsers[
                    Math.floor(Math.random() * availableUsers.length)
                ];
                this.symmetryType = this.symmetryTypes[
                    Math.floor(Math.random() * this.symmetryTypes.length)
                ];
                this.initialized = true;
            }
        }
    
        if (this.symmetrySource && !this.parent.userPositions.has(this.symmetrySource)) {
            this.onUserLeft({ user_id: this.symmetrySource });
        }
    
        this.updateInterface();
    }

    initializeControls() {
        const panel = document.querySelector('#symmetry-panel');
        
        panel.querySelector('#rate-plus').onclick = () => {
            if (this.updateRate < 100) {
                this.updateRate = Math.min(100, this.updateRate + 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
            }
        };

        panel.querySelector('#rate-minus').onclick = () => {
            if (this.updateRate > 0) {
                this.updateRate = Math.max(0, this.updateRate - 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
            }
        };

        panel.querySelector('#interval-plus').onclick = () => {
            if (this.userInterval < 10) {
                this.userInterval++;
                panel.querySelector('#color-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        };

        panel.querySelector('#interval-minus').onclick = () => {
            if (this.userInterval > 1) {
                this.userInterval--;
                panel.querySelector('#color-interval').textContent = this.userInterval;
                this.USER_UPDATE_INTERVAL = this.userInterval * 60 * 1000;
            }
        };
    }

    updateInterface() {
        const panel = document.querySelector('#symmetry-panel');
        if (!panel) return;

        // Position de l'utilisateur
        panel.querySelector('#user-position').textContent = this.parent.userPosition ? 
            `(${this.parent.userPosition.x}, ${this.parent.userPosition.y})` : '-';
            
        // Source de symétrie
        const sourceElement = panel.querySelector('#color-source');
        if (this.symmetrySource && this.parent.userPositions.has(this.symmetrySource)) {
            const sourcePos = this.parent.userPositions.get(this.symmetrySource);
            sourceElement.textContent = `User at (${sourcePos.x}, ${sourcePos.y})`;
            // Ajouter l'ID pour le débogage
            sourceElement.title = `ID: ${this.symmetrySource}`;
        } else {
            sourceElement.textContent = 'None (stopped)';
            sourceElement.title = '';
        }

        // Type de symétrie
        const typeElement = panel.querySelector('#symmetry-type');
        if (typeElement) {
            typeElement.textContent = this.symmetryType;
        }

        console.log('SymmetryBot: Interface updated', {
            source: this.symmetrySource,
            sourcePos: this.symmetrySource ? this.parent.userPositions.get(this.symmetrySource) : null,
            type: this.symmetryType
        });
    }

    chooseSymmetrySource() {
        console.log('SymmetryBot: Choosing source');
        const availableUsers = Array.from(this.parent.userPositions.keys())
            .filter(id => id !== this.parent.myUserId);
        
        console.log('Available users:', availableUsers);
        
        if (availableUsers.length > 0) {
            this.symmetrySource = availableUsers[
                Math.floor(Math.random() * availableUsers.length)
            ];
            this.symmetryType = this.symmetryTypes[
                Math.floor(Math.random() * this.symmetryTypes.length)
            ];
            console.log('SymmetryBot: Selected source:', this.symmetrySource);
            console.log('SymmetryBot: Selected type:', this.symmetryType);
            return true;
        }
        return false;
    }

    onInitialState(message) {
        console.log('SymmetryBot: Received initial state:', message);
        // Attendre que le parent ait traité l'état initial
        setTimeout(() => {
            console.log('SymmetryBot: Parent positions:', this.parent.userPositions);
            console.log('SymmetryBot: My ID:', this.parent.myUserId);
            
            if (this.chooseSymmetrySource()) {
                console.log('SymmetryBot: Source selected, starting intervals');
                this.startIntervals();
                this.updateInterface();
            } else {
                console.log('SymmetryBot: No source available');
            }
        }, 100);
    }

    applySymmetry(sourceX, sourceY) {
        sourceX = Math.max(0, Math.min(19, Math.floor(sourceX)));
        sourceY = Math.max(0, Math.min(19, Math.floor(sourceY)));

        switch(this.symmetryType) {
            case 'translation':
                return { x: sourceX, y: sourceY };
            case 'Y mirror':
                return { x: 19 - sourceX, y: sourceY };
            case 'X mirror':
                return { x: sourceX, y: 19 - sourceY };
            default:
                return { x: sourceX, y: sourceY };
        }
    }
}
