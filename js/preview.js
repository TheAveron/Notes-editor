/* Atelier de Dossiers — Rendu de l'aperçu paginé (HTML imprimable). */

/* ---------- Rendu : PREVIEW ---------- */
// Échappe aussi les guillemets : le résultat peut être placé dans un attribut.
function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function nl2p(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderBlockHtml(b) {
    switch (b.type) {
        case "heading2":
            return `<div class="sec-h2">${escapeHtml(b.text)}</div>`;
        case "paragraph":
            return `<p class="p-body${b.italic ? " italic" : ""}">${nl2p(b.text)}</p>`;
        case "bullets":
            return `<ul class="bullets">${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        case "callout": {
            const meta = tagStyle(b.tag);
            return `<div class="callout" style="border-left-color:${meta.border};background:${meta.calloutBg};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span><span class="ctitle">${escapeHtml(b.title)}</span>
        ${b.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>`;
        }
        case "table": {
            if (b.layout === "badge-label-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge" style="width:44px;">${escapeHtml(r.a)}</td><td class="label">${escapeHtml(r.c)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
            }
            if (b.layout === "badge-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge">${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
            }
            return `<table class="stat">${b.rows.map((r) => `<tr><td class="label">${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>`;
        }
        case "card":
            return `<div class="card">
        <div class="card-header">
        <div class="chead">${escapeHtml(b.badgeText)}</div>
        <div class="dot-separator">·</div>
        <div class="ctitle2">${escapeHtml(b.title)}</div>
        </div>
        <p>${escapeHtml(b.pitch)}</p>
        <table>${b.rows.map((r) => `<tr><td>${escapeHtml(r.a)}</td><td>${escapeHtml(r.b)}</td></tr>`).join("")}</table>
      </div>`;
        case "crossref":
            return `<div class="crossref"><b>→ RENVOI</b> &nbsp;${escapeHtml(b.text)}</div>`;
        default: // pagebreak : géré par renderPreview (découpage des pages)
            return "";
    }
}

function updateTocPages() {
    const preview = document.getElementById("preview");

    const pages = [...preview.querySelectorAll(".page")];

    doc.sections.forEach((section) => {
        const target = document.getElementById(section.id);
        if (!target) return;

        const pageElement = target.closest(".page");
        if (!pageElement) return;

        const pageNumber = pages.indexOf(pageElement) + 1;

        const tocEntry = preview.querySelector(
            `.toc-page[data-toc="${section.id}"]`
        );

        if (tocEntry) {
            tocEntry.textContent = pageNumber;
        }
    });
}

function renderPreview() {
    const pal = derivePalette(doc.color);
    const stampColor = doc.stampStyle === "red" ? FIXED.red : pal.accent;
    const stampBg = doc.stampStyle === "red" ? FIXED.redBg : pal.accentBg;
    const styleVars = `--doc-accent:${pal.accent};--doc-ink:${pal.ink};--doc-inkmid:${pal.inkMid};--doc-card:${pal.card};--stamp-color:${stampColor};--stamp-bg:${stampBg};`;

    const header = () =>
        `<div class="doc-header"><span>DOSSIER ${escapeHtml(docNumber())}</span><span>${escapeHtml(doc.footerBrand)}</span></div>`;
    const footer = (n, total) =>
        `<div class="page-footer">— ${n} / ${total} —</div>`;

    // On construit d'abord le contenu INTERNE de chaque page logique (une par section + pages fixes),
    // puis on numérote en une seule passe une fois le total connu.
    const pagesInner = [];

    // Page de couverture
    let cover = `<div class="cover-org">${escapeHtml(doc.cover.orgLine)}</div><hr class="cover-rule">`;
    cover += `<div class="cover-kicker">${escapeHtml(doc.cover.kicker)}</div>`;
    cover += `<div class="cover-title">${escapeHtml(doc.cover.title)}</div>`;
    cover += `<div class="cover-subtitle">${escapeHtml(doc.cover.subtitle)}</div>`;
    cover += `<div class="cover-stamp-box"><div class="cover-stamp"><p style="margin: 0; text-align: center">${nl2p(doc.cover.stampText)}</p></div></div>`;
    cover += `<table class="meta-table">${doc.cover.meta.map((m) => `<tr><td>${escapeHtml(m.a)}</td><td>${escapeHtml(m.b)}</td></tr>`).join("")}</table>`;
    pagesInner.push(cover);

    // Note d'usage
    let note = `<div class="sec-h1"><span class="code">${escapeHtml(docPrefix())}-00</span><span class="dot-separator">·</span>NOTE D'USAGE</div>`;
    note += `<p class="p-body">${nl2p(doc.noteUsage.text)}</p>`;
    if (doc.noteUsage.includeTagLegend) {
        const legends = [
            [
                "confirme",
                "Fait établi dans le lore central. Ne devrait pas être contredit à la légère car cela pourrait créer des incohérences dans l'histoire.",
            ],
            [
                "hypothese",
                "Proposition cohérente avec le canon existant, mais non tranchée. Le MJ peut l'adopter telle quelle, l'adapter, ou la remplacer par sa propre idée.",
            ],
            [
                "hook",
                "Accroche de scénario prête à l'emploi, directement exploitable en jeu.",
            ],
            [
                "attention",
                "Point de vigilance : risque d'incohérence, d'équilibrage, ou de spoil à ne pas dévoiler trop tôt aux joueurs.",
            ],
        ];
        legends.forEach(([tag, txt]) => {
            const meta = tagStyle(tag);
            note += `<div class="callout" style="border-left-color:${meta.border};background:${meta.calloutBg};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span>
        <p>${escapeHtml(txt)}</p></div>`;
        });
    }
    pagesInner.push(note);

    // Table des matières (statique)
    let toc = `<div class="sec-h1">TABLE DES MATIÈRES</div>`;
    toc +=
        `<ul class="toc-list">` +
        doc.sections
            .map(
                (s, i) =>
                    `<li><a href="#${s.id}"><span class="code">${escapeHtml(sectionCode(i))}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}<span class="toc-page" data-toc="${s.id}"></span></a></li>`,
            )
            .join("") +
        `</ul>`;
    pagesInner.push(toc);

    // Sections de contenu : un saut de page termine la page courante et en ouvre une nouvelle.
    doc.sections.forEach((s, i) => {
        let currentPage = `<div class="sec-h1" id="${s.id}"><span class="code">${escapeHtml(sectionCode(i))}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}
        </div>`;

        s.blocks.forEach((block) => {
            if (block.type === "pagebreak") {
                // On termine la page courante
                pagesInner.push(currentPage);

                // La suivante démarre vide
                // (ou remets l'en-tête de section ici si tu souhaites le répéter)
                currentPage = "";
            } else {
                currentPage += renderBlockHtml(block);
            }
        });

        // Dernière page de la section
        if (currentPage.trim() !== "") {
            pagesInner.push(currentPage);
        }
    });

    const total = pagesInner.length;
    const html = pagesInner
        .map(
            (inner, i) =>
                `<div class="page" style="${styleVars}">${header()}${inner}${footer(i + 1, total)}</div>`,
        )
        .join("");

    document.getElementById("preview").innerHTML = html;
    updateTocPages();
}
