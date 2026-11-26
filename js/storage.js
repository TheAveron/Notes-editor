/* Atelier de Dossiers — Persistance clé/valeur.
   Ordre de préférence : window.storage (Claude Artifacts), puis localStorage du
   navigateur, puis une simple mémoire (perdue au rechargement). */

const hasStorage =
    typeof window !== "undefined" &&
    window.storage &&
    typeof window.storage.get === "function";

const LOCAL_PREFIX = "atelier-dossiers:";
// localStorage peut être absent ou lever une exception (navigation privée, stockage bloqué).
const localStore = (() => {
    if (hasStorage) return null;
    try {
        const ls = window.localStorage;
        ls.setItem(LOCAL_PREFIX + "test", "1");
        ls.removeItem(LOCAL_PREFIX + "test");
        return ls;
    } catch (e) {
        return null;
    }
})();

// "artifact" | "navigateur" | "mémoire" — affiché dans la barre d'état.
const storageKind = hasStorage ? "artifact" : localStore ? "navigateur" : "mémoire";
const storageIsPersistent = storageKind !== "mémoire";

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
    if (localStore) {
        try {
            const v = localStore.getItem(LOCAL_PREFIX + key);
            return v ? JSON.parse(v) : null;
        } catch (e) {
            return null;
        }
    }
    return memoryStore[key] ?? null;
}
// Renvoie false si la valeur n'a pu être écrite que dans la mémoire volatile.
async function storeSet(key, value) {
    if (hasStorage) {
        try {
            await window.storage.set(key, JSON.stringify(value));
            return true;
        } catch (e) {
            /* repli mémoire */
        }
    } else if (localStore) {
        try {
            localStore.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
            return true;
        } catch (e) {
            /* quota dépassé : repli mémoire */
        }
    }
    memoryStore[key] = value;
    return false;
}
