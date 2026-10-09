# Audit — « un graphe de mariage complet, en un écran, avec le temps »

Demande (9 octobre 2026) : *une vue du graphe plein écran comme RELIA, tous les invités et
prestataires, et tout le long de la journée, pour chaque moment, qui est avec qui, qui fait quoi,
à quelle heure ; la playlist en graphe, la cérémonie aussi ; clic sur un prestataire → les docs
dans le panneau. L'organisation du mariage complet en un seul écran.*

Verdict en trois lignes. **Oui sur le fond, non sur la forme demandée.** L'axe temporel est la
seule extension de ce lot qui change la nature du produit : il découvre trois classes de défauts
qu'aucune grille horaire ne peut produire, et il contredit le plan de table 48 fois sur 48. Mais
« un seul écran avec tout le monde » est exactement le défaut que tu viens de me reprocher, à
l'échelle ×3 : le budget de lisibilité du moteur est de **32 étiquettes sur un écran
d'ordinateur, 13 sur un téléphone**. Le livrable correct est **un écran par moment** avec un
curseur de temps, pas un écran permanent avec les 10 moments dedans. Et ce n'est pas une
innovation pour RELIA : **le temps est déjà un premier citoyen du modèle** — `state.period`,
`inPeriod()`, les qualificatifs Wikidata P580/P582/P585 et une liste `timeline-year` existent
dans le produit (`src/app.js:53,185,1080`, `src/data.js:189`). La nouveauté, c'est de l'appliquer
à un domaine où les relations n'ont aucune date.

---

## 1. Ce que le moteur permet déjà — vérifié dans le code, pas dans l'intention

| Ce que tu demandes | Ce qui existe | Conséquence |
| --- | --- | --- |
| graphe plein écran | `#graph` occupe déjà tout le viewport, `#sheet` monte en 3 arrêts (`peek/half/full`, `src/sheet.js:5`) | le « panneau latéral avec les docs » n'est pas à concevoir : c'est `sheet` en `full` |
| cliquer un acteur → sa fiche | `onSelect(id)`, `setSelected`, `focus`, `highlightPath` (`src/graph.js`) | un clic sur un prestataire ouvre un panneau ; il reste à lui mettre un contenu |
| filtrer par moment | `setData(graph, visibleEdges)` : les arêtes sont filtrables sans recréer les nœuds (`src/graph.js:144`) | scrubber = changement d'arêtes + d'opacité, pas rechargement |
| ne pas perdre ses repères en bougeant le temps | la physique est **coupée à 400 itérations** (`src/graph.js:342`) et `setData` est diff : un nœud déjà présent garde sa position | **règle d'or gratuite** : figer les positions, n'animer que l'appartenance. Le plan 2D du prototype le fait déjà avec `state.highlight` |
| « qui, s'il manque, casse la journée » | `articulationPoints(adjacencyMap, ids)` (`src/seating/proof.js:72`) est agnostique du domaine | je l'ai appelé sur un graphe biparti acteur↔moment **sans le modifier** : la brique existe, seule la donnée manque |
| les moments datés | `inPeriod(edge,{from,to,undated})` (`src/data.js:189`) | le mauvais porteur ici — voir §3, dernier point |

**Les deux plafonds qui défont « tout le monde en un écran »** — mesurés à la formule du code :

- étiquettes : `Math.max(6, Math.min(32, ⌊w·h/24000 · zoom⌋))` (`src/graph.js:406`) → **32** sur
  1440×900, **13** sur 390×844. Avec 40 invités + 6 prestataires, la moitié du cast est sans nom
  à zoom 1. Ce n'est pas une question de goût, c'est le budget de lisibilité, déjà calculé.
- visages : les avatars se coupent au-delà de **36 nœuds** (14 sur mobile) (`src/graph.js:15`) →
  le jour J, plus d'avatars. Le « je vois la tête de tout le monde » n'existe pas.
- coût : la répulsion est en O(n²) par frame. Banc isolé, 400 frames : **23 ms à n=40, 77 ms à
  n=90, 241 ms à n=160** (single-thread Node, sans allocations `Vector3`, sans rendu, sans DOM
  des étiquettes → sous-estimé). Tenir les 53 nœuds d'un modèle « complet » est trivial ; y
  mettre les docs et les morceaux comme nœuds ne l'est pas, surtout sur le téléphone du jour J.

Conclusion de service : **le temps doit être l'axe, pas le contenu.** Ni les 10 moments, ni les
11 documents, ni les 40 morceaux ne deviennent des nœuds.

## 2. L'épreuve chiffrée

`node tools/temporal-audit.mjs` — déroulé synthétique de 10 moments branché sur le vrai jeu de
démonstration (mêmes 32 personnes, mêmes 40 relations, même plan résolu : 5 tables, coût 220,
3/3 séparations tenues, 2 induites, `complete:false`). Zéro dépendance, hors bundle.

| Classe de défaut | Trouvé | Une grille horaire le voit-elle ? |
| --- | --- | --- |
| séparations tenues à table, défaites par la journée | **48** co-présences, **6 paires distinctes sur 6**, dont **48 en zone ouverte et 0 en zone déclarée** | non : la grille dit « tout le monde en salle », pas « Bruno et Nadia y sont ensemble » |
| devoir affecté hors présence | **3** (les 2 témoins requis à la mairie à 14:30 alors que le RSVP par défaut les fait arriver à 15:30 ; Raymonde doit recevoir le bouquet à 21:00 et rentre à 19:40) | seulement si la présence est une colonne — elle ne l'est presque jamais |
| double réservation | **1** (la coordinatrice tient la soirée 21:20→00:30 *et* la pièce montée à 23:30) | oui, avec un tableur bien tenu |
| dépendant parti sans son accompagnateur | **2** (Léo 20:30 vs Élodie 00:30 ; Raymonde 19:40 vs Sophie 00:30) | non |
| exposition par la playlist | **4** (« Suspicious Minds » **dédiée à Bruno** à 21:20 avec Nadia présente ; « I Will Survive » **demandée par Nadia** à 22:10 avec Bruno sur la piste) | non : le tableur de set-list n'a pas de destinataire |
| musique couverte par un contrat inexistant | **trou réel de 120 min** sur la soirée (2 musiciens annoncés, 1 sous contrat signé) | non : le déroulé note « DJ 21:00→02:00 », jamais l'état du devis |
| charge des acteurs | Emma 29 %, Matthieu 28 % du temps de présence en tâches | non |
| point d'articulation du déroulé | **0** — la redondance des prestataires protège les moments | la réponse honnête est que *la coverage n'est pas le problème ; l'état des papiers l'est* |

Et le chiffre qui décide de toute l'architecture : **0 relation sur 40 ne porte de temps.** Une
brouille n'a pas d'horaire. Donc **présence = filtre, relation = constante** : le curseur de temps
ne doit jamais éteindre un lien sous prétexte qu'il n'est pas daté — c'est le contraire du
comportement de `inPeriod` (dont le défaut `undated = true` existe précisément parce que
l'histoire est mal datée). Le produit doit donc montrer la contrainte *partout dans la journée*,
et n'utiliser le temps que pour la **co-présence**.

**Le résultat le plus gênant du lot : sur 48 ruptures, 0 ne se répare en changeant les tables.**
Elles se passent toutes dans des moments où tout le monde est ensemble. Le plan de table est une
*partition* (chacun dans une case) ; la journée est une *superposition de zones*. Un problème de
zones ne se résout pas par l'affectation de chaises mais par l'horaire (décaler le bar, doubler la
terrasse, avancer le goûter des enfants). **Le temps n'est pas une couche de visualisation du
moteur existant : c'est un deuxième problème d'optimisation, avec un autre solveur.**

## 3. Idée par idée, sans complaisance

| Ton idée | Verdict | Pourquoi |
| --- | --- | --- |
| vue plein écran comme RELIA | **oui**, effort faible | le shell existe ; c'est une question de contenu de panneau |
| tous les invités + prestataires | **oui comme cast, non comme affichage simultané** | 32 étiquettes / 13 sur mobile, 0 avatar au-delà de 36 → il faut agréger par table ou par famille, et dé-agréger au zoom |
| tout le long de la journée | **oui en scrubber**, pas en quatre axes | une journée traverse minuit : mon premier modèle a produit **8 faux défauts** pour cette seule raison, avant que je compte en minutes depuis une heure de coupure (06:00) |
| qui est avec qui à chaque moment | **oui — c'est le produit** | c'est la table qui contredit 48/48 |
| qui fait quoi à quelle heure | **oui, et c'est le seul bloc irremplaçable** | 10 devoirs = 30 champs ; rien ne peut le dériver. À minimiser, pas à enrichir |
| playlist en graphe | **oui en hyperedge à trois pointes** (morceau, dédicataire, demandeur) posé sur une heure ; **non en « graphe de séquence »** | une set-list est une suite ordonnée avec durées ; la transformer en nœuds perd ce qui la rend utile (l'ordre) et n'ajoute que les relations — donc : la suite reste une liste, le graphe n'y prend que les dédicaces |
| clic prestataire → les docs | **oui — premier à faire** | effort le plus faible, valeur immédiate, et c'est la discipline de preuve de RELIA appliquée au commerce : un document *est* une source, avec un statut et une échéance |

## 4. Ce que ça coûte à saisir — le vrai mur

Le même script compte les champs qu'il faut pour que la vue unique soit **vraie** :
**165 champs** pour une journée de jouet (10 moments, 10 devoirs, 5 prestataires et leurs 11
documents, 6 morceaux, 32 fenêtres de présence). À l'échelle d'un vrai mariage (40 morceaux, 25
devoirs, 8 prestataires) : 400 à 600 champs, à tenir à jour jusqu'à la dernière minute.
Décomposé : 64 champs de présence et 20 de documents **sont déjà ailleurs** (RSVP, devis,
contrats) → la saisie irremplaçable tombe à ~80 champs, à condition de les **importer** et non de
les redemander. C'est là que l'audit du produit (voir `AUDIT_MARIAGE.md`) repasse en premier :
sans import du formulaire RSVP ni lecture des contrats, la timeline est un bel écran qu'on
remplit une fois et qui est faux dès le lendemain.

Et le mur qui ne bouge pas, répété parce qu'il tue la promesse « l'organisation complète en un
écran » : **sans serveur, il n'y a pas de vérité partagée le jour J.** Un déroulé change vingt
fois en 48 h ; à deux personnes qui le modifient sur deux appareils, la vue unique devient une
vue fausse — et un graphe faux est *pires* qu'une feuille, parce qu'il a l'air d'une preuve. IndexedDB +
export + lien de lecture seule, ou alors il faut renoncer à l'angle « complet ».
S'y ajoutent, inchangés depuis l'audit produit : données personnelles × temps × allergies ×
documents = charge RGPD supérieure à celle du plan de table ; et le multi-tenant (plusieurs
mariages, plusieurs clients) qui n'existe pas dans un viewer statique.

## 5. Le périmètre que je défendrais

- **J+1 — la preuve visuelle, sans nouveau modèle.** Curseur de temps sous le plan 2D existant,
  positions figées, opacité = présence ; clic sur un prestataire → panneau fenêtre + documents +
  statut. Quatre compteurs en tête : présents / devoirs tenus / moments à trou / papiers manquants.
- **J+3 — le modèle temporel.** Schéma `relia.temporal.v1` (moment = {heure, lieu, zones,
  acteurs requis}), les 6 classes de défauts en lignes de « trouvailles » (même registre que le
  plan de table : une ligne, une raison, une source), `articulationPoints` sur le biparti, le
  trou calculé **en ne comptant que les prestataires sous contrat signé**.
- **2 semaines — ce qui rend l'écran crédible en production.** Import RSVP/contrats (tue ~60 % de
  la saisie), export du déroulé **consultable hors réseau** (le jour J n'a pas de 4G dans une
  cave), et le lien privé en lecture seule pour les prestataires.
- **Le test qui dit si ça vaut un produit** (même format que celui du plan de table) : un planneur,
  un déroulé réel, 10 minutes, et la question : *« dis-moi quel moment de ta journée est tenu par
  une seule personne, et lequel dépend d'un document qui n'existe pas. »* S'il répond aussi bien
  sans la vue, l'écran ne vaut pas son coût d'entrée — et alors on garde le plan de table seul.

Ce que je **ne ferais pas** : l'optimisation conjointe (tables + horaires + zones + playlist).
C'est un problème d'ordonnancement avec contraintes de zones ; le solveur actuel sait faire pour
une partition, pas pour des intervalles. V1 = **vérifier et montrer**, pas résoudre.

## 6. Ce que mon propre modèle a faux (à lire avant de parier dessus)

L'épreuve a d'abord produit ses propres erreurs, et ce sont les meilleurs enseignements du
document, parce qu'elles sont toutes des pièges du domaine, pas des fautes de code :

1. **minutes du jour** → « 00:30 » trié avant « 15:30 » : 8 faux défauts et 0 vrai. Il faut une
   heure de coupure (ici 06:00), sinon les slots du matin basculent au lendemain ;
2. **unités mélangées** (minutes ÷ heures) → 9 acteurs signalés à tort « sans moment libre » ;
3. **zones trop grossières** → dire « tout le monde en salle » revient à déclarer qu'aucune
   séparation ne tient : le 48/48 dépend de mon granularity, pas du moteur ;
4. **fenêtres non croisées avec la logistique** (dé montage, trajet entre mairie et parc) ;
5. TDZ sur une constante déclarée trop bas, et `articulationPoints` sur un graphe de présence
   dense ne renvoie rien : la structure qui compte est **acteur ↔ responsabilité**, pas
   acteur ↔ pièce.

Données : déroulé, présences, devoirs, documents et morceaux inventés pour l'épreuve ; les
personnes et les relations sont le jeu de démonstration réel. Les ordres de grandeur sont
transférables, les valeurs non.

## 7. Rejouer

```bash
node tools/temporal-audit.mjs   # l'épreuve chiffrée (§2), zéro dépendance
npm test                        # 109/109 — rien de ce lot ne touche au produit
npm run dev                     # puis /seating.html : le plan 2D + le curseur à greffer
```

Poids actuels du prototype, pour mémoire : 53,7 kB JS + 17,6 kB CSS (18,2 + 4,5 gz), three.js
(594 kB) hors du chargement initial. La vue temporelle, telle que bornée au §5, ne change ni l'un
ni l'autre : elle ajoute une douzaine de lignes de rendu et un modèle de données.
