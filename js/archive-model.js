/* Atelier de Dossiers — Modèle de l'archive.

   Partagé entre le navigateur (window.ArchiveModel), le serveur et les scripts Node
   (require). Aucune dépendance au DOM.

   L'archive stocke trois sortes d'éléments, un fichier JSON chacun :

   - Entrée (archive/entrees/<id>.json) : une information thématique autonome
     (personnage, lieu, institution…), faite d'une suite de blocs.
       { id, title, kind, tags: [], blocks: [ <bloc> | { ref: "<id de bloc partagé>" } ] }

   - Bloc partagé (archive/blocs/<id>.json) : un bloc réutilisé par plusieurs entrées ;
     le modifier le modifie partout.
       { id, name, type, ...champs du bloc }

   - Dossier (archive/dossiers/<id>.json) : la mise en page d'un document imprimable.
     Il ne contient pas d'information, seulement des références ordonnées à des entrées,
     et ses propres sauts de page (la mise en page appartient au dossier, pas à l'entrée).
       { id, version: 3, color, stampStyle, cover, footerBrand, noteUsage,
         sections: [ { id, entry: "<id d'entrée>", pageBreaks?: [ { after, repeatTitle } ] } ] }
     `after` désigne le bloc de l'entrée après lequel couper : son id, "@<id>" pour un
     bloc partagé, ou null pour couper avant le premier bloc.

   L'éditeur, lui, travaille sur un document « résolu » au format autonome historique
   (sections contenant directement leurs blocs). resolve*() construit ce document à
   partir de l'archive ; decompose*() fait l'inverse au moment d'enregistrer. Les champs
   internes de l'éditeur commencent par « _ » et ne sont jamais enregistrés. */

(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ArchiveModel = api;
})(typeof self !== "undefined" ? self : this, function () {
    const DOSSIER_VERSION = 3;
    const COLLECTIONS = ["entrees", "blocs", "dossiers"];
    const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
    const KINDS = [
        ["personnage", "Personnage"],
        ["lieu", "Lieu"],
        ["institution", "Institution / groupe"],
        ["evenement", "Événement"],
        ["objet", "Objet / artefact"],
        ["concept", "Concept / règle"],
        ["autre", "Autre"],
    ];
    const KIND_KEYS = KINDS.map(([k]) => k);

    const clone = (o) => JSON.parse(JSON.stringify(o));

    function slugify(s) {
        return (
            String(s || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
                .slice(0, 60)
                .replace(/-$/, "") || "element"
        );
    }
    // Identifiant lisible et libre : « le-gardien », sinon « le-gardien-2 », etc.
    function uniqueId(base, isTaken) {
        const root = slugify(base);
        if (!isTaken(root)) return root;
        for (let i = 2; ; i++) if (!isTaken(`${root}-${i}`)) return `${root}-${i}`;
    }
    function isValidId(id) {
        return typeof id === "string" && ID_RE.test(id);
    }

    function stripInternal(o) {
        const out = {};
        for (const k in o) if (!k.startsWith("_")) out[k] = o[k];
        return out;
    }
    // Clé d'un élément d'entrée, utilisée par les sauts de page des dossiers
    function itemKey(item) {
        return item.ref ? "@" + item.ref : item.id;
    }

    // Libellé court d'un bloc (listes, résultats de recherche)
    function blockLabel(b) {
        const t =
            b.name ||
            b.title ||
            b.text ||
            b.badgeText ||
            (b.items && b.items[0]) ||
            (b.paragraphs && b.paragraphs[0]) ||
            (b.rows && b.rows[0] && (b.rows[0].a || b.rows[0].b)) ||
            "";
        const s = String(t).replace(/\s+/g, " ").trim();
        return s.length > 80 ? s.slice(0, 79) + "…" : s;
    }
    // Tout le texte d'un bloc, pour la recherche
    function blockText(b) {
        const parts = [b.name, b.title, b.text, b.badgeText, b.pitch];
        (b.items || []).forEach((x) => parts.push(x));
        (b.paragraphs || []).forEach((x) => parts.push(x));
        (b.rows || []).forEach((r) => parts.push(r.a, r.b, r.c));
        return parts.filter(Boolean).join(" \n ");
    }

    /* ---------- Archive → document de l'éditeur ---------- */

    // Développe les blocs d'une entrée. `used` garantit des identifiants uniques dans le
    // document (une même entrée ou un même bloc partagé peut y apparaître deux fois).
    function expandBlocks(entry, store, used) {
        const unique = (id) => {
            let out = id;
            for (let i = 2; used.has(out); i++) out = `${id}-${i}`;
            used.add(out);
            return out;
        };
        return (entry.blocks || []).map((item) => {
            if (item.ref) {
                const sb = store.blocks.get(item.ref);
                if (!sb)
                    return {
                        id: unique("manquant-" + item.ref),
                        type: "paragraph",
                        text: `[Bloc partagé introuvable : ${item.ref}]`,
                        italic: true,
                        _missingRef: item.ref,
                    };
                const b = clone(sb);
                delete b.name;
                b._shared = item.ref;
                b._sharedName = sb.name || "";
                b.id = unique("partage-" + item.ref);
                return b;
            }
            const b = clone(item);
            const id = unique(item.id);
            if (id !== item.id) b._origId = item.id;
            b.id = id;
            return b;
        });
    }

    function resolveDossier(dossier, store) {
        const used = new Set();
        let pb = 0;
        const sections = (dossier.sections || []).map((sec) => {
            const entry = store.entries.get(sec.entry);
            if (!entry)
                return {
                    id: sec.id,
                    title: `[Entrée introuvable : ${sec.entry}]`,
                    blocks: [],
                    _missingEntry: sec.entry,
                    _pageBreaks: sec.pageBreaks || [],
                };
            const breaks = (sec.pageBreaks || []).slice();
            const expanded = expandBlocks(entry, store, used);
            const blocks = [];
            const takeBreaks = (key) => {
                for (let i = 0; i < breaks.length; ) {
                    if ((breaks[i].after ?? null) === key) {
                        blocks.push({
                            id: `saut-${++pb}`,
                            type: "pagebreak",
                            repeatTitle: !!breaks[i].repeatTitle,
                        });
                        breaks.splice(i, 1);
                    } else i++;
                }
            };
            takeBreaks(null);
            (entry.blocks || []).forEach((item, i) => {
                blocks.push(expanded[i]);
                takeBreaks(itemKey(item));
            });
            // Saut dont le bloc de référence a disparu de l'entrée : gardé en fin de section
            breaks.forEach((b) =>
                blocks.push({ id: `saut-${++pb}`, type: "pagebreak", repeatTitle: !!b.repeatTitle }),
            );
            return { id: sec.id, title: entry.title, blocks, _entry: entry.id };
        });
        const { sections: _ignored, ...meta } = dossier;
        return { ...clone(meta), sections };
    }

    // Une entrée seule, présentée comme un document d'une section.
    function resolveEntry(entry, store) {
        const used = new Set();
        return {
            id: entry.id,
            sections: [
                {
                    id: entry.id,
                    title: entry.title,
                    blocks: expandBlocks(entry, store, used),
                    _entry: entry.id,
                },
            ],
        };
    }

    /* ---------- Document de l'éditeur → archive ---------- */

    // Sépare les blocs édités en éléments d'entrée, blocs partagés et sauts de page.
    function splitBlocks(editorBlocks, sharedOut) {
        const items = [];
        const pageBreaks = [];
        let lastKey = null;
        (editorBlocks || []).forEach((b) => {
            if (b.type === "pagebreak") {
                pageBreaks.push({ after: lastKey, repeatTitle: !!b.repeatTitle });
                return;
            }
            if (b._missingRef) {
                items.push({ ref: b._missingRef });
                lastKey = "@" + b._missingRef;
                return;
            }
            if (b._shared) {
                const sb = stripInternal(b);
                sb.id = b._shared;
                sb.name = b._sharedName || blockLabel(b);
                sharedOut.set(b._shared, sb);
                items.push({ ref: b._shared });
                lastKey = "@" + b._shared;
                return;
            }
            const o = stripInternal(b);
            o.id = b._origId || b.id;
            items.push(o);
            lastKey = o.id;
        });
        return { items, pageBreaks };
    }

    // Entrée enregistrée : métadonnées existantes conservées, titre et blocs mis à jour.
    function entryFrom(sec, items, store) {
        const prev = store.entries.get(sec._entry);
        const { id, title, kind, tags, blocks, ...rest } = prev ? stripInternal(prev) : {};
        return {
            id: sec._entry,
            title: sec.title,
            kind: kind || "autre",
            tags: tags || [],
            ...rest,
            blocks: items,
        };
    }

    // `newEntryId(title)` fournit un identifiant pour une section sans entrée (créée dans
    // l'éditeur avant d'avoir été enregistrée) ; il est mémorisé dans la section.
    function decomposeDossier(doc, store, newEntryId) {
        const entries = new Map();
        const blocks = new Map();
        const sections = (doc.sections || []).map((sec) => {
            if (sec._missingEntry)
                return {
                    id: sec.id,
                    entry: sec._missingEntry,
                    ...(sec._pageBreaks && sec._pageBreaks.length
                        ? { pageBreaks: sec._pageBreaks }
                        : {}),
                };
            if (!sec._entry) sec._entry = newEntryId(sec.title);
            const { items, pageBreaks } = splitBlocks(sec.blocks, blocks);
            entries.set(sec._entry, entryFrom(sec, items, store));
            return {
                id: sec.id,
                entry: sec._entry,
                ...(pageBreaks.length ? { pageBreaks } : {}),
            };
        });
        const dossier = stripInternal(doc);
        dossier.version = DOSSIER_VERSION;
        dossier.sections = sections;
        return { dossier, entries: [...entries.values()], blocks: [...blocks.values()] };
    }

    function decomposeEntry(doc, store) {
        const sec = doc.sections[0];
        const blocks = new Map();
        const { items } = splitBlocks(sec.blocks, blocks);
        return { entry: entryFrom(sec, items, store), blocks: [...blocks.values()] };
    }

    /* ---------- Import d'un document autonome (format historique) ---------- */

    // Découpe un dossier autonome (une section = une entrée). `isTaken(collection, id)`
    // indique les identifiants déjà utilisés dans l'archive.
    function importStandalone(doc, isTaken, opts = {}) {
        const title = (doc.cover && doc.cover.title) || "Dossier";
        const taken = { entrees: new Set(), dossiers: new Set() };
        const check = (col) => (id) => taken[col].has(id) || isTaken(col, id);
        const dossierId = uniqueId(title, check("dossiers"));
        taken.dossiers.add(dossierId);
        const prefix = (opts.prefix || "").toLowerCase();
        const emptyStore = { entries: new Map(), blocks: new Map() };

        const editorDoc = clone(doc);
        editorDoc.id = dossierId;
        editorDoc.sections.forEach((sec) => {
            const id = uniqueId(
                (prefix ? prefix + " " : "") + (sec.title || "entree"),
                check("entrees"),
            );
            taken.entrees.add(id);
            sec._entry = id;
        });
        const res = decomposeDossier(editorDoc, emptyStore, () => {
            throw new Error("identifiant d'entrée manquant");
        });
        res.entries.forEach((e) => {
            e.kind = "autre";
            e.tags = [title];
        });
        return res;
    }

    return {
        DOSSIER_VERSION,
        COLLECTIONS,
        KINDS,
        KIND_KEYS,
        slugify,
        uniqueId,
        isValidId,
        stripInternal,
        blockLabel,
        blockText,
        resolveDossier,
        resolveEntry,
        decomposeDossier,
        decomposeEntry,
        importStandalone,
    };
});
