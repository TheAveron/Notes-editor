const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createServer } = require("../server.js");

async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-"));
    const server = createServer({ archiveDir: dir });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (method, url, body, headers = { "X-Atelier": "1" }) =>
        fetch(base + url, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    try {
        await fn(call, dir);
    } finally {
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test("écrire, lire et supprimer une entrée", () =>
    withServer(async (call, dir) => {
        const entry = { id: "le-gardien", title: "Le Gardien", kind: "personnage", tags: [], blocks: [] };
        assert.equal((await call("PUT", "/api/entrees/le-gardien", entry)).status, 200);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "entrees/le-gardien.json"))), entry);
        const all = await (await call("GET", "/api/archive")).json();
        assert.deepEqual(all.entrees, [entry]);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "index.json"))).entrees, ["le-gardien"]);
        assert.equal((await call("DELETE", "/api/entrees/le-gardien")).status, 200);
        assert.equal((await call("DELETE", "/api/entrees/le-gardien")).status, 404);
    }));

test("identifiants, collections et contenus invalides refusés", () =>
    withServer(async (call) => {
        assert.equal((await call("PUT", "/api/entrees/..%2Fx", { id: "../x" })).status, 400);
        assert.equal((await call("PUT", "/api/entrees/A_B", { id: "A_B" })).status, 400);
        assert.equal((await call("PUT", "/api/autre/x", { id: "x" })).status, 404);
        assert.equal((await call("PUT", "/api/entrees/x", { id: "y" })).status, 400);
        assert.equal((await call("PUT", "/api/entrees/x", [1])).status, 400);
    }));

test("écriture sans l'en-tête de l'application refusée", () =>
    withServer(async (call) => {
        assert.equal((await call("PUT", "/api/entrees/x", { id: "x" }, {})).status, 403);
    }));

test("fichiers statiques servis sans sortir du dépôt", () =>
    withServer(async (call) => {
        const r = await call("GET", "/index.html");
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type"), /text\/html/);
        assert.equal((await call("GET", "/../../etc/passwd")).status, 404);
        assert.equal((await call("GET", "/%2e%2e/%2e%2e/etc/passwd")).status, 404);
        assert.equal((await call("GET", "/.git/config")).status, 404);
    }));
