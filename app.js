/* ============================================================
   ATELIER DE DOSSIERS — logique principale
   Aucune dépendance externe. Stockage via window.storage (si présent,
   ex. Claude Artifacts) avec repli automatique sur un registre en mémoire.
   ============================================================ */

/* ---------- Utilitaires couleur ---------- */
function clampPct(v) {
    return Math.max(0, Math.min(100, v));
}

function hexToHsl(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3)
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
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
    return /^#?[0-9a-fA-F]{6}$/.test(hex);
}
function normalizeHex(hex) {
    hex = hex.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    return hex.toLowerCase();
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
    hex = hex.replace("#", "");
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
            usedHexes.some((u) => colorDistance(hex, u) < 60) ||
            proposals.some((p) => colorDistance(hex, p) < 45);
        if (!tooClose) proposals.push(hex);
    }
    while (proposals.length < count) {
        proposals.push(hslToHex(Math.random() * 360, 50, 38));
    }
    return proposals;
}

/* ---------- Stockage ----------
   Ordre de préférence : window.storage (Claude Artifacts) → localStorage → mémoire. */
const hasStorage =
    typeof window !== "undefined" &&
    window.storage &&
    typeof window.storage.get === "function";
const STORAGE_PREFIX = "atelier-dossiers:";
function getLocalStorage() {
    try {
        const t = "__atelier_test__";
        window.localStorage.setItem(t, t);
        window.localStorage.removeItem(t);
        return window.localStorage;
    } catch (e) {
        return null; // fichier ouvert en file://, navigation privée, quota…
    }
}
const localStore = getLocalStorage();
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
    if (localStore) {
        try {
            const v = localStore.getItem(STORAGE_PREFIX + key);
            return v ? JSON.parse(v) : null;
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
    if (localStore) {
        try {
            localStore.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
            return;
        } catch (e) {
            /* fall through */
        }
    }
    memoryStore[key] = value;
}

/* ---------- Registre des couleurs ---------- */
let registry = []; // [{hex, title, docId}]
// Ne garde que les entrées valides (couleur hexadécimale, id de document) et les normalise.
function sanitizeRegistry(list) {
    if (!Array.isArray(list)) return [];
    return list
        .filter(
            (r) =>
                r &&
                typeof r.docId === "string" &&
                r.docId &&
                isValidHex(String(r.hex ?? "")),
        )
        .map((r) => ({
            hex: normalizeHex(String(r.hex)),
            title: String(r.title ?? "(sans titre)"),
            docId: r.docId,
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

/* ---------- Modèle de document ---------- */
function uid() {
    const r =
        typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10);
    return "id_" + r;
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
function dossierNumber() {
    const row =
        doc.cover.meta.find((m) =>
            /dossier|n[°o]\s*de|code/i.test(m.a || ""),
        ) || doc.cover.meta[0];
    return row && row.b ? row.b.trim() : "";
}
function docPrefix() {
    const prefix = dossierNumber().split("-")[0].trim().toUpperCase();
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

// Compatibilité : les documents exportés avant l'ajout du mode "3 colonnes" utilisaient un
// booléen `badge` au lieu du champ `layout`. On les met à niveau silencieusement à l'ouverture.
function migrateDoc(d) {
    (d.sections || []).forEach((s) => {
        (s.blocks || []).forEach((b) => {
            if (b.type === "table") {
                if (!b.layout) {
                    b.layout = b.badge ? "badge-value" : "label-value";
                }
                delete b.badge;
                b.rows = (b.rows || []).map((r) => ({
                    a: r.a || "",
                    b: r.b || "",
                    c: r.c || "",
                }));
            }
        });
    });
    return d;
}
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
function asRows(rows, withC) {
    return (Array.isArray(rows) ? rows : []).map((r) => {
        const row = { a: String(r?.a ?? ""), b: String(r?.b ?? "") };
        if (withC) row.c = String(r?.c ?? "");
        return row;
    });
}
// Complète/répare un bloc importé pour que le rendu ne puisse pas planter.
function normalizeBlock(b) {
    const out = { ...newBlock(b.type), ...b, type: b.type };
    out.id = typeof b.id === "string" && b.id ? b.id : uid();
    if (out.type === "bullets") {
        out.items = (Array.isArray(b.items) ? b.items : []).map(String);
    } else if (out.type === "callout") {
        out.tag = TAG_META[b.tag] ? b.tag : "confirme";
        out.paragraphs = (Array.isArray(b.paragraphs) ? b.paragraphs : []).map(
            String,
        );
    } else if (out.type === "table") {
        out.rows = asRows(b.rows, true);
    } else if (out.type === "card") {
        out.rows = asRows(b.rows, false);
        if (isValidHex(String(b.accent ?? "")))
            out.accent = normalizeHex(String(b.accent));
        else delete out.accent;
    }
    return out;
}
// Fusionne un JSON importé avec un document par défaut : champs manquants, types invalides,
// couleurs non hexadécimales et ids dupliqués sont corrigés avant tout rendu.
function normalizeDoc(raw) {
    const base = defaultDocument();
    const d = raw && typeof raw === "object" ? raw : {};
    const cover = { ...base.cover, ...(d.cover || {}) };
    cover.meta = Array.isArray(cover.meta)
        ? cover.meta.map((m) => ({
              a: String(m?.a ?? ""),
              b: String(m?.b ?? ""),
          }))
        : base.cover.meta;
    const seen = new Set();
    const sections = (Array.isArray(d.sections) ? d.sections : []).map((s) => {
        let id = typeof s?.id === "string" && s.id ? s.id : uid();
        while (seen.has(id)) id = uid();
        seen.add(id);
        return {
            id,
            title: String(s?.title ?? ""),
            blocks: (Array.isArray(s?.blocks) ? s.blocks : [])
                .filter((b) => b && BLOCK_TYPES.includes(b.type))
                .map(normalizeBlock),
        };
    });
    return migrateDoc({
        id: typeof d.id === "string" && d.id ? d.id : uid(),
        color: isValidHex(String(d.color ?? ""))
            ? normalizeHex(String(d.color))
            : base.color,
        stampStyle: d.stampStyle === "red" ? "red" : "accent",
        cover,
        footerBrand:
            typeof d.footerBrand === "string"
                ? d.footerBrand
                : base.footerBrand,
        noteUsage: { ...base.noteUsage, ...(d.noteUsage || {}) },
        sections: sections.length ? sections : [newSection()],
    });
}
function defaultDocument() {
    return {
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

let doc = defaultDocument();
let selectedSwatchIdx = 0;
let proposals = [];

/* ---------- Rendu : PREVIEW ---------- */
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

function renderBlockHtml(b) {
    switch (b.type) {
        case "heading2":
            return `<div class="sec-h2">${escapeHtml(b.text)}</div>`;
        case "paragraph":
            return `<p class="p-body${b.italic ? " italic" : ""}">${nl2p(b.text)}</p>`;
        case "bullets":
            return `<ul class="bullets">${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        case "callout": {
            const tag = TAG_META[b.tag] ? b.tag : "confirme";
            const meta = TAG_META[tag];
            return `<div class="callout" style="border-left-color:${CALLOUT_BORDER[tag]};background:${CALLOUT_BG[tag]};">
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
        case "card": {
            // Couleur d'accent facultative (ex. paliers/degrés de gravité) ; sinon style "hook" par défaut.
            const acc = isValidHex(String(b.accent ?? ""))
                ? normalizeHex(String(b.accent))
                : null;
            const cardStyle = acc
                ? ` style="border-left-color:${acc};background:${derivePalette(acc).accentBg};"`
                : "";
            const headStyle = acc ? ` style="color:${acc};"` : "";
            return `<div class="card"${cardStyle}>
        <div class="card-header">
        <div class="chead"${headStyle}>${escapeHtml(b.badgeText)}</div>
        <div class="dot-separator">·</div>
        <div class="ctitle2">${escapeHtml(b.title)}</div>
        </div>
        <p>${escapeHtml(b.pitch)}</p>
        <table>${b.rows.map((r) => `<tr><td>${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>
      </div>`;
        }
        case "crossref":
            return `<div class="crossref"><b>→ RENVOI</b> &nbsp;${escapeHtml(b.text)}</div>`;
        default:
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

// Les modifications arrivent à chaque frappe : on regroupe les rendus en un seul par frame
// et on planifie la sauvegarde automatique.
let previewScheduled = false;
function renderPreview() {
    scheduleAutosave();
    if (previewScheduled) return;
    previewScheduled = true;
    requestAnimationFrame(() => {
        previewScheduled = false;
        renderPreviewNow();
    });
}
// Signale (cadre rouge à l'écran) les pages dont le contenu dépasse la hauteur d'une feuille A4.
function markOverflowPages() {
    const limit = (297 / 25.4) * 96; // A4 en pixels CSS
    document.querySelectorAll("#preview .page").forEach((p) => {
        const over = p.scrollHeight > limit + 2;
        p.classList.toggle("page-overflow", over);
        if (over)
            p.dataset.overflow =
                "Contenu trop long : la page déborde (ajoutez un saut de page)";
        else delete p.dataset.overflow;
    });
}
function renderPreviewNow() {
    const pal = derivePalette(doc.color);
    const stampColor = doc.stampStyle === "red" ? FIXED.red : pal.accent;
    const stampBg = doc.stampStyle === "red" ? FIXED.redBg : pal.accentBg;
    const styleVars = `--doc-accent:${pal.accent};--doc-ink:${pal.ink};--doc-inkmid:${pal.inkMid};--doc-card:${pal.card};--stamp-color:${stampColor};--stamp-bg:${stampBg};`;

    const header = () =>
        `<div class="doc-header"><span>DOSSIER ${escapeHtml(dossierNumber())}</span><span>${escapeHtml(doc.footerBrand)}</span></div>`;
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
            const meta = TAG_META[tag];
            note += `<div class="callout" style="border-left-color:${CALLOUT_BORDER[tag]};background:${CALLOUT_BG[tag]};">
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

    // Sections de contenu (avec support des pagebreak)
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
    markOverflowPages();
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
    if (attrs && attrs.title && !attrs["aria-label"])
        e.setAttribute("aria-label", attrs.title);
    (children || []).forEach((c) => c && e.appendChild(c));
    return e;
}

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
        const sw = el("button", {
            type: "button",
            class: "swatch" + (isSelected ? " selected" : ""),
            title: "Choisir la couleur " + hex,
            "aria-pressed": String(isSelected),
            onclick: () => selectColor(hex),
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
                    proposals = generateProposals(
                        registryHexes().filter((h) => h !== doc.color),
                        5,
                    );
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
    const msg = el("div", {});
    function tryCustom(val) {
        if (!isValidHex(val)) {
            msg.className = "hex-warning";
            msg.textContent = "Code hexadécimal invalide.";
            return;
        }
        const norm = normalizeHex(val);
        const clash = registry.find(
            (r) => r.docId !== doc.id && normalizeHex(r.hex) === norm,
        );
        if (clash) {
            msg.className = "hex-warning";
            msg.textContent = `Déjà utilisée par « ${clash.title} ».`;
            return;
        }
        msg.className = "hex-ok";
        msg.textContent = "Couleur disponible ✓";
        colorInput.value = norm;
        selectColor(norm);
    }
    // Pendant le glissement dans le sélecteur natif, on ne reconstruit pas la sidebar
    // (sinon le sélecteur est détruit en cours d'usage) : aperçu seul, validation au "change".
    colorInput.addEventListener("input", () => {
        const norm = normalizeHex(colorInput.value);
        textInput.value = norm;
        const clash = registry.find(
            (r) => r.docId !== doc.id && normalizeHex(r.hex) === norm,
        );
        if (clash) {
            msg.className = "hex-warning";
            msg.textContent = `Déjà utilisée par « ${clash.title} ».`;
            return;
        }
        msg.className = "hex-ok";
        msg.textContent = "Couleur disponible ✓";
        doc.color = norm;
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
            renderPreview();
            syncRegistryTitle();
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
                title: "Supprimer la ligne",
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
                    title: "Supprimer la puce",
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
        body.appendChild(
            fieldText(
                "Couleur d'accent (hex, facultatif)",
                b.accent || "",
                (v) => {
                    b.accent = isValidHex(v) ? normalizeHex(v) : "";
                    renderPreview();
                },
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

// Garde le titre affiché dans le registre aligné sur le titre du document en cours d'édition.
let registryTitleTimer;
function syncRegistryTitle() {
    clearTimeout(registryTitleTimer);
    registryTitleTimer = setTimeout(async () => {
        const entry = registry.find((r) => r.docId === doc.id);
        const title = doc.cover.title || "(sans titre)";
        if (!entry || entry.title === title) return;
        entry.title = title;
        await saveRegistry();
        const old = document.querySelector("#sidebar .registry-panel");
        if (old) {
            const tmp = document.createElement("div");
            renderRegistryPanel(tmp);
            old.replaceWith(tmp.firstChild);
        }
    }, 400);
}
function renderRegistryPanel(container) {
    const box = el("div", { class: "side-section registry-panel" });
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
    const scrollTop = sidebar.scrollTop; // évite de remonter en haut à chaque ajout/suppression
    sidebar.innerHTML = "";
    renderColorPicker(sidebar);
    renderDocSettings(sidebar);
    renderSections(sidebar);
    renderRegistryPanel(sidebar);
    sidebar.scrollTop = scrollTop;
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
            if (!imported || !Array.isArray(imported.sections))
                throw new Error("format invalide");
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
    renderPreviewNow(); // s'assure que l'aperçu est à jour avant impression
    window.print();
});
document.getElementById("btn-new").addEventListener("click", async () => {
    if (
        !confirm(
            "Créer un nouveau document ? Les modifications non exportées seront perdues.",
        )
    )
        return;
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
function closeRegistryModal() {
    document.getElementById("registry-modal").style.display = "none";
}
document
    .getElementById("btn-registry-close")
    .addEventListener("click", closeRegistryModal);
document.getElementById("registry-modal").addEventListener("click", (e) => {
    if (e.target.id === "registry-modal") closeRegistryModal(); // clic sur le fond
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRegistryModal();
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

/* ---------- Sauvegarde automatique du document en cours ---------- */
let autosaveTimer;
function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => storeSet("current-doc", doc), 500);
}
// Dernière chance avant fermeture de l'onglet (localStorage est synchrone).
window.addEventListener("pagehide", () => {
    clearTimeout(autosaveTimer);
    storeSet("current-doc", doc);
});

/* ---------- Initialisation ---------- */
(async function init() {
    await loadRegistry();
    const saved = await storeGet("current-doc");
    if (saved && Array.isArray(saved.sections)) {
        // Reprise du document en cours : on garde sa couleur et son id.
        doc = normalizeDoc(saved);
        proposals = [
            doc.color,
            ...generateProposals([...registryHexes(), doc.color], 4),
        ];
    } else {
        proposals = generateProposals(registryHexes(), 5);
        doc.color = proposals[0];
    }
    await registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreviewNow();
})();
