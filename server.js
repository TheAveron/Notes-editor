#!/usr/bin/env node
/* Atelier de Dossiers — Serveur local (Node ≥ 18, aucune dépendance).

   Sert l'application et donne accès en lecture/écriture aux fichiers de l'archive, pour
   que chaque entrée, bloc partagé et dossier soit un fichier du dépôt (à committer avec Git).

   Usage : node server.js [--port 8080] [--archive archive]
   N'écoute que sur 127.0.0.1 : l'archive n'est pas exposée au réseau.

   API
     GET    /api/archive                 tout le contenu de l'archive
     PUT    /api/<collection>/<id>       crée ou remplace (collection : entrees, blocs, dossiers)
     DELETE /api/<collection>/<id>       supprime
     PUT    /api/couleurs                remplace le registre des couleurs */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createArchive, httpError } = require("./server/archive-fs.js");

const ROOT = __dirname;
const MAX_BODY = 5 * 1024 * 1024;
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".md": "text/plain; charset=utf-8",
};

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                reject(httpError(413, "contenu trop volumineux"));
                req.destroy();
            } else chunks.push(c);
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
            } catch (e) {
                reject(httpError(400, "JSON invalide"));
            }
        });
        req.on("error", reject);
    });
}

function send(res, status, body, type = "application/json; charset=utf-8") {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveStatic(req, res) {
    let rel;
    try {
        rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch (e) {
        return send(res, 400, { error: "adresse invalide" });
    }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(ROOT, "." + rel);
    // Rien en dehors du dépôt, ni fichier caché (.git, .env…)
    if (!file.startsWith(ROOT + path.sep) || rel.split("/").some((p) => p.startsWith(".")))
        return send(res, 404, { error: "introuvable" });
    fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, { error: "introuvable" });
        send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
    });
}

function createServer({ archiveDir = path.join(ROOT, "archive") } = {}) {
    const archive = createArchive(archiveDir);
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://x");
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] !== "api") {
            if (req.method !== "GET" && req.method !== "HEAD")
                return send(res, 405, { error: "méthode non autorisée" });
            return serveStatic(req, res);
        }
        // Protection simple contre les requêtes envoyées par d'autres sites (CSRF) : les
        // écritures doivent venir de cette page (en-tête posé par l'application).
        if (req.method !== "GET" && req.headers["x-atelier"] !== "1")
            return send(res, 403, { error: "requête refusée" });
        try {
            if (req.method === "GET" && parts[1] === "archive" && parts.length === 2)
                return send(res, 200, archive.readAll());
            if (req.method === "PUT" && parts[1] === "couleurs" && parts.length === 2) {
                archive.putColors(await readBody(req));
                return send(res, 200, { ok: true });
            }
            if (parts.length === 3 && req.method === "PUT") {
                archive.put(parts[1], parts[2], await readBody(req));
                return send(res, 200, { ok: true });
            }
            if (parts.length === 3 && req.method === "DELETE") {
                archive.remove(parts[1], parts[2]);
                return send(res, 200, { ok: true });
            }
            send(res, 404, { error: "route inconnue" });
        } catch (e) {
            send(res, e.status || 500, { error: e.message });
            if (!e.status) console.error(e);
        }
    });
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
    const port = Number(opt("--port", process.env.PORT || 8080));
    const archiveDir = path.resolve(opt("--archive", path.join(ROOT, "archive")));
    createServer({ archiveDir }).listen(port, "127.0.0.1", () => {
        console.log(`Atelier de Dossiers : http://localhost:${port}/`);
        console.log(`Archive : ${archiveDir}`);
    });
}

module.exports = { createServer };
