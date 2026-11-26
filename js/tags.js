/* Atelier de Dossiers — Les 4 tags de classification et leurs couleurs. */

const TAG_META = {
    confirme: { label: "Confirmé", bg: "var(--doc-ink)" },
    hypothese: { label: "Hypothèse de travail", bg: FIXED.gold },
    hook: { label: "Piste", bg: FIXED.teal },
    attention: { label: "Attention", bg: FIXED.red },
};
const TAG_KEYS = Object.keys(TAG_META);
const CALLOUT_BG = {
    confirme: "var(--doc-card)",
    hypothese: FIXED.goldBg,
    hook: FIXED.tealBg,
    attention: FIXED.redBg,
};
const CALLOUT_BORDER = {
    confirme: "var(--doc-ink)",
    hypothese: FIXED.gold,
    hook: FIXED.teal,
    attention: FIXED.red,
};
// Style complet d'un tag, avec repli sur « confirmé » pour une valeur inconnue.
function tagStyle(tag) {
    const key = TAG_META[tag] ? tag : "confirme";
    return {
        ...TAG_META[key],
        border: CALLOUT_BORDER[key],
        calloutBg: CALLOUT_BG[key],
    };
}
