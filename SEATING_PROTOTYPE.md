# Prototype « Plan de table » — compte rendu de build

> Suite de [`AUDIT_MARIAGE.md`](./AUDIT_MARIAGE.md). L'audit se terminait par une question à valider avant toute ligne de code :
> **« le graphe trouve-t-il un conflit qu'un tableur aurait manqué ? »**
> Ce document répond à cette question avec des chiffres mesurés sur un cas de démonstration de 30 invités.
> Date : 9 octobre 2026.

## 1. Ce qui tourne

- Page : **`/seating.html`** (dev : `http://localhost:5173/seating.html`) — aussi via `npm run build` puis `dist/seating.html`. Le graphe 2D s’affiche immédiatement ; la constellation 3D s’allume seule si l’appareil peut la montrer.
- Aucune nouvelle dépendance : le projet reste à `three` en runtime et `vite` en dev.
- Deux fichiers de RELIA touchés, aucun des deux par nécessité produit : `vite.config.js` (déclaration de la deuxième entrée de build) et un lien d’entrée discret dans la barre haute d’`index.html` (une balise `<a class="round-button">`, sans JavaScript) pour rejoindre le prototype depuis l’aperçu. `src/app.js`, `src/styles.css`, `src/data.js`, `src/graph.js` sont intacts. À retirer avant toute fusion si le prototype part dans son propre dépôt, ainsi que le lien.

```
seating.html                      96 lignes   coquille de page, quatre sections
src/seating/model.js               220        schéma invités/relations, discipline de preuve
src/seating/solver.js              413        blocs, contraintes, ascension déterministe
src/seating/proof.js               132        chaînes bornées, composantes, articulations, diff
src/seating/plan2d.js              118        coordonnées du plan de salle, sans WebGL ni dépendance
src/seating/fixtures.js            118        32 personnes, 40 relations dont 4 non sourcées
src/seating/moves.js                56        règle d’un déplacement : ce qui se tient, ce qui se refuse
src/seating/words.js               156        la voix du produit — tout le texte de l’écran vient d’ici
src/seating/app.js                 898        rendu des deux vues, geste direct, exports
src/seating/seating.css            425        tokens RELIA recopiés + mise en page, tactile et fiche
src/seating/*.test.js              541        55 tests
                                 ───
                               3 092 lignes ajoutées
```

### Deux vues, et une seule obligatoire

1. **Le plan de salle en SVG** (`plan2d.js`) — visible dès l’arrivée : les personnes posées autour de leurs tables rondes, les attaches déclarées tracées entre elles, un trait par régime de preuve.
2. **La constellation Three.js** — sur demande seulement, par le bouton « Voir en 3D » en pied de page. Désactivée d’office si WebGL ne répond pas, avec la raison écrite sur le bouton.

### Deux retours utilisateur, deux corrections

**« je vois pas les graphes de plan de table ».** La scène 3D était éteinte par défaut (choix « liste d’abord » hérité de l’audit) et, dans un aperçu en iframe, WebGL peut être coupé sans message : carte vide, aucune explication. Corrigé par la vue 2D (aucune accélération matérielle, lisible et imprimable), par un repli qui nomme la cause, et par des sections qui commencent par le graphe plutôt que par du texte.

**« c’est compliqué, ça fait charger, on se perd ».** Mesuré au lieu de deviné, avant/après, sur le rendu complet de la page :

| | avant | après |
| --- | --- | --- |
| mots affichés | 2 225 | **1 328** |
| éléments DOM | 1 451 | **890** |
| boutons et liens | 97 | **68** |
| lignes de contenu | 116 | **46** |
| sections | 6 | **4** |
| poids réseau au chargement | 55,5 kB JS + 16,8 kB CSS | **53,7 kB + 17,6 kB**, three.js non demandé |

Ce qui est tombé : les quatre cartes d’insights (devenues cinq lignes), les raisons de place affichées sous chaque siège (elles passent dans la fiche, au clic — la liste ne garde qu’un point d’alerte), le bandeau de cinq boutons d’action (devenu une rangée d’outils discrète en pied), les trois sections contraintes/questions/limites (devenues trois onglets), la colonne latérale, et l’ouverture automatique de la 3D.

Ce qui est resté, parce que c’est le produit et pas du décor : **le graphe en premier**, les séparations induites en une ligne chacune, le codage visuel du « sourcé » contre le « non confirmé », et la section Limites — maintenant un onglet compté, plus un pavé.

Et une correction de fond venue de la simplification : le plan 2D contient 32 sièges, donc 32 boutons ; les rendre aussi focusables dans le SVG doublait la navigation clavier. Le SVG est maintenant `aria-hidden` et cliquable à la souris, la liste des tables reste le chemin accessible. Le graphe est un dessin de la même information, pas une deuxième façon de la réclamer.

### Troisième retour : « parle comme nous »

**« sans jargon complexe, compréhensible par des vieux et des enfants, très mobile first, le graphe
qu'on peut déplacer à la main ».** Trois choses ont été changées, dans cet ordre.

1. **Un seul endroit écrit ce que l'utilisateur lit.** `words.js` est la voix du produit ; le moteur
   (`model.js`, `solver.js`, `proof.js`) ne rédige plus rien pour l'écran. Ses raisons de place
   renvoient désormais une structure (`kind`, `relation`, `otherId`, `sameTable`) en plus de son
   texte interne, et ses limites renvoient des chiffres (`plan.issues`) que `words.js` tourne en
   phrases. C'est ce qui rend la règle vérifiable : `wording.test.js` lit le gabarit HTML et les
   libellés du rendu, et **casse le build** si un mot de métier (contrainte, arête, nœud, capacité,
   source, épinglé, arbitrage, export, JSON, CSV…) revient, ou si une phrase dépasse dix-huit mots.
2. **Le geste remplace le menu.** Une pastille se prend au doigt, se lâche sur une table, et le plan
   se range autour. Un toucher sans mouvement ouvre la fiche. La fiche n'a qu'une grosse action :
   « Changer de table », qui fait apparaître le bac de tables — une cible par table, avec les
   chaises écrites, et la table refusée en rouge avec la raison. Passer outre est possible, par un
   seul bouton, et le déplacement est alors tracé comme une question.
3. **Mobile d'abord, vraiment.** Le plan s'adapte à la largeur : une colonne sous 700 px, pastilles
   de 51 px et cible de 68 px au pouce (le cercle visible est plus petit que la zone touchable),
   étiquettes plus grosses (`--ts: 1.06`), fiche en feuille du bas, bac épinglé au pouce, `touch-action: none`
   sur le plan seulement. Les trois sections de détails sont devenues des plis fermés avec un compteur.

| | avant cette passe | après |
| --- | --- | --- |
| mots à l'écran | 1 328 | **1 243** |
| longueur moyenne d'une phrase | non mesurée | **10,4 mots** |
| mots de métier dans la page rendue | plusieurs dizaines | **0**, tenu par un test |
| commandes | 68 | 71 (dont 6 dans un bac qui n'existe que pendant un déplacement) |
| sections visibles | 4 | **3 + trois plis fermés** |
| poids | 53,7 kB JS + 17,6 kB CSS | **64,6 kB + 22,4 kB** (22,2 + 5,5 gz) |

Le poids monte de 11 kB à cause de la couche de langue et de la règle de déplacement — pas d'une
dépendance : il n'y en a toujours aucune. Le mot de passe du lot est ailleurs : **une phrase en
français courant coûte moins à lire qu'un bouton de plus.**

Un bug que seul un navigateur aurait montré, corrigé en route : `renderPlan2D()` était appelé au
démarrage du glisser, ce qui **détachait le nœud que le pointeur suivait** et tuait la capture du
geste. Le plan s'éclaire maintenant sans être redessiné pendant une glissade (`markLift`). Le
harnais jsdom, lui, tenait la référence à jour et ne voyait rien : c'est la limite à noter, pas un
succès.

## 2. Réponse à la question de validation

Sur le jeu de démonstration (30 invités + 2 prestataires, 40 relations dont **36 exploitables** et 4 non sourcées) :

| Mesure | Résultat |
| --- | --- |
| Séparations obligatoires entre blocs | **3 sur 3 tenues** |
| **Séparations induites qu'aucune ligne ne déclarait** | **2** |
| — détaillées | Brigitte Lemaire ↔ Jacky Verhaeghe, *via* Ghislaine (table D → B) · Karine Bertin ↔ Nadia Perrette, *via* Bruno (table A → C) |
| Couples et foyers maintenus ensemble | 7 blocs indissociables respectés (sur 23 blocs) |
| Contradictions escaladées au lieu d'être tues | **1** — Cédric et Sandra : même foyer déclaré, conflit déclaré aussi. Plan marqué `complete: false`, question posée, aucune résolution silencieuse |
| Invités sans aucune attache exploitable | **2** — Yannick, Thierry : placés, signalés, le moteur ne devine pas à qui les présenter |
| Points d'articulation (« chaînons ») | **6** — dont Camille (4 sous-groupes), Lucie (3), Nathan (2) |
| Densité du réseau | un composant de **26 personnes sur 30** : le moteur le dit et explique que la coupure ne peut plus suivre les clans, seulement les affinités et les capacités |
| Séparations refusées faute de source | 4 lignes devenues **questions**, aucune appliquée (dont un conflit jugé devant tribunal en 2024, marqué ancien) |
| Répartition | tables de 8/7/7/8 + table prestataires, capacité de 8 chaises respectée |
| Déterminisme | coût 220, 834 essais, aucun tirage aléatoire, deux exécutions identiques au siège près |

**Verdict : oui.** Deux contraintes de séparation effectives n'existaient dans aucune ligne de la liste : elles naissent de la composition « couple + conflit » à travers un tiers. C'est exactement la classe d'erreur qu'un tableur produit — et la seule que le client ne pardonne pas (une table qui explose le jour J).

Les trois autres lectures (isolés, chaînons, densité) ne coûtent que de l'affichage : elles sortent du même graphe.

## 3. Ce qui a été prouvé sur le plan technique

1. **Le moteur est portable hors du domaine culturel.** `proof.js` réécrit la recherche de chaîne avec le vocabulaire du mariage en gardant les règles de `src/data.js` : `shortestPath`/`findRemotePath` bornent la profondeur et signalent l'incomplétude ; ici `findChain` fait la même chose et un **test compare nommément les deux règles** : une arête sans référence exploitable, une arête obsolète et une URL non-http sont rejetées des deux côtés (`la règle du prototype et celle de RELIA rejettent les mêmes insuffisances`).
2. **`src/graph.js` est réutilisé sans y toucher.** `NetworkView` reçoit le graphe des invités tel quel ; seule la fonction `themeColors()` est remplacée sur l'instance pour peindre les côtés au lieu des types culturels. La physique fait le travail intéressant : les amas qui se forment à l'écran viennent des attaches déclarées, ils ne sont pas dessinés par le moteur.
3. **La constellation est un moment, pas l'interface** (recommandation §7.2 de l'audit) : elle est éteinte par défaut et `three.js` n'est chargé qu'au premier allumage.
   - page seule : **55,49 kB JS / 18,71 kB gzip** + 16,83 kB CSS (vue 2D et filtres compris) ;
   - chunk `three` : 594,14 kB / 150,24 kB gzip, demandé seulement si l'utilisateur allume la scène ;
   - effet de bord sur RELIA : le passage en build multi-entrée a séparé le bundle, `main-*.js` passe de **682,86 kB à 82,65 kB**. Le seuil d'alerte Vite n'est plus déclenché que par le chunk 3D partagé.
4. **Le design system a été copié, pas fourchu** (recommandation §9.4) : les 40 tokens et les idiomes visuels de `src/styles.css` ont été recopiés dans `seating.css`, avec deux ajouts sémantiques (`--t-mariee`, `--t-marie`) et une règle par côté pour les étiquettes projetées. Zéro régression possible sur l'app culturelle, et le transfert est mesurable : même `prefers-reduced-motion`, même focus visible 3 px, même thème sombre persistant.
5. **Le mode liste accessible est le chemin nominal**, pas le repli : tout ce que montre la scène se lit dans les cartes de tables, y compris sous DOM sans WebGL (vérifié : la dégradation est propre).

## 4. Les décisions de conception qui viennent de l'audit

| Règle posée par l'audit | Application dans le prototype |
| --- | --- |
| Une hypothèse ne contraint pas le graphe | `ondit` et données `deprecated` ne produisent **aucune** contrainte : elles alimentent la section « Questions ouvertes », avec la question exacte à poser et qui l'a dite |
| Résultat nul expliqué, jamais absolus | « aucun chemin » affiche la profondeur bornée atteinte ; les limites du calcul sont dans une section permanente, pas en bulle d'aide |
| Une contradiction est escalated | un bloc à la fois solidaire et en conflit → `complete: false`, badge « contredit par ailleurs » sur la ligne de séparation, arbitrage demandé |
| La capacité est une règle du lieu, pas une préférence | dépassement de 8 places = pénalité lourde (4 000 par siège excédentaire, carré) et table marquée en rouge, avec la raison écrite |
| Les données sensibles ne sortent pas par défaut | le CSV traiteur **n'inclut pas** régimes et allergies tant que la case n'est pas cochée ; une ligne du fichier exporté explique ce que l'export implique comme base légale |
| Une déduction reste étiquetée déduction | les séparations induites sont présentées « déduit de N source(s), à valider, pas à imposer », jamais comme un fait |
| Un changement non déclaré n'est pas une vérité | le comparateur de versions sépare déplacements tracés et déplacements sans raison : les seconds remontent en question |
| Récits prudents côté langage | le texte dit « écarté », « à observer », « le plan les place, il ne devine pas » — aucune promesse d'omniscience |

## 5. Ce qui n'est pas fait, volontairement

- **Pas de backend, pas de comptes, pas de paiement.** Le prototype ne teste que la thèse produit ; le périmètre écarté au §8 de l'audit reste écarté.
- **Pas de saisie dans l'interface.** La liste des invités et ses relations vivent dans `fixtures.js`. Un import CSV et un éditeur de relations sont la première brique manquante réelle.
- **Pas de persistance de projet.** Épinglages, questions tranchées et versions enregistrées vivent dans la session et le `localStorage` de l'appareil ; rien n'est synchronisable ni exportable en tant que projet.
- **Résolution non optimale par construction.** Ascension de colline déterministe, 900 essais maximum : le plan est bon, reproductible et expliquable, pas prouvé optimal. Un instance difficile peut rester bloquée sur un optimum local — le texte du plan le dit (`coût`, `essais`), il ne promet rien d'autre.
- **Le solveur ignore le placement des chaises** (voisins de chaise, table d'honneur, proximité de la sortie) : seul le niveau table est calculé. La note de Raymonde (« table la plus proche de la sortie ») est affichée, pas résolue.
- **Accessibilité non validée en navigateur réel** : focus, contrastes et lecteurs d'écran sont écrits selon les idiomes de RELIA mais n'ont pas été testés avec VoiceOver/NVDA.

## 6. Comment rejouer les mesures

```bash
npm test                                    # 129 tests : 74 RELIA + 55 seating (dont wording.test.js : la langue)
npm run build                               # 2 entrées, chunk three isolé
node --test src/seating/solver.test.js      # dont « le graphe impose une séparation qu'aucune ligne ne contenait »
npm run dev                                 # puis /seating.html
```

Le harnais de rendu (35 vérifications sur DOM : rendu des sections, plan 2D et ses filtres, un seul contrôle par siège, clic sur un siège du graphe, onglets, déplacement depuis la fiche, arbitrage de question, exports, thème, repli sans WebGL) a été exécuté **hors du dépôt** avec `jsdom` installé temporairement dans `/tmp`, pour ne pas ajouter de dépendance au projet. À reproduire avec la même méthode, ou à convertir en test Playwright si une validation navigateur doit devenir permanente.

## 7. Prochaines étapes, par coût croissant

1. **Import d'une vraie liste** (CSV → `{guests, relations}` avec colonnes `source` et `déclaré_par`) : c'est ce qui transforme la démo en outil qu'un prestataire peut essayer sur son mariage. Coût faible, et `model.js` refuse déjà ce qui est mal typé ou mal identifié.
2. **Test utilisateur avec deux wedding planners et un prestataire.** Critère de réussite écrit dans l'audit §9.1, transposé : en moins de dix minutes, une personne doit pouvoir dire **quelle contrainte le graphe a trouvée que sa liste ne disait pas, et laquelle reste à demander**. S'il n'y a pas de déclic, l'angle meurt ici, et c'est une bonne nouvelle à 3 000 lignes plutôt qu'à six mois.
3. **Persistance du projet** (IndexedDB, une clé par mariage) puis **PDF imprimable du plan** avec les limitations en pied de page. Le `planToJSON` existe déjà et contient coût, limitations, provenance des raisons.
4. **Export vers le traiteur et le lieu** en deux portées distinctes, comme le fait le site analysé pour le programme (aucun prix côté lieu) : ici, aucune donnée sensible côté prestataire technique.
5. **Dépôt séparé**, avec extraction du design system en paquet partagé — à ne faire qu'après l'étape 2, pour ne pas industrialiser une hypothèse non validée.
