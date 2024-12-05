class PoieticViewerPanel {
    constructor(container) {
        this.container = container;
        this.setupViewer();
    }

    setupViewer() {
        this.iframe = document.createElement('iframe');
        this.iframe.src = '/viewer';
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        this.iframe.style.backgroundColor = 'black';
        
        this.container.classList.add('viewer-content');
        this.container.appendChild(this.iframe);
    }
} 