import { ColorGenerator } from './poietic-color-generator.js';

class PoieticChromaticPanel {
    constructor(container) {
        console.log('ChromaticPanel: Constructor called');
        this.container = container;
        this.setupCanvas();
        this.initializeState();
    }

    setupCanvas() {
        console.log('ChromaticPanel: Setting up canvas');
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.backgroundColor = '#333';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.updateColorProfile();
    }

    initializeState() {
        this.activeColors = new Map();
        this.userColors = new Map();
        console.log('ChromaticPanel: State initialized');
    }

    handleMessage(message) {
        console.log('ChromaticPanel: Message received:', message);
        switch (message.type) {
            case 'initial_state':
                this.handleInitialState(message);
                break;
            case 'cell_update':
                this.handleCellUpdate(message);
                break;
            case 'user_left':
                this.handleUserLeft(message);
                break;
        }
    }

    handleInitialState(state) {
        this.initializeState();
        
        if (state.grid_state) {
            const gridState = typeof state.grid_state === 'string' ? 
                JSON.parse(state.grid_state) : state.grid_state;
            
            Object.keys(gridState.user_positions).forEach(userId => {
                this.userColors.set(userId, ColorGenerator.generateInitialColors(userId));
                this.activeColors.set(userId, new Map());
            });
        }

        if (state.sub_cell_states) {
            Object.entries(state.sub_cell_states).forEach(([userId, subCells]) => {
                Object.entries(subCells).forEach(([coords, color]) => {
                    if (!this.activeColors.has(userId)) {
                        this.activeColors.set(userId, new Map());
                    }
                    this.activeColors.get(userId).set(coords, color);
                });
            });
        }

        this.updateColorProfile();
    }

    handleCellUpdate(message) {
        const { user_id: userId, sub_x, sub_y, color } = message;
        
        if (!this.activeColors.has(userId)) {
            this.activeColors.set(userId, new Map());
            this.userColors.set(userId, ColorGenerator.generateInitialColors(userId));
        }

        const coords = `${sub_x},${sub_y}`;
        this.activeColors.get(userId).set(coords, color);
        this.updateColorProfile();
    }

    handleUserLeft(message) {
        const userId = message.user_id;
        this.activeColors.delete(userId);
        this.userColors.delete(userId);
        this.updateColorProfile();
    }

    updateColorProfile() {
        const colorCounts = new Map();

        this.activeColors.forEach(subCells => {
            subCells.forEach(color => {
                colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
            });
        });

        this.drawColorProfile(colorCounts);
    }

    drawColorProfile(colorCounts) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        const totalColors = Array.from(colorCounts.values()).reduce((a, b) => a + b, 0);
        if (totalColors === 0) return;

        let x = 0;
        colorCounts.forEach((count, color) => {
            const barWidth = Math.max(1, Math.floor(width * (count / totalColors)));
            ctx.fillStyle = color;
            ctx.fillRect(x, 0, barWidth, height);
            x += barWidth;
        });

        console.log('ChromaticPanel: Color profile drawn');
    }
} 