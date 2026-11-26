# Notes Editor — Atelier de Dossiers

Archive de lore et éditeur de dossiers au format « dossier classifié ».

Chaque information est stockée **indépendamment**, dans son propre fichier du dépôt : on peut
la consulter seule, la retrouver par la recherche, et la réutiliser dans plusieurs dossiers.
Les **dossiers** (couverture, note d'usage, table des matières, pages A4, export PDF) ne sont
plus que des mises en page qui assemblent ces informations.

## Démarrer

Il faut [Node.js](https://nodejs.org) 18 ou plus récent ; aucune dépendance à installer.

```sh
npm start            # ou : node server.js
```

Puis ouvrir <http://localhost:8080>. Le serveur n'écoute que sur votre machine.

Les modifications sont enregistrées automatiquement dans le dossier `archive/`. Pour les
conserver dans le dépôt, committez-les avec Git comme n'importe quel fichier :

```sh
git add archive && git commit -m "Archive : nouvelles entrées sur la Tour"
```

Options : `node server.js --port 3000 --archive chemin/vers/une/archive`.

## Organisation de l'archive

| Élément | Fichier | Rôle |
| --- | --- | --- |
| **Entrée** | `archive/entrees/<id>.json` | Une information autonome (personnage, lieu, institution, événement…) : un titre, une catégorie, des étiquettes et des blocs. |
| **Bloc partagé** | `archive/blocs/<id>.json` | Un bloc (callout, tableau…) réutilisé par plusieurs entrées : le modifier le modifie partout. |
| **Dossier** | `archive/dossiers/<id>.json` | La mise en page d'un document imprimable : couverture, note d'usage, liste ordonnée d'entrées, sauts de page. |
| Registre des couleurs | `archive/couleurs.json` | Couleur de chaque dossier, pour qu'elles restent distinctes. |
| Index | `archive/index.json` | Liste des fichiers, régénérée automatiquement (sert à la lecture sans serveur). |

Une entrée peut figurer dans plusieurs dossiers, ou dans aucun. Retirer une section d'un
dossier ne supprime pas l'entrée ; supprimer un dossier garde toutes ses entrées.

## Utilisation

### Parcourir et rechercher

- **Accueil** : toutes les entrées, filtrables par catégorie, étiquette, ou « hors dossier ».
- **Recherche** : dans les titres, étiquettes et le contenu de tous les blocs, sans tenir
  compte des accents. Chaque bloc correspondant est listé avec un extrait surligné et mène
  directement à l'information dans sa page.
- **Page d'une entrée** : lecture dans le style des dossiers, avec les dossiers (et codes de
  section) où elle figure. Les codes comme `ARC-03` ou `GDN-05`, de n'importe quel dossier,
  et les numéros de dossier comme `CEL-VC-001` sont des liens.
- Onglets **Dossiers** (avec leur sommaire) et **Blocs partagés**.

### Modifier

- **Entrée** (✎ Modifier) : titre, catégorie, étiquettes et blocs. Une entrée n'a pas de
  pagination : les sauts de page appartiennent aux dossiers.
- **Dossier** : l'éditeur complet, avec aperçu paginé et export PDF. Chaque section est une
  entrée de l'archive :
  - « Entrée : … » mène à sa page ; « aussi dans … » signale que la modifier changera aussi
    d'autres dossiers ;
  - **+ Nouvelle section** crée une nouvelle entrée ; **+ Insérer une entrée existante**
    réutilise une entrée de l'archive ;
  - ✕ retire la section du dossier (l'entrée reste dans l'archive).
- **Blocs partagés** : dans l'éditeur, ⇄ rend un bloc partageable (on lui donne un nom), ⇥ le
  détache (copie propre à l'entrée) ; **+ Bloc partagé…** ou le menu ＋ d'un bloc insère un
  bloc de la bibliothèque.
- **+ Nouvelle entrée**, **+ Nouveau dossier**, **Importer un dossier JSON** (un dossier
  exporté par l'éditeur est découpé en entrées).

Dans l'éditeur : glisser-déposer avec la poignée ⠿, sections repliables, annuler/rétablir
(`Ctrl+Z`, `Ctrl+Maj+Z`), clic sur l'aperçu pour aller au formulaire correspondant.

### Types de blocs

| Bloc | Usage |
| --- | --- |
| Sous-titre | Titre de second niveau |
| Paragraphe | Texte courant, éventuellement en italique |
| Liste | Liste à puces |
| Callout | Encadré étiqueté par un tag : *Confirmé*, *Hypothèse de travail*, *Hook MJ*, *Attention MJ* |
| Tableau | Libellé + valeur, badge + valeur, ou badge + libellé + valeur |
| Fiche | Carte « hook » : badge, titre, accroche et tableau ; sarcelle, couleur du document ou couleur d'accent libre (hex) |
| Renvoi | Ligne « → RENVOI » |
| Saut de page | Dans un dossier seulement ; peut répéter le titre de la section (« suite ») |

### Mise en forme du texte

`**gras**`, `*italique*`, `\*` pour un astérisque. Une **ligne vide** force un retour à la
ligne ; un retour simple compte comme une espace (pratique pour coller depuis un PDF).

### Export PDF

Dans un dossier, « Exporter en PDF » ouvre l'impression du navigateur : choisir
« Enregistrer au format PDF », format A4 ; marges et arrière-plans sont gérés par la feuille
de style. Une page trop longue pour une feuille A4 est encadrée en rouge dans l'aperçu.

## Modes d'accès

| Ouverture | Mode |
| --- | --- |
| `node server.js` | Archive complète, lecture et écriture. |
| Hébergement statique (GitHub Pages…) | Archive en **lecture seule** : consultation, recherche, aperçu et PDF des dossiers. |
| `index.html` ouvert directement depuis le disque | Éditeur de dossier **autonome** (sans archive), enregistré dans le navigateur, import/export JSON — le fonctionnement d'origine. |

## Formats des fichiers

```jsonc
// archive/entrees/gdn-fiche-d-identification.json
{
  "id": "gdn-fiche-d-identification",
  "title": "Fiche d'identification",
  "kind": "personnage",           // personnage, lieu, institution, evenement, objet, concept, autre
  "tags": ["Le Gardien"],
  "blocks": [
    { "id": "…", "type": "table", "layout": "label-value", "rows": [{ "a": "Nom civil", "b": "Miguel", "c": "" }] },
    { "ref": "identite-du-gardien" }  // bloc partagé
  ]
}

// archive/blocs/identite-du-gardien.json
{ "id": "identite-du-gardien", "name": "Identité du Gardien", "type": "callout", "tag": "confirme", "title": "…", "paragraphs": ["…"] }

// archive/dossiers/le-gardien.json
{
  "id": "le-gardien", "version": 3, "color": "#a9812e", "stampStyle": "red",
  "cover": { "orgLine": "…", "kicker": "…", "title": "Le Gardien", "subtitle": "…", "stampText": "…",
             "meta": [{ "a": "N° de dossier", "b": "GDN-VC-001" }] },
  "footerBrand": "…",
  "noteUsage": { "includeTagLegend": true, "text": "…" },
  "sections": [
    { "id": "…", "entry": "gdn-fiche-d-identification" },
    { "id": "…", "entry": "gdn-la-tour-du-cinquieme-point-cardinal",
      "pageBreaks": [{ "after": "<id du bloc>", "repeatTitle": true }] }
  ]
}
```

Les identifiants (noms de fichiers) sont dérivés des titres à la création et ne changent
plus ensuite ; seuls `a-z`, `0-9` et `-` sont admis.

L'export JSON d'un dossier produit le **format autonome** historique (sections contenant
directement leurs blocs), réimportable dans n'importe quelle archive ou dans l'éditeur
autonome.

### Migration

`documents/` contient les dossiers au format autonome d'origine. Ils ont été convertis dans
`archive/` (une section → une entrée) par :

```sh
npm run migrate                                     # documents/*.json
node tools/migrate-documents.js mon-dossier.json    # un fichier précis
```

Le script n'écrase rien : un identifiant déjà pris reçoit un suffixe (`-2`…).

## Organisation du code

| Fichier | Rôle |
| --- | --- |
| `server.js` | Serveur local : application + API de l'archive |
| `server/archive-fs.js` | Lecture et écriture atomique des fichiers de l'archive |
| `tools/migrate-documents.js` | Conversion des dossiers autonomes |
| `js/archive-model.js` | Formats de l'archive ; passage archive ⇄ document de l'éditeur (navigateur et Node) |
| `js/archive-store.js` | Chargement, enregistrement, relations et recherche côté navigateur |
| `js/archive-views.js` | Pages de l'archive (accueil, entrée, bloc partagé) |
| `js/archive-editor.js` | Éditeur branché sur l'archive (ouverture, enregistrement, blocs partagés) |
| `js/router.js` | Navigation (`#/…`) et démarrage |
| `js/model.js`, `js/preview.js`, `js/sidebar-*.js`… | Éditeur et rendu des dossiers |
| `app.css` | Styles de l'interface, des dossiers et de l'impression |

L'éditeur travaille toujours sur un dossier « résolu » au format autonome : `resolve*()`
le construit à partir des fichiers de l'archive, `decompose*()` le redécoupe à
l'enregistrement, et seuls les fichiers modifiés sont réécrits.

## Tests

```sh
npm test
```

Ils vérifient la conversion des dossiers de `documents/` (aller-retour exact), les blocs
partagés, les références manquantes et l'API du serveur (y compris ses protections).
