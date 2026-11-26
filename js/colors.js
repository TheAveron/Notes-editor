/* Atelier de Dossiers — Utilitaires de couleur : conversions, palette dérivée, propositions uniques. */

/* ---------- Utilitaires couleur ---------- */
function clampPct(v) {
    return Math.max(0, Math.min(100, v));
}

// "#abc" → "abc" développé en "aabbcc" ; "#aabbcc" → "aabbcc"
function expandHex(hex) {
    hex = String(hex || "").trim().replace("#", "");
    if (hex.length === 3)
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
    return hex.toLowerCase();
}

function hexToHsl(hex) {
    hex = expandHex(hex);
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h,
        s,
        l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clampPct(s) / 100;
    l = clampPct(l) / 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h / 360 + 1 / 3);
        g = hue2rgb(p, q, h / 360);
        b = hue2rgb(p, q, h / 360 - 1 / 3);
    }
    const toHex = (x) =>
        Math.round(x * 255)
            .toString(16)
            .padStart(2, "0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
}
function isValidHex(hex) {
    return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(hex || "").trim());
}
// Toujours au format "#rrggbb" minuscule (les codes courts sont développés)
function normalizeHex(hex) {
    return "#" + expandHex(hex);
}

// Distance perceptuelle approximative (pondérée) entre deux teintes hex
function colorDistance(hexA, hexB) {
    const a = hexToRgb(hexA),
        b = hexToRgb(hexB);
    const dr = a.r - b.r,
        dg = a.g - b.g,
        db = a.b - b.b;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}
function hexToRgb(hex) {
    hex = expandHex(hex);
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
    };
}

// Dérive la mini-palette (encre, encre moyenne, fond pâle) à partir d'une seule teinte d'accent
function derivePalette(accentHex) {
    const { h, s } = hexToHsl(accentHex);
    return {
        accent: accentHex,
        ink: hslToHex(h, Math.min(s, 42), 15),
        inkMid: hslToHex(h, Math.min(s, 32), 32),
        accentBg: hslToHex(h, Math.min(s, 45), 93),
        card: hslToHex(h, 10, 95),
        rule: hslToHex(h, 14, 87),
    };
}

// Couleurs fixes des 4 tags établis dans toute la collection
const FIXED = {
    gold: "#a9812e",
    goldBg: "#f4eedd",
    teal: "#1f5c57",
    tealBg: "#e7f0ee",
    red: "#8b2635",
    redBg: "#f5e6e8",
};

// Écart minimal (colorDistance) entre une proposition et une couleur déjà attribuée,
// et entre deux propositions d'une même série.
const MIN_DISTANCE_USED = 60;
const MIN_DISTANCE_PROPOSALS = 45;

function generateProposals(usedHexes, count) {
    const proposals = [];
    let attempts = 0;
    const startHue = Math.random() * 360;
    while (proposals.length < count && attempts < 400) {
        attempts++;
        const idx = proposals.length;
        const hue =
            (startHue + idx * (360 / count) + (Math.random() * 24 - 12) + 360) %
            360;
        const sat = 38 + Math.random() * 28; // 38-66%
        const lig = 30 + Math.random() * 16; // 30-46% (ton "encre saturée", ni pastel ni noir)
        const hex = hslToHex(hue, sat, lig);
        const tooClose =
            usedHexes.some((u) => colorDistance(hex, u) < MIN_DISTANCE_USED) ||
            proposals.some((p) => colorDistance(hex, p) < MIN_DISTANCE_PROPOSALS);
        if (!tooClose) proposals.push(hex);
    }
    while (proposals.length < count) {
        proposals.push(hslToHex(Math.random() * 360, 50, 38));
    }
    return proposals;
}
