# RELIA — Vision produit V4

> **RELIA — Tout est relié.**  
> Audit produit, UX et architecture d’évolution — 8 octobre 2026

## Périmètre et méthode

Cet audit porte sur le code du dépôt, les tests et les rapports des phases 2 et 3. Le navigateur de cette session n’a pas permis de charger l’application déployée ; l’apparence décrite ci-dessous est donc celle vérifiable dans `index.html` et `src/styles.css`, et non une validation visuelle en production. Les capacités réseau ont été évaluées à partir des adaptateurs et tests ; cela ne certifie ni la disponibilité actuelle de Wikimedia, Wikipédia ou BnF, ni la qualité de chaque assertion.

Les mots **fonctionne dans le code**, **limité/expérimental** et **à construire** sont employés pour distinguer l’implémentation actuelle des propositions.

## 1. État réel du produit

### Ce que RELIA sait faire aujourd’hui

- **Choisir une identité, pas seulement un nom.** La recherche consulte Wikidata en français, puis en anglais si nécessaire, affiche jusqu’à huit résultats et exige le choix explicite d’un résultat et de son identifiant Q. Les résultats de recherche ne sont pas eux-mêmes une confirmation d’identité humaine ; le mode Relier vérifie que chaque personne sélectionnée est une instance humaine Wikidata (Q5).
- **Explorer un voisinage documenté.** Pour une entité réelle, RELIA récupère des assertions issues d’une liste codée de propriétés professionnelles et culturelles, leurs références, certaines dates et les libellés de ses voisins, puis les place dans un graphe 3D Three.js. La requête inclut les relations sortantes et une recherche entrante bornée. La catégorie de certaines entités reste une suggestion déduite des relations quand Wikidata ne fournit pas une classe reconnue.
- **Voir personnes, œuvres, institutions, événements et lieux**, avec descriptions disponibles, quelques dates biographiques, professions résolues, sitelinks Wikipédia exacts et images P18 de Wikidata. Les portraits circulaires chargent par petits groupes et sont plafonnés à 12 ; ils sont désactivés en mouvement réduit, sur certains appareils peu puissants et lorsque le graphe est dense.
- **Ouvrir une fiche et suivre une relation.** La fiche affiche les voisins et permet de poursuivre l’exploration. Un clic sur une relation ouvre ses propriétés, son rang, ses dates, son identifiant d’assertion et ses références déclarées (P854/P248), avec accès aux documents ou pages correspondants. La référence établit la provenance déclarée dans Wikidata, pas la véracité du fait dans la source externe.
- **Chercher un chemin entre deux personnes** en parcourant dans les deux sens les assertions admissibles. Le moteur retourne un chemin le plus court dans le graphe consulté à cet instant, pas dans tout Wikidata. Le chemin s’affiche étape par étape et est mis en valeur dans la scène.
- **Filtrer les relations par période**, y compris les années négatives et une option d’inclusion des dates inconnues. Le filtre utilise les dates de relations, pas les dates de vie ou la date de publication des sources. Une modification de période efface le chemin antérieur.
- **Consulter un extrait Wikipédia** uniquement depuis le sitelink exact associé à l’entité, sans nouvelle recherche par nom.
- **Tenter un enrichissement BnF** uniquement lorsqu’une relation explicite `owl:sameAs` relie l’identité Wikidata à une notice. L’adaptateur attend des libellés et fournit attribution et conditions de réutilisation ; il ne produit pas d’arêtes. L’accès réel et le schéma de production ne sont pas validés selon le rapport Phase 2.
- **Comparer et conserver des instantanés RELIA Discovery** : capture du graphe réel consulté, import/export JSON, comparaison déterministe, registre dans le navigateur et téléchargements. Les états portent paramètres, sources déclarées, limites et erreurs générales. Leur empreinte détecte des altérations accidentelles, mais n’est pas une signature d’authenticité.
- **Montrer une démonstration fictive isolée** et un mode liste accessible lorsque le rendu WebGL est indisponible. La démonstration n’est jamais une donnée historique.

### Limites et état d’achèvement

| Capacité | Statut réel et limites vérifiables |
| --- | --- |
| Recherche d’identités | Recherche Wikidata réelle implémentée ; homonymes et descriptions peuvent subsister. Une sélection explicite réduit l’ambiguïté mais ne certifie pas l’identité. |
| Réseau et chemin | Réseau partiel, limité à 100 entités et 180 relations. La recherche de chemin borne les expansions à 12, les requêtes à 40 et la profondeur explorée à 4 depuis chaque extrémité. Une recherche entrante ou une source indisponible peut rendre le résultat incomplet. |
| « Aucun chemin » | Signifie seulement qu’aucun chemin admissible n’a été trouvé dans le périmètre effectivement exploré. Les assertions sans référence exploitable, obsolètes, fictives et les propriétés géographiques P19/P20/P131 ne peuvent pas établir un chemin professionnel/culturel. |
| Sources | Relations consultables et provenance Wikidata visibles, mais pas de contrôle automatique des documents externes ni de classement éditorial de leur fiabilité. |
| Dates | Filtrage opérationnel des dates de relation connues ; beaucoup de relations n’ont pas de date exploitable. Le filtre n’infère aucune chronologie de carrière. |
| BnF | Adaptateur expérimental à alignement exact ; aucune recherche par nom, aucune relation et aucune admissibilité aux chemins. Tests sur fixtures, pas preuve d’un service de production validé. |
| Discovery | Moteur de comparaison sophistiqué, mais la capture directe actuelle déclare Wikidata comme seule source. Comparer deux captures ainsi ne fournit pas de nouvelle source et est donc volontairement incomparable. Une comparaison enrichie suppose un snapshot tiers réel, autorisé, traçable et à périmètre comparable. Les 20 paires de phase 3 sont synthétiques, pas des découvertes documentaires réelles. |
| Expérience visuelle | Scène 3D, rotation, zoom, déplacement, survol, sélection, recentrage et transitions de caméra implémentés. Tous les nœuds ont un label DOM projeté ; le code ne prévoit pas de budget anti-chevauchement dépendant du zoom ou de la densité. |
| Accessibilité et mobile | Recherche clavier, attributs ARIA et liste de remplacement existent. WebGL reste inaccessible comme structure à lui seul ; la liste est l’alternative. Sur petit écran les panneaux deviennent des panneaux superposés, mais les interactions hover n’existent pas au tactile. Tests de code présents, validation réelle des appareils non établie. |
| Thème et performance | Le thème implémenté est sombre ; aucun sélecteur de thème clair/sombre n’est présent. Le rapport Phase 3 signale un bundle de production de 641,93 kB minifié, au-dessus du seuil Vite de 500 kB. |

### Innovations déjà tangibles

1. **Une promesse de connexion accompagnée de ses limites.** La séparation assertion référencée/hypothèse, les exclusions de chemins et l’état incomplet rendent la prudence vérifiable au lieu d’ajouter un avertissement abstrait.
2. **Le chemin comme récit navigable.** RELIA explore depuis deux identités exactes et peut révéler les intermédiaires par œuvres, institutions ou événements, avec retour aux assertions d’origine.
3. **Le croisement de deux réseaux sans surinterprétation.** L’application sait présenter un résultat sans chemin et expose les plafonds ; l’opportunité est de rendre cette explication centrale et visuelle, car les réseaux A et B ne sont pas aujourd’hui distingués comme deux ensembles pédagogiques.
4. **Discovery comme protocole de comparaison, pas comme bouton “découverte”.** Le schéma, les paramètres comparables, les identifiants exacts, l’attribution explicite et les cas incomparables posent une base sérieuse de reproductibilité. Le moteur n’est toutefois pas une source de nouvelles données.
5. **Des portraits sourcés dans la constellation.** Le rendu relie l’identité visible à un fichier P18 exact et à sa page Commons ; la sélection, densité, appareil et mouvement réduit bornent le coût.

### Solidité et points de vigilance

**Fondations solides :** séparation modulaire entre données, scène, interface, BnF et comparaison ; appels réseau annulables, délais et caches mémoire bornés ; filtrage central des propriétés et preuves ; tests unitaires couvrant recherche, période, chemin, références, interruptions, avatars, snapshots et comparaison. Le moteur de graphe opère sans créer de faits à partir des libellés.

**Complexités à surveiller :**

- cinq onglets de même rang mélangent un objectif principal (Explorer/Relier), des filtres ou des preuves (Temps/Sources) et un outil avancé d’analyse/import (Discovery) ;
- une liste de propriétés fixe détermine la vision du monde du graphe ; élargir le périmètre multiplie les ambiguïtés sémantiques et de preuve ;
- l’exploration entrante et les données publiques à la demande rendent la couverture variable ; davantage de requêtes ne résout pas à elle seule l’incertitude documentaire ;
- la scène actuelle dessine les étiquettes de chaque nœud sans gestion de collisions, et les petits textes/contrastes sont cohérents avec un parti pris immersif mais peu robustes à distance, à forte densité ou sur mobile ;
- Discovery et BnF peuvent imposer un coût conceptuel disproportionné si l’utilisateur ordinaire doit les comprendre avant d’avoir trouvé une réponse ;
- un réseau « complet », une relation réelle établie ou une nouveauté historique ne doivent jamais être suggérés par une animation convaincante.

## 2. Audit UX/UI et expérience publique

### Direction

Conserver la constellation plein écran comme objet principal, mais la rendre lisible avant de la rendre spectaculaire. L’accueil actuel met déjà en scène le graphe et une recherche, mais son texte, les labels et plusieurs commandes sont petits ; cinq modes techniques cohabitent dans la navigation basse. Le changement utile n’est pas un tableau de bord : c’est une **constellation qui explique son propre périmètre**.

La direction recommandée est claire par défaut, avec un fond ivoire très pâle, un graphe toujours coloré et un mode sombre optionnel. Les panneaux deviennent des surfaces simples, aérées, moins translucides ; la typographie et les interactions gagnent en taille. RELIA conserve son accent violet et son signe de constellation, sans employer les couleurs comme seule manière de signaler une preuve.

### Les deux réseaux et le résultat nul

Quand l’utilisateur compare A et B, présenter dans la scène et dans une courte légende :

- **Réseau exploré de A · [nom]** et **Réseau exploré de B · [nom]**, avec une couleur douce distincte, leurs nœuds propres et un traitement commun pour les intersections ;
- les chemins trouvés comme une troisième couche fortement mise en évidence, avec étapes, relations et accès aux sources ;
- en l’absence de chemin, une phrase visible et stable : **« Aucun chemin documenté n’a été trouvé dans les données explorées. Cela ne prouve pas l’absence de relation réelle. »**
- un résumé concret de l’exploration : identités racines, nombre d’entités, relations et assertions admissibles consultées, expansions effectuées, profondeur et éventuelles limites, erreurs ou sources indisponibles. Ne pas appeler « relations explorées » des assertions filtrées hors chemin sans l’indiquer.

Il faut afficher le résumé lorsque la recherche se termine, y compris en cas de résultat nul. Si les sources ont échoué ou un plafond a été atteint, placer **« recherche incomplète »** avant la conclusion négative et proposer de relancer. Si aucun chemin admissible n’est trouvé dans une recherche achevée selon les plafonds, préciser ces plafonds plutôt que laisser penser à une exploration mondiale.

### Noms lisibles sans couvrir le ciel

La scène doit appliquer une hiérarchie d’étiquettes, et non augmenter uniformément la taille de toute la typographie 3D :

1. Toujours donner la priorité aux deux identités recherchées ; afficher leur nom clairement et un marqueur A/B explicite.
2. Afficher au niveau de zoom initial seulement les nœuds racines, ceux du chemin et les voisins les plus pertinents. Augmenter progressivement le nombre de labels avec le zoom et réduire le nombre permis lorsque la densité à l’écran augmente.
3. Calculer le placement en coordonnées écran et écarter/masquer les labels qui se chevauchent. Ne pas dissimuler leur existence : garder une sélection possible par le nœud et par la liste accessible.
4. Survoler à la souris ou sélectionner au clavier/toucher agrandit le nom ; le focus et la sélection restent persistants au-delà d’un hover bref. La fiche doit identifier clairement la relation et la source.
5. Sur mobile, remplacer le hover par un toucher pour sélectionner, un toucher prolongé facultatif pour une prévisualisation, et une fiche compacte ; augmenter les zones tactiles et ne jamais rendre le nom indispensable à l’identification par couleur seule.

Cette stratégie est réaliste sur l’architecture existante : les labels sont déjà des éléments DOM repositionnés à chaque rendu à partir de la projection Three.js. Un ordonnanceur de visibilité et de collision en coordonnées écran est à développer ; il faut le mesurer sur plusieurs densités et appareils avant de choisir ses seuils.

## 3. Modes de navigation et architecture proposée

| Mode actuel | Fonction réelle | Dépendance et utilité | Décision |
| --- | --- | --- | --- |
| **Explorer** | Recherche/choix d’une entité, chargement de son réseau, sélection et fiche. | Cœur d’entrée ; Wikidata réelle ou démonstration fictive. | **Principal** : accueil et ajout progressif d’identités. |
| **Relier** | Choix explicite de deux personnes, recherche bornée, rendu d’un chemin ou message d’absence/incomplétude. | Dépend des identités exactes et de l’exploration distante ; fonction à forte valeur et signature RELIA. | **Principal** : formulé comme le geste emblématique « Relier deux personnes ». |
| **Temps** | Filtre global sur les relations et les chemins, avec inclusion optionnelle des dates inconnues. | Utile seulement une fois un réseau chargé ; ne date pas les biographies. | **Contextuel** : filtre de la constellation, près du résumé du réseau. |
| **Sources** | Provenance de la relation sélectionnée ou liste des relations et références visibles. | S’ouvre aussi après clic sur une arête ; densité de détails pour usage avancé. | **Contextuel** : ouvrir depuis une relation, avec liste globale repliée dans « Sources et limites ». |
| **Découvrir / Discovery** | Capturer, importer/exporter et comparer des snapshots dans le navigateur. | Outil avancé ; la capture seule est mono-source et ne donne pas de comparaison admissible. | **Avancé, masqué par défaut** : « Analyse expérimentale » ou accès de niveau secondaire, jamais un onglet principal. |

**Architecture de navigation :** un espace principal unique « Explorer » accueille recherche simple et action secondaire « Ajouter une deuxième personne ». L’état à deux identités devient « Relier ». Dans le même espace, les options apparaissent lorsque le contexte les rend utiles : période après chargement, détails de source après sélection d’un lien, et analyse Discovery seulement depuis une commande avancée. Sur mobile, une seule fiche/panneau à la fois avec retour explicite à la constellation.

Ne pas ajouter un mode carte, carrière ou école avant qu’un parcours réel et une source adaptée puissent soutenir ces vues.

## 4. Innovations possibles à partir du code existant

Les complexités sont relatives : **M** = incrément moyen ; **É** = élevée ; **TÉ** = très élevée. Chaque idée ci-dessous est une possibilité, non une fonctionnalité livrée.

| Idée | Existe déjà | À développer et sources nécessaires | Faisabilité / valeur | Risques et limites | Complexité |
| --- | --- | --- | --- | --- | --- |
| **Exploration universelle des personnes** | Recherche par nom, voisins via une liste de propriétés, identité Wikidata. | Élargir prudemment le domaine de relations, amélioration de résolution d’identité et couverture multi-domaines ; Wikidata d’abord, puis connecteurs explicites. | Faisable par incréments ; donne un terrain d’exploration large. | Wikidata n’est ni complet ni uniformément référencé ; « universelle » promet trop. Garder les domaines visibles et les exclusions. | É |
| **Réseaux professionnels** | Employeur, formation, appartenance à une organisation, distinctions sont dans la liste actuelle. | Filtre/lecture éditoriale des propriétés professionnelles et dates, meilleure séparation des organisations et affiliations ; Wikidata, éventuellement sources biographiques autorisées. | Très faisable ; rend les connexions utiles pour comprendre un parcours. | L’affiliation ne prouve pas rencontre ou collaboration directe ; données manquantes et statuts ambigus. | M |
| **Histoire des collaborations** | Relations via œuvres et événements, plusieurs propriétés créateur/participant, dates de relation parfois présentes. | Parcours centré sur les œuvres, rôles et assertions datées ; Wikidata pour amorcer, sources de catalogues/archives autorisées pour vérifier et enrichir. | Forte valeur culturelle ; exploite le graphe déjà construit. | Ne pas assimiler contribution à collaboration personnelle ni déduire rencontre ; référentiels incomplets. | É |
| **Exploration géographique** | Lieux et certaines relations géographiques sont visibles comme contexte, mais exclues des chemins. Aucune carte. | Vue spatiale distincte, coordonnées validées, géocodage, temporalité et provenance des lieux ; Wikidata complété par gazetteers/licences validés. | Techniquement possible, mais pas un simple changement de scène. Valeur pour musées et histoire locale. | Localisation incertaine, anachronisme des frontières, inférences trompeuses à partir des lieux de naissance. | É |
| **Parcours temporels** | Filtre temporel de relations P580/P582/P585, années avant notre ère conservées. | Frise synchronisée avec scène, précision/absence des dates visibles, agrégation contrôlée ; Wikidata, puis sources datées. | Très faisable sur les dates existantes ; compréhension de l’évolution d’un réseau. | Dates inconnues nombreuses ; P577 est une date de publication, pas la date d’une relation. | M |
| **Œuvres et créateurs** | Nœuds d’œuvres et propriétés d’auteur, composition, réalisation, interprétation, création, édition. | Parcours « suivre une œuvre », rôles et versions/éditions explicites ; Wikidata et catalogues d’autorité (BnF après validation, autres catalogues sous licence). | Forte valeur distinctive, et extension directe de l’expérience actuelle. | Homonymies, attribution controversée, rôles multiples et notice de même œuvre difficile à aligner. | M/É |
| **Généalogie documentée** | Aucune relation familiale admissible ; les propriétés de parenté/intimité sont exclues. | Produit et politique séparés, arbre familial, gestion des vivants et pièces d’archives ; registres d’état civil/archives selon juridiction, accès et consentement. | Possible en théorie mais pas un prolongement responsable du graphe actuel. | Vie privée, personnes vivantes, données sensibles, erreurs d’identité et réglementation. Ne pas dériver la généalogie de la démo actuelle. | TÉ |
| **Découvertes multisources** | `RELIA Discovery` compare des snapshots attribués ; BnF fournit un enrichissement d’identité expérimental, pas des relations. | Connecteurs de sources de relations autorisées, provenance assertion par assertion, règles d’alignement, validation humaine, protocoles de collecte reproductibles. | Potentiel élevé ; le schéma Discovery constitue une base technique. | Comparabilité, doublons, licences, mise à jour des sources et preuve qu’une différence vient d’une source donnée. | TÉ |
| **Registre des découvertes** | Registre JSON local pour différences déterministes ; statut de validation humaine « non revu ». | Espace de travail durable, historique d’interprétation, commentaires et statut de revue ; sources qui alimentent les snapshots. | Incrément possible, utile aux chercheurs/curateurs. | Snapshot local perdu, hash non signé, présentations de nouveautés comme faits établis. | É |
| **Partage d’une constellation** | Export JSON et conservation locale ; pas d’URL partagée ni de service de partage. | Format de lien/instantané versionné, contrôle d’import, stratégie de taille et éventuellement stockage distant consenti. | Faisable ; rend les découvertes transmissibles. | Données obsolètes, provenance et limites qui se perdent, sécurité/confidentialité, coûts d’hébergement. | M/É |
| **Visualisation du chemin** | Chemin surligné, liste des étapes et liens vers chaque provenance ; transitions de caméra déjà codées. | Mise en scène séquencée, pause/continuer, explication par étape, mouvement réduit et cadrage mobile. | Très faisable ; peut devenir l’instant mémorable du produit. | Le spectacle ne doit pas présenter une assertion comme validée ni occulter une recherche partielle. | M |
| **Écoles et musées** | Faits contextualisés, fiches, sources, chemin, période et démonstration fictive. | Parcours guidés et exemples validés, vocabulaire pédagogique, exports/partage de séance, tests avec éducateurs ; corpus/documentation autorisés. | Valeur forte si conçu avec des utilisateurs ; réutilise les bases. | Narration orientée, niveau scolaire, droits médias et réutilisation non vérifiée. | É |

## 5. Expérience emblématique proposée

### « Deux noms. Un chemin — ou la limite clairement racontée. »

1. **L’accueil demande un premier nom**, en langage naturel, avec une phrase qui explique que l’utilisateur choisira l’identité exacte. Il peut ajouter une deuxième personne dès le départ, sans devoir connaître les modes.
2. **RELIA désambiguïse avant de raconter.** Pour chaque résultat, montrer nom, description courte, identifiant et portrait disponible. En cas de doute, ne pas choisir automatiquement ; une fiche de confirmation répond « Est-ce bien cette personne ? ».
3. **La scène s’ouvre sur deux pôles identifiés A et B.** Une ligne de statut décrit les données en chargement et les sources consultées. Les voisins apparaissent par couches, avec œuvres et institutions comme passerelles visuelles.
4. **Si un chemin admissible est trouvé**, les nœuds hors récit s’atténuent, puis la caméra parcourt le chemin étape par étape. Chaque arrêt énonce « A est lié à cette œuvre comme… » et donne accès à la propriété, au rang, à la date connue et à la provenance. Commandes visibles : pause, étape suivante, afficher tout, réduire le mouvement.
5. **Si aucun chemin n’est trouvé**, afficher dans la constellation deux nuages souplement colorés et distincts, sans inventer de lien entre eux. Une carte de résultat résume précisément le périmètre et affiche : « Aucun chemin documenté n’a été trouvé dans les données explorées. Cela ne prouve pas l’absence de relation réelle. »
6. **Les limites deviennent actionnables.** Expliquer le nombre d’entités/relations, les niveaux et requêtes consommés, les dates inconnues et les échecs de sources. Proposer « Réessayer les sources indisponibles » ou « Explorer un intermédiaire précis », sans élargir silencieusement les règles.

**Interaction remarquable et réaliste :** le « fil de lumière » n’apparaît qu’entre des assertions admissibles d’un chemin effectivement retourné ; il avance d’étape en étape et laisse l’utilisateur toucher chaque étape pour ouvrir sa provenance. C’est réalisable avec les arêtes et transitions de caméra existantes. Le fil ne traverse jamais un vide pour suggérer une relation ; en cas d’absence, les deux constellations restent séparées.

## 6. Proposition de design system RELIA

Une seule direction : **la clarté éditoriale d’un atlas vivant**, ni cockpit analytique ni imitation de marque Google/Apple.

| Élément | Recommandation |
| --- | --- |
| **Typographie** | Sans-serif système lisible, avec une seule famille distinctive de marque pour titres/logotype. Éviter de dépendre du chargement distant d’une police pour le contenu essentiel. |
| **Échelle** | Corps 16–18 px sur bureau, 16 px minimum sur mobile ; titre d’accueil 40–56 px ; titres de panneaux 22–28 px ; aides et métadonnées rarement sous 12–13 px. Utiliser une échelle régulière et des interlignes confortables. |
| **Couleurs** | Clair : fond ivoire `#F7F8FA`, surface blanche, texte encre `#18202B`, gris moyen accessible, violet RELIA en accent. Sombre optionnel : fond nuit proche de l’actuel, surfaces distinctes et contrastes recalculés. Couleurs catégorielles de nœuds sobres et cohérentes ; A/B utilise deux accents dédiés. Preuve et état partiel ont aussi un libellé et une icône, pas seulement une couleur. |
| **Contrastes** | Corps et composants conformes à un contraste WCAG AA ; ne pas employer le texte gris pâle actuel comme texte de lecture. Mesurer les états sur les deux thèmes et sur le graphe. |
| **Nœuds** | Sphères actuelles conservées comme base ; taille déterminée par rôle/focus, pas par importance supposée d’une personne. Taille interactive minimale visuelle et hit-target renforcé au toucher. |
| **Portraits** | Portraits circulaires préservés, masquage circulaire plutôt que rectangulaire, lien de crédit/licence maintenu. Toujours proposer un fallback de sphère et une description textuelle. |
| **Labels 3D** | Labels HTML projetés existants conservés ; racines, chemin et sélection prioritaires ; visibilité pilotée par le zoom et le budget écran ; collisions évitées ; focus clavier annoncé dans l’interface accessible. Un label n’est jamais l’unique moyen de sélection. |
| **Panneaux** | Surfaces nettes et opaques ou légèrement translucides, largeur de lecture maîtrisée, espacement généreux, une action primaire par étape. Mobile : panneau bas/plein écran avec retour facile à la scène, pas une colonne étroite sur la constellation. |
| **Navigation** | Barre réduite à Explorer et Relier ; Temps, Sources et limites comme outils contextuels ; Discovery dans un espace avancé. Navigation clavier et indication textuelle de l’état actif. |
| **Animations** | Révélation douce et caméra guidée uniquement après un résultat ; aucune animation décorative continue ne doit gêner la lecture. Préférences reduced-motion respectées et contrôle utilisateur disponible. |
| **Chargement** | Indiquer l’étape réelle (« identification », « consultation des relations », « références entrantes », « mise en place du graphe »), le progrès borné et les erreurs récupérables. Distinguer vide, inconnu, incomplet et échec. |
| **Mobile / accessibilité** | Cibles tactiles confortables, zoom sans dépendance au hover, focus visible, ordre clavier logique, textes agrandissables, annonces ARIA et liste relationnelle complète comme alternative au WebGL. Vérifier orientation, petit écran, lecteur d’écran, contraste et préférence de mouvement. |

## 7. Cinq priorités de développement recommandées

Échelle de coût : **M** moyen, **É** élevé, **TÉ** très élevé. Ordre recommandé, dépendances comprises.

| Rang | Évolution (pas de reconstruction) | Impact | Complexité | Risques | Coût | Dépendances |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | **Transformer le résultat Relier en explication pédagogique** : deux réseaux A/B, message d’absence prudent, résumé de couverture et état d’incomplétude visibles dans l’expérience principale. | Très élevé : répond immédiatement à « que regarde-je ? » et distingue RELIA des visualiseurs génériques. | M | Fausse impression de complétude ou de non-relation si les limites restent secondaires. | M | Réutilise recherche, état `discoverySearch`, graphe et limitations existants ; définir précisément les compteurs présentés. |
| **2** | **Rendre l’identification et le démarrage évidents** : recherche principale, confirmation des identités, ajouter une deuxième personne ; garder la démonstration explicitement fictive et secondaire. | Très élevé : baisse la friction et réduit les erreurs de personne. | M | Une identité choisie trop vite réintroduit les erreurs d’homonymie. | M | Recherche Wikidata et composants d’identité déjà présents ; tests de compréhension avec utilisateurs. |
| **3** | **Lisibilité de constellation multi-densité et mobile** : priorité aux deux racines/chemin, étiquettes selon zoom et collisions, focus/sélection tactile, panneau lisible. | Élevé : améliore l’usage réel sur grands graphes et appareils compacts. | É | Masquage de nœuds ou coût de rendu ; une implémentation naïve déplace trop les labels. | M/É | Labels DOM projetés, sélection et liste accessible existants ; mesures de performance et tests sur appareils réels. |
| **4** | **Réduire la navigation et ajouter clair/sombre** : Explorer/Relier comme objectifs, outils contextuels Temps/Sources, Discovery avancé ; thème clair accessible et sombre optionnel. | Élevé : compréhension immédiate et meilleure lisibilité sans abandon de l’identité. | M | Régression responsive et contrastes si les couleurs actuelles sont transposées directement. | M | HTML/CSS actuels et états de mode ; audit clavier, contraste et mobile. |
| **5** | **Faire du chemin une révélation sourcée et contrôlable** : caméra étape par étape, sources au point d’usage, pause et réduction de mouvement ; expliquer aussi la recherche incomplète. | Fort : rend l’usage mémorable tout en renforçant la confiance. | M | Le mouvement peut sur-vendre une assertion ; éviter toute animation d’un lien hypothétique. | M | Surlignage de chemin, étapes, fiches sources et transitions de caméra existants ; dépend de la priorité 1 pour le cadrage responsable. |

**Non prioritaire maintenant :** reconstruction complète, ingestion massive de données, recherche par nom BnF, graphe familial, carte géographique, collaboration sociale ou « IA » qui infère des relations. Ces chantiers augmenteraient coûts et risques avant d’avoir clarifié le cœur produit.

## 8. Architecture d’évolution incrémentale

1. **Maintenir les frontières actuelles.** Garder `data.js` responsable des règles d’éligibilité, des adaptateurs réseau et des limites ; `graph.js` responsable de la scène ; `app.js` orchestrateur ; `discovery.js` moteur de snapshots ; `bnf.js` enrichissement isolé. Éviter que le rendu redéfinisse ce qu’est une preuve.
2. **Rendre la portée une donnée de premier rang.** Attacher à toute recherche un résumé stable : racines exactes, source, propriétés/période, entités et assertions considérées, profondeur, expansions, requêtes, caps, erreurs et statut complet/partiel. La couche UI consomme ce résumé sans recalculer une conclusion.
3. **Ajouter une présentation relationnelle au-dessus du graphe actuel.** Modèle visuel A/B/commun/chemin calculé depuis les racines et les arêtes présentes ; les mêmes arêtes et objets de provenance continuent d’alimenter les vues Sources et accessible. Aucune nouvelle relation dérivée du voisinage, du nom ou de la géographie.
4. **Traiter la scène comme une vue, pas comme la seule interface.** Le graphe Three.js reste central ; recherche, légendes, résultats et liste sont du DOM accessible. L’algorithme de labels doit tenir compte du viewport/zoom et se désactiver proprement si WebGL est indisponible.
5. **Ajouter les sources seulement selon un protocole.** Chaque connecteur doit préciser accès autorisé, licence, identifiants exacts, attribution par assertion, règles d’alignement, délais/erreurs, cache, limites et tests sur données réelles vérifiées. Faire d’abord valider BnF en production avant tout rôle autre que contexte d’identité.
6. **Garder Discovery avancé et explicite.** Une source nouvelle ne devient comparable qu’avec paramètres identiques, provenance attribuée, collecte documentée et baseline complète. Une empreinte de fichier n’équivaut pas à une signature ni à une revue humaine.
7. **Mesurer avant d’élargir.** Suivre succès/abandon de recherche, ambiguïtés, temps jusqu’au premier lien compris, part de résultats incomplets, erreurs d’API et performance sur appareils. Ne pas journaliser d’identités personnelles au-delà de ce qui est nécessaire ; expliciter les appels publics aux fournisseurs.

## 9. Première intervention concrète proposée et réponse finale

### Première intervention

**Reconcevoir l’écran de résultat « Relier » sans toucher au moteur de collecte :** nommer visuellement A et B, colorer leurs réseaux avec douceur, faire ressortir les nœuds communs et les chemins trouvés, et afficher le même bloc d’explication pour les résultats positifs, négatifs et incomplets. Le bloc expose la taille réelle du graphe consulté et ses plafonds ; chaque affirmation reste liée à son assertion Wikidata et à sa référence déclarée. Cette intervention réutilise directement les racines, arêtes, chemin, périodes, états partiels et limites déjà présents dans le code. Elle ne prétend pas élargir Wikidata, ne nécessite pas une reconstruction et peut être testée avant toute autre innovation.

Le critère de réussite n’est pas « le graphe a l’air impressionnant » : après une courte exploration, une personne novice doit pouvoir dire **qui sont A et B, ce que RELIA a consulté, pourquoi un chemin est montré ou non, et ce que ce résultat ne permet pas de conclure**.

### Question finale — la transformation indispensable

Si RELIA devait servir des millions de personnes, sa première transformation indispensable serait de **rendre chaque résultat intelligible et honnête en un seul regard**. L’application sait déjà rechercher deux identités, développer des voisinages sourcés, tenter un chemin borné et préserver les limites de cette recherche. Ce qui manque n’est pas une nouvelle source ou un autre mode : c’est une mise en scène publique qui transforme ces capacités techniques en réponse compréhensible — deux personnes, leurs réseaux, le chemin sourcé s’il est trouvé, ou la limite précise de ce qui a été exploré s’il ne l’est pas. C’est la condition pour que la constellation devienne utile avant d’être spectaculaire, et mémorable sans faire croire à une certitude qu’elle ne possède pas.

**RELIA — Tout est relié. Ce que RELIA montre doit aussi dire ce qui est réellement documenté.**
