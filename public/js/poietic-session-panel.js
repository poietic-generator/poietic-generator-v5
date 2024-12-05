class PoieticSessionPanel {
    constructor(container) {
        this.container = container;
        this.setupDisplay();
    }

    setupDisplay() {
        this.statsContainer = document.createElement('div');
        this.statsContainer.style.padding = '10px';
        this.container.appendChild(this.statsContainer);
    }

    updateStats(message) {
        if (!message.grid_state) return;

        const gridState = JSON.parse(message.grid_state);
        const activeUsers = Object.keys(gridState.user_positions).length;
        
        let totalPixels = 0;
        const uniqueColors = new Set();

        if (message.sub_cell_states) {
            Object.values(message.sub_cell_states).forEach(subCells => {
                Object.values(subCells).forEach(color => {
                    uniqueColors.add(color);
                    totalPixels++;
                });
            });
        }

        this.statsContainer.innerHTML = `
            <div style="margin-bottom: 10px;">
                <h4>Utilisateurs actifs</h4>
                <p>${activeUsers}</p>
            </div>
            <div style="margin-bottom: 10px;">
                <h4>Pixels colorés</h4>
                <p>${totalPixels}</p>
            </div>
            <div style="margin-bottom: 10px;">
                <h4>Couleurs uniques</h4>
                <p>${uniqueColors.size}</p>
            </div>
        `;
    }
} 