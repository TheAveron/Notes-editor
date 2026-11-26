/* Atelier de Dossiers — Registre des couleurs : aperçu du panneau et modale. */

let registryEditMode = false;
async function removeRegistryEntry(idx) {
    const entry = registry[idx];
    if (!entry) return;
    if (
        !confirm(
            `Retirer « ${entry.title} » (${entry.hex}) du registre des couleurs ?`,
        )
    )
        return;
    registry.splice(idx, 1);
    await saveRegistry();
    renderSidebar();
}

function renderRegistryPanel(container) {
    const box = el("div", { class: "side-section" });
    const titleRow = el("div", {
        style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;",
    });
    titleRow.appendChild(
        el("h3", { style: "margin:0;" }, [
            document.createTextNode("Registre des couleurs (aperçu)"),
        ]),
    );
    titleRow.appendChild(
        el(
            "button",
            {
                class: "icon-btn" + (registryEditMode ? " active" : ""),
                title: "Modifier / retirer des couleurs",
                style: registryEditMode
                    ? "background:#eae6d8;color:#1a1a1a;"
                    : "",
                onclick: () => {
                    registryEditMode = !registryEditMode;
                    renderSidebar();
                },
            },
            [document.createTextNode("✎")],
        ),
    );
    box.appendChild(titleRow);
    const list = el("div", { class: "registry-list" });
    if (registry.length === 0) {
        list.appendChild(
            el("div", { style: "padding:8px;color:#999;font-size:11px;" }, [
                document.createTextNode(
                    "Aucune couleur enregistrée pour l'instant.",
                ),
            ]),
        );
    }
    registry.forEach((r, idx) => {
        const row = el("div", { class: "registry-row" });
        row.appendChild(
            el("span", {}, [
                el("span", {
                    class: "rc",
                    style: `background:${r.hex};`,
                }),
                document.createTextNode(r.title),
            ]),
        );
        const right = el("span", {
            style: "display:flex;align-items:center;gap:8px;",
        });
        right.appendChild(
            el(
                "span",
                {
                    style: "font-family:Consolas,monospace;color:#888;",
                },
                [document.createTextNode(r.hex)],
            ),
        );
        if (registryEditMode) {
            right.appendChild(
                el(
                    "button",
                    {
                        class: "icon-btn danger",
                        style: "width:20px;height:20px;font-size:11px;",
                        title: "Retirer du registre",
                        onclick: () => removeRegistryEntry(idx),
                    },
                    [document.createTextNode("✕")],
                ),
            );
        }
        row.appendChild(right);
        list.appendChild(row);
    });
    box.appendChild(list);
    container.appendChild(box);
}

/* ---------- Modale registre ---------- */
function renderRegistryModalList() {
    const list = document.getElementById("registry-list-full");
    list.innerHTML = "";
    if (registry.length === 0) {
        list.innerHTML =
            '<div style="padding:10px;color:#999;font-size:12px;">Aucune couleur enregistrée.</div>';
    }
    registry.forEach((r, idx) => {
        const row = document.createElement("div");
        row.className = "registry-row";
        const left = document.createElement("span");
        left.innerHTML = `<span class="rc" style="background:${escapeHtml(r.hex)};"></span>${escapeHtml(r.title)}`;
        const right = document.createElement("span");
        right.style.cssText = "display:flex;align-items:center;gap:8px;";
        right.innerHTML = `<span style="font-family:Consolas,monospace;color:#888;">${escapeHtml(r.hex)}</span>`;
        if (registryEditMode) {
            const delBtn = document.createElement("button");
            delBtn.className = "icon-btn danger";
            delBtn.style.cssText = "width:20px;height:20px;font-size:11px;";
            delBtn.title = "Retirer du registre";
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", () =>
                removeRegistryEntry(idx).then(renderRegistryModalList),
            );
            right.appendChild(delBtn);
        }
        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
    });
}
function openRegistryModal() {
    renderRegistryModalList();
    document.getElementById("registry-modal").style.display = "flex";
}
