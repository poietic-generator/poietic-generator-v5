document.write(`
    <script src="/js/poietic-viewer-panel.js"></script>
    <script src="/js/poietic-chromatic-panel.js"></script>
    <script src="/js/poietic-session-panel.js"></script>
`);

class PoieticMonitoring {
    constructor() {
        this.panels = new Map();
        this.initializeButtons();
    }

    initializeButtons() {
        document.getElementById('viewer-btn').addEventListener('click', () => this.createPanel('viewer'));
        document.getElementById('chromatic-btn').addEventListener('click', () => this.createPanel('chromatic'));
        document.getElementById('session-btn').addEventListener('click', () => this.createPanel('session'));
    }

    createPanel(type) {
        const panel = document.createElement('div');
        panel.className = 'dashboard-panel';
        panel.style.top = '100px';
        panel.style.left = '100px';

        const header = document.createElement('div');
        header.className = 'panel-header';
        
        const title = document.createElement('h3');
        title.className = 'panel-title';
        title.textContent = this.getPanelTitle(type);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => panel.remove();

        const content = document.createElement('div');
        content.className = 'panel-content';
        content.id = `${type}-content`;

        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        panel.appendChild(content);

        document.getElementById('dashboard-container').appendChild(panel);
        this.makeDraggable(panel);
        this.initializePanelContent(type, content);
    }

    getPanelTitle(type) {
        const titles = {
            viewer: 'Poietic Grid Viewer',
            chromatic: 'Chromatic Analysis',
            session: 'Session Data'
        };
        return titles[type];
    }

    makeDraggable(panel) {
        const header = panel.querySelector('.panel-header');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;

        header.onmousedown = dragStart;

        function dragStart(e) {
            initialX = e.clientX - panel.offsetLeft;
            initialY = e.clientY - panel.offsetTop;
            
            document.onmousemove = drag;
            document.onmouseup = dragEnd;
        }

        function drag(e) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            panel.style.left = `${currentX}px`;
            panel.style.top = `${currentY}px`;
        }

        function dragEnd() {
            initialX = currentX;
            initialY = currentY;
            
            document.onmousemove = null;
            document.onmouseup = null;
        }
    }

    initializePanelContent(type, container) {
        switch(type) {
            case 'viewer':
                new PoieticViewerPanel(container);
                break;
            case 'chromatic':
                new PoieticChromaticPanel(container);
                break;
            case 'session':
                new PoieticSessionPanel(container);
                break;
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.poieticMonitoring = new PoieticMonitoring();
}); 