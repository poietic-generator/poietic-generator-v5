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

        this.bots = new Map(); // Pour suivre les bots actifs

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
        iframe.src = '/bot';
        iframe.className = 'bot-frame';
        
        // Attendre que l'iframe soit chargée avant de l'ajouter à notre Map
        iframe.onload = () => {
            const botId = iframe.contentWindow.bot?.instanceId;
            if (botId) {
                this.bots.set(botId, iframe);
            }
        };
        
        this.botsContainer.insertBefore(iframe, this.botsContainer.firstChild);
    }

    removeBot() {
        const lastBot = this.botsContainer.lastChild;
        if (lastBot) {
            const botId = lastBot.dataset.botId;
            if (botId) {
                // Déconnecter proprement le bot
                const botWindow = lastBot.contentWindow;
                if (botWindow && botWindow.bot) {
                    botWindow.bot.disconnect();
                }
                this.bots.delete(botId);
            }
            this.botsContainer.removeChild(lastBot);
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.addbotManager = new AddbotManager();
}); 