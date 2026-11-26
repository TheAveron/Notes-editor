/* Atelier de Dossiers — L'éditeur branché sur l'archive.

   editorMode :
     "standalone" — dossier autonome (pas d'archive), enregistré dans le navigateur ;
     "dossier"    — un dossier de l'archive ; ses sections sont des entrées ;
     "entry"      — une entrée seule.
   Le document édité est la forme « résolue » (voir js/archive-model.js) ; il est
   redécoupé et enregistré dans l'archive après chaque modification. */

let editorMode = "standalone";

/* ---------- Ouverture ---------- */

function newEntryIdFor(title) {
    // Réserve aussi les entrées créées dans ce document mais pas encore enregistrées
    const reserved = new Set((doc.sections || []).map((s) => s._entry).filter(Boolean));
    return freeId("entrees", title || "entree", reserved);
}

// Couleur d'une entrée à l'écran : celle du premier dossier qui la contient
function entryColor(entryId) {
    const use = dossiersUsingEntry(entryId)[0];
    return (use && use.dossier.color) || "#2f6f5e";
}

async function openInEditor(d, mode) {
    await flushArchiveSave();
    editorMode = mode;
    colorMsg = null;
    doc = d;
    collapsedSections.clear();
    linkedBid = null;
    if (mode === "dossier") {
        proposals = [doc.color, ...generateProposals([...registryHexes(), doc.color], 4)];
        if (!archive.readOnly && !registry.some((r) => r.docId === doc.id))
            await registerColor(doc.id, doc.color, doc.cover.title);
    }
    document.body.dataset.editor = mode;
    renderSidebar();
    renderPreview();
    historyReset();
    refreshStatus();
}

async function openDossier(id) {
    const d = archive.dossiers.get(id);
    if (!d) return false;
    const resolved = normalizeDoc(ArchiveModel.resolveDossier(d, archiveStore()));
    await openInEditor(resolved, "dossier");
    return true;
}

async function openEntryEditor(id) {
    const e = archive.entries.get(id);
    if (!e) return false;
    const d = ArchiveModel.resolveEntry(e, archiveStore());
    d.color = entryColor(id);
    d.stampStyle = "accent";
    await openInEditor(d, "entry");
    return true;
}

/* ---------- Enregistrement ---------- */

let archiveSaving = null; // promesse en cours
let archiveSaveError = null;
let archiveDirty = false;

async function saveEditorToArchive() {
    if (editorMode === "standalone" || archive.readOnly) return true;
    archiveDirty = false;
    const run = async () => {
        if (editorMode === "dossier") {
            const out = ArchiveModel.decomposeDossier(doc, archiveStore(), newEntryIdFor);
            for (const b of out.blocks) await archivePut("blocs", b);
            for (const e of out.entries) await archivePut("entrees", e);
            await archivePut("dossiers", out.dossier);
        } else {
            const out = ArchiveModel.decomposeEntry(doc, archiveStore());
            for (const b of out.blocks) await archivePut("blocs", b);
            await archivePut("entrees", out.entry);
        }
    };
    archiveSaving = (archiveSaving || Promise.resolve()).then(run);
    try {
        await archiveSaving;
        archiveSaveError = null;
        return true;
    } catch (e) {
        archiveSaveError = e.message;
        archiveDirty = true;
        return false;
    } finally {
        refreshStatus();
    }
}

// Enregistre immédiatement ce qui est en attente (avant de changer de page)
async function flushArchiveSave() {
    if (editorMode === "standalone") return;
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
        await saveEditorToArchive();
    } else if (archiveSaving) await archiveSaving.catch(() => {});
}

/* ---------- Blocs partagés ---------- */

function sharedContent(b) {
    const o = ArchiveModel.stripInternal(b);
    delete o.id;
    delete o.name;
    return JSON.stringify(o);
}

// Un même bloc partagé peut apparaître plusieurs fois dans le document : la copie que
// l'on vient de modifier est recopiée dans les autres, pour qu'aucune ne l'écrase.
function syncSharedCopies() {
    const groups = new Map();
    doc.sections.forEach((s) =>
        s.blocks.forEach((b) => {
            if (!b._shared) return;
            if (!groups.has(b._shared)) groups.set(b._shared, []);
            groups.get(b._shared).push(b);
        }),
    );
    let changed = false;
    groups.forEach((copies, ref) => {
        if (copies.length < 2) return;
        const saved = archive.blocks.get(ref);
        const savedJson = saved ? sharedContent(saved) : null;
        const src = copies.find((c) => sharedContent(c) !== savedJson) || copies[0];
        const srcJson = sharedContent(src);
        copies.forEach((c) => {
            if (c === src || sharedContent(c) === srcJson) return;
            const keep = { id: c.id, _shared: c._shared, _sharedName: src._sharedName };
            Object.keys(c).forEach((k) => delete c[k]);
            Object.assign(c, JSON.parse(JSON.stringify(src)), keep);
            changed = true;
        });
    });
    if (changed) {
        const focus = rememberSidebarFocus();
        renderSidebar();
        restoreSidebarFocus(focus);
    }
}

function shareBlock(b) {
    const name = prompt(
        "Nom du bloc partagé (il pourra ensuite être inséré dans d'autres entrées) :",
        ArchiveModel.blockLabel(b),
    );
    if (!name) return;
    const reserved = new Set();
    doc.sections.forEach((s) => s.blocks.forEach((x) => x._shared && reserved.add(x._shared)));
    b._shared = freeId("blocs", name, reserved);
    b._sharedName = name;
    update({ structure: true });
}
function detachBlock(b) {
    delete b._shared;
    delete b._sharedName;
    b.id = uid();
    update({ structure: true });
}

// Copie d'un bloc partagé de la bibliothèque, prête à insérer dans le document
function sharedBlockForDoc(ref) {
    const sb = archive.blocks.get(ref);
    if (!sb) return null;
    const b = JSON.parse(JSON.stringify(sb));
    delete b.name;
    b.id = uid();
    b._shared = ref;
    b._sharedName = sb.name || "";
    return b;
}

// Section prête à insérer pour une entrée existante (identifiants rendus uniques)
function sectionForEntry(entryId) {
    const e = archive.entries.get(entryId);
    const sec = ArchiveModel.resolveEntry(e, archiveStore()).sections[0];
    const taken = new Set(doc.sections.flatMap((s) => s.blocks.map((b) => b.id)));
    sec.blocks.forEach((b) => {
        if (!taken.has(b.id)) return taken.add(b.id);
        if (!b._origId && !b._shared) b._origId = b.id;
        b.id = uid();
    });
    sec.id = uid();
    return sec;
}

/* ---------- Panneau « Entrée » ---------- */

function renderEntryPanel(container) {
    const box = el("div", { class: "side-section", id: "panel-cover" });
    const sec = doc.sections[0];
    const meta = archive.entries.get(sec._entry) || { kind: "autre", tags: [] };
    // kind et tags sont lus et écrits dans un brouillon gardé sur la section (_kind,
    // _tags) pour suivre l'historique ; ils sont reportés dans l'entrée à l'enregistrement.
    if (sec._kind === undefined) sec._kind = meta.kind || "autre";
    if (sec._tags === undefined) sec._tags = (meta.tags || []).slice();

    box.appendChild(el("h3", {}, [document.createTextNode("Entrée de l'archive")]));
    box.appendChild(
        fieldText("Titre", sec.title, (v) => {
            sec.title = v;
            update();
        }),
    );
    const kindRow = el("div", { class: "field" });
    kindRow.appendChild(el("label", {}, [document.createTextNode("Catégorie")]));
    const sel = el("select", {
        onchange: (e) => {
            sec._kind = e.target.value;
            update();
        },
    });
    ArchiveModel.KINDS.forEach(([k, label]) => {
        const o = el("option", { value: k }, [document.createTextNode(label)]);
        if (sec._kind === k) o.setAttribute("selected", "selected");
        sel.appendChild(o);
    });
    kindRow.appendChild(sel);
    box.appendChild(kindRow);
    box.appendChild(
        fieldText("Étiquettes (séparées par des virgules)", sec._tags.join(", "), (v) => {
            sec._tags = v
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
            update();
        }),
    );

    const uses = dossiersUsingEntry(sec._entry);
    const usage = el("div", { class: "entry-usage" });
    usage.appendChild(
        document.createTextNode(
            uses.length
                ? "Utilisée dans : "
                : "Cette entrée ne figure dans aucun dossier.",
        ),
    );
    uses.forEach(({ dossier, index }, i) => {
        if (i) usage.appendChild(document.createTextNode(", "));
        usage.appendChild(
            el("a", { href: `#/dossier/${dossier.id}` }, [
                document.createTextNode(
                    `${dossierTitle(dossier)} (${dossierPrefix(dossier)}-${String(index + 1).padStart(2, "0")})`,
                ),
            ]),
        );
    });
    box.appendChild(usage);
    container.appendChild(box);
}
