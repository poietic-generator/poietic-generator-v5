export class ImageImporter {
    constructor(client) {
        this.client = client;
        this.fileInput = this.createFileInput();
        this.setupImportButton();
    }

    // Création de l'input file invisible
    createFileInput() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        
        // Gestion de la sélection de fichier
        input.addEventListener('change', (e) => this.handleFileSelect(e));
        return input;
    }

    // Configuration du bouton d'import
    setupImportButton() {
        const importButton = document.querySelector('#zone-2a2');
        importButton.addEventListener('click', () => {
            if (!this.client.isDisconnected) {
                this.fileInput.click();
            }
        });
    }

    // Gestion de la sélection de fichier
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const imageUrl = URL.createObjectURL(file);
            await this.processImage(imageUrl);
        } catch (error) {
            console.error('Erreur lors du traitement de l\'image:', error);
        } finally {
            // Réinitialiser l'input pour permettre la sélection du même fichier
            this.fileInput.value = '';
        }
    }

    // Traitement de l'image
    processImage(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                try {
                    const pixels = this.resizeAndCropImage(img);
                    this.applyToGrid(pixels);
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    URL.revokeObjectURL(imageUrl);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(imageUrl);
                reject(new Error('Erreur de chargement de l\'image'));
            };

            img.src = imageUrl;
        });
    }

    // Redimensionnement et recadrage de l'image
    resizeAndCropImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Déterminer la zone de crop
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2;
        const y = (img.height - size) / 2;
        
        // Configurer le canvas pour la sortie 20x20
        canvas.width = 20;
        canvas.height = 20;
        
        // Dessiner l'image croppée et redimensionnée
        ctx.drawImage(img, x, y, size, size, 0, 0, 20, 20);
        
        // Récupérer les données des pixels
        return ctx.getImageData(0, 0, 20, 20);
    }

    // Trouver la couleur la plus proche dans la palette
    findClosestColor(r, g, b) {
        let minDistance = Infinity;
        let closestColor = 0;

        // Parcourir la palette de couleurs du client
        this.client.palette.forEach((color, index) => {
            const [cr, cg, cb] = this.hexToRgb(color);
            
            // Calculer la distance euclidienne
            const distance = Math.sqrt(
                Math.pow(r - cr, 2) +
                Math.pow(g - cg, 2) +
                Math.pow(b - cb, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestColor = index;
            }
        });

        return closestColor;
    }

    // Convertir une couleur hex en RGB
    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }

    // Appliquer les couleurs à la grille
    applyToGrid(imageData) {
        const pixels = imageData.data;
        const totalDuration = 10000; // 10 secondes
        let pixelsProcessed = 0;
        
        // Activer le zoom automatique
        if (this.client.zoomState) {
            this.client.zoomState.isAutoZoom = true;
            this.client.zoomToUserAndNeighbors();
            this.client.highlightUserCell(true);
        }
        
        const cell = this.client.cells.get(this.client.myUserId);
        if (!cell) {
            console.error('No cell found for current user');
            return;
        }

        console.log('Starting image import...');
        
        // Désactiver le bouton d'import pendant le processus
        const importButton = document.querySelector('#zone-2a2');
        if (importButton) {
            importButton.classList.add('processing');
        }

        // Créer un tableau de toutes les positions
        let positions = [];
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 20; x++) {
                positions.push({x, y});
            }
        }

        // Mélanger les positions aléatoirement
        positions = positions.sort(() => Math.random() - 0.5);

        // Calculer le délai entre chaque pixel
        const delayBetweenPixels = totalDuration / positions.length;

        // Appliquer les couleurs progressivement
        positions.forEach((pos, index) => {
            const i = (pos.y * 20 + pos.x) * 4;
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const color = `rgb(${r},${g},${b})`;

            setTimeout(() => {
                const subCell = cell.children[pos.y * 20 + pos.x];
                if (subCell) {
                    subCell.style.backgroundColor = color;
                }

                if (this.client.socket?.readyState === WebSocket.OPEN) {
                    this.client.socket.send(JSON.stringify({
                        type: 'cell_update',
                        sub_x: pos.x,
                        sub_y: pos.y,
                        color: color
                    }));
                }

                pixelsProcessed++;
                if (pixelsProcessed === 400) {
                    console.log('Image import completed');
                    // Réactiver le bouton d'import
                    if (importButton) {
                        importButton.classList.remove('processing');
                    }
                }
            }, index * delayBetweenPixels);
        });

        cell.classList.add('importing-image');
        
        setTimeout(() => {
            cell.classList.remove('importing-image');
        }, totalDuration + 100);
    }
} 