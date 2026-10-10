# Synchronisation YouTube → catalogue RELIA

Le modèle de workflow GitHub Actions **Synchroniser le catalogue YouTube** est prêt pour alimenter
la fiche locale `relia:person:matt-mez-sax` depuis les deux chaînes officielles déclarées par le
propriétaire :

- `https://www.youtube.com/@mezofon/videos`
- `https://www.youtube.com/@mattmezsax/videos`

**État de livraison :** le workflow n’est pas encore installé dans `.github/workflows/`, car la
connexion GitHub utilisée pour cette livraison ne possède pas la permission `workflows`. Le modèle
complet et prêt à installer est versionné séparément dans
[`docs/workflows/sync-youtube.yml`](workflows/sync-youtube.yml). Une fois les permissions accordées,
ce fichier devra être copié sans modification vers `.github/workflows/sync-youtube.yml`.

Ni la PR de code ni la PR qui ajoutera le workflow ne lancent une synchronisation réelle : le
workflow ne comporte aucun déclencheur `push` ou `pull_request`. Le premier appel à YouTube se fera
manuellement depuis GitHub, après installation du fichier et fusion sur `main`.

## Architecture vérifiée

- `tools/sync-youtube.mjs` résout chaque handle avec `channels.list`, puis lit les playlists `uploads`
  et les détails des vidéos via YouTube Data API v3.
- Les deux exécutions écrivent dans le **même fichier** :
  `src/data/youtube/matt-mez-sax.json` (`--identity relia:person:matt-mez-sax`).
- Ce fichier n’est pas ignoré par Git. `src/catalog.js` importe `src/data/youtube/*.json` avec Vite;
  `vercel.json` lance `npm run build` et publie `dist`. Le build statique incorpore donc les
  métadonnées publiques dans le site sans appel à l’API depuis le navigateur.
- Le workflow proposé n’utilise ni jeton Vercel ni commande de déploiement. Il construit le site pour
  vérifier le catalogue, puis propose une **PR de données**. La fusion manuelle dans `main` est
  l’étape d’approbation; si le projet Vercel est relié à GitHub, sa configuration habituelle peut
  alors construire/déployer `main`.

## Rafraîchissement et retrait des vidéos

- La politique locale fixe `REFRESH_AFTER_DAYS` à **30 jours**. Le modèle de workflow est planifié
  chaque lundi à **05:17 UTC**, soit une marge importante sous cette limite.
- Chaque lancement effectue une synchronisation complète des deux chaînes; il n’utilise pas le mode
  incrémental `--since`. Les dates de provenance de toutes les métadonnées encore publiques sont
  ainsi renouvelées.
- Une vidéo devenue privée, supprimée ou indisponible est retirée après une pagination complète.
  Une liste tronquée ne provoque jamais de suppression.
- Le modèle utilise `--max-pages 200` (jusqu’à 10 000 entrées par chaîne) et `--require-complete`.
  Si la liste dépasse cette garde, l’Action échoue avant de proposer une mise à jour, plutôt que de
  laisser des entrées non rafraîchies dans un nouveau catalogue. Augmenter la garde demandera de
  modifier le workflow, en tenant compte du quota du projet Google.
- La planification génère/actualise une PR, **sans fusion automatique**. Il faut fusionner chaque PR
  de rafraîchissement avant que l’ancienne copie déployée n’atteigne son échéance de 30 jours. Une
  PR non fusionnée ne renouvelle pas le site en production.

## Sécurité et échecs

- Lors de son exécution, le secret de dépôt `YOUTUBE_API_KEY` est transmis uniquement comme
  variable d’environnement aux étapes de synchronisation. Le client l’envoie dans l’en-tête
  `X-Goog-Api-Key` (jamais dans l’URL). Il n’est ni imprimé, ni commité, ni envoyé à Vercel. Les
  erreurs API n’incluent pas le texte brut reçu du serveur. Restreindre la clé à YouTube Data API v3
  dans Google Cloud.
- Le modèle n’écoute que `workflow_dispatch` et `schedule`, vérifie le dépôt/la branche `main`, et
  ne s’exécute jamais sur `pull_request` ou `pull_request_target`. Le code testé vient de `main`.
- La clé absente, une clé refusée ou restreinte, l’API inaccessible, un quota dépassé, une chaîne
  introuvable ou une pagination incomplète font échouer clairement l’exécution; aucune PR n’est
  créée à partir d’une synchronisation partielle.
- `concurrency` sérialise les exécutions. La branche fixe `automation/youtube-catalog` est
  régénérée depuis `main`, puis poussée avec `--force-with-lease`; le workflow ne pousse jamais sur
  `main` et ne s’écoute pas lui-même après un push. Un humain doit relire et fusionner la PR.
- Seules les métadonnées publiques nécessaires sont conservées (identifiants, titre, date de
  publication, chaîne, durée, miniature, lien et droit d’intégration). Aucune vidéo n’est téléchargée
  ou réhébergée. La validation du catalogue refuse les champs non prévus, notamment une clé.

## Première synchronisation depuis GitHub — sans terminal local

1. Relire et fusionner manuellement la PR de préparation vers `main`. Elle contient le synchroniseur,
   les tests et le modèle, mais **n’installe pas encore** le workflow actif.
2. Après reconnexion GitHub dans Arena avec la permission `workflows` en écriture, installer le modèle
   sous `.github/workflows/sync-youtube.yml` (ou demander à l’agent de créer cette PR dédiée), puis
   fusionner manuellement cette PR d’installation. Aucun déclencheur ne synchronise les données à
   cette étape.
3. Dans **Settings → Secrets and variables → Actions**, vérifier que le secret de dépôt
   `YOUTUBE_API_KEY` existe. La valeur n’a pas besoin d’être affichée ni copiée dans les journaux.
4. Dans **Settings → Actions → General**, vérifier que le dépôt permet les permissions d’écriture
   de `GITHUB_TOKEN` et que **Allow GitHub Actions to create and approve pull requests** est activé
   pour permettre à l’Action d’ouvrir sa PR. Le workflow ne l’utilise pas pour approuver ou fusionner;
   le job déclare seulement `contents: write` et `pull-requests: write`.
5. Ouvrir **Actions → Synchroniser le catalogue YouTube → Run workflow**, choisir la branche **main**
   et confirmer **Run workflow**. C’est le premier appel réel à YouTube.
6. Si l’exécution réussit, ouvrir la PR **Actualiser le catalogue YouTube de Matt Mez Sax**. Vérifier
   que le catalogue unique contient les deux chaînes et relire le diff, puis fusionner cette PR
   manuellement pour rendre les données disponibles au build du site.
7. Ensuite, les exécutions hebdomadaires ouvrent/actualisent la même PR de données. La fusion reste
   manuelle et doit intervenir avant l’échéance de conservation affichée dans la fiche RELIA.

Les échecs sont visibles dans l’onglet **Actions** et leurs journaux expliquent si le problème est
la clé, l’accès réseau/API, le quota, la référence d’une chaîne ou la limite de pagination. Aucun
échec ne déclenche un déploiement Vercel.
