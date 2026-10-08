# RELIA Innovation Lab

## Audit du moteur et pistes d’exploration

**Dépôt audité :** code de RELIA dans `/home/runner/work/RELIA/RELIA`  
**Date :** 8 octobre 2026  
**Périmètre :** audit statique du dépôt et de ses tests. Aucune modification de l’application, requête sur les données de production, validation du site déployé ni vérification en direct de la disponibilité des services externes n’a été effectuée.

> **RELIA — Tout est relié.** Une connexion affichée doit toujours montrer ce qui la soutient et ce que les données ne permettent pas de conclure.

## Synthèse

RELIA possède déjà un vrai moteur d’exploration de graphe, pas seulement une scène 3D : il recherche des identités Wikidata, collecte certains liens entrants et sortants, conserve les références et quelques qualificatifs temporels, puis cherche un chemin admissible entre deux personnes. Il limite explicitement la taille et la profondeur de la recherche, distingue une assertion référencée d’une hypothèse, et sait exposer ces limites.

Cette base peut alimenter des expériences plus riches sans reconstruire l’application : raconter un chemin étape par étape, explorer les trajectoires de carrière, suivre les rôles autour d’une œuvre ou d’un événement, et filtrer une constellation par période. En revanche, « l’histoire locale », la généalogie, les origines vérifiées d’une invention, les cartes historiques ou la découverte de connexions entre corpus exigent des données et des règles de rapprochement qui n’existent pas encore.

**Aucune proximité dans le graphe ne prouve à elle seule une influence, une rencontre, une causalité ou une collaboration.** Une référence associée à une assertion Wikidata indique sa provenance déclarée ; RELIA ne consulte pas automatiquement le document externe pour vérifier le fait.

### Direction visuelle

Le HTML initialise actuellement l’interface en clair (`data-theme="light"`) et le CSS comporte une direction claire substantielle. Il existe néanmoins un bouton de bascule, des styles sombres et des palettes 3D dépendantes du thème (`/home/runner/work/RELIA/RELIA/index.html:10,15`, `/home/runner/work/RELIA/RELIA/src/styles.css:18-20`, `/home/runner/work/RELIA/RELIA/src/app.js:643-650`, `/home/runner/work/RELIA/RELIA/src/graph.js:5-7,249`). La décision produit proposée est de **conserver le clair comme direction unique et prioritaire**. Retirer le mode sombre pourrait simplifier l’interface, mais sa portée dépasse la suppression du bouton : le code de thème est aussi présent dans le rendu de la scène. Cette étude ne modifie rien.

## 1. Capacités réelles du moteur

Les statuts employés ci-dessous sont : **présent** dans le code actuel, **partiel** mais utilisable sous des limites identifiées, ou **à développer**.

### Entités et relations

La normalisation reconnaît cinq familles principales : **personnes, œuvres, lieux, institutions et événements** ; elle conserve également la catégorie `unknown` lorsque le type ne peut pas être déterminé. Le type peut venir d’une classe Wikidata connue ou être suggéré par les relations présentes. Cette suggestion est déjà signalée comme incertaine dans la fiche. Pour les personnes, le code récupère aussi des professions, des dates de naissance et de décès, un identifiant BnF porté par Wikidata, un sitelink Wikipédia et, lorsqu’il existe, une image P18 (`/home/runner/work/RELIA/RELIA/src/data.js:99-123`).

Les relations actuellement extraites sont une **liste fermée de propriétés Wikidata**, classées en création, parcours professionnel, influence, contexte géographique, édition et événement. Elle couvre notamment les rôles de création et d’interprétation d’œuvres, l’employeur, la formation, l’appartenance à une institution, les distinctions, l’influence déclarée, les lieux associés aux œuvres et institutions, ainsi que des liens entre personnes, événements et organisateurs (`/home/runner/work/RELIA/RELIA/src/data.js:2-14`).

Ce modèle est déjà assez hétérogène pour explorer des histoires culturelles et professionnelles, mais il ne constitue pas une ontologie générale des connaissances. La liste ne couvre pas, par exemple, les liens familiaux, les citations scientifiques, les brevets, les relations de mentorat ou une sémantique générique « idée transmise par ». Les liens géographiques P19, P20 et P131 sont conservés comme contexte, mais explicitement exclus des chemins admissibles (`/home/runner/work/RELIA/RELIA/src/data.js:15,142-166`).

### Recherche et chemins

| Capacité | État actuel | Portée et conséquences |
| --- | --- | --- |
| Recherche par nom | **Présente** | Interroge la recherche d’entités Wikidata en français, puis en anglais si aucun résultat français n’est renvoyé ; jusqu’à huit résultats, avec sélection explicite. C’est une recherche d’identités, pas une interprétation de question en langage naturel (`/home/runner/work/RELIA/RELIA/src/data.js:58-65`). |
| Recherche d’une personne | **Présente** | Le mode Relier impose deux choix explicites et vérifie le type humain Wikidata Q5. Il ne résout pas de lui-même les ambiguïtés entre homonymes (`/home/runner/work/RELIA/RELIA/src/app.js:83-100,459-463`). |
| Expansion du graphe | **Partielle** | Charge les relations sortantes et cherche des sujets entrants via SPARQL ; la collecte dépend des API, des limites et des données disponibles (`/home/runner/work/RELIA/RELIA/src/data.js:209-254`). |
| Chemin entre deux personnes | **Présent, borné** | Recherche en largeur depuis les deux extrémités, alternativement ; au plus 4 niveaux, 12 expansions, 40 requêtes, 100 entités et 180 relations. Le chemin retourné est le plus court trouvé dans le graphe effectivement consulté, non dans tout Wikidata (`/home/runner/work/RELIA/RELIA/src/data.js:1,256-290`). |
| Sens des relations | **Présent** | Les chemins peuvent parcourir une assertion dans les deux sens, tout en conservant le sens original de la déclaration et en l’affichant (`/home/runner/work/RELIA/RELIA/src/data.js:177-206`, `/home/runner/work/RELIA/RELIA/src/app.js:443-450`). |
| Autres algorithmes de graphe | **À développer** | Pas de recherche des k meilleurs chemins, d’ancêtres intellectuels communs, de score de pont, de centralité, de clustering, de chemin causal ni de parcours soumis à des contraintes de rôles. |
| Absence de chemin | **Présente, prudente** | L’interface peut dire qu’aucun chemin admissible n’a été trouvé et afficher les limites ; elle ne traite pas ce résultat comme une preuve d’absence réelle (`/home/runner/work/RELIA/RELIA/src/app.js:420-442,472-485`). |

### Preuves, sources et identifiants

Chaque arête conserve son identifiant d’assertion, sa propriété, son sens, son rang, ses qualificatifs, ses dates, ses références et la date de récupération. Les références exposent les URL P854 et les documents P248 ; les liens sûrs sont filtrés. Un chemin réel n’admet que les relations non fictives, non obsolètes et ayant au moins une référence exploitable P854/P248. Une relation sans référence reste consultable comme hypothèse, mais ne forme pas un chemin (`/home/runner/work/RELIA/RELIA/src/data.js:89-90,126-166`).

**Cela certifie la présence d’une référence dans Wikidata, pas la véracité du document.** Les URLs et documents sont affichés, mais leurs contenus ne sont pas récupérés pour vérification. Les données principales viennent de Wikidata ; un extrait Wikipédia est obtenu depuis le sitelink exact, sans nouvelle recherche par nom. Les portraits viennent de l’image P18 liée à l’entité et renvoient à Commons. Ces usages ne constituent pas un service général de recherche dans les archives (`/home/runner/work/RELIA/RELIA/src/data.js:73-87`, `/home/runner/work/RELIA/RELIA/src/app.js:292-311,356-381`).

Les identifiants Wikidata QID sont la clé canonique réellement utilisée. L’adaptateur BnF ne tente un rapprochement que par `owl:sameAs` entre un QID donné et une notice ; il ne cherche pas par nom et ne crée ni relation de graphe ni étape de chemin (`/home/runner/work/RELIA/RELIA/src/bnf.js:11-22,34-58,61-89`). L’extension Discovery sait représenter des identifiants externes déclarés fiables et réconcilier une identité uniquement si un identifiant exact est univoque des deux côtés. Le namespace BnF est expressément écarté tant que l’adaptateur n’est pas validé (`/home/runner/work/RELIA/RELIA/src/discovery.js:191-249`). Ces mécanismes sont une base de rapprochement, pas une réconciliation multisource générale déjà déployée.

### Temps et géographie

Les dates de relation sont extraites des qualificatifs de début P580, fin P582, date ponctuelle P585 et publication P577. Le filtre temporel porte sur P580/P582/P585 ; une assertion sans date peut être incluse ou exclue. Une date de publication ne devient pas la date d’une relation. Les années négatives sont prises en charge, avec un niveau de précision minimal (`/home/runner/work/RELIA/RELIA/src/data.js:92-97,149-152,168-175`).

Les dates de naissance et décès et les professions existent sur la fiche, mais ne deviennent pas automatiquement des dates de carrière ni des fenêtres d’activité. Il n’y a ni frise synchronisée ni raisonnement temporel sur les chevauchements.

Les lieux sont des entités possibles et quelques relations géographiques sont collectées. **Aucune position ni carte n’est actuellement calculée ou rendue.** Les lieux de naissance, décès et divisions administratives ne créent pas de chemin professionnel ou culturel. Une recherche locale nécessiterait coordonnées sourcées, géocodage, dates et prise en compte des frontières historiques, pas seulement une vue cartographique.

### Discovery et visualisation

Discovery produit, valide et compare des instantanés JSON. Les états conservent identités exactes, sources déclarées, paramètres, graphes, chemins, limites et statut de collecte. Le comparateur distingue entités, relations, preuves ajoutées, chemins, hypothèses, contradictions, rapprochements d’identités et cas incomparables. Les comparaisons exigent des racines et paramètres identiques ainsi qu’une nouvelle source ; un état de référence incomplet ne peut établir une nouveauté fiable (`/home/runner/work/RELIA/RELIA/src/discovery.js:85-128,131-169,201-209,254-397`).

La capture directe actuelle déclare Wikidata seule comme source ; deux captures directes de cette source ne constituent donc pas une comparaison multisource démonstrative (`/home/runner/work/RELIA/RELIA/src/app.js:523-549`). Discovery est un protocole d’analyse utile, mais il ne collecte pas lui-même un deuxième corpus. Son empreinte détecte les modifications accidentelles ; elle n’est pas une signature d’authenticité.

La scène Three.js place les entités et relations dans un espace 3D, utilise une simulation de forces, colore par type et par réseaux A/B, surligne une sélection ou un chemin, déplace la caméra et projette des labels HTML. Le nombre d’étiquettes visibles est limité et leur chevauchement est filtré ; les identités, nœuds sélectionnés et étapes du chemin sont prioritaires. Des portraits P18 sont possibles sous certaines limites d’appareil, de densité et de mouvement réduit. Une liste accessible de secours expose les entités et relations si WebGL est indisponible (`/home/runner/work/RELIA/RELIA/src/graph.js:8-31,33-109,133-180,190-242,256-275,312-375`, `/home/runner/work/RELIA/RELIA/src/app.js:76-80,410-418`).

La 3D est donc un **mode de présentation et de navigation**, pas un algorithme de connaissance : elle n’ajoute pas de faits et ne prouve pas qu’une proximité visuelle soit significative. La recherche, les sources, les résultats et les explications restent à présenter clairement en langage simple, notamment sans dépendre du WebGL ou du survol.

## 2. Limites structurantes et voies réalistes

| Limite constatée | Ce qu’elle empêche | Réponse réaliste |
| --- | --- | --- |
| Propriétés et catégories limitées à une liste fixe | Explorer librement les idées, citations, brevets, parentés, mentorats ou domaines absents. | Ajouter des familles de relations par domaine, chacune documentée, typée, testée et accompagnée d’une politique de preuve ; éviter l’expansion indiscriminée du graphe. |
| Collecte bornée, à la demande et dépendante d’API externes | Affirmer que le graphe est complet ou qu’un chemin est le meilleur à l’échelle mondiale. | Conserver les budgets, expliquer portée et incomplétude, et proposer des sources/campagnes de collecte précises plutôt qu’une promesse de couverture totale. |
| Références seulement déclarées | Confondre provenance et validation de la source primaire. | Distinguer explicitement assertion, référence citée, source consultée et fait vérifié ; ajouter, uniquement si autorisé, des connecteurs de documents avec attribution et vérification éditoriale. |
| Un identifiant canonique effectif par nœud et peu d’identifiants externes réconciliés | Fusionner des notices d’autorité d’archives, de bibliothèques ou de musées sans risque d’homonymie. | Connecteurs d’identité versionnés, identifiants exacts, provenance de l’alignement, unicité vérifiée et validation humaine des cas ambigus. |
| Métadonnées géographiques sans coordonnées/temps historiques | Faire de la cartographie locale une recherche fiable. | Gazetteers et fonds cartographiques dont accès/licence sont vérifiés, coordonnées sourcées, référentiel de lieux temporel et restitution de l’incertitude. |
| Dates de relation clairsemées | Reconstituer une carrière ou une chronologie complète à partir des seuls événements datés. | Vue temporelle affichant les dates inconnues et leur précision ; compléter seulement par corpus datés réutilisables, sans déduire une durée de carrière d’une naissance ou d’une publication. |
| Un seul plus court chemin dans un graphe exploré | Comparer des récits, alternatives ou robustesse d’une connexion. | Ajouter k-chemins ou recherche contrainte, avec critères explicités et limite visible ; ne pas appeler un chemin « influence » sans relation attestée de ce type. |
| Question libre non interprétée | Comprendre « d’où vient cette idée ? » sans obliger l’utilisateur à connaître les propriétés. | Commencer par un interpréteur déterministe et transparent qui propose un type de recherche et fait confirmer l’identité et les critères ; réserver les modèles IA éventuels à une aide facultative, jamais à la création de faits. |
| Famille et personnes vivantes hors périmètre | Répondre sans risque à « quelles sont les origines de ma famille ? ». | Traiter comme un produit séparé, fondé sur des sources légitimes et consenties, protections des personnes vivantes, règles de conservation et contrôle strict ; ne pas activer par simple ajout d’arêtes publiques. |

Les services exposés dans le code comprennent les API Wikimedia/Wikidata, les extraits Wikipédia et un endpoint SPARQL BnF expérimental. La présence d’une API publique n’accorde pas automatiquement tous les droits d’aspiration, de republication, de mise en cache ou de combinaison. Chaque nouvelle source doit faire l’objet d’une vérification propre de son accès, de ses conditions de réutilisation, de son attribution, de ses limites techniques et de la provenance au niveau de chaque assertion. Aucun accès d’archives ou de corpus tiers n’est présumé disponible ou librement réutilisable.

## 3. Vingt concepts de recherche et d’expérience

Les difficultés sont indicatives : **faible** = surtout présentation de capacités présentes ; **moyenne** = nouvel algorithme ou interface sur le graphe existant ; **élevée** = collecte, sources ou rapprochement nouveaux ; **très élevée** = données sensibles, gouvernance ou systèmes multiples. « Présent » signifie qu’une partie précise du concept existe, pas que l’expérience complète est livrée.

### A. Connexions et héritages d’idées

#### 1. Le fil documenté
- **Question :** « Comment ces deux personnes sont-elles reliées ? »
- **Expérience RELIA :** deux constellations A/B, une suite d’étapes explicitant chaque rôle et le lien vers sa provenance ; si rien n’est trouvé, afficher séparément ce qui a été exploré.
- **Données nécessaires :** deux identités QID, relations admissibles, dates éventuelles et références.
- **Déjà présent :** recherche de deux personnes, expansion bornée, plus court chemin, affichage des étapes, surlignage 3D, fiches de sources et état partiel.
- **Manquant :** mettre le récit, le périmètre et les limites au premier plan ; améliorer le choix parmi les chemins possibles.
- **Difficulté :** faible à moyenne.
- **Risque trompeur :** faire passer un chemin de relations documentées pour une rencontre, une collaboration directe ou une causalité.
- **Public :** grand public, élèves, enseignants, journalistes, curieux.

#### 2. Ancêtres intellectuels communs
- **Question :** « Quelles traditions, œuvres ou personnes sont en amont de ces deux artistes ? »
- **Expérience :** comparer deux lignées d’influence déclarée et mettre en évidence leurs intersections, en qualifiant clairement chaque lien.
- **Données nécessaires :** relations explicites d’influence, œuvres et dates ; idéalement sources d’histoire intellectuelle.
- **Déjà présent :** influence déclarée P737 est une relation reconnue ; deux réseaux et leurs intersections peuvent être calculés dans le graphe consulté.
- **Manquant :** calcul des ancêtres communs, direction du raisonnement, visualisation des branches et corpus plus cohérent.
- **Difficulté :** moyenne à élevée.
- **Risque trompeur :** « ancêtre » pourrait être compris comme parent biologique ; un lien d’influence déclaré ne prouve ni l’ampleur ni le mécanisme de transmission.
- **Public :** artistes, enseignants, historiens des idées, élèves.

#### 3. Carte des influences artistiques
- **Question :** « Qui cette personne dit-elle avoir influencé sa création ? »
- **Expérience :** partir d’une personne ou d’une œuvre, parcourir les liens d’influence déclarés, puis ouvrir les œuvres relais et références.
- **Données nécessaires :** déclarations d’influence, attributions d’œuvres, sources datées et idéalement citations textuelles consultables.
- **Déjà présent :** P737 et plusieurs rôles de création/œuvre ; chemin admissible possible.
- **Manquant :** vue dédiée séparant influence déclarée, contexte historique et interprétation ; dates et preuves mieux contextualisées.
- **Difficulté :** moyenne.
- **Risque trompeur :** transformer une influence déclarée par Wikidata en vérité historique ou en relation réciproque.
- **Public :** public culturel, artistes, médiateurs, étudiants.

#### 4. Transmission scientifique
- **Question :** « Par quels travaux et institutions une idée scientifique a-t-elle circulé ? »
- **Expérience :** parcourir les travaux, auteurs, laboratoires, institutions et événements en montrant la nature exacte des passerelles.
- **Données nécessaires :** articles, citations, auteurs, affiliations, institutions, dates, archives et identifiants de publications.
- **Déjà présent :** personnes, institutions, œuvres/publications, formation, employeur et appartenance.
- **Manquant :** relations de citation scientifique et corpus d’articles avec identifiants réconciliés et provenance.
- **Difficulté :** élevée.
- **Risque trompeur :** affiliation commune ou proximité de travaux n’établit pas une transmission, un échange direct ni une priorité scientifique.
- **Public :** élèves, enseignants de sciences, chercheurs, médiateurs.

#### 5. Origines documentées d’une invention
- **Question :** « Qui a contribué à cette invention, et quand ? »
- **Expérience :** distinguer les personnes, institutions, prototypes, brevets et jalons connus dans une frise sourcée, en laissant visibles les désaccords.
- **Données nécessaires :** brevets et dossiers d’archives accessibles, identifiants d’invention, dates, rôles et documents primaires réutilisables.
- **Déjà présent :** graphe de personnes/œuvres/institutions/événements et filtres de dates de relation.
- **Manquant :** modèle inventions/brevets/prototypes, données de priorité, jalons historiques et traitement des revendications concurrentes.
- **Difficulté :** élevée.
- **Risque trompeur :** attribuer une invention complexe à une seule personne ou confondre date de brevet et origine de l’idée.
- **Public :** élèves, enseignants, musées, curieux de sciences et techniques.

#### 6. Le pont inattendu
- **Question :** « Quel intermédiaire relie ces deux univers culturels ? »
- **Expérience :** révéler les œuvres ou institutions communes, puis proposer plusieurs chemins alternatifs avec les règles utilisées.
- **Données nécessaires :** graphe suffisamment dense, références, rôles typés et sélection de deux ensembles ou domaines.
- **Déjà présent :** expansion bornée, voisinages A/B et intersections calculables ; un chemin court est visible.
- **Manquant :** k-chemins, mesure de centralité/communauté, choix de ponts qui expliquent une connexion sans en exagérer la portée.
- **Difficulté :** moyenne.
- **Risque trompeur :** un nœud central dans un échantillon limité n’est pas nécessairement un passeur historique ni un pont influent.
- **Public :** grand public, chercheurs, enseignants, journalistes.

### B. Personnes, métiers, œuvres et événements

#### 7. Trajectoire professionnelle
- **Question :** « Où cette personne a-t-elle étudié et travaillé ? »
- **Expérience :** une frise en langage simple reliant formation, employeurs, organisations, distinctions et œuvres, avec étapes datées et inconnues séparées.
- **Données nécessaires :** propriétés de carrière, dates de relation, données biographiques fiables.
- **Déjà présent :** P69, P108, P463, P166, professions, chronologie locale d’arêtes datées et filtre temporel.
- **Manquant :** frise unifiée, qualificatifs de rôle/durée et affichage honnête des trous chronologiques.
- **Difficulté :** moyenne.
- **Risque trompeur :** classer les étapes ou déduire emploi continu, promotion ou causalité à partir d’affiliations non datées.
- **Public :** enfants, enseignants, personnes curieuses d’un métier, biographes.

#### 8. Collaborations à travers les générations
- **Question :** « Quels artistes de générations différentes ont contribué à la même œuvre ou au même événement ? »
- **Expérience :** constellation bipartite personnes–œuvres/événements, datation quand elle est disponible, parcours guidé de rôle en rôle.
- **Données nécessaires :** rôles dans les œuvres et événements, dates de contribution, biographies.
- **Déjà présent :** plusieurs rôles de création et de participation, entités événements/œuvres et filtre temporel.
- **Manquant :** requêtes multi-personnes, agrégation par génération et représentation séparant contribution d’une collaboration directe.
- **Difficulté :** moyenne.
- **Risque trompeur :** participer au même événement ou figurer dans la même œuvre ne prouve pas une collaboration effective entre ces personnes.
- **Public :** public culturel, enseignants, chercheurs en arts et médias.

#### 9. Autour d’une œuvre
- **Question :** « Qui a fait cette œuvre, qui l’a publiée ou interprétée, et dans quels événements apparaît-elle ? »
- **Expérience :** faire de l’œuvre le centre ; déplier séparément création, interprétation, réalisation, édition et événements associés.
- **Données nécessaires :** métadonnées d’œuvre, rôles explicites, éditions/versions et événements liés.
- **Déjà présent :** plusieurs relations P50/P57/P86/P161/P170/P175/P123 et entités de type œuvre.
- **Manquant :** parcours d’une œuvre, séparation des versions et relation explicite œuvre–événement quand elle manque.
- **Difficulté :** moyenne.
- **Risque trompeur :** fusionner des œuvres homonymes ou traiter toutes les contributions comme équivalentes.
- **Public :** grand public, bibliothécaires, artistes, enseignants.

#### 10. Qui était dans la salle ?
- **Question :** « Quelles personnalités ont participé au même festival ou événement ? »
- **Expérience :** partir d’un événement, montrer les participants déclarés, les organisateurs et les œuvres associées comme groupes distincts.
- **Données nécessaires :** participants, organisateurs, lieux, dates et programmes d’événement.
- **Déjà présent :** P1344 participation à, P664 organisation, événements significatifs et liens temporalisés.
- **Manquant :** recherche événement-centrique, gestion du lieu/date et idéalement programmes historiques documentés.
- **Difficulté :** moyenne.
- **Risque trompeur :** confondre participant et spectateur, ou déduire qu’une personne était présente à une session précise.
- **Public :** public local, organisateurs culturels, enseignants, historiens.

#### 11. Réseau de mentorat attesté
- **Question :** « Qui a enseigné à cette personne ou l’a accompagnée ? »
- **Expérience :** distinguer enseignement institutionnel, mentorat documenté et simple appartenance commune ; ouvrir les sources de chaque lien.
- **Données nécessaires :** relations de mentorat/enseignement, archives, biographies attribuées.
- **Déjà présent :** formation P69 et influence P737, mais pas de relation générale de mentorat dans le modèle courant.
- **Manquant :** propriétés adaptées, sources primaires et distinctions sémantiques explicites.
- **Difficulté :** élevée.
- **Risque trompeur :** déduire une relation de mentor à partir de la même école, du même employeur ou d’une influence.
- **Public :** enseignants, élèves, artistes, chercheurs.

### C. Lieux, temps et histoire locale

#### 12. Capsule d’histoire locale
- **Question :** « Que s’est-il passé à Marseille à cette période ? »
- **Expérience :** une vue claire par période qui rassemble personnes, œuvres, institutions et événements associés à la ville, avec cartes éventuellement ajoutées plus tard.
- **Données nécessaires :** événements géolocalisés, lieux normalisés, dates, frontières et sources d’histoire locale.
- **Déjà présent :** lieux, événements, relations géographiques de contexte, filtre temporel.
- **Manquant :** recherche par lieu/zone, coordonnées, relations événement–lieu plus complètes, chronologie locale et sources adaptées.
- **Difficulté :** élevée.
- **Risque trompeur :** les données Wikidata ne sont pas un inventaire exhaustif ; lieu de naissance ne signifie pas activité ou présence historique.
- **Public :** habitants, écoles, bibliothèques, musées, touristes curieux.

#### 13. Villes et personnalités, dans leur époque
- **Question :** « Quelles personnalités ont été associées à cette ville lorsqu’elle avait ce nom ou ces frontières ? »
- **Expérience :** superposer des associations personne–lieu à une carte et une ligne du temps ; signaler les lieux identifiés avec incertitude.
- **Données nécessaires :** géométries, noms alternatifs, frontières datées, périodes de résidence/activité et sources.
- **Déjà présent :** types place/person, P19/P20/P131 conservés comme contexte, filtre temporel des arêtes.
- **Manquant :** relation de résidence/activité explicite, données géographiques et gestion des changements de noms et frontières.
- **Difficulté :** élevée.
- **Risque trompeur :** anachronisme des frontières et confusion entre naissance, résidence, passage et appartenance.
- **Public :** historiens, enseignants, collectivités, public local.

#### 14. Une œuvre, un lieu, un événement
- **Question :** « Quelles œuvres sont liées à cet événement et à cette ville ? »
- **Expérience :** un parcours événement–lieu–œuvres avec chaque type de lien nommé, sans transformer une proximité de dates en relation.
- **Données nécessaires :** œuvres présentées/créées à des événements, lieux, programmes et dates.
- **Déjà présent :** événement, œuvre, lieu, organisation et participation ; dates ponctuelles possibles.
- **Manquant :** relations explicites œuvre–événement et événement–lieu, recherche combinée et sources de programme.
- **Difficulté :** élevée.
- **Risque trompeur :** une œuvre produite la même année ou par un participant n’est pas nécessairement liée à l’événement.
- **Public :** musées, festivals, enseignants, historiens de la culture.

#### 15. Carte des déplacements attestés
- **Question :** « Quels lieux sont explicitement documentés dans le parcours de cette personne ? »
- **Expérience :** carte ou globe chronologique où chaque étape précise la nature du lien et la date ou l’absence de date.
- **Données nécessaires :** géolocalisation sourcée, résidence/activité/voyage qualifiés, intervalle de dates et licence cartographique.
- **Déjà présent :** lieux et dates relationnelles ponctuelles ; affichage 3D réutilisable comme représentation spatiale mais sans géométrie géographique.
- **Manquant :** connecteur de géocodage autorisé, modèle d’étape de lieu, carte 2D/3D et incertitudes géographiques.
- **Difficulté :** élevée.
- **Risque trompeur :** confondre lieu de naissance ou d’emploi avec un itinéraire, ou interpolation avec déplacement réel.
- **Public :** enfants, enseignants, biographes, musées.

### D. Sources, comparaison et nouvelles manières de questionner

#### 16. Ce que deux sources racontent différemment
- **Question :** « Cette relation apparaît-elle dans plusieurs sources indépendantes ? »
- **Expérience :** comparer deux états documentaires en séparant nouvelle relation, référence ajoutée, contradiction et cas non comparable.
- **Données nécessaires :** plusieurs corpus autorisés, identifiants, dates d’acquisition, attribution de chaque assertion et paramètres comparables.
- **Déjà présent :** schéma Discovery, rapprochement par identifiant fiable, catégories de comparaison et garde-fous contre les nouveautés non attribuées.
- **Manquant :** second connecteur de relations validé et captures réelles de même périmètre. BnF ne fournit actuellement que du contexte d’identité expérimental.
- **Difficulté :** élevée.
- **Risque trompeur :** présenter une différence de couverture, une mise à jour de Wikidata ou un doublon comme une découverte ou une contradiction historique.
- **Public :** chercheurs, bibliothécaires, conservateurs, journalistes.

#### 17. Remonter à la source d’une assertion
- **Question :** « Pourquoi RELIA montre-t-elle ce lien ? »
- **Expérience :** cliquer sur une relation pour distinguer l’affirmation, le document référencé, l’URL, la date de récupération et ce qui n’a pas été vérifié.
- **Données nécessaires :** références P854/P248, références documentaires résolubles et, éventuellement, copies/extraits autorisés.
- **Déjà présent :** affichage de propriété, rang, dates, références et qualificatifs ; les références sont associées aux arêtes.
- **Manquant :** vérifier l’accès et la nature des documents, dédoublonner les sources réellement indépendantes, marquer explicitement les étapes de contrôle.
- **Difficulté :** moyenne pour l’interface ; élevée pour la vérification de documents.
- **Risque trompeur :** confondre URL présente, source indépendante et preuve confirmée.
- **Public :** tous publics, enseignants, chercheurs, journalistes.

#### 18. Plusieurs réponses possibles
- **Question :** « Quelles sont les différentes manières de relier ces deux personnes ? »
- **Expérience :** comparer un chemin court par œuvre, un autre par institution, et afficher pourquoi chaque choix est classé sans masquer les chemins écartés.
- **Données nécessaires :** graphe plus complet, relations typées, dates, preuves et critères de sélection.
- **Déjà présent :** plus court chemin en largeur et filtres de période.
- **Manquant :** k-chemins, contraintes de domaine, pondération documentée et plafonnement contrôlé.
- **Difficulté :** moyenne.
- **Risque trompeur :** pondération subjective ou couverture inégale donnant l’illusion qu’un chemin est historiquement plus important.
- **Public :** curieux, élèves, enseignants, chercheurs.

#### 19. Question guidée en langage naturel
- **Question :** « D’où vient cette idée ? » ou « Que s’est-il passé dans cette ville ? »
- **Expérience :** la barre reformule la demande en une intention compréhensible — trouver une personne, remonter une influence, explorer une ville ou filtrer une période — puis demande de confirmer les identités et montre les sources choisies.
- **Données nécessaires :** dictionnaire de types de questions, entités, règles de requête et sources compatibles avec chaque intention.
- **Déjà présent :** recherche par nom, filtres temporels et recherche entre deux personnes.
- **Manquant :** interpréteur d’intention, désambiguïsation en conversation courte, recherche géographique/événementielle et plan de requête visible.
- **Difficulté :** moyenne sans modèle payant pour les intentions prises en charge ; élevée pour une couverture libre.
- **Risque trompeur :** une question ambigüe peut produire une requête erronée ; ne jamais laisser le système inventer un lien manquant.
- **Public :** enfants, grand public, personnes peu familières des graphes.

#### 20. Ma famille, mes origines
- **Question :** « Quelles sont les origines de ma famille ? »
- **Expérience :** à terme, arbre personnel documenté où chaque personne contrôle les données et associe des pièces d’archives aux liens.
- **Données nécessaires :** registres d’état civil et archives accessibles selon juridiction, actes familiaux fournis avec consentement, identifiants locaux protégés.
- **Déjà présent :** aucun modèle ou chemin familial destiné à cette recherche ; les relations familiales/intimes sont hors du domaine courant.
- **Manquant :** produit distinct, règles d’accès/consentement, protection des personnes vivantes, gestion des données sensibles, sources juridiquement accessibles et provenance de chaque lien.
- **Difficulté :** très élevée.
- **Risque trompeur :** erreur d’identité, révélation d’information sensible, atteinte à la vie privée ou transformation d’une hypothèse en filiation.
- **Public :** familles, généalogistes et archivistes, dans un cadre séparé et protégé.

## 4. Exemples de recherches concrètes

Ces exemples illustrent des requêtes possibles, pas des résultats actuellement garantis :

- **Par nom :** « Quelles œuvres relient Agnès Varda et une personne que j’ai choisie ? » — choisir les deux identités exactes, puis suivre uniquement les arêtes admissibles.
- **Par lieu et période :** « Quels événements culturels liés à Lyon sont documentés entre 1920 et 1940 ? » — nécessite recherche locale, dates, liens événement–lieu et un corpus adapté.
- **Par œuvre :** « Qui a écrit, interprété ou édité cette œuvre ? » — réutilise des relations déjà présentes, mais les rôles et versions doivent rester distincts.
- **Par influence :** « Quelles influences déclarées relient ces deux courants artistiques ? » — P737 peut amorcer un parcours ; « influence » doit rester l’intitulé de la déclaration, pas une inférence libre.
- **Par profession :** « Où cette personne a-t-elle étudié puis travaillé ? » — exploite des relations de carrière existantes, mais la chronologie ne sera complète que si les dates sont documentées.
- **Par événement :** « Quelles œuvres sont explicitement reliées à cette exposition ? » — exige un lien œuvre–événement, pas simplement des participants communs.
- **Par source :** « Plusieurs documents indépendants soutiennent-ils cette affirmation ? » — nécessite provenance explicite par source et validation que les sources sont réellement indépendantes.
- **En langage naturel :** « Pourquoi RELIA rapproche ces deux personnes ? » — la réponse doit exposer le chemin trouvé, les étapes, les sources et les limites de couverture.

## 5. Faisabilité et sources

| Famille de données | Situation actuelle | Usage possible | Conditions avant intégration |
| --- | --- | --- | --- |
| Wikidata | Source centrale, API de recherche/entités et SPARQL entrant utilisés par le code. | Entités, propriétés déjà supportées, qualificatifs et références déclarées. | Respecter les politiques du service, la provenance et les quotas ; mesurer la couverture réelle par domaine. |
| Wikipédia | Extrait d’introduction depuis le sitelink exact de l’entité. | Contexte de lecture, pas source de graphe/validation. | Maintenir attribution, lien exact et indication qu’aucune vérification automatique n’est faite. |
| Wikimedia Commons | Image P18 liée et page de fichier associée. | Portrait ou illustration avec consultation de la page source. | Respecter la licence propre à chaque fichier ; ne pas assimiler association P18 et droits universels de réutilisation. |
| data.bnf.fr | Adaptateur SPARQL expérimental ; rapprochement explicite par `owl:sameAs`, libellés seulement. | Enrichissement d’identité et piste de notice d’autorité. | Valider en direct l’endpoint, le schéma, CORS, les alignements et les conditions de réutilisation avant d’élargir ce rôle. |
| Catalogues de bibliothèques et d’autorité | Non connectés comme fournisseurs de relations à ce jour. | Rapprocher auteurs, éditions, œuvres et notices. | Vérifier accès, licence, stabilité des identifiants et règles d’alignement ; ne pas faire de fusion par libellé. |
| Archives, journaux, programmes et documents historiques | Aucun connecteur générique de consultation/ingestion n’est présent. | Contextualiser événements, histoire locale, carrières et inventions. | Étudier les droits, restrictions d’accès, conditions d’extraction et métadonnées de citation pour chaque collection. |
| Référentiels géographiques et cartes | Pas de géocodage ni couche cartographique actuelle. | Recherches de proximité et lieux historiques. | Licences et attribution des fonds, qualité des coordonnées, géographies historiques et incertitude de localisation. |
| Publications scientifiques et brevets | Pas de connecteur de citations ou de brevets. | Transmission scientifique, origine d’invention et provenance technique. | Identifier les jeux de données réutilisables, identifier auteurs/versions, dater les documents et traiter les conflits de priorité. |

Le coût le plus faible consiste à mieux présenter ce que le moteur possède déjà. Le coût et le risque augmentent fortement lorsque l’innovation implique un nouveau domaine documentaire, un rapprochement d’identités ou un fait spatial/causal. Discovery ne remplace pas ces connecteurs : il peut comparer leurs sorties si celles-ci sont réelles, autorisées, attribuées assertion par assertion et de paramètres comparables.

## 6. Les cinq innovations prioritaires

Évaluation qualitative — **fort / moyen / faible** — des critères demandés ; difficulté et coût sont relatifs, sans estimation de durée.

| Rang | Innovation | Originalité | Utilité | Faisabilité | Pédagogie | Moteur actuel | Coût raisonnable | Fiabilité documentaire |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Le fil documenté, expliqué à chaque étape** | Forte dans la combinaison récit + transparence | Forte | Forte | Très forte | Très forte | Faible à moyen | Forte si les limites des références restent visibles |
| 2 | **Parcours professionnel dans le temps** | Moyenne à forte | Forte | Forte | Très forte | Forte | Moyen | Moyenne, dépend de la présence de dates et des catégories |
| 3 | **Histoire d’une œuvre par ses rôles** | Forte comme exploration centrée sur l’œuvre | Forte | Forte | Forte | Forte | Moyen | Moyenne à forte, si versions et rôles restent séparés |
| 4 | **Collaborations entre générations** | Forte | Forte | Moyenne à forte | Très forte | Forte | Moyen | Moyenne, doit distinguer co-présence et collaboration |
| 5 | **Ancêtres intellectuels communs** | Forte | Forte | Moyenne | Forte | Moyenne à forte | Moyen | Moyenne, dépend de liens d’influence explicitement documentés |

### Pourquoi ces cinq

1. **Le fil documenté** transforme la capacité la plus différenciante déjà en place — relier deux identités — en expérience compréhensible. Il n’exige pas que RELIA prétende connaître tout Wikidata ; son innovation est de montrer la provenance étape par étape et de raconter aussi un résultat incomplet ou négatif.
2. **La trajectoire professionnelle** combine plusieurs propriétés déjà supportées et le temps. Elle répond à une question de la vie quotidienne sans nouveau fournisseur obligatoire ; la frise doit afficher les dates inconnues plutôt que combler les trous.
3. **L’histoire d’une œuvre** exploite le modèle de relations artistiques existant et change réellement le point de vue de la recherche : l’œuvre, et non la personne, devient l’entrée.
4. **Les collaborations intergénérationnelles** donnent un usage pédagogique distinct, en reliant générations, œuvres et événements. La présentation doit parler de contributions conjointes déclarées, jamais inférer que les personnes se sont rencontrées.
5. **Les ancêtres intellectuels communs** exploite un lien d’influence explicite et la comparaison de réseaux, avec une question intuitive. Le sens biologique du terme doit être désambiguïsé ; il s’agit exclusivement d’héritages intellectuels/culturels.

### Démonstration rapide avec les données actuellement disponibles

**« Le fil documenté »** est la démonstration la plus rapide et la plus sûre : sélectionner deux personnes réelles dans la recherche, lancer la recherche de chemin déjà implémentée, puis présenter chaque relation et sa référence déclarée. Quand aucun chemin admissible n’est trouvé, afficher le périmètre effectivement parcouru, ses plafonds et l’avertissement que cela ne prouve pas l’absence d’un lien réel.

Une démonstration contrôlée peut aussi utiliser la démo fictive actuelle, mais elle doit être étiquetée fictive à chaque étape et ne servir en aucun cas d’exemple historique. La couverture des identités et relations réelles varie ; le choix de deux noms ne garantit pas qu’un chemin soit trouvé.

## 7. Architecture réaliste d’une recherche universelle

Une barre unique peut guider vers plusieurs sortes de recherches sans supposer l’entraînement ou l’achat immédiat d’un modèle IA. Elle doit être un **routeur d’intention transparent**, pas un générateur de faits.

1. **Entrée en langage courant.** Accepter un nom, une question, un lieu, une date, une œuvre ou une combinaison. Exemples d’amorces : « Qui est… ? », « Comment relier… ? », « Que s’est-il passé à… ? », « D’où vient cette idée ? »
2. **Interprétation déterministe des intentions prises en charge.** D’abord couvrir un petit ensemble testable : recherche d’entité, chemin entre personnes, réseau d’une œuvre, filtre de dates et requête événement/lieu lorsqu’une source compatible existe. Repérer les noms et dates connus, demander une précision lorsqu’il y a plusieurs identités possibles.
3. **Plan compréhensible avant collecte.** Reformuler : « Je vais comparer ces deux identités dans les relations de création et d’influence documentées, entre ces années, depuis Wikidata. » Montrer les sources et la portée prévues ; demander confirmation des personnes si le nom est ambigu.
4. **Plan structuré et validé.** Convertir la demande en intention, identifiants confirmés, propriétés permises, période, sources et budget. Le moteur actuel sait déjà contrôler QID, période, types et limites ; un orchestrateur pourrait distribuer la requête aux adaptateurs au lieu de mêler interprétation, collecte et rendu.
5. **Adaptateurs isolés.** Conserver Wikidata comme connecteur actuel ; traiter Wikipédia, Commons et BnF selon leur rôle réel actuel ; ajouter d’autres catalogues uniquement après examen d’accès, de licence, de provenance et d’identifiants.
6. **Graphe de preuves, pas de génération de faits.** Chaque assertion récupérée garde source, identifiant, orientation, dates, qualificatifs, référence et statut. Les résultats de raisonnement — chemin, intersection, chronologie ou différence Discovery — sont des analyses dérivées et doivent être distingués des assertions sources.
7. **Résultat accessible et adapté à l’intention.** Utiliser une vue de chemin, une frise, une fiche d’œuvre ou une carte seulement quand les données le permettent. Garder la 3D comme exploration complémentaire, avec une liste/explication accessible et une direction lumineuse cohérente.
8. **IA facultative plus tard.** Un modèle peut aider à reformuler la requête ou suggérer une intention, avec information de l’utilisateur, mais ses propositions sont transformées en plan vérifiable puis confirmées. Il ne crée jamais d’arête et ne traite jamais une hypothèse linguistique comme preuve. Une couche remplaçable évite un fournisseur payant imposé.

Les états à présenter au public devraient distinguer simplement **« source consultée »**, **« lien référencé dans les données »**, **« document non vérifié par RELIA »**, **« date inconnue »**, **« résultat partiel »** et **« aucun chemin trouvé dans les données explorées »**. Les mots techniques, identifiants et qualificatifs complets peuvent rester disponibles dans un niveau de détail.

## 8. Vision UX pédagogique et lumineuse

- **Une invitation simple, pas un formulaire technique.** Commencer par « Que voulez-vous découvrir ? » et suggérer des questions concrètes ; ne pas présenter les domaines de graphe ou les identifiants comme prérequis.
- **Confirmer les personnes, lieux et œuvres.** Proposer des résultats avec une description courte ; demander « Est-ce bien cette personne ? » avant de lancer un récit quand il y a plusieurs possibilités.
- **Expliquer l’action avant l’exploration.** Dire en termes enfantins mais exacts : « Je cherche des liens indiqués dans les sources que j’ai consultées. Je ne peux pas vérifier automatiquement tous les documents. »
- **Raconter en étapes.** Une relation par étape, une phrase simple sur son rôle, une date quand elle est réellement disponible et un accès à la source déclarée. Les enfants voient une explication courte ; les détails peuvent être ouverts par un adulte, un enseignant ou un chercheur.
- **Rendre l’incertitude concrète.** Une date absente reste « inconnue » ; un graphe incomplet est annoncé ; « rien trouvé » n’est jamais traduit en « aucun lien n’existe ».
- **Garder les options avancées progressives.** Les périodes, filtres de type de relation et paramètres Discovery apparaissent au besoin, pas en vocabulaire imposé au premier écran.
- **Utiliser la 3D comme aide visuelle.** Les racines et le chemin sont évidents, les étiquettes ne se chevauchent pas, le mouvement est contrôlable et la liste relationnelle fournit la même information.
- **Préserver la simplicité lumineuse.** Fond clair, contraste lisible, espaces calmes, accent RELIA propre ; aucune imitation d’identité visuelle d’un moteur de recherche connu. L’audit ne recommande pas de maintenir le sombre comme priorité.

## 9. Première expérience recommandée

### Relier, puis montrer pourquoi

La première expérience à prototyper est **un récit court et sourcé du chemin entre deux personnes**, avec une présentation également soignée du résultat sans chemin.

1. L’utilisateur écrit le premier nom et confirme l’identité ; il ajoute un deuxième nom avec la même étape de confirmation.
2. RELIA annonce qu’elle consulte le graphe et les types de liens retenus, puis affiche le statut de recherche réel.
3. Si un chemin est trouvé, la constellation met en évidence une étape à la fois ; chaque étape nomme la relation et ouvre ses références déclarées.
4. Une carte de portée indique les racines exactes, le nombre de relations consultées, les plafonds rencontrés et les erreurs/sources manquantes.
5. Si aucun chemin n’est trouvé, RELIA affiche : **« Aucun chemin documenté n’a été trouvé dans les données explorées. Cela ne prouve pas l’absence d’une relation réelle. »** Les ensembles A et B restent visuellement séparés.
6. L’utilisateur peut ouvrir une liste équivalente, consulter les preuves et les incertitudes sans dépendre de la 3D.

Cette expérience réutilise les identités, propriétés, dates, filtres, arêtes, références, états de collecte et transitions de caméra existants. Sa nouveauté tient à une combinaison pédagogique où le graphe explique autant sa réponse que ses limites — non à une technologie prétendument inédite. Elle ne demande ni nouvelle source, ni modèle IA payant, ni reconstruction.

## 10. Conclusion

RELIA n’a pas besoin de commencer par être « universelle » au sens de couvrir tous les sujets. Une recherche universelle crédible peut d’abord être universelle dans sa **façon de guider** : accueillir une question naturelle, déterminer le type de réponse qu’elle peut produire, confirmer les identités, choisir les sources déclarées, montrer le graphe réellement parcouru et donner à chaque conclusion sa provenance et son niveau d’incertitude.

Les idées à plus fort potentiel — famille, histoire locale, origine d’invention, diffusion scientifique ou archives multisources — sont crédibles à terme, mais demandent des sources, des identifiants et des politiques qui ne sont pas présents aujourd’hui. Leur réalisme dépendra moins d’une animation ou d’un modèle génératif que d’une collecte autorisée, de données adaptées, de réconciliations auditables et d’une présentation qui n’assimile jamais hypothèse et preuve.

### Réponse finale

**Si RELIA devait inventer une nouvelle manière d’explorer les connaissances humaines, la fonctionnalité la plus remarquable et réalisable avec son architecture actuelle serait le “fil documenté” : relier deux personnes par les œuvres, institutions ou événements réellement présents dans les données consultées, puis laisser l’utilisateur parcourir chaque étape, ouvrir sa provenance et comprendre clairement les limites du résultat.** C’est déjà soutenu par le moteur de chemin et la scène 3D ; l’innovation serait de rendre cette exploration universelle, accessible et honnête — y compris lorsque le graphe ne trouve aucun chemin.

**RELIA — Tout est relié.**
