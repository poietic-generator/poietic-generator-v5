export class ColorGenerator {
    static uuidToSeed(uuid) {
        return uuid.split('')
            .reduce((acc, char) => (acc << 8) + char.charCodeAt(0), 0);
    }

    static seededRandom(seed) {
        let state = seed;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    static hueToRgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    static hslToHex(h, s, l) {
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = ColorGenerator.hueToRgb(p, q, h + 1/3);
            g = ColorGenerator.hueToRgb(p, q, h);
            b = ColorGenerator.hueToRgb(p, q, h - 1/3);
        }

        const toHex = x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    static generateInitialColors(uuid) {
        const seed = this.uuidToSeed(uuid);
        const random = this.seededRandom(seed);

        const baseH = random();
        const baseS = 0.6 + (random() * 0.4);
        const baseL = 0.4 + (random() * 0.2);

        return Array.from({ length: 400 }, () => {
            const h = (baseH + (random() * 0.2) - 0.1) % 1.0;
            const s = Math.max(0, Math.min(1, baseS + (random() * 0.2) - 0.1));
            const l = Math.max(0, Math.min(1, baseL + (random() * 0.2) - 0.1));
            return this.hslToHex(h, s, l);
        });
    }
} 