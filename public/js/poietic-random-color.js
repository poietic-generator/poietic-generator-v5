export function generateRandomColor() {
    const hue = Math.floor(Math.random() * 360);    // Teinte aléatoire (0-359)
    const saturation = 60 + Math.random() * 40;     // Saturation entre 60% et 100%
    const lightness = 35 + Math.random() * 30;      // Luminosité entre 35% et 65%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
} 