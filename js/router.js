/* Atelier de Dossiers — Navigation et démarrage.

   Adresses (partie après #) :
     /                         accueil de l'archive : entrées, recherche
     /dossiers, /blocs         listes des dossiers et des blocs partagés
     /entree/<id>              lecture d'une entrée
     /entree/<id>/bloc/<bloc>  lecture d'une entrée, positionnée sur un bloc
     /entree/<id>/modifier     édition d'une entrée
     /bloc/<id>                bloc partagé
     /dossier/<id>             édition (ou lecture) d'un dossier, aperçu paginé, PDF
   Sans archive accessible, l'application reste l'éditeur de dossier autonome. */

function showView(view) {
    currentView = view;
    document.body.dataset.view = view;
    refreshStatus();
}

async function route() {
    const parts = (location.hash || "#/")
        .replace(/^#\/?/, "")
        .split("/")
        .filter(Boolean)
        .map((p) => {
            try {
                return decodeURIComponent(p);
            } catch (e) {
                return p;
            }
        });
    const [kind, id, sub, arg] = parts;

    if (kind === "dossier" && id) {
        if (currentView === "editor" && editorMode === "dossier" && doc.id === id) return;
        if (await openDossier(id)) return showView("editor");
        return showArchivePage(() => renderNotFound(`Le dossier « ${id} » n'existe pas.`));
    }
    if (kind === "entree" && id && sub === "modifier") {
        if (archive.readOnly) return void (location.hash = `#/entree/${id}`);
        if (currentView === "editor" && editorMode === "entry" && doc.id === id) return;
        if (await openEntryEditor(id)) {
            document.getElementById("btn-done").href = `#/entree/${id}`;
            return showView("editor");
        }
        return showArchivePage(() => renderNotFound(`L'entrée « ${id} » n'existe pas.`));
    }
    if (kind === "entree" && id) return showArchivePage(() => renderEntryPage(id, sub === "bloc" ? arg : null));
    if (kind === "bloc" && id) return showArchivePage(() => renderBlockPage(id));
    if (kind === "dossiers") return showArchivePage(() => renderArchiveHome("dossiers"));
    if (kind === "blocs") return showArchivePage(() => renderArchiveHome("blocs"));
    return showArchivePage(() => renderArchiveHome("entrees"));
}

// Quitte l'éditeur (en enregistrant) et affiche une page de l'archive
async function showArchivePage(render) {
    await flushArchiveSave();
    richLinkMode = "archive";
    codeIndexCache = null;
    numberIndexCache = null;
    showView("archive");
    render();
}

/* ---------- Actions de l'archive ---------- */
document.getElementById("btn-new-entry").addEventListener("click", createEntry);
document.getElementById("btn-new-dossier").addEventListener("click", createDossier);
document.getElementById("archive-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await importDossierFile(file);
});

/* ---------- Démarrage ---------- */
(async function init() {
    await loadArchive();
    document.body.dataset.archive = archive.mode;
    document.body.classList.toggle("read-only", archive.mode === "static");
    await loadRegistry();
    if (archive.mode === "none") {
        showView("editor");
        await startStandalone();
        return;
    }
    // Ne pas perdre une modification en fermant l'onglet pendant l'enregistrement
    window.addEventListener("beforeunload", (e) => {
        if (currentView === "editor" && (archiveDirty || autosaveTimer)) {
            e.preventDefault();
            e.returnValue = "";
        }
    });
    window.addEventListener("hashchange", route);
    await route();
})();
