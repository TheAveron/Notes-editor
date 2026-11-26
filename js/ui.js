/* Atelier de Dossiers — Petits utilitaires de construction de formulaires. */

/* ---------- Rendu : SIDEBAR (formulaires) ---------- */
function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
        if (k === "html") e.innerHTML = attrs[k];
        else if (k.startsWith("on"))
            e.addEventListener(k.substring(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
    }
    if (attrs && attrs.title && !attrs["aria-label"])
        e.setAttribute("aria-label", attrs.title);
    (children || []).forEach((c) => c && e.appendChild(c));
    return e;
}

function fieldText(labelText, value, onInput, multiline) {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", {}, [document.createTextNode(labelText)]));
    const input = el(
        multiline ? "textarea" : "input",
        multiline ? {} : { type: "text" },
    );
    input.value = value || "";
    input.addEventListener("input", (e) => onInput(e.target.value));
    f.appendChild(input);
    return f;
}

// Construit l'éditeur d'une ligne de tableau/carte : une première ligne pour les champs courts
// (badge et/ou libellé) + bouton de suppression, puis une zone de texte multi-ligne pour la valeur.
function makeRowBlock(row, topFields, valueKey, onChange, onDelete) {
    const wrap = el("div", { class: "row-block" });
    const top = el("div", { class: "row-top" });
    topFields.forEach((f) => {
        const inp = el("input", {
            type: "text",
            value: row[f.key] || "",
            placeholder: f.placeholder,
            class: f.narrow ? "narrow" : "",
        });
        inp.addEventListener("input", (e) => {
            row[f.key] = e.target.value;
            onChange();
        });
        top.appendChild(inp);
    });
    top.appendChild(
        el(
            "button",
            {
                class: "icon-btn danger",
                title: "Supprimer la ligne",
                onclick: onDelete,
            },
            [document.createTextNode("✕")],
        ),
    );
    wrap.appendChild(top);
    const ta = el("textarea", {
        class: "row-value",
        placeholder: "Valeur / contenu…",
    });
    ta.value = row[valueKey] || "";
    ta.addEventListener("input", (e) => {
        row[valueKey] = e.target.value;
        onChange();
    });
    wrap.appendChild(ta);
    return wrap;
}
