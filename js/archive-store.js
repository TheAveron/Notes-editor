/* Atelier de Dossiers — Accès à l'archive depuis le navigateur.

   Trois situations :
   - "server" : l'application est servie par server.js ; lecture et écriture via l'API ;
   - "static" : hébergement statique (GitHub Pages…) ; l'archive est lue depuis
                archive/index.json et ses fichiers, en lecture seule ;
   - "none"   : aucune archive accessible (fichier ouvert depuis le disque) ; l'éditeur
                fonctionne alors comme éditeur de dossier autonome. */

const archive = {
    mode: "none",
    readOnly: true,
    entries: new Map(), // id → entrée
    blocks: new Map(), // id → bloc partagé
    dossiers: new Map(), // id → dossier
    colors: [],
};

// Pour ArchiveModel : les collections sous la forme attendue par resolve/decompose
function archiveStore() {
    return { entries: archive.entries, blocks: archive.blocks };
}

const COLLECTION_MAP = {
    entrees: "entries",
    blocs: "blocks",
    dossiers: "dossiers",
};

function fillArchive(data) {
    archive.entries = new Map((data.entrees || []).map((x) => [x.id, x]));
    archive.blocks = new Map((data.blocs || []).map((x) => [x.id, x]));
    archive.dossiers = new Map((data.dossiers || []).map((x) => [x.id, x]));
    archive.colors = Array.isArray(data.couleurs) ? data.couleurs : [];
}

async function loadArchive() {
    try {
        const r = await fetch("api/archive", { cache: "no-store" });
        if (r.ok) {
            fillArchive(await r.json());
            archive.mode = "server";
            archive.readOnly = false;
            return;
        }
    } catch (e) {
        /* pas de serveur */
    }
    try {
        const r = await fetch("archive/index.json", { cache: "no-store" });
        if (r.ok) {
            const index = await r.json();
            const data = {};
            for (const col of ArchiveModel.COLLECTIONS) {
                data[col] = await Promise.all(
                    (index[col] || []).map((id) =>
                        fetch(`archive/${col}/${encodeURIComponent(id)}.json`).then((x) =>
                            x.ok ? x.json() : null,
                        ),
                    ),
                ).then((l) => l.filter(Boolean));
            }
            data.couleurs = await fetch("archive/couleurs.json")
                .then((x) => (x.ok ? x.json() : []))
                .catch(() => []);
            fillArchive(data);
            archive.mode = "static";
            archive.readOnly = true;
            return;
        }
    } catch (e) {
        /* pas d'archive statique */
    }
    archive.mode = "none";
    archive.readOnly = true;
}

async function apiCall(method, url, body) {
    const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-Atelier": "1" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
        let msg = r.statusText;
        try {
            msg = (await r.json()).error || msg;
        } catch (e) {
            /* corps non JSON */
        }
        throw new Error(msg);
    }
}

// Enregistre un élément s'il a changé ; met à jour la copie locale.
async function archivePut(col, item) {
    const map = archive[COLLECTION_MAP[col]];
    const before = map.get(item.id);
    if (before && JSON.stringify(before) === JSON.stringify(item)) return false;
    if (archive.readOnly) throw new Error("archive en lecture seule");
    await apiCall("PUT", `api/${col}/${encodeURIComponent(item.id)}`, item);
    map.set(item.id, JSON.parse(JSON.stringify(item)));
    return true;
}
async function archiveDelete(col, id) {
    if (archive.readOnly) throw new Error("archive en lecture seule");
    await apiCall("DELETE", `api/${col}/${encodeURIComponent(id)}`);
    archive[COLLECTION_MAP[col]].delete(id);
}
async function archivePutColors(list) {
    if (archive.readOnly) return;
    await apiCall("PUT", "api/couleurs", list);
    archive.colors = list;
}

// Identifiant libre dans une collection (en tenant compte d'identifiants réservés)
function freeId(col, base, reserved) {
    const map = archive[COLLECTION_MAP[col]];
    return ArchiveModel.uniqueId(base, (id) => map.has(id) || (reserved && reserved.has(id)));
}

/* ---------- Relations ---------- */

// Dossiers (et positions) où figure une entrée
function dossiersUsingEntry(entryId) {
    const out = [];
    archive.dossiers.forEach((d) =>
        (d.sections || []).forEach((s, i) => {
            if (s.entry === entryId) out.push({ dossier: d, index: i });
        }),
    );
    return out;
}
// Entrées qui utilisent un bloc partagé
function entriesUsingBlock(blockId) {
    const out = [];
    archive.entries.forEach((e) => {
        if ((e.blocks || []).some((b) => b.ref === blockId)) out.push(e);
    });
    return out;
}

// Préfixe des codes de section d'un dossier (même règle que docPrefix)
function dossierPrefix(d) {
    const meta = (d.cover && d.cover.meta) || [];
    const row = meta.find((m) => /dossier|n[°o]\s*de|code/i.test(m.a || "")) || meta[0];
    const p = ((row && row.b) || "").trim().split("-")[0].trim().toUpperCase();
    return p || "DOC";
}
function dossierTitle(d) {
    return (d.cover && d.cover.title) || d.id;
}
// N° de dossier (« CEL-VC-001 ») → identifiant du dossier
function dossierNumberIndex() {
    const idx = new Map();
    archive.dossiers.forEach((d) => {
        const meta = (d.cover && d.cover.meta) || [];
        const row = meta.find((m) => /dossier|n[°o]\s*de|code/i.test(m.a || "")) || meta[0];
        const num = ((row && row.b) || "").trim().toUpperCase();
        if (num) idx.set(num, d.id);
    });
    return idx;
}
// Code « GRD-03 » → entrée, pour tous les dossiers de l'archive
function codeIndex() {
    const idx = new Map();
    archive.dossiers.forEach((d) => {
        const p = dossierPrefix(d);
        (d.sections || []).forEach((s, i) =>
            idx.set(`${p}-${String(i + 1).padStart(2, "0")}`, { entry: s.entry, dossier: d.id }),
        );
    });
    return idx;
}

/* ---------- Recherche ---------- */

function normalizeSearch(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}
function resolvedBlocksOf(entry) {
    return (entry.blocks || []).map((item) =>
        item.ref ? { ...(archive.blocks.get(item.ref) || {}), _ref: item.ref } : item,
    );
}

// Résultats : entrées dont l'ensemble du texte contient tous les mots, avec les blocs
// qui contiennent au moins un mot (chaque information est accessible individuellement).
function searchArchive(query) {
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const kindLabel = Object.fromEntries(ArchiveModel.KINDS);
    const results = [];
    archive.entries.forEach((e) => {
        const blocks = resolvedBlocksOf(e);
        const head = normalizeSearch([e.title, kindLabel[e.kind], ...(e.tags || [])].join(" "));
        const texts = blocks.map((b) => normalizeSearch(ArchiveModel.blockText(b)));
        const all = head + " " + texts.join(" ");
        if (!words.every((w) => all.includes(w))) return;
        const hits = [];
        blocks.forEach((b, i) => {
            if (words.some((w) => texts[i].includes(w))) hits.push(b);
        });
        const score =
            words.filter((w) => normalizeSearch(e.title).includes(w)).length * 10 + hits.length;
        results.push({ entry: e, hits, score });
    });
    return results.sort(
        (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "fr"),
    );
}
