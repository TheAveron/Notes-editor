/* Atelier de Dossiers — Historique (annuler / rétablir) et sauvegarde automatique. */

const HISTORY_LIMIT = 200;
// Les frappes successives dans un champ sont regroupées en une seule étape
// tant qu'elles sont espacées de moins de ce délai.
const TYPING_GROUP_MS = 800;

let undoStack = []; // instantanés JSON, du plus ancien au plus récent
let redoStack = [];
let lastSnapshot = null; // JSON du document après la dernière étape enregistrée
let typingGroupOpen = false;
let typingTimer = null;

function closeTypingGroup() {
    typingGroupOpen = false;
    clearTimeout(typingTimer);
}

// Repart d'un historique vide (nouveau document, import, chargement).
function historyReset() {
    closeTypingGroup();
    undoStack = [];
    redoStack = [];
    lastSnapshot = JSON.stringify(doc);
    refreshHistoryButtons();
}

// Enregistre l'état courant comme une étape, si le document a changé.
function historyRecord({ typing = false } = {}) {
    const snap = JSON.stringify(doc);
    if (snap === lastSnapshot) return false;
    if (!(typing && typingGroupOpen)) {
        undoStack.push(lastSnapshot);
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    if (typing) {
        typingGroupOpen = true;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(closeTypingGroup, TYPING_GROUP_MS);
    } else {
        closeTypingGroup();
    }
    redoStack = [];
    lastSnapshot = snap;
    refreshHistoryButtons();
    return true;
}

function restoreSnapshot(snap) {
    const focus = rememberSidebarFocus();
    doc = JSON.parse(snap);
    lastSnapshot = snap;
    registerColor(doc.id, doc.color, doc.cover.title);
    renderSidebar();
    renderPreview();
    restoreSidebarFocus(focus);
    refreshHistoryButtons();
    scheduleAutosave();
    refreshStatus();
}

function undo() {
    closeTypingGroup();
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    restoreSnapshot(undoStack.pop());
}
function redo() {
    closeTypingGroup();
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    restoreSnapshot(redoStack.pop());
}

function refreshHistoryButtons() {
    const u = document.getElementById("btn-undo");
    const r = document.getElementById("btn-redo");
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
}

// Après une reconstruction du panneau, on replace le curseur dans le champ de même rang
// (les champs sont recréés, l'élément d'origine n'existe plus).
function sidebarFields() {
    return [...document.querySelectorAll("#sidebar input, #sidebar textarea, #sidebar select")];
}
function rememberSidebarFocus() {
    const idx = sidebarFields().indexOf(document.activeElement);
    return idx >= 0 ? idx : null;
}
function restoreSidebarFocus(idx) {
    if (idx === null) return;
    const f = sidebarFields()[idx];
    if (f) f.focus({ preventScroll: true });
}

/* ---------- Sauvegarde automatique ---------- */
const AUTOSAVE_KEY = "current-doc";
let autosaveTimer = null;
let autosaveOk = true;
// Dossier autonome : copie dans le navigateur. Archive : enregistrement des fichiers
// modifiés (entrées, blocs partagés, dossier) via le serveur.
function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    if (editorMode !== "standalone") {
        archiveDirty = true;
        refreshStatus();
    }
    autosaveTimer = setTimeout(async () => {
        autosaveTimer = null;
        if (editorMode === "standalone") autosaveOk = await storeSet(AUTOSAVE_KEY, doc);
        else autosaveOk = await saveEditorToArchive();
        refreshStatus();
    }, 500);
}
async function loadAutosave() {
    const saved = await storeGet(AUTOSAVE_KEY);
    if (!saved) return null;
    try {
        return normalizeDoc(saved);
    } catch (e) {
        return null;
    }
}

/* ---------- Modifications non exportées ---------- */
let exportedSnapshot = null; // JSON du document lors du dernier export / import
function markExported() {
    exportedSnapshot = JSON.stringify(doc);
    refreshStatus();
}
function hasUnexportedChanges() {
    if (editorMode !== "standalone") return false;
    return !isPristine(doc) && JSON.stringify(doc) !== exportedSnapshot;
}

function refreshStatus() {
    const st = document.getElementById("save-status");
    if (!st) return;
    if (editorMode !== "standalone" || currentView !== "editor") {
        let text = "";
        let warn = false;
        if (archive.mode === "static") text = "Archive en lecture seule";
        else if (currentView === "editor" && archiveSaveError) {
            text = "⚠ Échec de l'enregistrement : " + archiveSaveError;
            warn = true;
        } else if (currentView === "editor" && archiveDirty) text = "Enregistrement…";
        else if (archive.mode === "server") text = "Enregistré dans l'archive";
        st.textContent = text;
        st.classList.toggle("warn", warn);
        return;
    }
    const parts = [];
    if (!storageIsPersistent || !autosaveOk)
        parts.push("⚠ Sauvegarde automatique indisponible");
    else
        parts.push(
            storageKind === "artifact"
                ? "Enregistré automatiquement"
                : "Enregistré dans ce navigateur",
        );
    if (hasUnexportedChanges()) parts.push("modifications non exportées");
    st.textContent = parts.join(" · ");
    st.classList.toggle("warn", !storageIsPersistent || !autosaveOk);
}
