class PoieticChromaticPanel {
    constructor(container) {
        this.container = container;
        this.setupCanvas();
        this.initWebSocket();
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        // Ajuster la taille du canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
    }

    initWebSocket() {
        this.socket = new WebSocket('ws://localhost:3001/updates?mode=monitoring');
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.updateChromaticProfile(message);
        };
    }

    updateChromaticProfile(message) {
        if (!message.sub_cell_states) return;

        const colorCounts = {};
        Object.values(message.sub_cell_states).forEach(subCells => {
            Object.values(subCells).forEach(color => {
                colorCounts[color] = (colorCounts[color] || 0) + 1;
            });
        });

        this.drawColorProfile(colorCounts);
    }

    drawColorProfile(colorCounts) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        const totalColors = Object.values(colorCounts).reduce((a, b) => a + b, 0);
        let x = 0;

        Object.entries(colorCounts).forEach(([color, count]) => {
            const barWidth = Math.max(1, Math.floor(width * (count / totalColors)));
            ctx.fillStyle = color;
            ctx.fillRect(x, 0, barWidth, height);
            x += barWidth;
        });
    }
} 