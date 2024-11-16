window.PoieticBots.RandomSelfBot = class {
    constructor(parent) {
        this.parent = parent;
        this.updateRate = 10;
        this.behaviorInterval = 2;
        this.BEHAVIOR_UPDATE_INTERVAL = this.behaviorInterval * 60 * 1000;
        
        // État actuel
        this.currentColor = this.getRandomColor();
        this.currentBehavior = this.getRandomBehavior();
        this.lastCell = this.getRandomInitialCell();
        
        // Intervalles
        this.updateInterval = null;
        this.behaviorUpdateInterval = null;

        this.initializeControls();
        this.updateInterface();
        this.startIntervals();
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.behaviorUpdateInterval) {
            clearInterval(this.behaviorUpdateInterval);
            this.behaviorUpdateInterval = null;
        }
        
        this.updateInterface();
    }

    getRandomBehavior() {
        const behaviors = ['adjacent', 'diagonal', 'random'];
        return behaviors[Math.floor(Math.random() * behaviors.length)];
    }

    getRandomInitialCell() {
        return {
            x: Math.floor(Math.random() * 20),
            y: Math.floor(Math.random() * 20)
        };
    }

    getNextCell() {
        let possibleCells = [];
        const { x, y } = this.lastCell;

        switch (this.currentBehavior) {
            case 'adjacent':
                // Cellules horizontales et verticales uniquement
                possibleCells = [
                    {x: x-1, y: y}, {x: x+1, y: y},
                    {x: x, y: y-1}, {x: x, y: y+1}
                ];
                break;

            case 'diagonal':
                // Cellules diagonales uniquement
                possibleCells = [
                    {x: x-1, y: y-1}, {x: x-1, y: y+1},
                    {x: x+1, y: y-1}, {x: x+1, y: y+1}
                ];
                break;

            case 'random':
                // Direction aléatoire depuis la dernière cellule
                const angle = Math.random() * 2 * Math.PI;
                const distance = 1;
                return {
                    x: Math.floor(x + Math.cos(angle) * distance),
                    y: Math.floor(y + Math.sin(angle) * distance)
                };
        }

        // Pour adjacent et diagonal, filtrer les cellules valides et en choisir une
        possibleCells = possibleCells.filter(cell => 
            cell.x >= 0 && cell.x < 20 && cell.y >= 0 && cell.y < 20
        );

        return possibleCells.length > 0 
            ? possibleCells[Math.floor(Math.random() * possibleCells.length)]
            : this.getRandomInitialCell(); // Si aucune cellule valide, nouvelle position aléatoire
    }

    getRandomColor() {
        return `rgb(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0})`;
    }

    getComplementaryColor(color) {
        const rgb = color.match(/\d+/g).map(Number);
        return `rgb(${255-rgb[0]},${255-rgb[1]},${255-rgb[2]})`;
    }

    getSimilarColor(color) {
        const rgb = color.match(/\d+/g).map(Number);
        const variation = 0.1; // 10%
        return `rgb(${
            Math.max(0, Math.min(255, rgb[0] + (Math.random() * 2 - 1) * 255 * variation))|0
        },${
            Math.max(0, Math.min(255, rgb[1] + (Math.random() * 2 - 1) * 255 * variation))|0
        },${
            Math.max(0, Math.min(255, rgb[2] + (Math.random() * 2 - 1) * 255 * variation))|0
        })`;
    }

    chooseNextColor() {
        const colorChoices = [
            () => this.getSimilarColor(this.currentColor),
            () => this.getComplementaryColor(this.currentColor),
            () => this.getRandomColor()
        ];
        return colorChoices[Math.floor(Math.random() * colorChoices.length)]();
    }

    updateBehaviorAndColor() {
        this.currentBehavior = this.getRandomBehavior();
        this.currentColor = this.chooseNextColor();
        this.updateInterface();
    }

    startIntervals() {
        // Intervalle pour le changement de comportement et de couleur
        this.behaviorUpdateInterval = setInterval(() => {
            this.updateBehaviorAndColor();
        }, this.BEHAVIOR_UPDATE_INTERVAL);

        // Intervalle pour le dessin
        this.startDrawing();
    }

    startDrawing() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        if (this.updateRate === 0) {
            this.updateInterval = null;
            return;
        }

        const baseInterval = 1000;
        const pixelsPerMinute = (400 * this.updateRate) / 100;
        const pixelsPerSecond = pixelsPerMinute / 60;
        const newInterval = Math.max(baseInterval / pixelsPerSecond, 50);

        this.updateInterval = setInterval(() => {
            const nextCell = this.getNextCell();
            this.lastCell = nextCell;
            
            this.parent.updateCell(nextCell.x, nextCell.y, this.currentColor);
            if (this.parent.socket && this.parent.socket.readyState === WebSocket.OPEN) {
                this.parent.socket.send(JSON.stringify({
                    type: 'cell_update',
                    sub_x: nextCell.x,
                    sub_y: nextCell.y,
                    color: this.currentColor
                }));
            }
        }, newInterval);
    }

    initializeControls() {
        const panel = document.querySelector('#random-self-panel');
        
        panel.querySelector('#rate-plus').onclick = () => {
            if (this.updateRate < 100) {
                this.updateRate = Math.min(100, this.updateRate + 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        };

        panel.querySelector('#rate-minus').onclick = () => {
            if (this.updateRate > 0) {
                this.updateRate = Math.max(0, this.updateRate - 5);
                panel.querySelector('#update-rate').textContent = this.updateRate;
                this.startDrawing();
            }
        };

        panel.querySelector('#interval-plus').onclick = () => {
            if (this.behaviorInterval < 10) {
                this.behaviorInterval++;
                panel.querySelector('#behavior-interval').textContent = this.behaviorInterval;
                this.BEHAVIOR_UPDATE_INTERVAL = this.behaviorInterval * 60 * 1000;
            }
        };

        panel.querySelector('#interval-minus').onclick = () => {
            if (this.behaviorInterval > 1) {
                this.behaviorInterval--;
                panel.querySelector('#behavior-interval').textContent = this.behaviorInterval;
                this.BEHAVIOR_UPDATE_INTERVAL = this.behaviorInterval * 60 * 1000;
            }
        };
    }

    updateInterface() {
        const panel = document.querySelector('#random-self-panel');
        panel.querySelector('#current-behavior').textContent = this.currentBehavior;
        panel.querySelector('#update-rate').textContent = this.updateRate;
        panel.querySelector('#behavior-interval').textContent = this.behaviorInterval;
        
        const colorPreview = panel.querySelector('#current-color');
        if (colorPreview) {
            colorPreview.style.backgroundColor = this.currentColor;
        }
    }
} 