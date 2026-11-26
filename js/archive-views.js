/* Atelier de Dossiers — Pages de l'archive : accueil (recherche, entrées, dossiers, blocs
   partagés), page d'une entrée, page d'un bloc partagé. */

const KIND_LABEL = Object.fromEntries(ArchiveModel.KINDS);
const searchState = { q: "", kind: "", tag: "", orphan: false };

function archiveRoot() {
    return document.getElementById("archive-view");
}
function h(html) {
    archiveRoot().innerHTML = html;
    archiveRoot().scrollTop = 0;
}
const pad2 = (n) => String(n).padStart(2, "0");

function paletteStyle(color) {
    const pal = derivePalette(color || "#2f6f5e");
    return `--doc-accent:${pal.accent};--doc-ink:${pal.ink};--doc-inkmid:${pal.inkMid};--doc-card:${pal.card};`;
}
function kindChip(kind) {
    return `<span class="kind-chip kind-${escapeHtml(kind || "autre")}">${escapeHtml(KIND_LABEL[kind] || "Autre")}</span>`;
}
function tagChips(tags) {
    return (tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
}
function usesHtml(entryId) {
    const uses = dossiersUsingEntry(entryId);
    if (!uses.length) return `<span class="muted">Hors dossier</span>`;
    return uses
        .map(
            ({ dossier, index }) =>
                `<span class="use-chip" style="--chip:${escapeHtml(dossier.color || "#888")}">${escapeHtml(dossierTitle(dossier))} · ${escapeHtml(dossierPrefix(dossier))}-${pad2(index + 1)}</span>`,
        )
        .join(" ");
}
function allTags() {
    const set = new Set();
    archive.entries.forEach((e) => (e.tags || []).forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

/* ---------- Accueil ---------- */

function renderArchiveHome(tab) {
    const counts = {
        entrees: archive.entries.size,
        dossiers: archive.dossiers.size,
        blocs: archive.blocks.size,
    };
    const tabLink = (id, label, href) =>
        `<a class="tab${tab === id ? " active" : ""}" href="${href}">${label} <span class="count">${counts[id]}</span></a>`;
    const kindOptions = ArchiveModel.KINDS.map(
        ([k, l]) => `<option value="${k}"${searchState.kind === k ? " selected" : ""}>${escapeHtml(l)}</option>`,
    ).join("");
    const tagOptions = allTags()
        .map((t) => `<option${searchState.tag === t ? " selected" : ""}>${escapeHtml(t)}</option>`)
        .join("");
    h(`<div class="archive-page">
        <div class="archive-search">
            <input type="search" id="archive-q" placeholder="Rechercher dans toute l'archive (titres, étiquettes, contenu des blocs)…" value="${escapeHtml(searchState.q)}" autocomplete="off" />
        </div>
        <nav class="archive-tabs">
            ${tabLink("entrees", "Entrées", "#/")}
            ${tabLink("dossiers", "Dossiers", "#/dossiers")}
            ${tabLink("blocs", "Blocs partagés", "#/blocs")}
        </nav>
        <div class="archive-filters${tab === "entrees" ? "" : " hidden"}">
            <select id="f-kind"><option value="">Toutes catégories</option>${kindOptions}</select>
            <select id="f-tag"><option value="">Toutes étiquettes</option>${tagOptions}</select>
            <label><input type="checkbox" id="f-orphan"${searchState.orphan ? " checked" : ""} /> Hors dossier seulement</label>
        </div>
        <div id="archive-list"></div>
    </div>`);
    const q = document.getElementById("archive-q");
    q.addEventListener("input", () => {
        searchState.q = q.value;
        // Une recherche porte sur les entrées et leurs blocs
        if (tab !== "entrees" && q.value.trim()) location.hash = "#/";
        else renderArchiveList(tab);
    });
    document.getElementById("f-kind").addEventListener("change", (e) => {
        searchState.kind = e.target.value;
        renderArchiveList(tab);
    });
    document.getElementById("f-tag").addEventListener("change", (e) => {
        searchState.tag = e.target.value;
        renderArchiveList(tab);
    });
    document.getElementById("f-orphan").addEventListener("change", (e) => {
        searchState.orphan = e.target.checked;
        renderArchiveList(tab);
    });
    renderArchiveList(tab);
    if (searchState.q) {
        q.focus();
        q.setSelectionRange(q.value.length, q.value.length);
    }
}

function renderArchiveList(tab) {
    const list = document.getElementById("archive-list");
    if (tab === "dossiers") list.innerHTML = dossierListHtml();
    else if (tab === "blocs") list.innerHTML = blockListHtml();
    else list.innerHTML = entryListHtml();
}

function passesFilters(e) {
    if (searchState.kind && e.kind !== searchState.kind) return false;
    if (searchState.tag && !(e.tags || []).includes(searchState.tag)) return false;
    if (searchState.orphan && dossiersUsingEntry(e.id).length) return false;
    return true;
}

function entryCardHtml(e, extra = "") {
    const n = (e.blocks || []).length;
    return `<div class="entry-card">
        <a class="entry-card-title" href="#/entree/${e.id}">${escapeHtml(e.title || e.id)}</a>
        <div class="entry-card-meta">${kindChip(e.kind)}${tagChips(e.tags)}<span class="muted">${n} bloc${n > 1 ? "s" : ""}</span></div>
        <div class="entry-card-uses">${usesHtml(e.id)}</div>
        ${extra}
    </div>`;
}

// Extrait du texte autour du premier mot trouvé, mots recherchés surlignés
function snippet(text, words) {
    const flat = String(text || "").replace(/\s+/g, " ").trim();
    const norm = normalizeSearch(flat); // même longueur que flat (accents retirés un à un)
    let pos = -1;
    words.forEach((w) => {
        const i = norm.indexOf(w);
        if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    });
    const start = Math.max(0, pos - 60);
    const end = Math.min(flat.length, Math.max(pos, 0) + 160);
    const slice = flat.slice(start, end);
    const nslice = norm.slice(start, end);
    // Surlignage calculé sur le texte normalisé, appliqué au texte d'origine
    const marks = new Array(slice.length).fill(false);
    words.forEach((w) => {
        for (let i = nslice.indexOf(w); i >= 0; i = nslice.indexOf(w, i + 1))
            for (let k = i; k < i + w.length; k++) marks[k] = true;
    });
    let out = "";
    let open = false;
    for (let i = 0; i < slice.length; i++) {
        if (marks[i] && !open) (out += "<mark>"), (open = true);
        if (!marks[i] && open) (out += "</mark>"), (open = false);
        out += escapeHtml(slice[i]);
    }
    if (open) out += "</mark>";
    return (start > 0 ? "… " : "") + out + (end < flat.length ? " …" : "");
}

const BLOCK_TYPE_LABEL = {
    heading2: "Sous-titre",
    paragraph: "Paragraphe",
    bullets: "Liste",
    callout: "Callout",
    table: "Tableau",
    card: "Fiche",
    crossref: "Renvoi",
};
function blockAnchor(item) {
    return item._ref ? "partage-" + item._ref : item.id;
}

function entryListHtml() {
    const q = searchState.q.trim();
    if (q) {
        const words = normalizeSearch(q).split(/\s+/).filter(Boolean);
        const results = searchArchive(q).filter((r) => passesFilters(r.entry));
        if (!results.length) return `<p class="empty">Aucun résultat pour « ${escapeHtml(q)} ».</p>`;
        const nHits = results.reduce((n, r) => n + r.hits.length, 0);
        return (
            `<p class="muted result-count">${results.length} entrée${results.length > 1 ? "s" : ""}, ${nHits} bloc${nHits > 1 ? "s" : ""} correspondant${nHits > 1 ? "s" : ""}</p>` +
            results
                .map(({ entry, hits }) =>
                    entryCardHtml(
                        entry,
                        hits.length
                            ? `<ul class="hit-list">${hits
                                  .slice(0, 6)
                                  .map((b) => {
                                      const tag = b.type === "callout" ? tagStyle(b.tag).label : "";
                                      return `<li><a href="#/entree/${entry.id}/bloc/${encodeURIComponent(blockAnchor(b))}"><span class="hit-type">${escapeHtml(BLOCK_TYPE_LABEL[b.type] || b.type)}${tag ? " · " + escapeHtml(tag) : ""}${b._ref ? " · ⇄" : ""}</span>${snippet(ArchiveModel.blockText(b), words)}</a></li>`;
                                  })
                                  .join("")}${hits.length > 6 ? `<li class="muted">… et ${hits.length - 6} autre(s)</li>` : ""}</ul>`
                            : "",
                    ),
                )
                .join("")
        );
    }
    const entries = [...archive.entries.values()]
        .filter(passesFilters)
        .sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr"));
    if (!entries.length) return `<p class="empty">Aucune entrée.</p>`;
    return entries.map((e) => entryCardHtml(e)).join("");
}

function dossierListHtml() {
    const ds = [...archive.dossiers.values()].sort((a, b) =>
        dossierTitle(a).localeCompare(dossierTitle(b), "fr"),
    );
    if (!ds.length) return `<p class="empty">Aucun dossier.</p>`;
    return ds
        .map((d) => {
            const n = (d.sections || []).length;
            const sections = (d.sections || [])
                .map((s, i) => {
                    const e = archive.entries.get(s.entry);
                    return `<li><span class="code">${escapeHtml(dossierPrefix(d))}-${pad2(i + 1)}</span> ${
                        e
                            ? `<a href="#/entree/${e.id}">${escapeHtml(e.title)}</a>`
                            : `<span class="warn">entrée introuvable : ${escapeHtml(s.entry)}</span>`
                    }</li>`;
                })
                .join("");
            return `<div class="dossier-card" style="--chip:${escapeHtml(d.color || "#888")}">
                <div class="dossier-card-head">
                    <span class="color-dot"></span>
                    <a class="entry-card-title" href="#/dossier/${d.id}">${escapeHtml(dossierTitle(d))}</a>
                    <span class="muted">${escapeHtml(dossierPrefix(d))} · ${n} section${n > 1 ? "s" : ""}</span>
                    <span class="grow"></span>
                    <a class="btn-link" href="#/dossier/${d.id}">${archive.readOnly ? "Ouvrir" : "Ouvrir / modifier"}</a>
                    <button class="btn-link danger needs-write" data-delete-dossier="${d.id}">Supprimer</button>
                </div>
                <div class="muted">${escapeHtml((d.cover && d.cover.subtitle) || "")}</div>
                <ol class="dossier-sections">${sections}</ol>
            </div>`;
        })
        .join("");
}

function blockListHtml() {
    const bs = [...archive.blocks.values()].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, "fr"),
    );
    if (!bs.length)
        return `<p class="empty">Aucun bloc partagé pour l'instant. Dans l'éditeur d'une entrée, le bouton ⇄ d'un bloc le rend réutilisable dans d'autres entrées.</p>`;
    return bs
        .map((b) => {
            const users = entriesUsingBlock(b.id);
            return `<div class="entry-card">
                <a class="entry-card-title" href="#/bloc/${b.id}">⇄ ${escapeHtml(b.name || b.id)}</a>
                <div class="entry-card-meta"><span class="kind-chip">${escapeHtml(BLOCK_TYPE_LABEL[b.type] || b.type)}</span><span class="muted">utilisé dans ${users.length} entrée${users.length > 1 ? "s" : ""}</span></div>
                <div class="entry-card-uses">${users.map((e) => `<a href="#/entree/${e.id}">${escapeHtml(e.title)}</a>`).join(" · ")}</div>
            </div>`;
        })
        .join("");
}

/* ---------- Page d'une entrée ---------- */

function renderEntryPage(id, anchor) {
    const e = archive.entries.get(id);
    if (!e) return renderNotFound(`L'entrée « ${id} » n'existe pas.`);
    const uses = dossiersUsingEntry(id);
    const color = entryColor(id);
    const blocks = resolvedBlocksOf(e);
    const body = blocks
        .map((b) => {
            const html = b.type ? renderBlockHtml(b) : `<p class="warn">[Bloc partagé introuvable : ${escapeHtml(b._ref)}]</p>`;
            const shared = b._ref
                ? `<a class="shared-note" href="#/bloc/${b._ref}">⇄ Bloc partagé : ${escapeHtml(b.name || b._ref)}</a>`
                : "";
            return `<div class="read-block${b._ref ? " is-shared" : ""}" id="bloc-${escapeHtml(blockAnchor(b))}">${shared}${html}</div>`;
        })
        .join("");
    const dossierOptions = [...archive.dossiers.values()]
        .map((d) => `<option value="${d.id}">${escapeHtml(dossierTitle(d))}</option>`)
        .join("");
    h(`<div class="archive-page">
        <div class="crumbs"><a href="#/">Archive</a> › Entrée</div>
        <header class="entry-head">
            <div>${kindChip(e.kind)}${tagChips(e.tags)}</div>
            <h1>${escapeHtml(e.title || e.id)}</h1>
            <div class="entry-actions needs-write">
                <a class="btn" href="#/entree/${e.id}/modifier">✎ Modifier</a>
                <select id="add-to-dossier"><option value="">+ Ajouter à un dossier…</option>${dossierOptions}</select>
                <button class="btn danger" id="delete-entry"${uses.length ? ` disabled title="Retirez d'abord l'entrée des dossiers qui l'utilisent"` : ""}>Supprimer</button>
            </div>
            <div class="entry-uses">Dans les dossiers : ${
                uses.length
                    ? uses
                          .map(
                              ({ dossier, index }) =>
                                  `<a class="use-chip" style="--chip:${escapeHtml(dossier.color || "#888")}" href="#/dossier/${dossier.id}">${escapeHtml(dossierTitle(dossier))} · ${escapeHtml(dossierPrefix(dossier))}-${pad2(index + 1)}</a>`,
                          )
                          .join(" ")
                    : `<span class="muted">aucun</span>`
            }</div>
            <div class="muted file-path">archive/entrees/${escapeHtml(e.id)}.json</div>
        </header>
        <div class="page reading-page" style="${paletteStyle(color)}">${body || `<p class="muted">Entrée vide.</p>`}</div>
    </div>`);

    const add = document.getElementById("add-to-dossier");
    add.addEventListener("change", async () => {
        const d = archive.dossiers.get(add.value);
        if (!d) return;
        const copy = JSON.parse(JSON.stringify(d));
        copy.sections = [...(copy.sections || []), { id: uid(), entry: e.id }];
        await guarded(async () => {
            await archivePut("dossiers", copy);
            renderEntryPage(id);
        });
    });
    document.getElementById("delete-entry").addEventListener("click", async () => {
        if (!confirm(`Supprimer définitivement l'entrée « ${e.title} » de l'archive ?`)) return;
        await guarded(async () => {
            await archiveDelete("entrees", e.id);
            location.hash = "#/";
        });
    });
    if (anchor) {
        const t = document.getElementById("bloc-" + anchor);
        if (t) {
            t.scrollIntoView({ block: "center" });
            flash(t);
        }
    }
}

/* ---------- Page d'un bloc partagé ---------- */

function renderBlockPage(id) {
    const b = archive.blocks.get(id);
    if (!b) return renderNotFound(`Le bloc partagé « ${id} » n'existe pas.`);
    const users = entriesUsingBlock(id);
    h(`<div class="archive-page">
        <div class="crumbs"><a href="#/blocs">Archive › Blocs partagés</a></div>
        <header class="entry-head">
            <div><span class="kind-chip">${escapeHtml(BLOCK_TYPE_LABEL[b.type] || b.type)}</span></div>
            <h1>⇄ ${escapeHtml(b.name || b.id)}</h1>
            <div class="entry-actions needs-write">
                <button class="btn" id="rename-block">Renommer</button>
                <button class="btn danger" id="delete-block"${users.length ? ` disabled title="Bloc encore utilisé : détachez-le d'abord des entrées"` : ""}>Supprimer</button>
            </div>
            <div class="entry-uses">Utilisé dans : ${
                users.length
                    ? users.map((e) => `<a class="use-chip" href="#/entree/${e.id}">${escapeHtml(e.title)}</a>`).join(" ")
                    : `<span class="muted">aucune entrée</span>`
            }</div>
            <p class="muted">Pour modifier son contenu, ouvrez l'une de ces entrées en édition : le changement s'appliquera partout.</p>
            <div class="muted file-path">archive/blocs/${escapeHtml(b.id)}.json</div>
        </header>
        <div class="page reading-page" style="${paletteStyle(users[0] ? entryColor(users[0].id) : null)}">${renderBlockHtml(b)}</div>
    </div>`);
    document.getElementById("rename-block").addEventListener("click", async () => {
        const name = prompt("Nouveau nom du bloc partagé :", b.name || "");
        if (!name) return;
        await guarded(async () => {
            await archivePut("blocs", { ...b, name });
            renderBlockPage(id);
        });
    });
    document.getElementById("delete-block").addEventListener("click", async () => {
        if (!confirm(`Supprimer le bloc partagé « ${b.name} » ?`)) return;
        await guarded(async () => {
            await archiveDelete("blocs", id);
            location.hash = "#/blocs";
        });
    });
}

function renderNotFound(msg) {
    h(`<div class="archive-page"><div class="crumbs"><a href="#/">Archive</a></div><p class="empty">${escapeHtml(msg)}</p></div>`);
}

// Exécute une écriture dans l'archive en affichant l'erreur éventuelle
async function guarded(fn) {
    try {
        await fn();
    } catch (e) {
        alert("Impossible d'enregistrer dans l'archive : " + e.message);
    }
}

// Suppression d'un dossier depuis la liste (les entrées restent dans l'archive)
archiveRoot().addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-delete-dossier]");
    if (!btn) return;
    const d = archive.dossiers.get(btn.dataset.deleteDossier);
    if (!d) return;
    if (!confirm(`Supprimer le dossier « ${dossierTitle(d)} » ?\nSes ${(d.sections || []).length} entrées restent dans l'archive.`))
        return;
    await guarded(async () => {
        await archiveDelete("dossiers", d.id);
        registry = registry.filter((r) => r.docId !== d.id);
        await saveRegistry();
        renderArchiveHome("dossiers");
    });
});

/* ---------- Création et import ---------- */

async function createEntry() {
    const title = prompt("Titre de la nouvelle entrée :");
    if (!title || !title.trim()) return;
    const e = {
        id: freeId("entrees", title.trim()),
        title: title.trim(),
        kind: "autre",
        tags: [],
        blocks: [{ ...newBlock("paragraph"), text: "" }],
    };
    await guarded(async () => {
        await archivePut("entrees", e);
        location.hash = `#/entree/${e.id}/modifier`;
    });
}

async function createDossier() {
    const title = prompt("Titre du nouveau dossier :");
    if (!title || !title.trim()) return;
    const d = defaultDocument();
    const id = freeId("dossiers", title.trim());
    const color = generateProposals(registryHexes(), 1)[0];
    const dossier = {
        ...ArchiveModel.stripInternal(d),
        id,
        version: ArchiveModel.DOSSIER_VERSION,
        color,
        cover: { ...d.cover, title: title.trim() },
        footerBrand: title.trim().toUpperCase(),
        sections: [],
    };
    await guarded(async () => {
        await archivePut("dossiers", dossier);
        await registerColor(id, color, title.trim());
        location.hash = `#/dossier/${id}`;
    });
}

// Importe un dossier au format autonome (fichier exporté par l'éditeur ou documents/)
async function importDossierFile(file) {
    const text = await file.text();
    let raw;
    try {
        raw = normalizeDoc(JSON.parse(text));
    } catch (e) {
        return alert("Fichier JSON invalide : " + e.message);
    }
    const prev = doc;
    doc = raw; // docPrefix() lit le document courant
    const prefix = docPrefix();
    doc = prev;
    const res = ArchiveModel.importStandalone(
        raw,
        (col, id) => archive[COLLECTION_MAP[col]].has(id),
        { prefix },
    );
    await guarded(async () => {
        for (const e of res.entries) await archivePut("entrees", e);
        await archivePut("dossiers", res.dossier);
        await registerColor(res.dossier.id, res.dossier.color, raw.cover.title);
        alert(`Dossier importé : ${res.entries.length} entrées ajoutées à l'archive.`);
        location.hash = `#/dossier/${res.dossier.id}`;
    });
}
