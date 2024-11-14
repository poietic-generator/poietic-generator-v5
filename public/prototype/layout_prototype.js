function updateLayout() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const mainContainer = document.getElementById('main-container');
    const technicalTools = document.getElementById('technical-tools');
    const graphicalTools = document.getElementById('graphical-tools');
    const drawingArea = document.getElementById('drawing-area');
    const zone1 = document.getElementById('zone-1');

    if (isLandscape) {
        // Mode paysage
        mainContainer.style.flexDirection = 'row';
        drawingArea.style.height = '100%';
        drawingArea.style.width = 'auto';
        zone1.style.height = '100%';
        zone1.style.width = 'auto';
        zone1.style.aspectRatio = '1 / 1';

        const sideWidth = (window.innerWidth - zone1.offsetHeight) / 2;
        technicalTools.style.width = `${sideWidth}px`;
        technicalTools.style.height = '100%';
        graphicalTools.style.width = `${sideWidth}px`;
        graphicalTools.style.height = '100%';
        technicalTools.style.flexDirection = 'column';
        graphicalTools.style.flexDirection = 'column';

        // Assurez-vous que les sous-zones occupent toute la hauteur
        const subZones = document.querySelectorAll('.sub-zone');
        subZones.forEach(zone => {
            zone.style.flex = '1';
        });
    } else {
        // Mode portrait
        mainContainer.style.flexDirection = 'column';
        drawingArea.style.width = '100%';
        drawingArea.style.height = 'auto';
        zone1.style.width = '100%';
        zone1.style.height = 'auto';
        zone1.style.aspectRatio = '1 / 1';

        const sideHeight = (window.innerHeight - zone1.offsetWidth) / 2;
        technicalTools.style.width = '100%';
        technicalTools.style.height = `${sideHeight}px`;
        graphicalTools.style.width = '100%';
        graphicalTools.style.height = `${sideHeight}px`;
        technicalTools.style.flexDirection = 'row';
        graphicalTools.style.flexDirection = 'row';

        // Assurez-vous que les sous-zones occupent toute la largeur
        const subZones = document.querySelectorAll('.sub-zone');
        subZones.forEach(zone => {
            zone.style.flex = '1';
        });
    }

    // Set different colors for each zone
    document.getElementById('zone-1').style.backgroundColor = '#FF5733';
    document.getElementById('zone-2a').style.backgroundColor = '#C70039';
    document.getElementById('zone-2b').style.backgroundColor = '#900C3F';
    document.getElementById('zone-2c').style.backgroundColor = '#581845';
    document.getElementById('zone-3a').style.backgroundColor = '#FFC300';
    document.getElementById('zone-3b').style.backgroundColor = '#DAF7A6';
    document.getElementById('zone-3c').style.backgroundColor = '#FF5733';
}

window.addEventListener('load', updateLayout);
window.addEventListener('resize', updateLayout);
