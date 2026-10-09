# Prompt idéal — « Graphe de mariage temporel » (Arena Design 3D)

Le prompt est écrit pour produire **un écran par moment**, pas une fresque de tout le monde : c'est
la conclusion chiffrée de l'audit (`AUDIT_TIMELINE.md`) — le moteur affiche 32 étiquettes sur un
écran d'ordinateur, 13 sur un téléphone, et coupe les avatars au-delà de 36 nœuds. Les nombres du
prompt ne sont pas décoratifs : ils empêchent l'agent d'inventer un mariage bidon à 5 personnes.

Deux versions : la **courte** (ce que je collerais moi-même) et la **complète** (si l'outil accepte
un cahier des charges). Les deux sont prêtes à copier.

---

## 1. Version courte — coller telle quelle

> Conçois **un écran** : le graphe social d'un mariage, coupé par l'heure de la journée.
>
> Concept directeur : **le temps n'est pas une animation, c'est une lampe.** Les 37 acteurs
> (13 côté mariée dont la mariée, 10 côté marié dont le marié, 7 communs, 2 prestataires de
> service, 5 prestataires extérieurs) occupent des
> positions fixes dans l'espace — la position sociale, pas la place physique. Un plan lumineux
> traverse la journée de 13:00 à 02:00 ; ce qu'il éclaire est présent, le reste reste en gris
> à 28 % d'opacité. Se déplacer dans le temps ne déplace personne.
>
> Une arête rouge qui s'embrase = deux personnes qu'on a séparées à table et que le moment
> réunit. C'est LE sujet de l'écran : sur le jeu de données, il y a **6 paires de séparation et
> 48 co-présences qui les défont**, toutes dans des moments « tout le monde est ensemble ».
>
> Contraintes non négociables : 32 étiquettes maximum visibles à la fois (13 sur mobile),
> sélection au clic → panneau bas qui monte en trois arrêts, thème clair + sombre, repli SVG
> 2D obligatoire si WebGL échoue, aucune rotation automatique de caméra, aucun cœur ni confetti.
> Rendu documentaire, pas science-fiction : on lit un état d'une journée réelle.
>
> À livrer : l'écran par défaut (15:30, cérémonie), l'état sélection, l'étape mobile, l'état
> « pas de WebGL », et l'impression A4 paysage.

---

## 2. Version complète — coller telle quelle

> ### Rôle
> Tu es le designer 3D et l'UI designer d'un prototype produit. Tu livres **un écran**, pas une
> maquette marketing.
>
> ### Objet
> Une vue unique du mariage comme **graphe social traversé par le temps** : qui est avec qui, qui
> fait quoi, à quelle heure. Destinée à s'intégrer dans une page web existante (`/seating.html`
> d'un prototype de plan de table), donc : pas de nouvelle dépendance (Three.js 0.186 est déjà
> là), pas de backend, pas de compte utilisateur.
>
> ### Le concept à tenir
> **Le temps est une coupe, pas un mouvement.**
> - Les acteurs ont des positions fixes, déterminées par la structure relationnelle (deux
>   familles aux deux pôles, les ponts au centre). Elles ne bougent jamais pendant qu'on déplace
>   le curseur d'heure. Toute solution qui recalcule une layout à chaque étape est un échec de
>   design : la position est la mémoire de l'utilisateur.
> - Un **plan de lumière** (ou un rideau d'éclairage) balaye la journée, 13:00 → 02:00. Ce qui
>   est dans le présent du plan est éclairé ; ce qui est absent reste présent mais éteint, à
>   ~28 % d'opacité. On ne supprime jamais un acteur absent : on le voit disparaître, c'est
>   l'information (« Thierry est parti à 21:00, personne ne l'a remarqué »).
> - Les **zones** du moment (assemblée, terrasse, bar, fumoir, piste) sont rendues comme des
>   altitude-bandes ou des halos de sol, pas comme des bulles à étiquettes.
>
> ### Ce que l'écran doit révéler (le vrai sujet)
> 1. **Une séparation tenue à table et défaite par la journée.** Données réelles du prototype :
>    6 paires de séparation, 48 co-présences qui les annulent, 100 % dans des moments où tout le
>    monde est ensemble. Visuellement : une arête rouge qui **s'embrase** au moment où ses deux
>    extrémités sont éclairées. C'est l'unique moment de drame autorisé.
> 2. **Un devoir hors présence** : 3 dans le jeu (deux témoins requis à 14:30 qui n'arrivent que
>    pour 15:30 ; une grand-mère chargée du bouquet à 21:00 qui rentre à 19:40).
> 3. **Une trouée logistique** : 120 minutes de soirée tenues par un prestataire **sans contrat
>    signé**. À montrer comme une zone d'obscurité sur le plan de lumière, avec une puce
>    « document manquant ».
> 4. **La playlist comme lien, pas comme liste** : un morceau relie trois personnes (titre,
>    dédicataire, demandeur). Un titre peut déclencher la même arête rouge (ex. « Suspicious
>    Minds » dédiée à Bruno à 21:20, Nadia présente). Le graphe ne doit jamais devenir une
>    set-list : l'ordre des morceaux reste une liste hors du graphe.
>
> ### Budgets et plafonds (à respecter, pas à discuter)
> - Cast : **37 acteurs**. **Étiquettes : 32 max affichées (13 sur mobile)**, sélectionnées par
>   degré et proximité de la caméra ; dé-agrégation au zoom, jamais tout-à-la-fois.
> - Le plafond d'avatars du moteur est à 36 nœuds : le cast du jour J fait **un nœud de plus**.
>   Donc **aucun visage, par construction** — prévoir une identité non photographique (pastille de
>   côté, initiale, glyphe de rôle). Ne pas proposer de « photos de tout le monde ».
> - Physique O(n²) coupée après stabilisation : toute interaction doit rester < 1 ms/frame à
>   n = 90. Les moments, les documents et les morceaux **ne sont pas des nœuds**.
> - Chargement initial visé : < 20 kB gzippé hors three.js ; la scène 3D est **optionnelle**,
>   jamais le chemin unique vers l'information.
>
> ### Interactions demandées
> - Curseur d'heure (molette/flèches/glisser) + 10 moments nommés (mairie, cérémonie, vin
>   d'honneur, entrée, discours, repas, ouverture, soirée, pièce montée, fin) avec saut par
>   moment, pas par minute.
> - Clic sur un acteur → panneau du bas qui monte en trois arrêts (aperçu / mi-hauteur / plein) :
>   rôle, fenêtre de présence, devoirs avec heure, arêtes et leur source, documents rattachés
>   avec statut (signé / en attente / non fourni).
> - Clic sur un **prestataire** → même panneau, mais les documents passent en tête : c'est la
>   demande explicite du client.
> - Filtre « ne montrer que les ruptures » : éteint tout sauf les arêtes rouges embrasées.
>
> ### États à livrer (tous obligatoires)
> 1. arrivée, 15:30 — ce que comprend un inquisiteur en 5 secondes ;
> 2. sélection d'un prestataire, panneau en mi-hauteur ;
> 3. moment 22:10, arête embrasée + puce playlist ;
> 4. mobile 390×844 (13 étiquettes, panneau plein écran, pas de 3D par défaut) ;
> 5. **repli sans WebGL** : le même plan en SVG, lisible ;
> 6. impression A4 paysage d'un moment (le jour J s'imprime) ;
> 7. thème sombre.
>
> ### Langage visuel
> S'aligner sur l'identité existante du produit : 40 tokens, fond papier ou encre, filets de
> séparation fins, typographie de texte long, un accent, une ambre (à valider), un rouge (rupture).
> **Contre-indiqué** : glassmorphism, néon, halo violet, caméra qui tourne seule, particules,
> dégradés d'arrière-plan, « hologramme », icônes de cœur/alliance, toute métaphore fête.
> On dessine un **état d'une journée qui va arriver**, pas une pub pour mariage.
>
> ### Définition de « réussi »
> Une planneuse de mariage, 10 minutes, sur un déroulé réel, doit pouvoir répondre à : *« quel
> moment de ma journée est tenu par une seule personne, et lequel dépend d'un document qui
> n'existe pas ? »* — en regardant l'écran, pas en interrogeant un tableur. Si la réponse demande
> de comprendre l'interface, l'écran a échoué.
>
> ### Interdits de périmètre
> Pas de saisie de données (le cast vient d'un JSON de 32 invités et 40 relations), pas de
> paiement, pas de signature électronique, pas de carte de salle en 3D réaliste, pas de deuxième
> écran. Ne pas proposer de « vue globale de toute la journée en une image » : c'est la demande
> initiale, elle a été auditée et refusée pour surcharge.

---

## 3. Pourquoi chaque clause (correspondance prompt → audit)

| Clause du prompt | Ce qu'elle empêche, mesuré |
| --- | --- |
| positions figées, temps = coupe | la physique tourne jusqu'à 400 itérations puis se coupe : une layout qui bouge au scrub détruit la lecture et coûte 77 ms/400 frames à n = 90 |
| 32 étiquettes / 13 mobile | le budget réel du moteur (`⌊w·h/24000⌋`, plafonné à 32) ; ignorer ce chiffre produit un lavis illisible |
| 0 visage, par construction | le moteur coupe les avatars à 36 nœuds et le cast en fait 37 ; demander « les photos de tout le monde » = demander un écran sans photos |
| les absents restent en gris 28 % | 48 ruptures sur 6 paires ne se voient que si l'on compare présence et lien ; masquer les absents supprime la preuve |
| moments/docs/morceaux hors du graphe | 53 nœuds est tenable, 160 non : l'axe temporel ne doit pas devenir du contenu |
| arête rouge qui s'embrase | le seul moment où l'émotion est informative : elle marque une contrainte violée, pas une ambiance |
| panneau en trois arrêts, docs en tête au clic prestataire | le mécanisme existe déjà dans le produit ; le refondre = travail inutile |
| repli SVG obligatoire | le retour utilisateur « jvois pas les graphes » venait d'un rendu conditionné à WebGL dans un aperçu |
| impression A4 paysage | le jour J se vit hors réseau ; un écran qui ne s'imprime pas meurt à 20:00 |
| refus de la vue-tout-le-monde | « c'est compliqué, ça fait charger, on se perd » : 2 225 mots → 1 328 pour tenir ; la version « tout en un » repartait à la hausse |
| test de la planneuse en 10 minutes | la seule validation qui distingue un outil d'une démo |

## 4. Ce que je ferais avec le retour de l'agent

1. **Je ne branche pas le rendu sur une donnée inventée** : je rejoue sa proposition contre les 6
   paires et les 48 co-présences du script. Un design qui ne sait pas montrer une rupture est une
   coquille vide.
2. **Je compte.** Si l'écran livré affiche plus de 32 étiquettes ou ajoute un panneau de texte,
   on est revenus à la version surchargée, indépendamment de sa beauté.
3. **Je demande les 7 états, pas un rendu.** Sans le repli 2D, le mobile et l'impression, le
   design n'est pas une interface.
4. Ce qui trahit un mauvais rendu, à rejeter sans discussion : caméra qui tourne, néon/violet,
   bulles nommées autour des groupes, une frise chronologique horizontale de 10 moments avec tous
   les acteurs dedans, un graphique de « charge de travail » — la dernière est une visualisation
   pour présentateur, pas pour le jour J.
