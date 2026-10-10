# Identités locales, dates documentées et provenance

Fondation de la première PR du pilote Matt Mez Sax. Périmètre : fonctions pures et tests. Aucune interface, aucune synchronisation réseau, aucune modification des relations existantes.

## Identités

Une identité a une origine (`kind`) :

- `wikidata` : un QID réel (`Q33977` pour Jules Verne). Les données existantes ne changent pas.
- `local` : un identifiant `relia:<type>:<slug>` (ex. `relia:person:matt-mez-sax`).

Règles :

- Un identifiant local ne ressemble jamais à un QID et ne porte jamais de QID (`wikidataId` refusé).
- Aucun export automatique vers Wikidata (`AUTOMATIC_WIKIDATA_EXPORT = false`).
- Un libellé identique ne prouve pas l’identité : deux homonymes ont deux identifiants (`slug` explicite pour les distinguer).
- Les collisions d’identifiants sont signalées (`findDuplicateIds`), jamais fusionnées automatiquement.
- Niveaux de vérification : `unverified`, `probable`, `registry_referenced`, `owner_confirmed`. Une identité locale démarre à `unverified`.

Fichiers : `src/identity.js`, `src/local-identities.js`.

## Dates

Une entrée datée distingue trois axes, qui ne doivent jamais être confondus :

| Axe | Champ | Affichage |
|---|---|---|
| Date de l’événement (vie, relation, événement) | `eventDate` | « Date de l’événement » |
| Date de publication d’un média | `publishedAt` | « Publié le » |
| Date de découverte par RELIA | `discoveredAt` (horodatage ISO) | « Découvert par RELIA le » |

- Une date porte sa **précision** (`day`, `month`, `year`, `decade`, `century`) et une **incertitude** (`approximate`, affichée « vers … »). Une date n’est jamais devinée : une précision non prise en charge donne `null`, c’est-à-dire « Date inconnue ».
- Un **contenu** (`kind: 'content'`) porte une date de publication et jamais une date d’événement. Une vidéo publiée en 2025 sur un auteur ne devient donc jamais un événement de sa vie.
- Le tri (`chronologicalOrder`) est ascendant sur l’axe demandé. Les entrées sans date sur cet axe sont dans une liste séparée, jamais placées au hasard. Les égalités sont départagées par identifiant.
- Les valeurs temporelles Wikidata sont converties par `dateFromWikidataTime` (précisions 7 à 11). Les relations existantes ne sont pas réécrites.

Fichier : `src/dates.js`.

## Provenance

Toute entrée a au moins une provenance : méthode (`wikidata_claim`, `youtube_api`, `owner_declared`, `human_review`, `local_record`), source, URL vérifiée (http/https uniquement), date de capture.

- Une métadonnée YouTube doit porter une **échéance de rafraîchissement** (`refreshBy`). `isStale` indique quand elle doit être revérifiée ou retirée.
- Une saisie locale ne référence aucune source externe.

Fichier : `src/provenance.js`.

## Fiche initiale : Matt Mez Sax

`relia:person:matt-mez-sax`, libellé, description « Saxophoniste et artiste. Fiche locale : aucune biographie validée. », `verification: unverified`. Aucune date, aucune relation, aucune vidéo, aucun compte. Les données viendront uniquement de sources vérifiées.

## Hors périmètre de cette PR

- Interface : la fiche locale n’est pas encore affichée dans l’application.
- Synchronisation YouTube (PR suivante) et lecture au clic.
- Mode « Raconter » : inchangé.
- Liaison d’une identité locale à Wikidata : jamais automatique.
