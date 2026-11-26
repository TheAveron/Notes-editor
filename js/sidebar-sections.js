/* Atelier de Dossiers — Panneau « Sections & contenu » : éditeurs de blocs. */

// Types de blocs proposés à l'ajout, dans l'ordre des menus.
const BLOCK_MENU = [
    ["heading2", "Sous-titre"],
    ["paragraph", "Paragraphe"],
    ["bullets", "Liste"],
    ["callout", "Callout"],
    ["table", "Tableau"],
    ["card", "Fiche"],
    ["crossref", "Renvoi"],
    ["pagebreak", "Saut de page"],
];

const isArchiveEditor = () => editorMode === "dossier" || editorMode === "entry";
// Une entrée seule n'a pas de mise en page : pas de saut de page (il appartient au dossier).
function availableBlockTypes() {
    return editorMode === "entry"
        ? BLOCK_MENU.filter(([t]) => t !== "pagebreak")
        : BLOCK_MENU;
}
// Liste déroulante des blocs partagés de l'archive ; onPick(bloc prêt à insérer).
function sharedBlockSelect(firstLabel, onPick, cls) {
    const sel = el("select", {
        class: cls,
        onchange: (e) => {
            const ref = e.target.value;
            if (!ref) return;
            const b = sharedBlockForDoc(ref);
            if (b) onPick(b);
        },
    });
    sel.appendChild(el("option", { value: "" }, [document.createTextNode(firstLabel)]));
    [...archive.blocks.values()]
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "fr"))
        .forEach((sb) =>
            sel.appendChild(
                el("option", { value: sb.id }, [
                    document.createTextNode(sb.name || sb.id),
                ]),
            ),
        );
    return sel;
}

// Sections repliées dans le panneau (état d'affichage, non enregistré dans le document).
const collapsedSections = new Set();

/* ---------- Glisser-déposer (blocs et sections) ----------
   Implémenté avec les événements pointeur plutôt que l'API HTML5 drag & drop : celle-ci
   interrompt le glissement au passage sur les zones de texte des blocs, et ne fonctionne
   pas au tactile. Les cibles portent data-drop="block" ou "section" et leur callback. */
let drag = null; // { data, container, target, after }

function clearDropMarks() {
    document
        .querySelectorAll("#sidebar .drop-before, #sidebar .drop-after")
        .forEach((e) => e.classList.remove("drop-before", "drop-after"));
}
function makeDragHandle(container, data, title) {
    const h = el("span", { class: "drag-handle", title }, [
        document.createTextNode("⠿"),
    ]);
    h.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag = { data, container, target: null, after: false };
        container.classList.add("dragging");
        document.body.classList.add("is-dragging");
        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragEnd);
        window.addEventListener("pointercancel", onDragCancel);
        window.addEventListener("keydown", onDragKey);
    });
    return h;
}
function onDragMove(e) {
    if (!drag) return;
    clearDropMarks();
    drag.target = null;
    // Défilement automatique du panneau près de ses bords
    const sidebar = document.getElementById("sidebar");
    const sr = sidebar.getBoundingClientRect();
    if (e.clientY < sr.top + 40) sidebar.scrollTop -= 14;
    else if (e.clientY > sr.bottom - 40) sidebar.scrollTop += 14;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const t = under && under.closest(`[data-drop="${drag.data.kind}"]`);
    if (!t || t === drag.container || !sidebar.contains(t)) return;
    const r = t.getBoundingClientRect();
    drag.target = t;
    drag.after = e.clientY > r.top + r.height / 2;
    t.classList.add(drag.after ? "drop-after" : "drop-before");
}
function endDrag() {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragCancel);
    window.removeEventListener("keydown", onDragKey);
    document.body.classList.remove("is-dragging");
    clearDropMarks();
    const d = drag;
    drag = null;
    if (d) d.container.classList.remove("dragging");
    return d;
}
function onDragEnd() {
    const d = endDrag();
    if (d && d.target && d.target._onDrop) d.target._onDrop(d.data, d.after);
}
function onDragCancel() {
    endDrag();
}
function onDragKey(e) {
    if (e.key === "Escape") endDrag();
}
// onDrop(data, after) : after indique si l'on dépose après (moitié basse) ou avant.
function makeDropTarget(elm, kind, onDrop) {
    elm.setAttribute("data-drop", kind);
    elm._onDrop = onDrop;
}
function moveItem(fromList, fromIdx, toList, toIdx) {
    const [it] = fromList.splice(fromIdx, 1);
    if (fromList === toList && fromIdx < toIdx) toIdx--;
    toList.splice(toIdx, 0, it);
}
function moveBlockTo(d, targetSection, targetIdx) {
    const from = doc.sections.find((x) => x.id === d.sid);
    if (!from) return;
    moveItem(from.blocks, d.idx, targetSection.blocks, targetIdx);
    collapsedSections.delete(targetSection.id);
    update({ structure: true });
}

function blockHeader(label, s, b, idx, item) {
    const head = el("div", { class: "block-item-head" });
    head.appendChild(
        makeDragHandle(
            item,
            { kind: "block", sid: s.id, idx },
            "Glisser pour déplacer le bloc (y compris vers une autre section)",
        ),
    );
    head.appendChild(el("span", {}, [document.createTextNode(label)]));
    if (b._shared) {
        const n = entriesUsingBlock(b._shared).length;
        head.appendChild(
            el(
                "a",
                {
                    class: "shared-badge",
                    href: `#/bloc/${b._shared}`,
                    title: `Bloc partagé : le modifier ici le modifie dans ${n > 1 ? `les ${n} entrées qui l'utilisent` : "toutes les entrées qui l'utiliseront"}.`,
                },
                [document.createTextNode("⇄ " + (b._sharedName || b._shared))],
            ),
        );
    }
    head.appendChild(el("span", { class: "grow" }));
    if (isArchiveEditor() && b.type !== "pagebreak" && !b._missingRef)
        head.appendChild(
            el(
                "button",
                {
                    class: "icon-btn",
                    title: b._shared
                        ? "Détacher : remplacer par une copie propre à cette entrée"
                        : "Partager : en faire un bloc réutilisable dans d'autres entrées",
                    onclick: () => (b._shared ? detachBlock(b) : shareBlock(b)),
                },
                [document.createTextNode(b._shared ? "⇥" : "⇄")],
            ),
        );
    // Insertion d'un nouveau bloc juste après celui-ci
    const ins = el("select", {
        class: "insert-select",
        title: "Insérer un bloc après celui-ci",
        onchange: (e) => {
            const t = e.target.value;
            if (!t) return;
            const nb = t.startsWith("partage:")
                ? sharedBlockForDoc(t.slice(8))
                : newBlock(t);
            if (!nb) return;
            s.blocks.splice(idx + 1, 0, nb);
            update({ structure: true });
        },
    });
    ins.appendChild(el("option", { value: "" }, [document.createTextNode("＋")]));
    availableBlockTypes().forEach(([t, l]) =>
        ins.appendChild(
            el("option", { value: t }, [
                document.createTextNode("Insérer après : " + l),
            ]),
        ),
    );
    if (isArchiveEditor())
        archive.blocks.forEach((sb) =>
            ins.appendChild(
                el("option", { value: "partage:" + sb.id }, [
                    document.createTextNode("Insérer après : ⇄ " + (sb.name || sb.id)),
                ]),
            ),
        );
    head.appendChild(ins);
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
                    // La copie d'un bloc partagé est une copie indépendante
                    delete copy._shared;
                    delete copy._sharedName;
                    delete copy._origId;
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
    item.setAttribute("data-bid", b.id);
    item.appendChild(blockHeader(labels[b.type] || b.type, s, b, idx, item));
    makeDropTarget(item, "block", (d, after) =>
        moveBlockTo(d, s, idx + (after ? 1 : 0)),
    );
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
        const toneRow = el("div", { class: "field" });
        toneRow.appendChild(
            el("label", {}, [document.createTextNode("Couleur de la fiche")]),
        );
        const toneSel = el("select", {
            onchange: (e) => {
                b.tone = e.target.value;
                update();
            },
        });
        [
            ["hook", "Sarcelle (hook MJ)"],
            ["accent", "Couleur du document"],
        ].forEach(([v, label]) => {
            const o = el("option", { value: v }, [document.createTextNode(label)]);
            if ((b.tone || "hook") === v) o.setAttribute("selected", "selected");
            toneSel.appendChild(o);
        });
        toneRow.appendChild(toneSel);
        body.appendChild(toneRow);
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
            el("div", { style: "font-size:12px;color:#999;margin-bottom:6px;" }, [
                document.createTextNode(
                    "Force un saut de page à l'impression.",
                ),
            ]),
        );
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!b.repeatTitle;
        cb.addEventListener("change", (e) => {
            b.repeatTitle = e.target.checked;
            update();
        });
        body.appendChild(
            el(
                "label",
                {
                    style: "display:flex;gap:6px;align-items:center;font-weight:400;font-size:12px;",
                },
                [
                    cb,
                    document.createTextNode(
                        "Répéter le titre de la section sur la page suivante (suite)",
                    ),
                ],
            ),
        );
    }

    item.appendChild(body);
    return item;
}

function renderSectionCard(s, idx) {
    const entryMode = editorMode === "entry";
    const collapsed = !entryMode && collapsedSections.has(s.id);
    const card = el("div", {
        class: "section-card" + (collapsed ? " collapsed" : ""),
        "data-sid": s.id,
    });
    // Entrée seule : son titre et ses métadonnées sont dans le panneau « Entrée »
    if (entryMode) {
        renderSectionBody(card, s);
        return card;
    }
    const head = el("div", { class: "section-head" });
    head.appendChild(
        makeDragHandle(
            card,
            { kind: "section", sid: s.id, idx },
            "Glisser pour déplacer la section",
        ),
    );
    head.appendChild(
        el(
            "button",
            {
                class: "icon-btn fold-btn",
                title: collapsed ? "Déplier la section" : "Replier la section",
                onclick: () => {
                    if (collapsed) collapsedSections.delete(s.id);
                    else collapsedSections.add(s.id);
                    renderSidebar();
                },
            },
            [document.createTextNode(collapsed ? "▸" : "▾")],
        ),
    );
    makeDropTarget(card, "section", (d, after) => {
        moveItem(doc.sections, d.idx, doc.sections, idx + (after ? 1 : 0));
        update({ structure: true });
    });
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
                title:
                    editorMode === "dossier"
                        ? "Retirer la section du dossier (l'entrée reste dans l'archive)"
                        : "Supprimer la section",
                onclick: () => {
                    const msg =
                        editorMode === "dossier"
                            ? `Retirer « ${s.title || sectionCode(idx)} » de ce dossier ?\nL'entrée reste dans l'archive. (Ctrl+Z permet d'annuler.)`
                            : `Supprimer la section « ${s.title || sectionCode(idx)} » et ses ${s.blocks.length} bloc(s) ?\n(Ctrl+Z permet d'annuler.)`;
                    if (s.blocks.length && !confirm(msg)) return;
                    doc.sections.splice(idx, 1);
                    update({ structure: true });
                },
            },
            [document.createTextNode("✕")],
        ),
    );
    card.appendChild(head);
    if (editorMode === "dossier") card.appendChild(sectionEntryLine(s));
    if (collapsed) {
        const n = s.blocks.length;
        card.appendChild(
            el("div", { class: "collapsed-summary" }, [
                document.createTextNode(`${n} bloc${n > 1 ? "s" : ""} — section repliée`),
            ]),
        );
        return card;
    }
    renderSectionBody(card, s);
    return card;
}

// Ligne « Entrée : … · aussi dans … » sous le titre d'une section de dossier
function sectionEntryLine(s) {
    const line = el("div", { class: "section-entry-line" });
    if (s._missingEntry) {
        line.classList.add("warn");
        line.appendChild(
            document.createTextNode(`⚠ L'entrée « ${s._missingEntry} » n'existe plus dans l'archive.`),
        );
        return line;
    }
    const saved = s._entry && archive.entries.has(s._entry);
    line.appendChild(document.createTextNode("Entrée : "));
    line.appendChild(
        saved
            ? el("a", { href: `#/entree/${s._entry}` }, [document.createTextNode(s._entry)])
            : el("span", {}, [document.createTextNode("nouvelle (créée à l'enregistrement)")]),
    );
    const others = s._entry
        ? dossiersUsingEntry(s._entry).filter((u) => u.dossier.id !== doc.id)
        : [];
    if (others.length) {
        line.appendChild(document.createTextNode(" · aussi dans "));
        others.forEach((u, i) => {
            if (i) line.appendChild(document.createTextNode(", "));
            line.appendChild(
                el("a", { href: `#/dossier/${u.dossier.id}` }, [
                    document.createTextNode(dossierTitle(u.dossier)),
                ]),
            );
        });
        line.title = "Les modifications de cette section s'appliquent aussi à ces dossiers.";
        line.classList.add("shared");
    }
    return line;
}

function renderSectionBody(card, s) {
    const blockList = el("div", { class: "block-list" });
    s.blocks.forEach((b, bidx) =>
        blockList.appendChild(renderBlockEditor(s, b, bidx)),
    );
    // Section vide : on peut quand même y déposer un bloc.
    if (!s.blocks.length) {
        blockList.appendChild(
            el("div", { class: "empty-drop" }, [
                document.createTextNode("Section vide — déposez un bloc ici"),
            ]),
        );
        makeDropTarget(blockList, "block", (d) => moveBlockTo(d, s, 0));
    }
    card.appendChild(blockList);

    const menu = el("div", { class: "add-block-menu" });
    availableBlockTypes().forEach(([t, l]) => {
        const label = "+ " + l;
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
    if (isArchiveEditor() && archive.blocks.size)
        menu.appendChild(
            sharedBlockSelect(
                "+ Bloc partagé…",
                (b) => {
                    s.blocks.push(b);
                    update({ structure: true });
                },
                "add-shared-select",
            ),
        );
    card.appendChild(menu);
}

const FORMAT_HINT_HTML =
    "Mise en forme dans les textes : <code>**gras**</code>, <code>*italique*</code>, " +
    "<code>\\*</code> pour un astérisque. Laisser une ligne vide pour aller à la ligne.";

function renderSections(container) {
    const entryMode = editorMode === "entry";
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [
            document.createTextNode(entryMode ? "Contenu de l'entrée" : "Sections & contenu"),
        ]),
    );
    box.appendChild(
        el("div", { class: "format-hint", html: FORMAT_HINT_HTML }),
    );
    if (entryMode) {
        doc.sections.forEach((s, idx) => box.appendChild(renderSectionCard(s, idx)));
        container.appendChild(box);
        return;
    }
    const foldAll = el("div", { class: "fold-all" });
    foldAll.appendChild(
        el(
            "button",
            {
                onclick: () => {
                    doc.sections.forEach((s) => collapsedSections.add(s.id));
                    renderSidebar();
                },
            },
            [document.createTextNode("▸ Tout replier")],
        ),
    );
    foldAll.appendChild(
        el(
            "button",
            {
                onclick: () => {
                    collapsedSections.clear();
                    renderSidebar();
                },
            },
            [document.createTextNode("▾ Tout déplier")],
        ),
    );
    box.appendChild(foldAll);
    doc.sections.forEach((s, idx) =>
        box.appendChild(renderSectionCard(s, idx)),
    );
    box.appendChild(
        el(
            "button",
            {
                class: "add-section-btn",
                onclick: () => {
                    // Dans l'archive, le titre donne aussi l'identifiant (nom du fichier)
                    let title;
                    if (editorMode === "dossier") {
                        title = prompt("Titre de la nouvelle section (une nouvelle entrée de l'archive) :");
                        if (!title || !title.trim()) return;
                        title = title.trim();
                    }
                    doc.sections.push(newSection(title));
                    update({ structure: true });
                },
            },
            [
                document.createTextNode(
                    editorMode === "dossier"
                        ? "+ Nouvelle section (nouvelle entrée)"
                        : "+ Ajouter une section",
                ),
            ],
        ),
    );
    // Dossier de l'archive : réutiliser une entrée existante comme section
    if (editorMode === "dossier") {
        const sel = el("select", {
            class: "insert-entry-select",
            onchange: (e) => {
                const id = e.target.value;
                if (!id || !archive.entries.has(id)) return;
                doc.sections.push(sectionForEntry(id));
                update({ structure: true });
            },
        });
        sel.appendChild(
            el("option", { value: "" }, [
                document.createTextNode("+ Insérer une entrée existante…"),
            ]),
        );
        const inDoc = new Set(doc.sections.map((s) => s._entry));
        [...archive.entries.values()]
            .sort((a, b) => a.title.localeCompare(b.title, "fr"))
            .forEach((e) =>
                sel.appendChild(
                    el("option", { value: e.id }, [
                        document.createTextNode(
                            (inDoc.has(e.id) ? "✓ " : "") + `${e.title} (${e.id})`,
                        ),
                    ]),
                ),
            );
        box.appendChild(sel);
    }
    container.appendChild(box);
}
