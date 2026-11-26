/* Atelier de Dossiers — Point d'entrée : cycle de mise à jour, actions de la barre, initialisation. */

// Point unique de mise à jour après une modification du document.
//   structure: true → le panneau doit être reconstruit (élément ajouté, supprimé ou déplacé) ;
//   sinon seul l'aperçu est régénéré (frappe dans un champ, pour garder le focus).
function update({ structure = false } = {}) {
    if (structure) renderSidebar();
    renderPreview();
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
            update({ structure: true });
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
    update({ structure: true });
});

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
    update({ structure: true });
})();
