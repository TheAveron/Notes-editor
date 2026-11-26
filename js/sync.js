/* Atelier de Dossiers — Liaison entre l'aperçu et le panneau d'édition.
   - Cliquer un élément de l'aperçu fait défiler le panneau jusqu'à son éditeur.
   - Placer le curseur dans un éditeur de bloc fait défiler l'aperçu jusqu'au bloc,
     qui reste surligné tant que l'éditeur a le focus. */

let linkedBid = null; // bloc dont l'éditeur a le focus

function flash(elm) {
    elm.classList.remove("flash");
    void elm.offsetWidth; // relance l'animation
    elm.classList.add("flash");
}

function revealInSidebar(selector, sectionId) {
    // Une section repliée est dépliée pour montrer le bloc
    if (sectionId && collapsedSections.has(sectionId)) {
        collapsedSections.delete(sectionId);
        renderSidebar();
    }
    const t = document.querySelector(selector);
    if (!t) return;
    t.scrollIntoView({ behavior: "smooth", block: "center" });
    flash(t);
}

// Reporte le surlignage après chaque régénération de l'aperçu.
function applyLinkedHighlight() {
    document
        .querySelectorAll("#preview .linked")
        .forEach((e) => e.classList.remove("linked"));
    if (!linkedBid) return null;
    const target = document.querySelector(`#preview [data-bid="${linkedBid}"]`);
    if (target) target.classList.add("linked");
    return target;
}

document.getElementById("preview").addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) {
        // Ancre interne (table des matières, renvoi) : on fait défiler l'aperçu sans
        // changer l'adresse, qui sert à la navigation dans l'archive (#/…).
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#") && !href.startsWith("#/")) {
            e.preventDefault();
            const t = document.getElementById(href.slice(1));
            if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
    }
    const blockEl = e.target.closest("[data-bid]");
    if (blockEl) {
        const bid = blockEl.dataset.bid;
        const sec = doc.sections.find((s) => s.blocks.some((b) => b.id === bid));
        revealInSidebar(`#sidebar .block-item[data-bid="${bid}"]`, sec && sec.id);
        return;
    }
    const page = e.target.closest(".page");
    if (!page) return;
    if (page.dataset.section)
        revealInSidebar(`#sidebar .section-card[data-sid="${page.dataset.section}"]`);
    else if (page.dataset.panel) revealInSidebar(`#panel-${page.dataset.panel}`);
});

const sidebarEl = document.getElementById("sidebar");
sidebarEl.addEventListener("focusin", (e) => {
    const item = e.target.closest(".block-item[data-bid]");
    if (item) {
        linkedBid = item.dataset.bid;
        const target = applyLinkedHighlight();
        // Défilement immédiat : une animation serait interrompue par le rendu suivant (frappe)
        if (target) target.scrollIntoView({ block: "nearest" });
        return;
    }
    linkedBid = null;
    applyLinkedHighlight();
    // Titre de section : on montre le début de la section dans l'aperçu
    const card = e.target.closest(".section-head");
    const sid = card && card.parentElement.dataset.sid;
    const heading = sid && document.getElementById(sid);
    if (heading) heading.scrollIntoView({ block: "nearest" });
});
sidebarEl.addEventListener("focusout", (e) => {
    // Le focus quitte le panneau (et non un champ pour un autre champ du même bloc)
    if (!e.relatedTarget || !sidebarEl.contains(e.relatedTarget)) {
        linkedBid = null;
        applyLinkedHighlight();
    }
});
