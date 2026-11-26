/* Atelier de Dossiers — Registre des couleurs attribuées, tous documents confondus. */

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
// Avec une archive, le registre est le fichier archive/couleurs.json (partagé par tous les
// dossiers de l'archive) ; sinon il est gardé dans le navigateur.
async function loadRegistry() {
    if (archive.mode !== "none") registry = sanitizeRegistry(archive.colors);
    else registry = sanitizeRegistry(await storeGet("color-registry"));
}
async function saveRegistry() {
    if (archive.mode === "none") return void (await storeSet("color-registry", registry));
    try {
        await archivePutColors(registry);
    } catch (e) {
        console.warn("Registre des couleurs non enregistré :", e.message);
    }
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
    if (editorMode !== "standalone" || !isPristine(d)) return;
    registry = registry.filter((r) => r.docId !== d.id);
    await saveRegistry();
}
