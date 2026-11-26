/* Atelier de Dossiers — Modèle de document : création, codes de section, validation des imports. */

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
                tone: "hook",
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
            return { ...base, repeatTitle: false };
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
                // "hook" : sarcelle des hooks MJ (historique) ; "accent" : couleur du document
                tone: b.tone === "accent" ? "accent" : "hook",
                badgeText: asStr(b.badgeText),
                title: asStr(b.title),
                pitch: asStr(b.pitch),
                rows: asRows(b.rows, ["a", "b"]),
            };
        case "pagebreak":
            return { id, type: b.type, repeatTitle: !!b.repeatTitle };
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
let proposals = [];
