class LayoutManager {
    constructor() {
        this.setupEventListeners();
        this.updateLayout();
        
        // Création d'un event emitter personnalisé
        this.gridSizeChanged = new Event('gridSizeChanged');
    }

    setupEventListeners() {
        // Écouter les changements de taille de fenêtre
        window.addEventListener('resize', () => this.updateLayout());
        // Écouter le chargement complet de la page
        window.addEventListener('load', () => this.updateLayout());
    }

    updateLayout() {
        const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        const poieticGrid = document.getElementById('poietic-grid');
        const drawingArea = document.getElementById('drawing-area');

        if (!poieticGrid || !drawingArea) return;

        if (orientation === 'landscape') {
            // Mode paysage
            const gridSize = Math.min(drawingArea.offsetWidth * 0.6666, drawingArea.offsetHeight);
            poieticGrid.style.width = `${gridSize}px`;
            poieticGrid.style.height = `${gridSize}px`;
        } else {
            // Mode portrait
            const gridSize = Math.min(drawingArea.offsetWidth, drawingArea.offsetHeight * 0.6666);
            poieticGrid.style.width = `${gridSize}px`;
            poieticGrid.style.height = `${gridSize}px`;
        }

        // Notifier les changements de taille de la grille
        poieticGrid.dispatchEvent(this.gridSizeChanged);
    }
}

// Initialisation du gestionnaire de layout
document.addEventListener('DOMContentLoaded', () => {
    window.layoutManager = new LayoutManager();
});
