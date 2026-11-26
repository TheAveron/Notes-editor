/* Atelier de Dossiers — Point d'entrée : cycle de mise à jour, actions de la barre, initialisation. */

// Point unique de mise à jour après une modification du document.
//   structure: true → le panneau doit être reconstruit (élément ajouté, supprimé ou déplacé) ;
//   sinon seul l'aperçu est régénéré (frappe dans un champ, pour garder le focus).
function update({ structure = false } = {}) {
    if (structure) renderSidebar();
    renderPreview();
    if (historyRecord({ typing: !structure })) scheduleAutosave();
    refreshStatus();
}

// Remplace le document courant (import, nouveau document, chargement).
async function loadDocument(d, { exported = true } = {}) {
    await releaseColorIfPristine(doc);
    colorMsg = null;
    doc = d;
    await registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreview();
    historyReset();
    if (exported) markExported();
    scheduleAutosave();
    refreshStatus();
}

function renderSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = "";
    renderColorPicker(sidebar);
    renderDocSettings(sidebar);
    renderSections(sidebar);
    renderRegistryPanel(sidebar);
    markSidebarOverflow();
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
    markExported();
});
document.getElementById("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const imported = normalizeDoc(JSON.parse(reader.result));
            if (
                hasUnexportedChanges() &&
                !confirm(
                    "Le document actuel a des modifications non exportées. Les remplacer par le fichier importé ?",
                )
            )
                return;
            proposals = [
                imported.color,
                ...generateProposals([...registryHexes(), imported.color], 4),
            ];
            await loadDocument(imported);
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
        hasUnexportedChanges() &&
        !confirm(
            "Créer un nouveau document ? Les modifications non exportées seront perdues.",
        )
    )
        return;
    // La couleur du document vierge actuel est libérée avant de calculer les propositions.
    await releaseColorIfPristine(doc);
    const fresh = defaultDocument();
    proposals = generateProposals(registryHexes(), 5);
    fresh.color = proposals[0];
    await loadDocument(fresh);
});

/* ---------- Annuler / rétablir ---------- */
document.getElementById("btn-undo").addEventListener("click", undo);
document.getElementById("btn-redo").addEventListener("click", redo);
document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
    }
});

// Sans sauvegarde persistante, fermer l'onglet perdrait le travail : on prévient.
window.addEventListener("beforeunload", (e) => {
    if (storageIsPersistent && autosaveOk) return;
    if (!hasUnexportedChanges()) return;
    e.preventDefault();
    e.returnValue = "";
});

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

/* ---------- Initialisation ---------- */
(async function init() {
    await loadRegistry();
    // Reprend le document en cours lors de la dernière visite, s'il y en a un.
    const saved = await loadAutosave();
    let start;
    if (saved) {
        start = saved;
        proposals = [
            saved.color,
            ...generateProposals([...registryHexes(), saved.color], 4),
        ];
    } else {
        start = doc;
        proposals = generateProposals(registryHexes(), 5);
        start.color = proposals[0];
    }
    // Un document restauré n'est pas considéré comme exporté.
    await loadDocument(start, { exported: !saved });
})();
