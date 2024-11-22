export class ShareManager {
    constructor(client) {
        this.client = client;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupShareButton());
        } else {
            this.setupShareButton();
        }
    }

    setupShareButton() {
        const shareButton = document.querySelector('#zone-2c2');
        if (shareButton) {
            console.log('Share button found, adding listener');
            shareButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Share button clicked');
                this.handleShare();
            });
        } else {
            console.error('Share button not found (#zone-2c2)');
        }
    }

    async handleShare() {
        console.log('Handling share action');
        if (!this.client.isConnected) {
            console.log('Client not connected, cannot share');
            return;
        }

        try {
            const canvas = await this.captureGridState();
            this.showShareDialog(canvas);
        } catch (error) {
            console.error('Error during share:', error);
        }
    }

    async captureGridState() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calcul de la taille de la grille basé sur le nombre d'utilisateurs
        const userCount = this.client.cells.size;
        const gridSideSize = Math.ceil(Math.sqrt(userCount));
        // S'assurer que la grille est impaire pour le placement en spirale
        const CELLS_PER_SIDE = gridSideSize % 2 === 0 ? gridSideSize + 1 : gridSideSize;
        
        const PIXEL_SIZE = 6;
        const GRID_PIXELS = 20;
        
        // Calculer la taille totale du canvas
        const gridSize = CELLS_PER_SIDE * GRID_PIXELS * PIXEL_SIZE;
        const textAreaHeight = 50;
        canvas.width = gridSize;
        canvas.height = gridSize + textAreaHeight;

        // Fond noir
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dessiner chaque cellule utilisateur
        this.client.cells.forEach((cell, userId) => {
            const pos = this.client.userPositions.get(userId);
            if (!pos) return;

            // Ajuster la position pour centrer dans la nouvelle grille
            const baseX = (pos.x + Math.floor(CELLS_PER_SIDE/2)) * GRID_PIXELS * PIXEL_SIZE;
            const baseY = (pos.y + Math.floor(CELLS_PER_SIDE/2)) * GRID_PIXELS * PIXEL_SIZE;

            // Dessiner les sous-cellules
            Array.from(cell.children).forEach((subCell, index) => {
                const subX = index % GRID_PIXELS;
                const subY = Math.floor(index / GRID_PIXELS);
                ctx.fillStyle = subCell.style.backgroundColor;
                ctx.fillRect(
                    baseX + (subX * PIXEL_SIZE),
                    baseY + (subY * PIXEL_SIZE),
                    PIXEL_SIZE,
                    PIXEL_SIZE
                );
            });
        });

        // Texte
        ctx.font = '14px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        const centerX = canvas.width / 2;
        
        ctx.fillText('Poietic Generator - good net art since 1986', centerX, gridSize + 25);
        ctx.font = '12px Arial';
        ctx.fillText(new Date().toLocaleString(), centerX, gridSize + 45);

        return canvas;
    }

    showShareDialog(canvas) {
        const dialog = document.createElement('div');
        dialog.className = 'share-modal';
        
        dialog.innerHTML = `
            <div class="share-preview">
                <button class="close-button">×</button>
                <img src="${canvas.toDataURL('image/png', 1.0)}" alt="Preview">
                <div class="share-options">
                    <button class="share-option" data-type="download">download</button>
                    <button class="share-option" data-type="email">email</button>
                    <button class="share-option" data-type="mastodon">mastodon</button>
                </div>
            </div>
        `;

        const close = () => dialog.remove();

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog || e.target.classList.contains('close-button')) {
                close();
                return;
            }

            if (e.target.classList.contains('share-option')) {
                this.handleShareOption(e.target.dataset.type, canvas);
            }
        });

        document.body.appendChild(dialog);
    }

    handleShareOption(type, canvas) {
        switch(type) {
            case 'download':
                this.downloadImage(canvas);
                break;
            case 'email':
                this.shareByEmail(canvas);
                break;
            case 'mastodon':
                this.shareToMastodon(canvas);
                break;
        }
    }

    downloadImage(canvas) {
        const link = document.createElement('a');
        link.download = `poietic-${new Date().toISOString()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }

    shareByEmail(canvas) {
        const subject = encodeURIComponent('Poietic Generator');
        const body = encodeURIComponent(`
            Poietic Generator
            good net art since 1986
            ${window.location.href}
        `);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    shareToMastodon(canvas) {
        const instance = prompt('Entrez l\'URL de votre instance Mastodon:');
        if (!instance) return;
        
        const text = `Poietic Generator\ngood net art since 1986\n${window.location.href}`;
        window.open(`${instance}/share?text=${encodeURIComponent(text)}`);
    }
} 