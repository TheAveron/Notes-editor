# Notes Editor — Atelier de Dossiers

Cet éditeur a pour objectif de faciliter la création de notes de lore avec une mise en page
graphique soignée, au format « dossier classifié » : couverture, note d'usage, table des
matières et sections paginées en A4, prêtes à exporter en PDF.

## Lancer l'éditeur

Aucune installation ni dépendance : ouvrez `index.html` dans un navigateur récent
(Chrome, Edge, Firefox). Le fichier peut être ouvert directement depuis le disque.

## Utilisation

L'écran est divisé en deux : le **panneau d'édition** à gauche et l'**aperçu** paginé à droite,
mis à jour à chaque frappe.

- **Cliquer un élément de l'aperçu** fait défiler le panneau jusqu'à son éditeur ;
  **placer le curseur dans un éditeur** fait défiler l'aperçu jusqu'au bloc correspondant.
- Les sections se **replient** (▾/▸, ou « Tout replier »), se **réordonnent** par
  glisser-déposer avec la poignée ⠿ (blocs et sections, y compris d'une section à une autre)
  ou avec les flèches ↑/↓.
- Le bouton **＋** d'un bloc insère un nouveau bloc juste après lui.
- **Annuler / rétablir** : boutons ↶ ↷, `Ctrl+Z`, `Ctrl+Maj+Z` ou `Ctrl+Y`.

### Types de blocs

| Bloc | Usage |
| --- | --- |
| Sous-titre | Titre de second niveau dans une section |
| Paragraphe | Texte courant, éventuellement en italique |
| Liste | Liste à puces |
| Callout | Encadré étiqueté par un des 4 tags (voir ci-dessous) |
| Tableau | 3 dispositions : libellé + valeur, badge + valeur, badge + libellé + valeur |
| Fiche | Carte « hook » : badge, titre, accroche et tableau ; sarcelle ou couleur du document |
| Renvoi | Ligne « → RENVOI » vers une autre section ou un autre dossier |
| Saut de page | Termine la page ; peut répéter le titre de la section (« suite ») |

Les **tags** des callouts sont communs à toute la collection : *Confirmé* (couleur du
document), *Hypothèse de travail* (or), *Hook MJ* (sarcelle), *Attention MJ* (rouge).

### Mise en forme du texte

Dans tous les textes de contenu :

- `**gras**` et `*italique*` ; `\*` pour un astérisque littéral ;
- une **ligne vide** force un retour à la ligne ; un retour simple est traité comme une espace
  (pratique pour coller du texte depuis un PDF) ;
- les **codes de section** du dossier (par ex. `ARC-03`) deviennent des liens cliquables
  vers la section, dans l'aperçu comme dans le PDF. `XXX-00` renvoie à la note d'usage.

Les codes de section sont calculés automatiquement : préfixe du champ « N° de dossier »
(`ARC-VC-001` → `ARC`) suivi de la position de la section.

### Couleurs et registre

Chaque dossier a une couleur d'accent, dont l'éditeur dérive une palette (encre, fonds).
Le **registre des couleurs** mémorise la couleur de chaque dossier pour que les propositions
restent distinctes d'un dossier à l'autre. Une couleur personnalisée déjà prise est refusée ;
une couleur très proche est acceptée avec un avertissement.

Le registre s'exporte et s'importe (fusion) depuis « Registre des couleurs ». Le fichier
`registre-couleurs.json` du dépôt contient celui de la collection actuelle.

### Sauvegarde

- Le document en cours et le registre sont **enregistrés automatiquement** dans le navigateur
  (localStorage) et rouverts à la visite suivante. La barre du haut indique l'état de la
  sauvegarde et s'il reste des **modifications non exportées**.
- Pour conserver ou partager un dossier, utilisez **Exporter JSON** ; **Importer JSON**
  le rouvre. Les dossiers existants sont dans `documents/`.
- En navigation privée, ou si le stockage est bloqué, la sauvegarde automatique est
  indisponible : l'éditeur le signale et prévient avant de fermer l'onglet.

### Export PDF

« Exporter en PDF » ouvre la boîte d'impression du navigateur : choisissez
**Enregistrer au format PDF**, format **A4**. Les marges et les arrière-plans sont gérés par
la feuille de style ; inutile de modifier ces réglages.

Chaque page de l'aperçu correspond à une feuille. Une page dont le contenu dépasse la hauteur
d'une feuille A4 est **encadrée en rouge** dans l'aperçu (et signalée dans la barre du haut) :
à l'impression elle serait coupée sur deux feuilles et la numérotation serait décalée.
Ajoutez un saut de page ou raccourcissez le contenu.

## Format des fichiers JSON

```jsonc
{
  "version": 2,                 // version du format
  "id": "id…",                  // identifiant du dossier (lien avec le registre)
  "color": "#5c6b4f",           // couleur d'accent
  "stampStyle": "accent",       // "accent" ou "red"
  "cover": {
    "orgLine": "…", "kicker": "…", "title": "…", "subtitle": "…", "stampText": "…",
    "meta": [{ "a": "N° de dossier", "b": "ARC-VC-001" }, …]
  },
  "footerBrand": "…",
  "noteUsage": { "includeTagLegend": true, "text": "…" },
  "sections": [
    {
      "id": "id…", "title": "…",
      "blocks": [
        { "id": "…", "type": "paragraph", "text": "…", "italic": false },
        { "id": "…", "type": "callout", "tag": "confirme", "title": "…", "paragraphs": ["…"] },
        { "id": "…", "type": "table", "layout": "label-value", "rows": [{ "a": "…", "b": "…", "c": "" }] },
        { "id": "…", "type": "card", "tone": "hook", "badgeText": "…", "title": "…", "pitch": "…", "rows": [{ "a": "…", "b": "…" }] },
        { "id": "…", "type": "pagebreak", "repeatTitle": false }
        // autres types : heading2 (text), bullets (items), crossref (text)
      ]
    }
  ]
}
```

À l'import, le fichier est validé et complété : champs manquants remplis, blocs de type
inconnu ignorés, anciens formats (tableaux avec `badge`) convertis. Les champs inconnus
sont conservés tels quels.

## Organisation du code

Scripts classiques (et non modules ES, bloqués en `file://`), chargés dans l'ordre par
`index.html` :

| Fichier | Rôle |
| --- | --- |
| `js/colors.js` | Conversions de couleurs, palette dérivée, propositions distinctes |
| `js/tags.js` | Les 4 tags et leurs couleurs |
| `js/storage.js` | Stockage : `window.storage`, sinon localStorage, sinon mémoire |
| `js/registry.js` | Registre des couleurs |
| `js/model.js` | Modèle de document, codes de section, validation des imports |
| `js/history.js` | Annuler / rétablir, sauvegarde automatique, état des exports |
| `js/preview.js` | Rendu de l'aperçu, mise en forme du texte, pages trop longues |
| `js/ui.js` | Utilitaires de construction de formulaires |
| `js/sidebar-*.js` | Un fichier par panneau (couleur, couverture, sections, registre) |
| `js/sync.js` | Liaison aperçu ↔ panneau |
| `js/app.js` | Cycle de mise à jour (`update()`), actions de la barre, initialisation |
| `app.css` | Styles de l'interface, de l'aperçu et de l'impression |

Toute modification du document passe par `update({ structure })` : l'aperçu est régénéré,
le panneau aussi si un élément a été ajouté, supprimé ou déplacé, puis l'historique et la
sauvegarde automatique sont mis à jour.
