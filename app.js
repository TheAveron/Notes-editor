/* ============================================================
   ATELIER DE DOSSIERS — logique principale
   Aucune dépendance externe. Stockage via window.storage (si présent,
   ex. Claude Artifacts) avec repli automatique sur un registre en mémoire.
   ============================================================ */

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

/* ---------- Stockage (window.storage avec repli mémoire) ---------- */
const hasStorage =
    typeof window !== "undefined" &&
    window.storage &&
    typeof window.storage.get === "function";
let memoryStore = {};
async function storeGet(key) {
    if (hasStorage) {
        try {
            const r = await window.storage.get(key);
            return r ? JSON.parse(r.value) : null;
        } catch (e) {
            return null;
        }
    }
    return memoryStore[key] ?? null;
}
async function storeSet(key, value) {
    if (hasStorage) {
        try {
            await window.storage.set(key, JSON.stringify(value));
            return;
        } catch (e) {
            /* fall through */
        }
    }
    memoryStore[key] = value;
}

/* ---------- Registre des couleurs ---------- */
let registry = []; // [{hex, title, docId}]
// Ne garde que les entrées bien formées ; un fichier importé ne peut ainsi rien injecter
// dans les attributs style où la couleur est insérée.
function sanitizeRegistry(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(
            (r) =>
                r &&
                isValidHex(r.hex) &&
                (typeof r.docId === "string" || typeof r.docId === "number"),
        )
        .map((r) => ({
            hex: normalizeHex(r.hex),
            title: typeof r.title === "string" ? r.title : "(sans titre)",
            docId: String(r.docId),
        }));
}
async function loadRegistry() {
    registry = sanitizeRegistry(await storeGet("color-registry"));
}
async function saveRegistry() {
    await storeSet("color-registry", registry);
}
function registryHexes() {
    return registry.map((r) => r.hex);
}
async function registerColor(docId, hex, title) {
    registry = registry.filter((r) => r.docId !== docId);
    registry.push({ hex, title: title || "(sans titre)", docId });
    await saveRegistry();
}
// Garde le titre affiché dans le registre synchronisé avec le titre du document.
let registryTitleTimer = null;
function syncRegistryTitle() {
    const entry = registry.find((r) => r.docId === doc.id);
    if (!entry) return;
    entry.title = doc.cover.title || "(sans titre)";
    clearTimeout(registryTitleTimer);
    registryTitleTimer = setTimeout(saveRegistry, 400);
}
// Retire du registre la couleur d'un document jamais modifié (document vierge créé au
// démarrage ou via « Nouveau document »), pour ne pas laisser d'entrée fantôme.
async function releaseColorIfPristine(d) {
    if (!isPristine(d)) return;
    registry = registry.filter((r) => r.docId !== d.id);
    await saveRegistry();
}

/* ---------- Modèle de document ---------- */
// Identifiant unique : horodatage + aléa. (L'ancien compteur repartait de 1 à chaque
// chargement, ce qui rendait les collisions avec un document importé possibles.)
let uidCounter = 0;
function uid() {
    uidCounter = (uidCounter + 1) % 1296;
    return (
        "id" +
        Date.now().toString(36) +
        uidCounter.toString(36).padStart(2, "0") +
        "_" +
        Math.random().toString(36).slice(2, 7)
    );
}

function newBlock(type) {
    const base = { id: uid(), type };
    switch (type) {
        case "heading2":
            return { ...base, text: "Sous-titre" };
        case "paragraph":
            return {
                ...base,
                text: "Nouveau paragraphe. Cliquez pour modifier ce texte.",
                italic: false,
            };
        case "bullets":
            return {
                ...base,
                items: ["Premier point", "Deuxième point"],
            };
        case "callout":
            return {
                ...base,
                tag: "confirme",
                title: "Titre du callout",
                paragraphs: ["Texte du callout."],
            };
        case "table":
            return {
                ...base,
                layout: "label-value",
                rows: [{ a: "Champ", b: "Valeur", c: "" }],
            };
        case "card":
            return {
                ...base,
                badgeText: "HOOK 1",
                title: "Titre de la fiche",
                pitch: "Accroche ou description.",
                rows: [{ a: "Niveau", b: "Valeur" }],
            };
        case "crossref":
            return {
                ...base,
                text: "Voir XXX-00 pour plus de détails.",
            };
        case "pagebreak":
            return { ...base };
        default:
            return base;
    }
}
function newSection() {
    return {
        id: uid(),
        title: "Nouvelle section",
        blocks: [newBlock("paragraph")],
    };
}

// Dérive le préfixe du dossier (ex. "GDN") depuis le champ "N° de dossier" des métadonnées,
// en cherchant la ligne dont le libellé évoque un numéro de dossier plutôt qu'en supposant
// qu'elle est toujours en première position (l'utilisateur peut réordonner/renommer les lignes).
function docNumber() {
    const row =
        doc.cover.meta.find((m) =>
            /dossier|n[°o]\s*de|code/i.test(m.a || ""),
        ) || doc.cover.meta[0];
    return row && row.b ? row.b.trim() : "";
}
function docPrefix() {
    const prefix = docNumber().split("-")[0].trim().toUpperCase();
    return prefix || "DOC";
}
// Code affiché pour la section d'index idx (0-based) : préfixe du dossier + numéro séquentiel à 2 chiffres.
function sectionCode(idx) {
    return `${docPrefix()}-${String(idx + 1).padStart(2, "0")}`;
}
// Met à jour les badges de code déjà affichés dans la sidebar sans reconstruire le DOM
// (utilisé quand on tape dans le champ "N° de dossier", pour ne pas casser le focus du champ).
function refreshSectionBadges() {
    document.querySelectorAll("#sidebar .code-badge").forEach((elm, i) => {
        elm.textContent = sectionCode(i);
    });
}

/* ---------- Validation / migration des documents importés ---------- */
// Version du format JSON. Incrémenter à chaque changement de structure et ajouter la
// migration correspondante dans normalizeDoc().
//   1 : format d'origine (tableaux avec booléen `badge`)
//   2 : champ `version`, tableaux avec `layout`
const DOC_VERSION = 2;
const BLOCK_TYPES = [
    "heading2",
    "paragraph",
    "bullets",
    "callout",
    "table",
    "card",
    "crossref",
    "pagebreak",
];
const TABLE_LAYOUTS = ["label-value", "badge-value", "badge-label-value"];
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function asStr(v, fallback = "") {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return fallback;
}
function asStrList(v) {
    return Array.isArray(v) ? v.map((x) => asStr(x)) : [];
}
function asRows(v, keys) {
    if (!Array.isArray(v)) return [];
    return v.map((r) => {
        const out = {};
        keys.forEach((k) => (out[k] = asStr(r && r[k])));
        return out;
    });
}

function normalizeBlock(b, id) {
    switch (b.type) {
        case "heading2":
        case "crossref":
            return { id, type: b.type, text: asStr(b.text) };
        case "paragraph":
            return { id, type: b.type, text: asStr(b.text), italic: !!b.italic };
        case "bullets":
            return { id, type: b.type, items: asStrList(b.items) };
        case "callout":
            return {
                id,
                type: b.type,
                tag: TAG_KEYS.includes(b.tag) ? b.tag : "confirme",
                title: asStr(b.title),
                paragraphs: asStrList(b.paragraphs),
            };
        case "table": {
            // v1 : booléen `badge` au lieu de `layout`
            let layout = b.layout;
            if (!TABLE_LAYOUTS.includes(layout))
                layout = b.badge ? "badge-value" : "label-value";
            return {
                id,
                type: b.type,
                layout,
                badge: undefined, // champ v1 retiré (ignoré par JSON.stringify)
                rows: asRows(b.rows, ["a", "b", "c"]),
            };
        }
        case "card":
            return {
                id,
                type: b.type,
                badgeText: asStr(b.badgeText),
                title: asStr(b.title),
                pitch: asStr(b.pitch),
                rows: asRows(b.rows, ["a", "b"]),
            };
        default:
            return { id, type: b.type };
    }
}

// Transforme n'importe quel JSON importé en document valide : champs manquants complétés,
// types inconnus écartés, identifiants et couleur vérifiés (ils sont insérés tels quels
// dans des attributs HTML), identifiants dupliqués régénérés.
function normalizeDoc(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.sections))
        throw new Error("format invalide (liste « sections » absente)");
    const def = defaultDocument();
    const seen = new Set();
    const safeId = (v) => {
        let id = asStr(v);
        if (!SAFE_ID.test(id) || seen.has(id)) id = uid();
        seen.add(id);
        return id;
    };
    const cover = raw.cover && typeof raw.cover === "object" ? raw.cover : {};
    const note =
        raw.noteUsage && typeof raw.noteUsage === "object" ? raw.noteUsage : {};
    return {
        ...raw,
        version: DOC_VERSION,
        id: safeId(raw.id),
        color: isValidHex(raw.color) ? normalizeHex(raw.color) : def.color,
        stampStyle: raw.stampStyle === "red" ? "red" : "accent",
        cover: {
            orgLine: asStr(cover.orgLine, def.cover.orgLine),
            kicker: asStr(cover.kicker, def.cover.kicker),
            title: asStr(cover.title, def.cover.title),
            subtitle: asStr(cover.subtitle, def.cover.subtitle),
            stampText: asStr(cover.stampText, def.cover.stampText),
            meta: Array.isArray(cover.meta)
                ? asRows(cover.meta, ["a", "b"])
                : def.cover.meta,
        },
        footerBrand: asStr(raw.footerBrand, def.footerBrand),
        noteUsage: {
            includeTagLegend: note.includeTagLegend !== false,
            text: asStr(note.text, def.noteUsage.text),
        },
        sections: raw.sections
            .filter((sec) => sec && typeof sec === "object")
            .map((sec) => ({
                ...sec,
                id: safeId(sec.id),
                title: asStr(sec.title),
                blocks: (Array.isArray(sec.blocks) ? sec.blocks : [])
                    .filter((b) => b && BLOCK_TYPES.includes(b.type))
                    // Les champs inconnus sont conservés (jamais affichés) pour qu'un
                    // import suivi d'un export ne perde rien.
                    .map((b) => ({ ...b, ...normalizeBlock(b, safeId(b.id)) })),
            })),
    };
}
function defaultDocument() {
    return {
        version: DOC_VERSION,
        id: uid(),
        color: "#2f6f5e",
        stampStyle: "accent", // 'accent' ou 'red'
        cover: {
            orgLine: "GUILDE DES ARCHIVISTES — FONDS DOCUMENTAIRE",
            kicker: "DOSSIER D'INFORMATION",
            title: "TITRE DU DOSSIER",
            subtitle: "Sous-titre descriptif du document",
            stampText: "Niveau 1 — Domaine Public",
            meta: [
                { a: "N° de dossier", b: "DOC-VC-001" },
                {
                    a: "Objet",
                    b: "Décrire ici le sujet du dossier",
                },
                { a: "Documents liés", b: "" },
                { a: "Nature du sujet", b: "" },
                {
                    a: "Confidentialité",
                    b: "Niveau 1 — voir ARC-03",
                },
            ],
        },
        footerBrand: "NOUVEAU DOSSIER",
        noteUsage: {
            includeTagLegend: true,
            text: "Ce dossier suit le système de classification commun à la collection. Chaque information est étiquetée selon son statut.",
        },
        sections: [newSection()],
    };
}

// Empreinte d'un document « vierge » (hors identifiant et couleur), pour savoir si
// l'utilisateur l'a modifié.
function contentFingerprint(d) {
    const { id, color, ...rest } = d;
    return JSON.stringify(rest, (k, v) => (k === "id" ? undefined : v));
}
const PRISTINE_FINGERPRINT = contentFingerprint(defaultDocument());
function isPristine(d) {
    return contentFingerprint(d) === PRISTINE_FINGERPRINT;
}

let doc = defaultDocument();
let selectedSwatchIdx = 0;
let proposals = [];

/* ---------- Rendu : PREVIEW ---------- */
// Échappe aussi les guillemets : le résultat peut être placé dans un attribut.
function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function nl2p(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
}

const TAG_META = {
    confirme: { label: "Confirmé", bg: "var(--doc-ink)" },
    hypothese: { label: "Hypothèse de travail", bg: FIXED.gold },
    hook: { label: "Hook MJ", bg: FIXED.teal },
    attention: { label: "Attention MJ", bg: FIXED.red },
};
const TAG_KEYS = Object.keys(TAG_META);
const CALLOUT_BG = {
    confirme: "var(--doc-card)",
    hypothese: FIXED.goldBg,
    hook: FIXED.tealBg,
    attention: FIXED.redBg,
};
const CALLOUT_BORDER = {
    confirme: "var(--doc-ink)",
    hypothese: FIXED.gold,
    hook: FIXED.teal,
    attention: FIXED.red,
};
// Style complet d'un tag, avec repli sur « confirmé » pour une valeur inconnue.
function tagStyle(tag) {
    const key = TAG_META[tag] ? tag : "confirme";
    return {
        ...TAG_META[key],
        border: CALLOUT_BORDER[key],
        calloutBg: CALLOUT_BG[key],
    };
}

function renderBlockHtml(b) {
    switch (b.type) {
        case "heading2":
            return `<div class="sec-h2">${escapeHtml(b.text)}</div>`;
        case "paragraph":
            return `<p class="p-body${b.italic ? " italic" : ""}">${nl2p(b.text)}</p>`;
        case "bullets":
            return `<ul class="bullets">${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        case "callout": {
            const meta = tagStyle(b.tag);
            return `<div class="callout" style="border-left-color:${meta.border};background:${meta.calloutBg};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span><span class="ctitle">${escapeHtml(b.title)}</span>
        ${b.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>`;
        }
        case "table": {
            if (b.layout === "badge-label-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge" style="width:44px;">${escapeHtml(r.a)}</td><td class="label">${escapeHtml(r.c)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
            }
            if (b.layout === "badge-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge">${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
            }
            return `<table class="stat">${b.rows.map((r) => `<tr><td class="label">${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
        }
        case "card":
            return `<div class="card">
        <div class="card-header">
        <div class="chead">${escapeHtml(b.badgeText)}</div>
        <div class="dot-separator">·</div>
        <div class="ctitle2">${escapeHtml(b.title)}</div>
        </div>
        <p>${escapeHtml(b.pitch)}</p>
        <table>${b.rows.map((r) => `<tr><td>${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>
      </div>`;
        case "crossref":
            return `<div class="crossref"><b>→ RENVOI</b> &nbsp;${escapeHtml(b.text)}</div>`;
        default: // pagebreak : géré par renderPreview (découpage des pages)
            return "";
    }
}

function updateTocPages() {
    const preview = document.getElementById("preview");

    const pages = [...preview.querySelectorAll(".page")];

    doc.sections.forEach((section) => {
        const target = document.getElementById(section.id);
        if (!target) return;

        const pageElement = target.closest(".page");
        if (!pageElement) return;

        const pageNumber = pages.indexOf(pageElement) + 1;

        const tocEntry = preview.querySelector(
            `.toc-page[data-toc="${section.id}"]`
        );

        if (tocEntry) {
            tocEntry.textContent = pageNumber;
        }
    });
}

function renderPreview() {
    const pal = derivePalette(doc.color);
    const stampColor = doc.stampStyle === "red" ? FIXED.red : pal.accent;
    const stampBg = doc.stampStyle === "red" ? FIXED.redBg : pal.accentBg;
    const styleVars = `--doc-accent:${pal.accent};--doc-ink:${pal.ink};--doc-inkmid:${pal.inkMid};--doc-card:${pal.card};--stamp-color:${stampColor};--stamp-bg:${stampBg};`;

    const header = () =>
        `<div class="doc-header"><span>DOSSIER ${escapeHtml(docNumber())}</span><span>${escapeHtml(doc.footerBrand)}</span></div>`;
    const footer = (n, total) =>
        `<div class="page-footer">— ${n} / ${total} —</div>`;

    // On construit d'abord le contenu INTERNE de chaque page logique (une par section + pages fixes),
    // puis on numérote en une seule passe une fois le total connu.
    const pagesInner = [];

    // Page de couverture
    let cover = `<div class="cover-org">${escapeHtml(doc.cover.orgLine)}</div><hr class="cover-rule">`;
    cover += `<div class="cover-kicker">${escapeHtml(doc.cover.kicker)}</div>`;
    cover += `<div class="cover-title">${escapeHtml(doc.cover.title)}</div>`;
    cover += `<div class="cover-subtitle">${escapeHtml(doc.cover.subtitle)}</div>`;
    cover += `<div class="cover-stamp-box"><div class="cover-stamp"><p style="margin: 0; text-align: center">${nl2p(doc.cover.stampText)}</p></div></div>`;
    cover += `<table class="meta-table">${doc.cover.meta.map((m) => `<tr><td>${escapeHtml(m.a)}</td><td>${escapeHtml(m.b)}</td></tr>`).join("")}</table>`;
    pagesInner.push(cover);

    // Note d'usage
    let note = `<div class="sec-h1"><span class="code">${escapeHtml(docPrefix())}-00</span><span class="dot-separator">·</span>NOTE D'USAGE</div>`;
    note += `<p class="p-body">${nl2p(doc.noteUsage.text)}</p>`;
    if (doc.noteUsage.includeTagLegend) {
        const legends = [
            [
                "confirme",
                "Fait établi dans le lore central. Ne devrait pas être contredit à la légère car cela pourrait créer des incohérences dans l'histoire.",
            ],
            [
                "hypothese",
                "Proposition cohérente avec le canon existant, mais non tranchée. Le MJ peut l'adopter telle quelle, l'adapter, ou la remplacer par sa propre idée.",
            ],
            [
                "hook",
                "Accroche de scénario prête à l'emploi, directement exploitable en jeu.",
            ],
            [
                "attention",
                "Point de vigilance : risque d'incohérence, d'équilibrage, ou de spoil à ne pas dévoiler trop tôt aux joueurs.",
            ],
        ];
        legends.forEach(([tag, txt]) => {
            const meta = tagStyle(tag);
            note += `<div class="callout" style="border-left-color:${meta.border};background:${meta.calloutBg};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span>
        <p>${escapeHtml(txt)}</p></div>`;
        });
    }
    pagesInner.push(note);

    // Table des matières (statique)
    let toc = `<div class="sec-h1">TABLE DES MATIÈRES</div>`;
    toc +=
        `<ul class="toc-list">` +
        doc.sections
            .map(
                (s, i) =>
                    `<li><a href="#${s.id}"><span class="code">${escapeHtml(sectionCode(i))}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}<span class="toc-page" data-toc="${s.id}"></span></a></li>`,
            )
            .join("") +
        `</ul>`;
    pagesInner.push(toc);

    // Sections de contenu : un saut de page termine la page courante et en ouvre une nouvelle.
    doc.sections.forEach((s, i) => {
        let currentPage = `<div class="sec-h1" id="${s.id}"><span class="code">${escapeHtml(sectionCode(i))}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}
        </div>`;

        s.blocks.forEach((block) => {
            if (block.type === "pagebreak") {
                // On termine la page courante
                pagesInner.push(currentPage);

                // La suivante démarre vide
                // (ou remets l'en-tête de section ici si tu souhaites le répéter)
                currentPage = "";
            } else {
                currentPage += renderBlockHtml(block);
            }
        });

        // Dernière page de la section
        if (currentPage.trim() !== "") {
            pagesInner.push(currentPage);
        }
    });

    const total = pagesInner.length;
    const html = pagesInner
        .map(
            (inner, i) =>
                `<div class="page" style="${styleVars}">${header()}${inner}${footer(i + 1, total)}</div>`,
        )
        .join("");

    document.getElementById("preview").innerHTML = html;
    updateTocPages();
}

/* ---------- Rendu : SIDEBAR (formulaires) ---------- */
function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
        if (k === "html") e.innerHTML = attrs[k];
        else if (k.startsWith("on"))
            e.addEventListener(k.substring(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && e.appendChild(c));
    return e;
}

// Message affiché sous le champ « Couleur personnalisée ». Il est conservé ici (et non dans
// le DOM) pour survivre à la reconstruction du panneau.
let colorMsg = null; // { cls, text } | null

async function selectColor(hex) {
    doc.color = normalizeHex(hex);
    await registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreview();
}

function renderColorPicker(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Couleur du document")]),
    );

    const grid = el("div", { class: "swatch-grid" });
    proposals.forEach((hex, i) => {
        const isSelected = normalizeHex(doc.color) === normalizeHex(hex);
        const sw = el("div", {
            class: "swatch" + (isSelected ? " selected" : ""),
            onclick: () => {
                colorMsg = null;
                selectColor(hex);
            },
        });
        sw.appendChild(
            el("div", {
                class: "chip",
                style: `background:${hex};`,
            }),
        );
        sw.appendChild(
            el("span", { class: "hex" }, [document.createTextNode(hex)]),
        );
        if (i === 0)
            sw.appendChild(
                el("span", { class: "default-tag" }, [
                    document.createTextNode("DÉFAUT"),
                ]),
            );
        grid.appendChild(sw);
    });
    box.appendChild(grid);

    const actions = el("div", { class: "swatch-actions" });
    actions.appendChild(
        el(
            "button",
            {
                onclick: () => {
                    // La couleur actuelle reste en tête pour pouvoir y revenir.
                    proposals = [
                        doc.color,
                        ...generateProposals(
                            [...registryHexes(), doc.color],
                            4,
                        ),
                    ];
                    renderSidebar();
                },
            },
            [document.createTextNode("↻ 5 nouvelles propositions")],
        ),
    );
    box.appendChild(actions);

    const customWrap = el("div", { class: "custom-hex" });
    const colorInput = el("input", {
        type: "color",
        value: isValidHex(doc.color) ? normalizeHex(doc.color) : "#2f6f5e",
    });
    const textInput = el("input", {
        type: "text",
        placeholder: "#RRGGBB",
        value: doc.color,
    });
    const msg = el("div", colorMsg ? { class: colorMsg.cls } : {});
    if (colorMsg) msg.textContent = colorMsg.text;
    // Refus : on revient à la dernière couleur validée (l'aperçu a pu suivre le glissement).
    function refuse(text) {
        colorMsg = { cls: "hex-warning", text };
        const mine = registry.find((r) => r.docId === doc.id);
        if (mine) doc.color = mine.hex;
        renderSidebar();
        renderPreview();
    }
    function tryCustom(val) {
        if (!isValidHex(val)) return refuse("Code hexadécimal invalide.");
        const norm = normalizeHex(val);
        const others = registry.filter((r) => r.docId !== doc.id);
        const clash = others.find((r) => normalizeHex(r.hex) === norm);
        if (clash) return refuse(`Déjà utilisée par « ${clash.title} ».`);
        // Même critère que les propositions automatiques : une teinte quasi identique
        // est acceptée (choix explicite) mais signalée.
        const near = others.find(
            (r) => colorDistance(r.hex, norm) < MIN_DISTANCE_USED,
        );
        colorMsg = near
            ? {
                  cls: "hex-warning",
                  text: `Acceptée, mais très proche de « ${near.title} » (${near.hex}).`,
              }
            : { cls: "hex-ok", text: "Couleur disponible ✓" };
        selectColor(norm);
    }
    // Pendant le glissement dans le sélecteur natif : aperçu seulement, sans reconstruire
    // le panneau (ce qui fermerait le sélecteur). La validation se fait au relâchement.
    colorInput.addEventListener("input", () => {
        textInput.value = colorInput.value;
        doc.color = normalizeHex(colorInput.value);
        renderPreview();
    });
    colorInput.addEventListener("change", () => tryCustom(colorInput.value));
    textInput.addEventListener("change", () => tryCustom(textInput.value));
    customWrap.appendChild(colorInput);
    customWrap.appendChild(textInput);
    box.appendChild(
        el("label", {}, [document.createTextNode("Couleur personnalisée")]),
    );
    box.appendChild(customWrap);
    box.appendChild(msg);

    const pal = derivePalette(doc.color);
    const palPrev = el("div", { class: "palette-preview" });
    [pal.ink, pal.inkMid, pal.accent, pal.accentBg, pal.card].forEach((c) =>
        palPrev.appendChild(el("div", { style: `background:${c};`, title: c })),
    );
    box.appendChild(
        el("label", { style: "margin-top:8px;" }, [
            document.createTextNode("Palette dérivée (encre → fond)"),
        ]),
    );
    box.appendChild(palPrev);

    const stampRow = el("div", {
        class: "field",
        style: "margin-top:10px;",
    });
    stampRow.appendChild(
        el("label", {}, [
            document.createTextNode("Style du tampon de couverture"),
        ]),
    );
    const sel = el("select", {
        onchange: (e) => {
            doc.stampStyle = e.target.value;
            renderPreview();
        },
    });
    ["accent", "red"].forEach((v) => {
        const o = el("option", { value: v }, [
            document.createTextNode(
                v === "accent"
                    ? "Couleur du document"
                    : "Rouge (alerte / restreint)",
            ),
        ]);
        if (doc.stampStyle === v) o.setAttribute("selected", "selected");
        sel.appendChild(o);
    });
    stampRow.appendChild(sel);
    box.appendChild(stampRow);

    container.appendChild(box);
}

function fieldText(labelText, value, onInput, multiline) {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", {}, [document.createTextNode(labelText)]));
    const input = el(
        multiline ? "textarea" : "input",
        multiline ? {} : { type: "text" },
    );
    input.value = value || "";
    input.addEventListener("input", (e) => onInput(e.target.value));
    f.appendChild(input);
    return f;
}

function renderDocSettings(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Couverture du document")]),
    );
    box.appendChild(
        fieldText("Ligne d'organisation", doc.cover.orgLine, (v) => {
            doc.cover.orgLine = v;
            renderPreview();
        }),
    );
    box.appendChild(
        fieldText("Sur-titre (kicker)", doc.cover.kicker, (v) => {
            doc.cover.kicker = v;
            renderPreview();
        }),
    );
    box.appendChild(
        fieldText("Titre principal", doc.cover.title, (v) => {
            doc.cover.title = v;
            syncRegistryTitle();
            renderPreview();
        }),
    );
    box.appendChild(
        fieldText("Sous-titre", doc.cover.subtitle, (v) => {
            doc.cover.subtitle = v;
            renderPreview();
        }),
    );
    box.appendChild(
        fieldText("Texte du tampon", doc.cover.stampText, (v) => {
            doc.cover.stampText = v;
            renderPreview();
        }, true),
    );
    box.appendChild(
        fieldText("Marque en pied/en-tête de page", doc.footerBrand, (v) => {
            doc.footerBrand = v;
            renderPreview();
        }),
    );

    box.appendChild(
        el("label", { style: "margin-top:10px;display:block;" }, [
            document.createTextNode("Métadonnées (tableau de couverture)"),
        ]),
    );
    const rows = el("div", { class: "rows-list" });
    doc.cover.meta.forEach((m, i) => {
        const rp = el("div", { class: "rowpair" });
        const ai = el("input", {
            type: "text",
            value: m.a,
            class: "narrow",
        });
        ai.addEventListener("input", (e) => {
            m.a = e.target.value;
            renderPreview();
            refreshSectionBadges();
        });
        const bi = el("input", { type: "text", value: m.b });
        bi.addEventListener("input", (e) => {
            m.b = e.target.value;
            renderPreview();
            refreshSectionBadges();
        });
        const del = el(
            "button",
            {
                class: "icon-btn danger",
                onclick: () => {
                    doc.cover.meta.splice(i, 1);
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("✕")],
        );
        rp.appendChild(ai);
        rp.appendChild(bi);
        rp.appendChild(del);
        rows.appendChild(rp);
    });
    box.appendChild(rows);
    box.appendChild(
        el(
            "button",
            {
                class: "add-row-btn",
                onclick: () => {
                    doc.cover.meta.push({
                        a: "Champ",
                        b: "Valeur",
                    });
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("+ ligne")],
        ),
    );

    box.appendChild(
        el("label", { style: "margin-top:12px;display:block;" }, [
            document.createTextNode("Note d'usage"),
        ]),
    );
    box.appendChild(
        fieldText(
            "Texte introductif",
            doc.noteUsage.text,
            (v) => {
                doc.noteUsage.text = v;
                renderPreview();
            },
            true,
        ),
    );
    const legendRow = el("div", { class: "field" });
    const cb = el("input", { type: "checkbox" });
    cb.checked = doc.noteUsage.includeTagLegend;
    cb.addEventListener("change", (e) => {
        doc.noteUsage.includeTagLegend = e.target.checked;
        renderPreview();
    });
    const lbl = el(
        "label",
        {
            style: "display:flex;align-items:center;gap:6px;font-weight:400;",
        },
        [cb, document.createTextNode("Inclure la légende des 4 tags")],
    );
    legendRow.appendChild(lbl);
    box.appendChild(legendRow);

    container.appendChild(box);
}

function blockHeader(label, s, b, idx) {
    const head = el("div", { class: "block-item-head" });
    head.appendChild(el("span", {}, [document.createTextNode(label)]));
    head.appendChild(el("span", { class: "grow" }));
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Monter",
                onclick: () => {
                    if (idx > 0) {
                        [s.blocks[idx - 1], s.blocks[idx]] = [
                            s.blocks[idx],
                            s.blocks[idx - 1],
                        ];
                        renderSidebar();
                        renderPreview();
                    }
                },
            },
            [document.createTextNode("↑")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Descendre",
                onclick: () => {
                    if (idx < s.blocks.length - 1) {
                        [s.blocks[idx + 1], s.blocks[idx]] = [
                            s.blocks[idx],
                            s.blocks[idx + 1],
                        ];
                        renderSidebar();
                        renderPreview();
                    }
                },
            },
            [document.createTextNode("↓")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Dupliquer",
                onclick: () => {
                    const copy = JSON.parse(JSON.stringify(b));
                    copy.id = uid();
                    s.blocks.splice(idx + 1, 0, copy);
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("⧉")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer",
                onclick: () => {
                    s.blocks.splice(idx, 1);
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("✕")],
        ),
    );
    return head;
}

// Construit l'éditeur d'une ligne de tableau/carte : une première ligne pour les champs courts
// (badge et/ou libellé) + bouton de suppression, puis une zone de texte multi-ligne pour la valeur.
function makeRowBlock(row, topFields, valueKey, onChange, onDelete) {
    const wrap = el("div", { class: "row-block" });
    const top = el("div", { class: "row-top" });
    topFields.forEach((f) => {
        const inp = el("input", {
            type: "text",
            value: row[f.key] || "",
            placeholder: f.placeholder,
            class: f.narrow ? "narrow" : "",
        });
        inp.addEventListener("input", (e) => {
            row[f.key] = e.target.value;
            onChange();
        });
        top.appendChild(inp);
    });
    top.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer la ligne",
                onclick: onDelete,
            },
            [document.createTextNode("✕")],
        ),
    );
    wrap.appendChild(top);
    const ta = el("textarea", {
        class: "row-value",
        placeholder: "Valeur / contenu…",
    });
    ta.value = row[valueKey] || "";
    ta.addEventListener("input", (e) => {
        row[valueKey] = e.target.value;
        onChange();
    });
    wrap.appendChild(ta);
    return wrap;
}

function renderBlockEditor(s, b, idx) {
    const item = el("div", { class: "block-item" });
    const labels = {
        heading2: "Sous-titre",
        paragraph: "Paragraphe",
        bullets: "Liste à puces",
        callout: "Callout",
        table: "Tableau",
        card: "Fiche (hook/carte)",
        crossref: "Renvoi",
        pagebreak: "Saut de page",
    };
    item.appendChild(blockHeader(labels[b.type] || b.type, s, b, idx));
    const body = el("div", { class: "block-item-body" });

    if (b.type === "heading2") {
        body.appendChild(
            fieldText("Texte", b.text, (v) => {
                b.text = v;
                renderPreview();
            }),
        );
    } else if (b.type === "paragraph") {
        body.appendChild(
            fieldText(
                "Texte",
                b.text,
                (v) => {
                    b.text = v;
                    renderPreview();
                },
                true,
            ),
        );
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!b.italic;
        cb.addEventListener("change", (e) => {
            b.italic = e.target.checked;
            renderPreview();
        });
        body.appendChild(
            el(
                "label",
                {
                    style: "display:flex;gap:6px;align-items:center;font-weight:400;",
                },
                [cb, document.createTextNode("Italique")],
            ),
        );
    } else if (b.type === "bullets") {
        const list = el("div", { class: "bullets-list" });
        b.items.forEach((it, i) => {
            const rp = el("div", { class: "rowpair" });
            const inp = el("input", { type: "text", value: it });
            inp.addEventListener("input", (e) => {
                b.items[i] = e.target.value;
                renderPreview();
            });
            const del = el(
                "button",
                {
                    class: "icon-btn danger",
                    onclick: () => {
                        b.items.splice(i, 1);
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode("✕")],
            );
            rp.appendChild(inp);
            rp.appendChild(del);
            list.appendChild(rp);
        });
        body.appendChild(list);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-item-btn",
                    onclick: () => {
                        b.items.push("Nouveau point");
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode("+ puce")],
            ),
        );
    } else if (b.type === "callout") {
        const tagRow = el("div", { class: "tag-select" });
        Object.keys(TAG_META).forEach((tagKey) => {
            const active = b.tag === tagKey;
            const btn = el(
                "button",
                {
                    style: active ? `background:${TAG_META[tagKey].bg};` : "",
                    class: active ? "active" : "",
                    onclick: () => {
                        b.tag = tagKey;
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode(TAG_META[tagKey].label)],
            );
            tagRow.appendChild(btn);
        });
        body.appendChild(
            el("label", {}, [document.createTextNode("Type de tag")]),
        );
        body.appendChild(tagRow);
        body.appendChild(
            fieldText("Titre du callout", b.title, (v) => {
                b.title = v;
                renderPreview();
            }),
        );
        const paraWrap = el("div", {});
        b.paragraphs.forEach((p, i) => {
            const rowBlock = el("div", { class: "row-block" });
            const top = el("div", { class: "row-top" });
            top.appendChild(
                el(
                    "span",
                    {
                        style: "flex:1;font-size:11px;color:#999;font-weight:600;",
                    },
                    [document.createTextNode("Paragraphe " + (i + 1))],
                ),
            );
            top.appendChild(
                el(
                    "button",
                    {
                        class: "icon-btn danger",
                        title: "Supprimer le paragraphe",
                        onclick: () => {
                            b.paragraphs.splice(i, 1);
                            renderSidebar();
                            renderPreview();
                        },
                    },
                    [document.createTextNode("✕")],
                ),
            );
            rowBlock.appendChild(top);
            const ta = el("textarea", {
                class: "row-value",
                placeholder: "Texte du paragraphe…",
            });
            ta.value = p;
            ta.addEventListener("input", (e) => {
                b.paragraphs[i] = e.target.value;
                renderPreview();
            });
            rowBlock.appendChild(ta);
            paraWrap.appendChild(rowBlock);
        });
        body.appendChild(paraWrap);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-item-btn",
                    onclick: () => {
                        b.paragraphs.push("Nouveau paragraphe");
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode("+ paragraphe")],
            ),
        );
    } else if (b.type === "table") {
        const layoutRow = el("div", { class: "field" });
        layoutRow.appendChild(
            el("label", {}, [
                document.createTextNode("Disposition du tableau"),
            ]),
        );
        const sel = el("select", {
            onchange: (e) => {
                b.layout = e.target.value;
                renderSidebar();
                renderPreview();
            },
        });
        const options = [
            ["label-value", "Libellé + valeur (standard)"],
            ["badge-value", "Badge + valeur (échelle simple, 2 colonnes)"],
            [
                "badge-label-value",
                "Badge + libellé + valeur (échelle à 3 colonnes)",
            ],
        ];
        options.forEach(([v, label]) => {
            const o = el("option", { value: v }, [
                document.createTextNode(label),
            ]);
            if (b.layout === v) o.setAttribute("selected", "selected");
            sel.appendChild(o);
        });
        layoutRow.appendChild(sel);
        body.appendChild(layoutRow);

        const threeCol = b.layout === "badge-label-value";
        const badgeCol = b.layout === "badge-value" || threeCol;
        const rows = el("div", { class: "rows-list" });
        b.rows.forEach((r, i) => {
            const topFields = [
                {
                    key: "a",
                    placeholder: badgeCol ? "Badge" : "Libellé",
                    narrow: badgeCol,
                },
            ];
            if (threeCol)
                topFields.push({
                    key: "c",
                    placeholder: "Libellé",
                    narrow: false,
                });
            rows.appendChild(
                makeRowBlock(
                    r,
                    topFields,
                    "b",
                    () => renderPreview(),
                    () => {
                        b.rows.splice(i, 1);
                        renderSidebar();
                        renderPreview();
                    },
                ),
            );
        });
        body.appendChild(rows);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-row-btn",
                    onclick: () => {
                        b.rows.push({ a: "", b: "", c: "" });
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode("+ ligne")],
            ),
        );
    } else if (b.type === "card") {
        body.appendChild(
            fieldText("Badge (ex. HOOK 1)", b.badgeText, (v) => {
                b.badgeText = v;
                renderPreview();
            }),
        );
        body.appendChild(
            fieldText("Titre", b.title, (v) => {
                b.title = v;
                renderPreview();
            }),
        );
        body.appendChild(
            fieldText(
                "Accroche / description",
                b.pitch,
                (v) => {
                    b.pitch = v;
                    renderPreview();
                },
                true,
            ),
        );
        const rows = el("div", { class: "rows-list" });
        b.rows.forEach((r, i) => {
            rows.appendChild(
                makeRowBlock(
                    r,
                    [
                        {
                            key: "a",
                            placeholder: "Libellé",
                            narrow: false,
                        },
                    ],
                    "b",
                    () => renderPreview(),
                    () => {
                        b.rows.splice(i, 1);
                        renderSidebar();
                        renderPreview();
                    },
                ),
            );
        });
        body.appendChild(rows);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-row-btn",
                    onclick: () => {
                        b.rows.push({ a: "", b: "" });
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode("+ ligne")],
            ),
        );
    } else if (b.type === "crossref") {
        body.appendChild(
            fieldText("Texte du renvoi", b.text, (v) => {
                b.text = v;
                renderPreview();
            }),
        );
    } else if (b.type === "pagebreak") {
        body.appendChild(
            el("div", { style: "font-size:12px;color:#999;" }, [
                document.createTextNode(
                    "Force un saut de page à l'impression.",
                ),
            ]),
        );
    }

    item.appendChild(body);
    return item;
}

function renderSectionCard(s, idx) {
    const card = el("div", { class: "section-card" });
    const head = el("div", { class: "section-head" });
    const codeBadge = el(
        "span",
        {
            class: "code-badge",
            title: "Calculé automatiquement à partir du N° de dossier et de la position de la section",
        },
        [document.createTextNode(sectionCode(idx))],
    );
    const titleInput = el("input", {
        type: "text",
        value: s.title,
    });
    titleInput.addEventListener("input", (e) => {
        s.title = e.target.value;
        renderPreview();
    });
    head.appendChild(codeBadge);
    head.appendChild(titleInput);
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Monter la section",
                onclick: () => {
                    if (idx > 0) {
                        [doc.sections[idx - 1], doc.sections[idx]] = [
                            doc.sections[idx],
                            doc.sections[idx - 1],
                        ];
                        renderSidebar();
                        renderPreview();
                    }
                },
            },
            [document.createTextNode("↑")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Descendre la section",
                onclick: () => {
                    if (idx < doc.sections.length - 1) {
                        [doc.sections[idx + 1], doc.sections[idx]] = [
                            doc.sections[idx],
                            doc.sections[idx + 1],
                        ];
                        renderSidebar();
                        renderPreview();
                    }
                },
            },
            [document.createTextNode("↓")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer la section",
                onclick: () => {
                    doc.sections.splice(idx, 1);
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("✕")],
        ),
    );
    card.appendChild(head);

    const blockList = el("div", { class: "block-list" });
    s.blocks.forEach((b, bidx) =>
        blockList.appendChild(renderBlockEditor(s, b, bidx)),
    );
    card.appendChild(blockList);

    const menu = el("div", { class: "add-block-menu" });
    const types = [
        ["heading2", "+ Sous-titre"],
        ["paragraph", "+ Paragraphe"],
        ["bullets", "+ Liste"],
        ["callout", "+ Callout"],
        ["table", "+ Tableau"],
        ["card", "+ Fiche"],
        ["crossref", "+ Renvoi"],
        ["pagebreak", "+ Saut de page"],
    ];
    types.forEach(([t, label]) => {
        menu.appendChild(
            el(
                "button",
                {
                    onclick: () => {
                        s.blocks.push(newBlock(t));
                        renderSidebar();
                        renderPreview();
                    },
                },
                [document.createTextNode(label)],
            ),
        );
    });
    card.appendChild(menu);
    return card;
}

function renderSections(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Sections & contenu")]),
    );
    doc.sections.forEach((s, idx) =>
        box.appendChild(renderSectionCard(s, idx)),
    );
    box.appendChild(
        el(
            "button",
            {
                class: "add-section-btn",
                onclick: () => {
                    doc.sections.push(newSection());
                    renderSidebar();
                    renderPreview();
                },
            },
            [document.createTextNode("+ Ajouter une section")],
        ),
    );
    container.appendChild(box);
}

let registryEditMode = false;
async function removeRegistryEntry(idx) {
    const entry = registry[idx];
    if (!entry) return;
    if (
        !confirm(
            `Retirer « ${entry.title} » (${entry.hex}) du registre des couleurs ?`,
        )
    )
        return;
    registry.splice(idx, 1);
    await saveRegistry();
    renderSidebar();
}

function renderRegistryPanel(container) {
    const box = el("div", { class: "side-section" });
    const titleRow = el("div", {
        style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;",
    });
    titleRow.appendChild(
        el("h3", { style: "margin:0;" }, [
            document.createTextNode("Registre des couleurs (aperçu)"),
        ]),
    );
    titleRow.appendChild(
        el(
            "button",
            {
                class: "icon-btn" + (registryEditMode ? " active" : ""),
                title: "Modifier / retirer des couleurs",
                style: registryEditMode
                    ? "background:#eae6d8;color:#1a1a1a;"
                    : "",
                onclick: () => {
                    registryEditMode = !registryEditMode;
                    renderSidebar();
                },
            },
            [document.createTextNode("✎")],
        ),
    );
    box.appendChild(titleRow);
    const list = el("div", { class: "registry-list" });
    if (registry.length === 0) {
        list.appendChild(
            el("div", { style: "padding:8px;color:#999;font-size:11px;" }, [
                document.createTextNode(
                    "Aucune couleur enregistrée pour l'instant.",
                ),
            ]),
        );
    }
    registry.forEach((r, idx) => {
        const row = el("div", { class: "registry-row" });
        row.appendChild(
            el("span", {}, [
                el("span", {
                    class: "rc",
                    style: `background:${r.hex};`,
                }),
                document.createTextNode(r.title),
            ]),
        );
        const right = el("span", {
            style: "display:flex;align-items:center;gap:8px;",
        });
        right.appendChild(
            el(
                "span",
                {
                    style: "font-family:Consolas,monospace;color:#888;",
                },
                [document.createTextNode(r.hex)],
            ),
        );
        if (registryEditMode) {
            right.appendChild(
                el(
                    "button",
                    {
                        class: "icon-btn danger",
                        style: "width:20px;height:20px;font-size:11px;",
                        title: "Retirer du registre",
                        onclick: () => removeRegistryEntry(idx),
                    },
                    [document.createTextNode("✕")],
                ),
            );
        }
        row.appendChild(right);
        list.appendChild(row);
    });
    box.appendChild(list);
    container.appendChild(box);
}

function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";
    renderColorPicker(sidebar);
    renderDocSettings(sidebar);
    renderSections(sidebar);
    renderRegistryPanel(sidebar);
}

/* ---------- Export / Import JSON ---------- */
function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
function slugify(s) {
    return (
        (s || "document")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "document"
    );
}

document.getElementById("btn-export-json").addEventListener("click", () => {
    downloadFile(
        `dossier-${slugify(doc.cover.title)}.json`,
        JSON.stringify(doc, null, 2),
        "application/json",
    );
});
document.getElementById("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const imported = JSON.parse(reader.result);
            await releaseColorIfPristine(doc);
            colorMsg = null;
            doc = normalizeDoc(imported);
            proposals = [
                doc.color,
                ...generateProposals([...registryHexes(), doc.color], 4),
            ];
            await registerColor(doc.id, doc.color, doc.cover.title);
            renderSidebar();
            renderPreview();
        } catch (err) {
            alert("Fichier JSON invalide : " + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = "";
});
document.getElementById("btn-pdf").addEventListener("click", () => {
    window.print();
});
document.getElementById("btn-new").addEventListener("click", async () => {
    if (
        !confirm(
            "Créer un nouveau document ? Les modifications non exportées seront perdues.",
        )
    )
        return;
    await releaseColorIfPristine(doc);
    colorMsg = null;
    doc = defaultDocument();
    proposals = generateProposals(registryHexes(), 5);
    doc.color = proposals[0];
    await registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreview();
});

/* ---------- Modale registre ---------- */
function renderRegistryModalList() {
    const list = document.getElementById("registry-list-full");
    list.innerHTML = "";
    if (registry.length === 0) {
        list.innerHTML =
            '<div style="padding:10px;color:#999;font-size:12px;">Aucune couleur enregistrée.</div>';
    }
    registry.forEach((r, idx) => {
        const row = document.createElement("div");
        row.className = "registry-row";
        const left = document.createElement("span");
        left.innerHTML = `<span class="rc" style="background:${escapeHtml(r.hex)};"></span>${escapeHtml(r.title)}`;
        const right = document.createElement("span");
        right.style.cssText = "display:flex;align-items:center;gap:8px;";
        right.innerHTML = `<span style="font-family:Consolas,monospace;color:#888;">${escapeHtml(r.hex)}</span>`;
        if (registryEditMode) {
            const delBtn = document.createElement("button");
            delBtn.className = "icon-btn danger";
            delBtn.style.cssText = "width:20px;height:20px;font-size:11px;";
            delBtn.title = "Retirer du registre";
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", () =>
                removeRegistryEntry(idx).then(renderRegistryModalList),
            );
            right.appendChild(delBtn);
        }
        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
    });
}
function openRegistryModal() {
    renderRegistryModalList();
    document.getElementById("registry-modal").style.display = "flex";
}
document.getElementById("btn-modal-edit").addEventListener("click", () => {
    registryEditMode = !registryEditMode;
    renderRegistryModalList();
});
document
    .getElementById("btn-registry")
    .addEventListener("click", openRegistryModal);
document.getElementById("btn-registry-close").addEventListener("click", () => {
    document.getElementById("registry-modal").style.display = "none";
});
document.getElementById("btn-registry-export").addEventListener("click", () => {
    downloadFile(
        "registre-couleurs.json",
        JSON.stringify(registry, null, 2),
        "application/json",
    );
});
document.getElementById("registry-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const imported = JSON.parse(reader.result);
            if (!Array.isArray(imported))
                throw new Error("format invalide (liste attendue)");
            const byDocId = new Map(registry.map((r) => [r.docId, r]));
            sanitizeRegistry(imported).forEach((r) => byDocId.set(r.docId, r));
            registry = Array.from(byDocId.values());
            await saveRegistry();
            openRegistryModal();
            renderSidebar();
        } catch (err) {
            alert("Fichier de registre invalide : " + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = "";
});

/* ---------- Initialisation ---------- */
(async function init() {
    await loadRegistry();
    proposals = generateProposals(registryHexes(), 5);
    doc.color = proposals[0];
    await registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreview();
})();
