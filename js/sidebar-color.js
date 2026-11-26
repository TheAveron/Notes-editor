/* Atelier de Dossiers — Panneau « Couleur du document ». */

// Message affiché sous le champ « Couleur personnalisée ». Il est conservé ici (et non dans
// le DOM) pour survivre à la reconstruction du panneau.
let colorMsg = null; // { cls, text } | null

async function selectColor(hex) {
    doc.color = normalizeHex(hex);
    await registerColor(doc.id, doc.color, doc.cover.title);
    update({ structure: true });
}

function renderColorPicker(container) {
    const box = el("div", { class: "side-section" });
    box.appendChild(
        el("h3", {}, [document.createTextNode("Couleur du document")]),
    );

    const grid = el("div", { class: "swatch-grid" });
    proposals.forEach((hex, i) => {
        const isSelected = normalizeHex(doc.color) === normalizeHex(hex);
        const sw = el("button", {
            type: "button",
            class: "swatch" + (isSelected ? " selected" : ""),
            title: "Choisir la couleur " + hex,
            "aria-pressed": String(isSelected),
            onclick: () => {
                colorMsg = null;
                selectColor(hex);
            },
        });
        sw.appendChild(
            el("div", {
                class: "chip",
                style: `background:${hex};`,
            }),
        );
        sw.appendChild(
            el("span", { class: "hex" }, [document.createTextNode(hex)]),
        );
        if (i === 0)
            sw.appendChild(
                el("span", { class: "default-tag" }, [
                    document.createTextNode("DÉFAUT"),
                ]),
            );
        grid.appendChild(sw);
    });
    box.appendChild(grid);

    const actions = el("div", { class: "swatch-actions" });
    actions.appendChild(
        el(
            "button",
            {
                onclick: () => {
                    // La couleur actuelle reste en tête pour pouvoir y revenir.
                    proposals = [
                        doc.color,
                        ...generateProposals(
                            [...registryHexes(), doc.color],
                            4,
                        ),
                    ];
                    renderSidebar();
                },
            },
            [document.createTextNode("↻ 5 nouvelles propositions")],
        ),
    );
    box.appendChild(actions);

    const customWrap = el("div", { class: "custom-hex" });
    const colorInput = el("input", {
        type: "color",
        value: isValidHex(doc.color) ? normalizeHex(doc.color) : "#2f6f5e",
    });
    const textInput = el("input", {
        type: "text",
        placeholder: "#RRGGBB",
        value: doc.color,
    });
    const msg = el("div", colorMsg ? { class: colorMsg.cls } : {});
    if (colorMsg) msg.textContent = colorMsg.text;
    // Refus : on revient à la dernière couleur validée (l'aperçu a pu suivre le glissement).
    function refuse(text) {
        colorMsg = { cls: "hex-warning", text };
        const mine = registry.find((r) => r.docId === doc.id);
        if (mine) doc.color = mine.hex;
        update({ structure: true });
    }
    function tryCustom(val) {
        if (!isValidHex(val)) return refuse("Code hexadécimal invalide.");
        const norm = normalizeHex(val);
        const others = registry.filter((r) => r.docId !== doc.id);
        const clash = others.find((r) => normalizeHex(r.hex) === norm);
        if (clash) return refuse(`Déjà utilisée par « ${clash.title} ».`);
        // Même critère que les propositions automatiques : une teinte quasi identique
        // est acceptée (choix explicite) mais signalée.
        const near = others.find(
            (r) => colorDistance(r.hex, norm) < MIN_DISTANCE_USED,
        );
        colorMsg = near
            ? {
                  cls: "hex-warning",
                  text: `Acceptée, mais très proche de « ${near.title} » (${near.hex}).`,
              }
            : { cls: "hex-ok", text: "Couleur disponible ✓" };
        selectColor(norm);
    }
    // Pendant le glissement dans le sélecteur natif : aperçu seulement, sans reconstruire
    // le panneau (ce qui fermerait le sélecteur). La validation se fait au relâchement.
    colorInput.addEventListener("input", () => {
        textInput.value = colorInput.value;
        doc.color = normalizeHex(colorInput.value);
        renderPreview(); // aperçu seul : rien n'est validé tant que le curseur bouge
    });
    colorInput.addEventListener("change", () => tryCustom(colorInput.value));
    textInput.addEventListener("change", () => tryCustom(textInput.value));
    customWrap.appendChild(colorInput);
    customWrap.appendChild(textInput);
    box.appendChild(
        el("label", {}, [document.createTextNode("Couleur personnalisée")]),
    );
    box.appendChild(customWrap);
    box.appendChild(msg);

    const pal = derivePalette(doc.color);
    const palPrev = el("div", { class: "palette-preview" });
    [pal.ink, pal.inkMid, pal.accent, pal.accentBg, pal.card].forEach((c) =>
        palPrev.appendChild(el("div", { style: `background:${c};`, title: c })),
    );
    box.appendChild(
        el("label", { style: "margin-top:8px;" }, [
            document.createTextNode("Palette dérivée (encre → fond)"),
        ]),
    );
    box.appendChild(palPrev);

    const stampRow = el("div", {
        class: "field",
        style: "margin-top:10px;",
    });
    stampRow.appendChild(
        el("label", {}, [
            document.createTextNode("Style du tampon de couverture"),
        ]),
    );
    const sel = el("select", {
        onchange: (e) => {
            doc.stampStyle = e.target.value;
            update();
        },
    });
    ["accent", "red"].forEach((v) => {
        const o = el("option", { value: v }, [
            document.createTextNode(
                v === "accent"
                    ? "Couleur du document"
                    : "Rouge (alerte / restreint)",
            ),
        ]);
        if (doc.stampStyle === v) o.setAttribute("selected", "selected");
        sel.appendChild(o);
    });
    stampRow.appendChild(sel);
    box.appendChild(stampRow);

    container.appendChild(box);
}
