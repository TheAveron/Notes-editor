/* Atelier de Dossiers — Lecture et écriture de l'archive sur disque (Node).

   archive/
     entrees/<id>.json   entrées
     blocs/<id>.json     blocs partagés
     dossiers/<id>.json  dossiers
     couleurs.json       registre des couleurs
     index.json          liste des fichiers, régénérée à chaque écriture ; elle permet de
                         lire l'archive sans serveur (hébergement statique, lecture seule) */

const fs = require("fs");
const path = require("path");
const { COLLECTIONS, isValidId } = require("../js/archive-model.js");

const COLORS_FILE = "couleurs.json";
const INDEX_FILE = "index.json";

function createArchive(root) {
    root = path.resolve(root);
    const dir = (col) => path.join(root, col);

    function checkCollection(col) {
        if (!COLLECTIONS.includes(col)) throw httpError(404, `collection inconnue : ${col}`);
    }
    function checkId(id) {
        if (!isValidId(id)) throw httpError(400, `identifiant invalide : ${id}`);
    }
    function fileOf(col, id) {
        checkCollection(col);
        checkId(id);
        return path.join(dir(col), id + ".json");
    }

    // Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un
    // JSON à moitié écrit si le processus s'arrête.
    function writeJson(file, value) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + ".tmp-" + process.pid;
        fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
        fs.renameSync(tmp, file);
    }
    function readJson(file, fallback) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (e) {
            if (e.code === "ENOENT") return fallback;
            throw e;
        }
    }

    function list(col) {
        checkCollection(col);
        let names = [];
        try {
            names = fs.readdirSync(dir(col));
        } catch (e) {
            if (e.code !== "ENOENT") throw e;
        }
        return names
            .filter((n) => n.endsWith(".json") && isValidId(n.slice(0, -5)))
            .sort()
            .map((n) => readJson(path.join(dir(col), n)));
    }

    function readAll() {
        const out = { couleurs: readJson(path.join(root, COLORS_FILE), []) };
        COLLECTIONS.forEach((col) => (out[col] = list(col)));
        return out;
    }

    function writeIndex() {
        const index = { generatedBy: "Atelier de Dossiers" };
        COLLECTIONS.forEach((col) => (index[col] = list(col).map((x) => x.id)));
        writeJson(path.join(root, INDEX_FILE), index);
    }

    function put(col, id, value) {
        const file = fileOf(col, id);
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw httpError(400, "un objet JSON est attendu");
        if (value.id !== id)
            throw httpError(400, "l'identifiant du contenu ne correspond pas à l'adresse");
        writeJson(file, value);
        writeIndex();
    }
    function remove(col, id) {
        const file = fileOf(col, id);
        try {
            fs.unlinkSync(file);
        } catch (e) {
            if (e.code === "ENOENT") throw httpError(404, `${col}/${id} introuvable`);
            throw e;
        }
        writeIndex();
    }
    function putColors(list) {
        if (!Array.isArray(list)) throw httpError(400, "une liste est attendue");
        writeJson(path.join(root, COLORS_FILE), list);
    }

    return { root, list, readAll, put, remove, putColors, writeIndex, writeJson };
}

function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}

module.exports = { createArchive, httpError };
