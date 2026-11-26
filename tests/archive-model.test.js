const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const M = require("../js/archive-model.js");

const docsDir = path.join(__dirname, "..", "documents");
const docs = fs
    .readdirSync(docsDir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(fs.readFileSync(path.join(docsDir, n), "utf8")));

const storeOf = (res, extra = {}) => ({
    entries: new Map([...(extra.entries || []), ...res.entries].map((e) => [e.id, e])),
    blocks: new Map([...(extra.blocks || []), ...res.blocks].map((b) => [b.id, b])),
});
// Vue comparable d'une section : titre + blocs sans champs internes ni id des sauts
const comparable = (sections) =>
    sections.map((s) => ({
        title: s.title,
        blocks: s.blocks.map((b) => {
            const o = M.stripInternal(b);
            if (o.type === "pagebreak") return { type: "pagebreak", repeatTitle: !!o.repeatTitle };
            return o;
        }),
    }));

for (const doc of docs) {
    test(`import puis résolution redonne le dossier « ${doc.cover.title} »`, () => {
        const res = M.importStandalone(doc, () => false, { prefix: "x" });
        assert.equal(res.entries.length, doc.sections.length);
        res.entries.forEach((e) => assert.ok(M.isValidId(e.id), e.id));
        const resolved = M.resolveDossier(res.dossier, storeOf(res));
        assert.deepEqual(comparable(resolved.sections), comparable(doc.sections));
        assert.deepEqual(resolved.cover, doc.cover);
    });

    test(`décomposer un dossier résolu est stable (« ${doc.cover.title} »)`, () => {
        const res = M.importStandalone(doc, () => false);
        const store = storeOf(res);
        const again = M.decomposeDossier(M.resolveDossier(res.dossier, store), store, () => {
            throw new Error("pas de nouvelle entrée attendue");
        });
        assert.deepEqual(again.dossier, res.dossier);
        assert.deepEqual(again.entries, res.entries);
    });
}

test("les identifiants déjà pris reçoivent un suffixe", () => {
    const taken = new Set(["le-gardien", "grd-annexes"]);
    const res = M.importStandalone(
        docs.find((d) => d.cover.title === "Le Gardien"),
        (col, id) => taken.has(id),
        { prefix: "GRD" },
    );
    assert.equal(res.dossier.id, "le-gardien-2");
    assert.ok(res.entries.some((e) => e.id === "grd-annexes-2"));
});

test("un bloc partagé est développé puis réenregistré par référence", () => {
    const store = {
        blocks: new Map([["regle", { id: "regle", name: "Règle", type: "paragraph", text: "A" }]]),
        entries: new Map([
            ["e1", { id: "e1", title: "E1", kind: "lieu", tags: ["t"], blocks: [{ ref: "regle" }] }],
            ["e2", { id: "e2", title: "E2", kind: "autre", tags: [], blocks: [{ id: "b1", type: "heading2", text: "H" }, { ref: "regle" }] }],
        ]),
    };
    const dossier = { id: "d", sections: [{ id: "s1", entry: "e1" }, { id: "s2", entry: "e2", pageBreaks: [{ after: "b1", repeatTitle: true }] }] };
    const doc = M.resolveDossier(dossier, store);
    // deux occurrences du même bloc partagé : identifiants distincts dans l'éditeur
    const ids = doc.sections.flatMap((s) => s.blocks.map((b) => b.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(doc.sections[1].blocks.map((b) => b.type), ["heading2", "pagebreak", "paragraph"]);

    doc.sections[1].blocks[2].text = "B"; // modifié depuis l'entrée e2
    const out = M.decomposeDossier(doc, store, () => "nouvelle");
    assert.deepEqual(out.blocks, [{ id: "regle", name: "Règle", type: "paragraph", text: "B" }]);
    assert.deepEqual(out.entries[0], { id: "e1", title: "E1", kind: "lieu", tags: ["t"], blocks: [{ ref: "regle" }] });
    assert.deepEqual(out.dossier.sections[1].pageBreaks, [{ after: "b1", repeatTitle: true }]);
});

test("références manquantes conservées telles quelles", () => {
    const store = { blocks: new Map(), entries: new Map([["e", { id: "e", title: "E", kind: "autre", tags: [], blocks: [{ ref: "absent" }] }]]) };
    const dossier = { id: "d", sections: [{ id: "s", entry: "e" }, { id: "s2", entry: "disparue", pageBreaks: [{ after: null }] }] };
    const doc = M.resolveDossier(dossier, store);
    assert.match(doc.sections[0].blocks[0].text, /introuvable/);
    const out = M.decomposeDossier(doc, store, () => "x");
    assert.deepEqual(out.entries[0].blocks, [{ ref: "absent" }]);
    assert.deepEqual(out.dossier.sections[1], { id: "s2", entry: "disparue", pageBreaks: [{ after: null }] });
});

test("une section nouvelle crée une entrée", () => {
    const store = { blocks: new Map(), entries: new Map() };
    const doc = { id: "d", sections: [{ id: "s", title: "Nouvelle", blocks: [{ id: "p", type: "paragraph", text: "t" }] }] };
    const out = M.decomposeDossier(doc, store, (t) => M.slugify(t));
    assert.equal(doc.sections[0]._entry, "nouvelle");
    assert.deepEqual(out.entries[0], { id: "nouvelle", title: "Nouvelle", kind: "autre", tags: [], blocks: [{ id: "p", type: "paragraph", text: "t" }] });
});
