#!/usr/bin/env node
/* Atelier de Dossiers — Convertit des dossiers autonomes (format historique, un fichier
   par dossier) en éléments de l'archive : une entrée par section, un dossier de mise en
   page qui y fait référence. Le registre des couleurs est repris en suivant les dossiers.

   Usage : node tools/migrate-documents.js [dossiers…] [--archive archive] [--registre fichier]
   Sans fichier, convertit documents/*.json. Les éléments existants ne sont jamais écrasés :
   un identifiant déjà pris reçoit un suffixe (-2, -3…). */

const fs = require("fs");
const path = require("path");
const { importStandalone } = require("../js/archive-model.js");
const { createArchive } = require("../server/archive-fs.js");

const repo = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf(name);
    if (i < 0) return def;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
};
const archiveDir = opt("--archive", path.join(repo, "archive"));
const registryFile = opt("--registre", path.join(repo, "registre-couleurs.json"));
let files = args;
if (!files.length) {
    const d = path.join(repo, "documents");
    files = fs
        .readdirSync(d)
        .filter((n) => n.endsWith(".json"))
        .sort()
        .map((n) => path.join(d, n));
}

// Même règle que l'éditeur : la ligne « N° de dossier » donne le préfixe des codes.
function docPrefix(doc) {
    const meta = (doc.cover && doc.cover.meta) || [];
    const row = meta.find((m) => /dossier|n[°o]\s*de|code/i.test(m.a || "")) || meta[0];
    return ((row && row.b) || "").trim().split("-")[0].trim();
}

const archive = createArchive(archiveDir);
const existing = archive.readAll();
const taken = {
    entrees: new Set(existing.entrees.map((x) => x.id)),
    dossiers: new Set(existing.dossiers.map((x) => x.id)),
};
const docToDossier = new Map();

files.forEach((file) => {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(doc.sections)) {
        console.warn(`ignoré (pas de sections) : ${file}`);
        return;
    }
    const res = importStandalone(doc, (col, id) => taken[col].has(id), {
        prefix: docPrefix(doc),
    });
    res.entries.forEach((e) => {
        archive.writeJson(path.join(archive.root, "entrees", e.id + ".json"), e);
        taken.entrees.add(e.id);
    });
    archive.writeJson(path.join(archive.root, "dossiers", res.dossier.id + ".json"), res.dossier);
    taken.dossiers.add(res.dossier.id);
    if (doc.id) docToDossier.set(String(doc.id), res.dossier.id);
    console.log(
        `${path.basename(file)} → dossier « ${res.dossier.id} », ${res.entries.length} entrées`,
    );
});

// Registre : les couleurs suivent les dossiers (identifiants renommés)
if (fs.existsSync(registryFile)) {
    const reg = JSON.parse(fs.readFileSync(registryFile, "utf8"));
    const merged = new Map(existing.couleurs.map((r) => [r.docId, r]));
    reg.forEach((r) => {
        const id = docToDossier.get(String(r.docId));
        if (id) merged.set(id, { ...r, docId: id });
    });
    archive.putColors([...merged.values()]);
    console.log(`registre des couleurs : ${merged.size} entrées`);
}
archive.writeIndex();
