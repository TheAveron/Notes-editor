/* Atelier de Dossiers — Panneau « Couverture du document » et note d'usage. */

function renderDocSettings(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Couverture du document")]),
    );
    box.appendChild(
        fieldText("Ligne d'organisation", doc.cover.orgLine, (v) => {
            doc.cover.orgLine = v;
            update();
        }),
    );
    box.appendChild(
        fieldText("Sur-titre (kicker)", doc.cover.kicker, (v) => {
            doc.cover.kicker = v;
            update();
        }),
    );
    box.appendChild(
        fieldText("Titre principal", doc.cover.title, (v) => {
            doc.cover.title = v;
            syncRegistryTitle();
            update();
        }),
    );
    box.appendChild(
        fieldText("Sous-titre", doc.cover.subtitle, (v) => {
            doc.cover.subtitle = v;
            update();
        }),
    );
    box.appendChild(
        fieldText("Texte du tampon", doc.cover.stampText, (v) => {
            doc.cover.stampText = v;
            update();
        }, true),
    );
    box.appendChild(
        fieldText("Marque en pied/en-tête de page", doc.footerBrand, (v) => {
            doc.footerBrand = v;
            update();
        }),
    );

    box.appendChild(
        el("label", { style: "margin-top:10px;display:block;" }, [
            document.createTextNode("Métadonnées (tableau de couverture)"),
        ]),
    );
    const rows = el("div", { class: "rows-list" });
    doc.cover.meta.forEach((m, i) => {
        const rp = el("div", { class: "rowpair" });
        const ai = el("input", {
            type: "text",
            value: m.a,
            class: "narrow",
        });
        ai.addEventListener("input", (e) => {
            m.a = e.target.value;
            update();
            refreshSectionBadges();
        });
        const bi = el("input", { type: "text", value: m.b });
        bi.addEventListener("input", (e) => {
            m.b = e.target.value;
            update();
            refreshSectionBadges();
        });
        const del = el(
            "button",
            {
                class: "icon-btn danger",
                onclick: () => {
                    doc.cover.meta.splice(i, 1);
                    update({ structure: true });
                },
            },
            [document.createTextNode("✕")],
        );
        rp.appendChild(ai);
        rp.appendChild(bi);
        rp.appendChild(del);
        rows.appendChild(rp);
    });
    box.appendChild(rows);
    box.appendChild(
        el(
            "button",
            {
                class: "add-row-btn",
                onclick: () => {
                    doc.cover.meta.push({
                        a: "Champ",
                        b: "Valeur",
                    });
                    update({ structure: true });
                },
            },
            [document.createTextNode("+ ligne")],
        ),
    );

    box.appendChild(
        el("label", { style: "margin-top:12px;display:block;" }, [
            document.createTextNode("Note d'usage"),
        ]),
    );
    box.appendChild(
        fieldText(
            "Texte introductif",
            doc.noteUsage.text,
            (v) => {
                doc.noteUsage.text = v;
                update();
            },
            true,
        ),
    );
    const legendRow = el("div", { class: "field" });
    const cb = el("input", { type: "checkbox" });
    cb.checked = doc.noteUsage.includeTagLegend;
    cb.addEventListener("change", (e) => {
        doc.noteUsage.includeTagLegend = e.target.checked;
        update();
    });
    const lbl = el(
        "label",
        {
            style: "display:flex;align-items:center;gap:6px;font-weight:400;",
        },
        [cb, document.createTextNode("Inclure la légende des 4 tags")],
    );
    legendRow.appendChild(lbl);
    box.appendChild(legendRow);

    container.appendChild(box);
}
