class AdduserManager {
    constructor() {
        this.counter = 0;
        this.isAutoMode = true;
        this.maxUsers = 100;
        this.minUsers = 0;

        // Éléments DOM
        this.counterElement = document.getElementById('counter');
        this.plusButton = document.getElementById('plus-btn');
        this.minusButton = document.getElementById('minus-btn');
        this.modeButton = document.getElementById('mode-btn');
        this.simulatorsContainer = document.getElementById('simulators');

        this.initializeEventListeners();
        this.updateButtonStates();
        this.setInitialState();
    }

    initializeEventListeners() {
        this.plusButton.addEventListener('click', () => this.incrementCounter());
        this.minusButton.addEventListener('click', () => this.decrementCounter());
        this.modeButton.addEventListener('click', () => this.toggleMode());
    }

    setInitialState() {
        // Démarrer en mode AUTO avec 1 utilisateur
        this.isAutoMode = true;
        this.updateCounter(1);
    }

    incrementCounter() {
        if (this.counter < this.maxUsers) {
            this.updateCounter(this.counter + 1);
        }
    }

    decrementCounter() {
        if (this.counter > this.minUsers) {
            this.updateCounter(this.counter - 1);
        }
    }

    toggleMode() {
        this.isAutoMode = !this.isAutoMode;
        this.modeButton.textContent = this.isAutoMode ? 'AUTO' : 'MANUAL';
        this.updateButtonStates();

        if (this.isAutoMode) {
            // Réinitialiser à 1 utilisateur en mode AUTO
            this.updateCounter(1);
        }
    }

    updateButtonStates() {
        this.plusButton.disabled = this.isAutoMode;
        this.minusButton.disabled = this.isAutoMode;
    }

    updateCounter(newValue) {
        const oldValue = this.counter;
        this.counter = newValue;
        this.counterElement.textContent = this.counter;

        // Mettre à jour les simulateurs
        if (newValue > oldValue) {
            // Ajouter des simulateurs
            for (let i = oldValue; i < newValue; i++) {
                this.addSimulator();
            }
        } else if (newValue < oldValue) {
            // Retirer des simulateurs
            for (let i = oldValue; i > newValue; i--) {
                this.removeSimulator();
            }
        }
    }

    addSimulator() {
        const iframe = document.createElement('iframe');
        iframe.src = '/simulator.html';
        iframe.className = 'simulator-frame';
        this.simulatorsContainer.appendChild(iframe);
    }

    removeSimulator() {
        const lastSimulator = this.simulatorsContainer.lastChild;
        if (lastSimulator) {
            this.simulatorsContainer.removeChild(lastSimulator);
        }
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.adduserManager = new AdduserManager();
}); 