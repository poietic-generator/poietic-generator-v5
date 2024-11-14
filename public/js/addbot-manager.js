class AddbotManager {
    constructor() {
        this.counter = 0;
        this.maxBots = 50;  // Limite maximale de bots
        this.minBots = 0;

        // Éléments DOM
        this.counterElement = document.getElementById('counter');
        this.plusButton = document.getElementById('plus-btn');
        this.minusButton = document.getElementById('minus-btn');
        this.botsContainer = document.getElementById('bots');

        this.initializeEventListeners();
        this.updateButtonStates();
        this.setInitialState();
    }

    initializeEventListeners() {
        this.plusButton.addEventListener('click', () => this.incrementCounter());
        this.minusButton.addEventListener('click', () => this.decrementCounter());
    }

    setInitialState() {
        // Démarrer avec 1 bot
        this.updateCounter(1);
    }

    incrementCounter() {
        if (this.counter < this.maxBots) {
            this.updateCounter(this.counter + 1);
        }
    }

    decrementCounter() {
        if (this.counter > this.minBots) {
            this.updateCounter(this.counter - 1);
        }
    }

    updateButtonStates() {
        this.plusButton.disabled = this.counter >= this.maxBots;
        this.minusButton.disabled = this.counter <= this.minBots;
    }

    updateCounter(newValue) {
        const oldValue = this.counter;
        this.counter = newValue;
        this.counterElement.textContent = this.counter;
        this.updateButtonStates();

        // Mettre à jour les bots
        if (newValue > oldValue) {
            // Ajouter des bots
            for (let i = oldValue; i < newValue; i++) {
                this.addBot();
            }
        } else if (newValue < oldValue) {
            // Retirer des bots
            for (let i = oldValue; i > newValue; i--) {
                this.removeBot();
            }
        }
    }

    addBot() {
        const iframe = document.createElement('iframe');
        iframe.src = '/bot.html';
        iframe.className = 'bot-frame';
        this.botsContainer.insertBefore(iframe, this.botsContainer.firstChild);
        
        // Scroll vers le haut pour voir le nouveau bot
        this.botsContainer.scrollTop = 0;
    }

    removeBot() {
        const lastBot = this.botsContainer.lastChild;
        if (lastBot) {
            this.botsContainer.removeChild(lastBot);
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.addbotManager = new AddbotManager();
}); 