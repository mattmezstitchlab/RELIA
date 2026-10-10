# Synchronisation YouTube → catalogue RELIA

Procédure d’exécution **réelle**. Le sandbox de développement ne peut pas joindre `googleapis.com` :
la synchronisation se fait depuis un environnement autorisé (poste local, ou CI privée avec secret).

## Principes

- **La clé ne circule jamais côté navigateur.** Elle vit uniquement dans `YOUTUBE_API_KEY`,
  variable d’environnement privée du processus de synchronisation (secret CI, variable shell).
  Elle n’est jamais écrite dans le dépôt, dans les journaux, ni dans le fichier catalogue produit.
- **Rattachement explicite uniquement.** La chaîne est déclarée par le propriétaire (URL officielle
  ou identifiant `UC…`). Aucune correspondance par nom, aucune URL personnalisée « /c/ » devinée.
- **Aucune vidéo téléchargée ni réhébergée.** Le catalogue ne stocke que des métadonnées publiques :
  identifiant, titre, date de publication, chaîne, durée, miniature (URL YouTube), lien, droit d’intégration.
- **Conservation des métadonnées.** Chaque entrée porte une provenance `youtube_api` avec une échéance
  de rafraîchissement à +30 jours. Une vidéo devenue privée ou supprimée est **retirée** du catalogue
  à la synchronisation complète suivante. Une pagination incomplète ne supprime jamais rien.

## Appels API utilisés (YouTube Data API v3)

| Appel | Rôle | Coût approximatif |
|---|---|---|
| `channels.list` | résoudre la chaîne déclarée, obtenir la playlist « uploads » | 1 unité |
| `playlistItems.list` | pages de la playlist (50 vidéos/page) | 1 unité / page |
| `videos.list` | métadonnées vérifiées (lots de 50) | 1 unité / lot |

Une chaîne de 100 vidéos coûte donc environ **5 unités** (quota par défaut : 10 000/jour).

## Procédure (poste local)

```bash
cd RELIA

# 1. Vérifier que l’environnement rejoint l’API (1 unité de quota) :
export YOUTUBE_API_KEY="…votre clé…"        # variable d’environnement du shell uniquement
node tools/sync-youtube.mjs --check --channel "https://www.youtube.com/@VotreHandle"

# 2. Synchronisation complète (premier rattachement — l’URL est déclarée ici, par le propriétaire) :
node tools/sync-youtube.mjs --channel "https://www.youtube.com/@VotreHandle" \
  --identity relia:person:matt-mez-sax

# 3. Contrôler le résultat puis committer le catalogue :
git diff src/data/youtube/
git add src/data/youtube/ && git commit -m "Catalogue YouTube de Matt Mez Sax (synchronisation réelle)"
```

Sans `--channel`, l’outil resynchronise **toutes** les chaînes déjà rattachées à l’identité
(plusieurs chaînes officielles par personne sont prises en charge : relancez l’outil par chaîne
au premier rattachement, puis un simple appel entretient tout le monde).

## Options utiles

| Option | Effet |
|---|---|
| `--dry-run` | calcule tout, n’écrit rien |
| `--since AAAA-MM-JJ` | incrémental : n’ajoute/met à jour que ce qui est publié après la date (aucune suppression, `complete` inchangé) |
| `--max-pages N` | garde de quota (défaut 40 pages ≈ 2 000 vidéos par chaîne) |
| `--out chemin` | autre fichier catalogue (doit rester dans `src/data/youtube/`) |

## Rafraîchissement et suppression

- Relancez la synchronisation **au moins tous les 30 jours** (l’outil affiche la date limite).
  Au-delà, l’interface marque les entrées « métadonnées à revérifier » et les données doivent être
  revérifiées ou retirées.
- Une vidéo passée en privée ou supprimée disparaît du catalogue à la synchronisation complète
  suivante (liste paginée **complète** uniquement — condition codée et testée).
- En CI privée, planifiez par exemple un cron mensuel avec `YOUTUBE_API_KEY` en secret.

## Sécurité

- La clé part dans l’en-tête `X-Goog-Api-Key`, jamais dans l’URL : rien n’apparaît dans les journaux.
- Le fichier catalogue est validé par un schéma à clés fermées (`validateCatalog`) : tout champ
  inattendu — dont une éventuelle clé — rend le fichier refusé par l’application.
- Restreignez la clé dans Google Cloud (API YouTube Data v3 seule) et, si possible, par IP.
