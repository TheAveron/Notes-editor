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

// Texte enrichi : échappement HTML, puis mini-markdown en ligne.
//   **gras**   *italique*   \* pour un astérisque littéral
// Comme en Markdown, un retour à la ligne simple est une espace (les textes collés depuis
// un PDF en contiennent au milieu des phrases) ; une ligne vide force un saut de ligne.
const ESC_STAR = "\u0001";
function rich(text) {
    let h = String(text ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/\\\*/g, ESC_STAR);
    h = escapeHtml(h)
        .replace(/[ \t]*\n(?:[ \t]*\n)+[ \t]*/g, "<br>")
        .replace(/[ \t]*\n[ \t]*/g, " ");
    h = h.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\*(\S(?:[^*]*?\S)?)\*/g, "<em>$1</em>");
    return linkSectionCodes(h).replaceAll(ESC_STAR, "*");
}

// Transforme les codes de section du dossier courant (ex. « GDN-03 ») en liens vers la
// section, cliquables dans l'aperçu comme dans le PDF. Les codes d'autres dossiers
// (autre préfixe) et les numéros sans section correspondante restent du texte simple.
// N'opère que sur du texte déjà échappé : aucune balise de rich() ne porte d'attribut.
function linkSectionCodes(html) {
    const prefix = docPrefix().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Za-z0-9-])(${prefix}-(\\d{2}))(?![A-Za-z0-9-])`, "g");
    return html.replace(re, (m, before, code, num) => {
        const n = parseInt(num, 10);
        const target =
            n === 0 ? "note-usage" : doc.sections[n - 1] && doc.sections[n - 1].id;
        if (!target) return m;
        return `${before}<a class="xref" href="#${target}">${code}</a>`;
    });
}

function renderBlockHtml(b) {
    switch (b.type) {
        case "heading2":
            return `<div class="sec-h2">${escapeHtml(b.text)}</div>`;
        case "paragraph":
            return `<p class="p-body${b.italic ? " italic" : ""}">${rich(b.text)}</p>`;
        case "bullets":
            return `<ul class="bullets">${b.items.map((i) => `<li>${rich(i)}</li>`).join("")}</ul>`;
        case "callout": {
            const meta = tagStyle(b.tag);
            return `<div class="callout" style="border-left-color:${meta.border};background:${meta.calloutBg};">
        <span class="ctag" style="background:${meta.bg};">${meta.label}</span><span class="ctitle">${rich(b.title)}</span>
        ${b.paragraphs.map((p) => `<p>${rich(p)}</p>`).join("")}
      </div>`;
        }
        case "table": {
            if (b.layout === "badge-label-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge" style="width:44px;">${escapeHtml(r.a)}</td><td class="label">${escapeHtml(r.c)}</td><td>${rich(r.b)}</td></tr>`).join("")}</table>`;
            }
            if (b.layout === "badge-value") {
                return `<table class="stat">${b.rows.map((r) => `<tr><td class="badge">${escapeHtml(r.a)}</td><td>${rich(r.b)}</td></tr>`).join("")}</table>`;
            }
            return `<table class="stat">${b.rows.map((r) => `<tr><td class="label">${escapeHtml(r.a)}</td><td>${rich(r.b)}</td></tr>`).join("")}</table>`;
        }
        case "card": {
            // Couleur d'accent facultative (ex. degrés de gravité) ; elle prime sur `tone`.
            const acc = isValidHex(b.accent || "") ? normalizeHex(b.accent) : null;
            const cardStyle = acc
                ? ` style="border-left-color:${acc};background:${derivePalette(acc).accentBg};"`
                : "";
            const headStyle = acc ? ` style="color:${acc};"` : "";
            return `<div class="card${b.tone === "accent" ? " card-accent" : ""}"${cardStyle}>
        <div class="card-header">
        <div class="chead"${headStyle}>${escapeHtml(b.badgeText)}</div>
        <div class="dot-separator"${headStyle}>·</div>
        <div class="ctitle2">${escapeHtml(b.title)}</div>
        </div>
        <p>${rich(b.pitch)}</p>
        <table>${b.rows.map((r) => `<tr><td>${escapeHtml(r.a)}</td><td>${rich(r.b)}</td></tr>`).join("")}</table>
      </div>`;
        }
        case "crossref":
            return `<div class="crossref"><b>→ RENVOI</b> &nbsp;${rich(b.text)}</div>`;
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

/* ---------- Pages trop longues ---------- */
// Hauteur d'une feuille A4 en pixels CSS, et tolérance avant de signaler un débordement.
const A4_HEIGHT_PX = (297 * 96) / 25.4;
const OVERFLOW_TOLERANCE_PX = 2;
let overflowingSections = new Set();

// Une page est une feuille A4 : si son contenu dépasse, l'impression le coupe sur deux
// feuilles et décale la numérotation. On mesure la hauteur naturelle de chaque page
// (sans sa hauteur minimale) et on signale celles qui dépassent.
function checkOverflow() {
    const preview = document.getElementById("preview");
    // Pendant la mesure l'aperçu raccourcit : on rétablit ensuite sa position de défilement,
    // sinon elle serait ramenée en arrière à chaque frappe en fin de document.
    const scrollTop = preview.scrollTop;
    preview.classList.add("measuring");
    const pages = [...preview.querySelectorAll(".page")];
    const heights = pages.map((p) => p.offsetHeight);
    preview.classList.remove("measuring");
    preview.scrollTop = scrollTop;

    overflowingSections = new Set();
    let count = 0;
    pages.forEach((p, i) => {
        const excess = heights[i] - A4_HEIGHT_PX;
        if (excess <= OVERFLOW_TOLERANCE_PX) return;
        count++;
        if (p.dataset.section) overflowingSections.add(p.dataset.section);
        p.classList.add("overflowing");
        const mm = Math.ceil((excess * 25.4) / 96);
        p.insertAdjacentHTML(
            "afterbegin",
            `<div class="overflow-flag no-print">⚠ Page trop longue d'environ ${mm} mm : à l'impression, elle sera coupée sur deux feuilles. Ajoutez un saut de page ou raccourcissez le contenu.</div>`,
        );
    });

    const status = document.getElementById("layout-status");
    if (status)
        status.textContent = count
            ? `⚠ ${count} page${count > 1 ? "s" : ""} trop longue${count > 1 ? "s" : ""}`
            : "";
    markSidebarOverflow();
}

// Reporte l'avertissement sur les sections concernées dans le panneau de gauche.
function markSidebarOverflow() {
    document.querySelectorAll("#sidebar .section-card").forEach((card) => {
        card.classList.toggle(
            "has-overflow",
            overflowingSections.has(card.dataset.sid),
        );
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
    cover += `<table class="meta-table">${doc.cover.meta.map((m) => `<tr><td>${escapeHtml(m.a)}</td><td>${linkSectionCodes(escapeHtml(m.b))}</td></tr>`).join("")}</table>`;
    pagesInner.push(cover);

    // Note d'usage
    let note = `<div class="sec-h1" id="note-usage"><span class="code">${escapeHtml(docPrefix())}-00</span><span class="dot-separator">·</span>NOTE D'USAGE</div>`;
    note += `<p class="p-body">${rich(doc.noteUsage.text)}</p>`;
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
    // Chaque page de contenu retient la section à laquelle elle appartient (data-section),
    // pour signaler dans le panneau les sections dont une page déborde.
    const pageSection = pagesInner.map(() => null);
    // Couverture et note d'usage : réglées dans le panneau « Couverture du document »
    const pagePanel = ["cover", "cover", null];
    doc.sections.forEach((s, i) => {
        const title = (cont) =>
            `<div class="sec-h1"${cont ? "" : ` id="${s.id}"`}><span class="code">${escapeHtml(sectionCode(i))}</span><span class="dot-separator">·</span>${escapeHtml(s.title)}${cont ? ` <span class="sec-cont">(suite)</span>` : ""}</div>`;
        let currentPage = title(false);

        s.blocks.forEach((block) => {
            if (block.type === "pagebreak") {
                pagesInner.push(currentPage);
                pageSection.push(s.id);
                currentPage = block.repeatTitle ? title(true) : "";
            } else {
                // data-bid relie l'élément rendu à son éditeur dans le panneau
                currentPage += renderBlockHtml(block).replace(
                    /^\s*<([a-z0-9]+)/i,
                    `<$1 data-bid="${block.id}"`,
                );
            }
        });

        // Dernière page de la section
        if (currentPage.trim() !== "") {
            pagesInner.push(currentPage);
            pageSection.push(s.id);
        }
    });

    const total = pagesInner.length;
    const html = pagesInner
        .map(
            (inner, i) =>
                `<div class="page" style="${styleVars}"${pageSection[i] ? ` data-section="${pageSection[i]}"` : ""}${pagePanel[i] ? ` data-panel="${pagePanel[i]}"` : ""}>${header()}${inner}${footer(i + 1, total)}</div>`,
        )
        .join("");

    document.getElementById("preview").innerHTML = html;
    updateTocPages();
    checkOverflow();
    applyLinkedHighlight();
}
