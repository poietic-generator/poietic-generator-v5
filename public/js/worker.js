// Fichier: public/js/worker.js

self.onmessage = function(event) {
    const { type, userId, pixelGrid, cellSize, pixelSize } = event.data;
    
    if (type === 'render_cell') {
        const canvas = new OffscreenCanvas(cellSize, cellSize);
        const ctx = canvas.getContext('2d');
        
        // Assurez-vous que pixelGrid n'est pas vide
        if (pixelGrid && pixelGrid.length > 0) {
            for (let i = 0; i < pixelGrid.length; i++) {
                const x = i % pixelSize;
                const y = Math.floor(i / pixelSize);
                ctx.fillStyle = pixelGrid[i];
                ctx.fillRect(x * (cellSize / pixelSize), y * (cellSize / pixelSize), cellSize / pixelSize, cellSize / pixelSize);
            }
            
            canvas.convertToBlob().then(blob => {
                self.postMessage({
                    type: 'render_complete',
                    data: {
                        userId: userId,
                        imageData: blob
                    }
                });
            });
        } else {
            console.error('Empty or invalid pixelGrid:', pixelGrid);
            self.postMessage({
                type: 'render_error',
                data: {
                    userId: userId,
                    error: 'Empty or invalid pixelGrid'
                }
            });
        }
    }
};
