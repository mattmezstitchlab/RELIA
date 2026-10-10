# Phase YouTube — rapport

Intégration de YouTube à RELIA pour la chronologie documentaire réelle. Pilote : **Matt Mez Sax**.
Branche : `arena/c223e772-relia` → PR vers `main`. **PR non fusionnée** (décision explicite du propriétaire).

## État constaté en début de phase (vérifié sur GitHub)

- **PR #11 « Fondation des identités locales et des dates documentées » : fusionnée** (merge `728add8`, 2026-10-10).
- **PR #12 : n’existe pas** sur GitHub (aucune PR portant ce numéro, ouverte ou fermée). L’« intégration
  visible des identités locales » annoncée comme fusionnée n’a jamais été livrée : `src/local-identities.js`
  existait mais n’était importé nulle part. Cette intégration visible est **incluse dans la présente phase**
  (commit interface).
- Suite au départ : 155/155 tests, build OK (l’échec initial venait de `node_modules` absent).

## Livré

### 1. Connecteur YouTube — hors navigateur (commit `529d74a`)

| Fichier | Rôle |
|---|---|
| `src/youtube/client.js` | Client YouTube Data API v3 : `channels.list` (résolution explicite), `playlistItems.list` paginé, `videos.list` par lots de 50. Transport injectable (tests sans réseau). Clé uniquement dans l’en-tête `X-Goog-Api-Key` — jamais dans une URL, un message d’erreur ou une donnée produite. |
| `src/youtube/catalog.js` | Métadonnées publiques normalisées (identifiant, titre, publication, chaîne, durée, miniature https, lien, `embeddable`). Provenance `youtube_api` datée avec échéance de rafraîchissement **+30 j** (`isStale`). Fusion incrémentale par identifiant YouTube ; suppression conforme des vidéos devenues privées/supprimées — **seulement si la pagination est complète** ; mode incrémental `--since` sans suppression. Conversion en entrées `content` du **moteur chronologique existant** (`chronologicalOrder`, axe `publication`). Validation du fichier à **clés fermées** : tout champ inattendu (dont une clé) est refusé. |
| `tools/sync-youtube.mjs` | Synchronisation réelle : clé via `YOUTUBE_API_KEY` (environnement du processus uniquement). Chaîne rattachée sur **déclaration explicite du propriétaire** (`/channel/UC…`, `/@handle`, `/user/…`, `UC…`) — jamais par nom, jamais via `/c/`. Garde de quota `--max-pages`, `--check` (portée réseau), `--dry-run`. Plusieurs chaînes officielles par personne prises en charge. |
| `docs/SYNC_YOUTUBE.md` | Procédure d’exécution réelle depuis un environnement autorisé. |

### 2. Interface — fiche locale + chronologie (commit `3498292`)

- Rechercher **« Matt Mez Sax »** fait remonter la **fiche locale RELIA** en tête des résultats
  (correspondance stricte insensible à la casse/accents). Aucune expansion Wikidata pour une identité locale.
- La fiche affiche : niveau de vérification, **chaînes YouTube officielles** (rattachement `owner_declared`),
  et la **chronologie des vidéos de la plus ancienne publication à la plus récente** — miniature, titre,
  « Publié le » (axe publication, jamais date d’événement), chaîne d’origine, durée, lien YouTube,
  **lecteur intégré `youtube-nocookie`** lorsque `embeddable` est vrai, sinon accès par lien.
- Provenance affichée par vidéo (capture, échéance de rafraîchissement, badge « à revérifier »).
- Catalogues chargés depuis `src/data/youtube/*.json`, validés puis ignorés si invalides.
- **Aucune donnée fictive** : sans synchronisation, états vides explicites renvoyant à la procédure.
- Mode PLAY « Raconter » : inchangé (narration chronologique des vidéos : évolution suivante, la
  structure de données y est déjà adaptée).

## Vérifications exécutées

- `npm test` : **181/181** (155 préexistantes + 22 connecteur + 4 recherche locale).
- `npm run build` : OK.
- **Portée réseau mesurée** : `googleapis.com` est **injoignable** depuis le sandbox de développement
  (sortie bloquée). Aucune synchronisation n’a donc été simulée : le CLI échoue proprement et la
  procédure réelle est documentée. `tools/sync-youtube.mjs --check` permet de valider un environnement
  autorisé en 1 unité de quota.

## Restant (une fois l’URL de la chaîne et la clé fournies)

1. `export YOUTUBE_API_KEY=…` dans un environnement autorisé (poste local ou CI privée).
2. `node tools/sync-youtube.mjs --check --channel <URL de la chaîne officielle>` (1 unité).
3. `node tools/sync-youtube.mjs --channel <URL> --identity relia:person:matt-mez-sax`.
4. Vérifier `git diff src/data/youtube/`, committer le catalogue, pousser : la fiche RELIA affiche
   alors chaîne, vidéos, dates et lecteurs — sans jamais exposer la clé.
5. Ensuite (évolutions déjà préparées) : narration chronologique des vidéos via le mode PLAY existant ;
   éventuellement `--since` mensuel planifié en CI pour le rafraîchissement 30 jours.
