/* Atelier de Dossiers — Persistance clé/valeur : window.storage si présent (Artifacts), sinon mémoire. */

/* ---------- Stockage (window.storage avec repli mémoire) ---------- */
const hasStorage =
    typeof window !== "undefined" &&
    window.storage &&
    typeof window.storage.get === "function";
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
    memoryStore[key] = value;
}
