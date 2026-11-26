/* Atelier de Dossiers — Panneau « Sections & contenu » : éditeurs de blocs. */

function blockHeader(label, s, b, idx) {
    const head = el("div", { class: "block-item-head" });
    head.appendChild(el("span", {}, [document.createTextNode(label)]));
    head.appendChild(el("span", { class: "grow" }));
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Monter",
                onclick: () => {
                    if (idx > 0) {
                        [s.blocks[idx - 1], s.blocks[idx]] = [
                            s.blocks[idx],
                            s.blocks[idx - 1],
                        ];
                        update({ structure: true });
                    }
                },
            },
            [document.createTextNode("↑")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Descendre",
                onclick: () => {
                    if (idx < s.blocks.length - 1) {
                        [s.blocks[idx + 1], s.blocks[idx]] = [
                            s.blocks[idx],
                            s.blocks[idx + 1],
                        ];
                        update({ structure: true });
                    }
                },
            },
            [document.createTextNode("↓")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Dupliquer",
                onclick: () => {
                    const copy = JSON.parse(JSON.stringify(b));
                    copy.id = uid();
                    s.blocks.splice(idx + 1, 0, copy);
                    update({ structure: true });
                },
            },
            [document.createTextNode("⧉")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer",
                onclick: () => {
                    s.blocks.splice(idx, 1);
                    update({ structure: true });
                },
            },
            [document.createTextNode("✕")],
        ),
    );
    return head;
}

function renderBlockEditor(s, b, idx) {
    const item = el("div", { class: "block-item" });
    const labels = {
        heading2: "Sous-titre",
        paragraph: "Paragraphe",
        bullets: "Liste à puces",
        callout: "Callout",
        table: "Tableau",
        card: "Fiche (hook/carte)",
        crossref: "Renvoi",
        pagebreak: "Saut de page",
    };
    item.appendChild(blockHeader(labels[b.type] || b.type, s, b, idx));
    const body = el("div", { class: "block-item-body" });

    if (b.type === "heading2") {
        body.appendChild(
            fieldText("Texte", b.text, (v) => {
                b.text = v;
                update();
            }),
        );
    } else if (b.type === "paragraph") {
        body.appendChild(
            fieldText(
                "Texte",
                b.text,
                (v) => {
                    b.text = v;
                    update();
                },
                true,
            ),
        );
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!b.italic;
        cb.addEventListener("change", (e) => {
            b.italic = e.target.checked;
            update();
        });
        body.appendChild(
            el(
                "label",
                {
                    style: "display:flex;gap:6px;align-items:center;font-weight:400;",
                },
                [cb, document.createTextNode("Italique")],
            ),
        );
    } else if (b.type === "bullets") {
        const list = el("div", { class: "bullets-list" });
        b.items.forEach((it, i) => {
            const rp = el("div", { class: "rowpair" });
            // Zone de texte (et non champ simple) pour permettre les retours à la ligne.
            const inp = el("textarea", { class: "bullet-input", rows: "1" });
            inp.value = it;
            inp.addEventListener("input", (e) => {
                b.items[i] = e.target.value;
                update();
            });
            const del = el(
                "button",
                {
                    class: "icon-btn danger",
                    onclick: () => {
                        b.items.splice(i, 1);
                        update({ structure: true });
                    },
                },
                [document.createTextNode("✕")],
            );
            rp.appendChild(inp);
            rp.appendChild(del);
            list.appendChild(rp);
        });
        body.appendChild(list);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-item-btn",
                    onclick: () => {
                        b.items.push("Nouveau point");
                        update({ structure: true });
                    },
                },
                [document.createTextNode("+ puce")],
            ),
        );
    } else if (b.type === "callout") {
        const tagRow = el("div", { class: "tag-select" });
        Object.keys(TAG_META).forEach((tagKey) => {
            const active = b.tag === tagKey;
            const btn = el(
                "button",
                {
                    style: active ? `background:${TAG_META[tagKey].bg};` : "",
                    class: active ? "active" : "",
                    onclick: () => {
                        b.tag = tagKey;
                        update({ structure: true });
                    },
                },
                [document.createTextNode(TAG_META[tagKey].label)],
            );
            tagRow.appendChild(btn);
        });
        body.appendChild(
            el("label", {}, [document.createTextNode("Type de tag")]),
        );
        body.appendChild(tagRow);
        body.appendChild(
            fieldText("Titre du callout", b.title, (v) => {
                b.title = v;
                update();
            }),
        );
        const paraWrap = el("div", {});
        b.paragraphs.forEach((p, i) => {
            const rowBlock = el("div", { class: "row-block" });
            const top = el("div", { class: "row-top" });
            top.appendChild(
                el(
                    "span",
                    {
                        style: "flex:1;font-size:11px;color:#999;font-weight:600;",
                    },
                    [document.createTextNode("Paragraphe " + (i + 1))],
                ),
            );
            top.appendChild(
                el(
                    "button",
                    {
                        class: "icon-btn danger",
                        title: "Supprimer le paragraphe",
                        onclick: () => {
                            b.paragraphs.splice(i, 1);
                            update({ structure: true });
                        },
                    },
                    [document.createTextNode("✕")],
                ),
            );
            rowBlock.appendChild(top);
            const ta = el("textarea", {
                class: "row-value",
                placeholder: "Texte du paragraphe…",
            });
            ta.value = p;
            ta.addEventListener("input", (e) => {
                b.paragraphs[i] = e.target.value;
                update();
            });
            rowBlock.appendChild(ta);
            paraWrap.appendChild(rowBlock);
        });
        body.appendChild(paraWrap);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-item-btn",
                    onclick: () => {
                        b.paragraphs.push("Nouveau paragraphe");
                        update({ structure: true });
                    },
                },
                [document.createTextNode("+ paragraphe")],
            ),
        );
    } else if (b.type === "table") {
        const layoutRow = el("div", { class: "field" });
        layoutRow.appendChild(
            el("label", {}, [
                document.createTextNode("Disposition du tableau"),
            ]),
        );
        const sel = el("select", {
            onchange: (e) => {
                b.layout = e.target.value;
                update({ structure: true });
            },
        });
        const options = [
            ["label-value", "Libellé + valeur (standard)"],
            ["badge-value", "Badge + valeur (échelle simple, 2 colonnes)"],
            [
                "badge-label-value",
                "Badge + libellé + valeur (échelle à 3 colonnes)",
            ],
        ];
        options.forEach(([v, label]) => {
            const o = el("option", { value: v }, [
                document.createTextNode(label),
            ]);
            if (b.layout === v) o.setAttribute("selected", "selected");
            sel.appendChild(o);
        });
        layoutRow.appendChild(sel);
        body.appendChild(layoutRow);

        const threeCol = b.layout === "badge-label-value";
        const badgeCol = b.layout === "badge-value" || threeCol;
        const rows = el("div", { class: "rows-list" });
        b.rows.forEach((r, i) => {
            const topFields = [
                {
                    key: "a",
                    placeholder: badgeCol ? "Badge" : "Libellé",
                    narrow: badgeCol,
                },
            ];
            if (threeCol)
                topFields.push({
                    key: "c",
                    placeholder: "Libellé",
                    narrow: false,
                });
            rows.appendChild(
                makeRowBlock(
                    r,
                    topFields,
                    "b",
                    () => update(),
                    () => {
                        b.rows.splice(i, 1);
                        update({ structure: true });
                    },
                ),
            );
        });
        body.appendChild(rows);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-row-btn",
                    onclick: () => {
                        b.rows.push({ a: "", b: "", c: "" });
                        update({ structure: true });
                    },
                },
                [document.createTextNode("+ ligne")],
            ),
        );
    } else if (b.type === "card") {
        body.appendChild(
            fieldText("Badge (ex. HOOK 1)", b.badgeText, (v) => {
                b.badgeText = v;
                update();
            }),
        );
        body.appendChild(
            fieldText("Titre", b.title, (v) => {
                b.title = v;
                update();
            }),
        );
        body.appendChild(
            fieldText(
                "Accroche / description",
                b.pitch,
                (v) => {
                    b.pitch = v;
                    update();
                },
                true,
            ),
        );
        const rows = el("div", { class: "rows-list" });
        b.rows.forEach((r, i) => {
            rows.appendChild(
                makeRowBlock(
                    r,
                    [
                        {
                            key: "a",
                            placeholder: "Libellé",
                            narrow: false,
                        },
                    ],
                    "b",
                    () => update(),
                    () => {
                        b.rows.splice(i, 1);
                        update({ structure: true });
                    },
                ),
            );
        });
        body.appendChild(rows);
        body.appendChild(
            el(
                "button",
                {
                    class: "add-row-btn",
                    onclick: () => {
                        b.rows.push({ a: "", b: "" });
                        update({ structure: true });
                    },
                },
                [document.createTextNode("+ ligne")],
            ),
        );
    } else if (b.type === "crossref") {
        body.appendChild(
            fieldText("Texte du renvoi", b.text, (v) => {
                b.text = v;
                update();
            }),
        );
    } else if (b.type === "pagebreak") {
        body.appendChild(
            el("div", { style: "font-size:12px;color:#999;" }, [
                document.createTextNode(
                    "Force un saut de page à l'impression.",
                ),
            ]),
        );
    }

    item.appendChild(body);
    return item;
}

function renderSectionCard(s, idx) {
    const card = el("div", { class: "section-card" });
    const head = el("div", { class: "section-head" });
    const codeBadge = el(
        "span",
        {
            class: "code-badge",
            title: "Calculé automatiquement à partir du N° de dossier et de la position de la section",
        },
        [document.createTextNode(sectionCode(idx))],
    );
    const titleInput = el("input", {
        type: "text",
        value: s.title,
    });
    titleInput.addEventListener("input", (e) => {
        s.title = e.target.value;
        update();
    });
    head.appendChild(codeBadge);
    head.appendChild(titleInput);
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Monter la section",
                onclick: () => {
                    if (idx > 0) {
                        [doc.sections[idx - 1], doc.sections[idx]] = [
                            doc.sections[idx],
                            doc.sections[idx - 1],
                        ];
                        update({ structure: true });
                    }
                },
            },
            [document.createTextNode("↑")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn",
                title: "Descendre la section",
                onclick: () => {
                    if (idx < doc.sections.length - 1) {
                        [doc.sections[idx + 1], doc.sections[idx]] = [
                            doc.sections[idx],
                            doc.sections[idx + 1],
                        ];
                        update({ structure: true });
                    }
                },
            },
            [document.createTextNode("↓")],
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer la section",
                onclick: () => {
                    doc.sections.splice(idx, 1);
                    update({ structure: true });
                },
            },
            [document.createTextNode("✕")],
        ),
    );
    card.appendChild(head);

    const blockList = el("div", { class: "block-list" });
    s.blocks.forEach((b, bidx) =>
        blockList.appendChild(renderBlockEditor(s, b, bidx)),
    );
    card.appendChild(blockList);

    const menu = el("div", { class: "add-block-menu" });
    const types = [
        ["heading2", "+ Sous-titre"],
        ["paragraph", "+ Paragraphe"],
        ["bullets", "+ Liste"],
        ["callout", "+ Callout"],
        ["table", "+ Tableau"],
        ["card", "+ Fiche"],
        ["crossref", "+ Renvoi"],
        ["pagebreak", "+ Saut de page"],
    ];
    types.forEach(([t, label]) => {
        menu.appendChild(
            el(
                "button",
                {
                    onclick: () => {
                        s.blocks.push(newBlock(t));
                        update({ structure: true });
                    },
                },
                [document.createTextNode(label)],
            ),
        );
    });
    card.appendChild(menu);
    return card;
}

const FORMAT_HINT_HTML =
    "Mise en forme dans les textes : <code>**gras**</code>, <code>*italique*</code>, " +
    "<code>\\*</code> pour un astérisque. Laisser une ligne vide pour aller à la ligne.";

function renderSections(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Sections & contenu")]),
    );
    box.appendChild(
        el("div", { class: "format-hint", html: FORMAT_HINT_HTML }),
    );
    doc.sections.forEach((s, idx) =>
        box.appendChild(renderSectionCard(s, idx)),
    );
    box.appendChild(
        el(
            "button",
            {
                class: "add-section-btn",
                onclick: () => {
                    doc.sections.push(newSection());
                    update({ structure: true });
                },
            },
            [document.createTextNode("+ Ajouter une section")],
        ),
    );
    container.appendChild(box);
}
