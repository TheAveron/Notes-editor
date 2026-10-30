# Notes Editor

Cet éditeur a pour objectif de faciliter la création de notes de Lore avec une mise en page graphique intéressante : fiches « dossier classifié » en A4, avec couverture, note d'usage, table des matières paginée, callouts étiquetés (Confirmé / Hypothèse / Hook MJ / Attention MJ), tableaux et fiches.

## Utilisation

Aucune installation : ouvrir `index.html` dans un navigateur récent (Chrome, Edge, Firefox).

- **Sauvegarde automatique** : le document en cours et le registre des couleurs sont conservés dans le navigateur (`localStorage`). Pensez tout de même à **Exporter JSON** : c'est la vraie sauvegarde, à versionner dans `documents/`.
- **Importer JSON** : charge un dossier (les champs manquants sont complétés, les valeurs invalides corrigées).
- **Registre des couleurs** : garantit qu'un dossier a une couleur unique ; exportable/importable (`registre-couleurs.json`).
- **Saut de page** : bloc manuel. Une page rouge dans l'aperçu signale un contenu qui dépasse une feuille A4 : ajoutez un saut de page.
- **Exporter en PDF** : bouton qui ouvre la boîte d'impression ; choisir « Enregistrer au format PDF », format A4. Les marges sont gérées par la mise en page (`@page { margin: 0 }`), pas besoin de les régler.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de l'interface |
| `app.css` | Styles de l'interface, de l'aperçu et de l'impression |
| `app.js` | Logique (modèle de document, rendu, import/export, registre) |
| `documents/` | Dossiers exportés (`.json`) et leurs PDF |
| `registre-couleurs.json` | Registre des couleurs déjà attribuées |

## Format JSON d'un dossier

`id`, `color` (hex), `stampStyle` (`accent` ou `red`), `cover` (titres, tampon, `meta` : liste de `{a, b}`), `footerBrand`, `noteUsage` (`text`, `includeTagLegend`), `sections` : liste de `{id, title, blocks}`. Types de blocs : `heading2`, `paragraph`, `bullets`, `callout`, `table`, `card`, `crossref`, `pagebreak`.
