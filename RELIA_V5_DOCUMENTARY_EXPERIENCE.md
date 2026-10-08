# RELIA V5 — Recherche universelle et exploration documentaire immersive

## Objet et méthode

Cette proposition décrit une évolution progressive du code de RELIA vers une expérience de recherche et de narration documentaire chronologique. Elle s’appuie sur l’architecture du dépôt, les audits `/home/runner/work/RELIA/RELIA/RELIA_PRODUCT_VISION.md` et `/home/runner/work/RELIA/RELIA/RELIA_INNOVATION_LAB.md`, et les adaptateurs réellement présents.

**Périmètre de cet audit :** étude et proposition uniquement. Aucun fichier applicatif n’est modifié, aucun connecteur n’est ajouté ou appelé pour cette étude, aucune donnée de production n’est interrogée et aucun déploiement n’est effectué. Les services tiers et leurs pages de conditions doivent être testés et relus avant implémentation ; une API publique ne signifie pas que chaque image, vidéo ou document est librement réutilisable ou intégrable.

> **Principe éditorial :** RELIA peut raconter ce que les données relient. Elle ne doit pas transformer un média associé en preuve, une date de publication en date d’événement, ni une hypothèse en fait.

## Synthèse

RELIA dispose déjà des briques d’une expérience documentaire, mais pas d’un moteur de recherche universel, d’une frise interactive synchronisée ou d’un catalogue de médias :

- Recherche d’identités Wikidata par nom, résultats français puis anglais, sélection explicite, détails d’entité, dates biographiques et professionnelles, extrait Wikipédia depuis le sitelink exact, image P18 et accès à Commons.
- Graphe 3D de personnes, œuvres, lieux, institutions et événements, construit à partir d’une liste fixe de propriétés, avec affichage des références déclarées et un filtre temporel de certaines dates de relation.
- BnF expérimental pour le contexte d’identité par `owl:sameAs`, sans arêtes de relations ni médias. Discovery conserve des instantanés/comparaisons, mais ne collecte pas de nouvelles sources.
- Chargement paresseux d’images et sélection limitée de portraits ; pas de modèle générique de média, de licence par ressource ou de lecteur vidéo.

La première version utile n’a donc pas besoin d’un fournisseur nouveau. Elle peut faire d’une **personne ou d’une œuvre déjà sélectionnée** le centre d’un récit accessible : résumé de l’identité, relations datées, frise, section « Date inconnue », portrait existant et accès direct aux références. L’amélioration documentaire consiste d’abord à mieux structurer et présenter les données disponibles, sans prétendre à une couverture historique exhaustive.

## 1. Vision fonctionnelle

L’interface garde la constellation comme scène principale, sur le fond clair déjà développé (`/home/runner/work/RELIA/RELIA/index.html:10,15`, `/home/runner/work/RELIA/RELIA/src/styles.css:18-20`). Une question compréhensible ouvre un parcours dont l’utilisateur peut vérifier le sujet, la portée et les sources :

1. **Demande :** l’utilisateur saisit un nom ou une question courte.
2. **Intention et identité :** RELIA propose un type de recherche pris en charge, affiche des résultats désambiguïsés et demande une sélection explicite.
3. **Exploration :** le graphe révèle les relations documentées réellement consultées. La recherche et ses plafonds restent visibles.
4. **Temps :** une frise montre uniquement les dates/périodes disponibles ; les relations non datées restent consultables dans une rubrique dédiée.
5. **Fiche :** sélectionner un nœud ouvre une fiche documentaire légère, avec résumé, visuel existant et rubriques repliables.
6. **Examen :** un média ou une référence s’ouvre à la demande. Chaque ressource garde son fournisseur, son identifiant, son attribution, ses droits connus et les dates qui lui appartiennent.

La constellation est une **vue** des données, non une nouvelle preuve ni le seul moyen d’accès. Les mêmes relations, étapes et sources doivent être disponibles en texte accessible et au clavier. Les animations sont facultatives et n’affectent ni la recherche ni la compréhension du contenu.

## 2. Recherche universelle par étapes

### Ce qui fonctionne déjà

`searchEntities()` interroge `wbsearchentities`, demande des résultats en français puis en anglais si nécessaire, retourne au plus huit QID avec libellé/description et refuse les termes de moins de deux caractères (`/home/runner/work/RELIA/RELIA/src/data.js:58-65`). Le composant de recherche permet l’usage clavier, l’annulation d’une requête précédente et une liste de résultats annoncée aux technologies d’assistance (`/home/runner/work/RELIA/RELIA/src/app.js:83-160`).

Les fiches couvrent les types connus personne, œuvre, lieu, institution et événement. Le type peut toutefois être une suggestion lorsqu’il est inféré depuis des relations, et l’homonymie reste à résoudre par l’utilisateur (`/home/runner/work/RELIA/RELIA/src/data.js:99-123`, `/home/runner/work/RELIA/RELIA/src/app.js:356-380`). Le mode Relier permet de choisir explicitement deux personnes et d’effectuer une recherche de chemin bornée.

### Ce qui n’existe pas encore

La recherche actuelle **cherche des entités par nom**, pas une intention en langage naturel. Elle n’extrait pas les dates d’une phrase, ne recherche pas tous les événements d’un lieu, ne comprend pas une période libre et ne transforme pas une question en requête structurée. La barre principale n’effectue pas à elle seule une comparaison de personnes, une recherche d’archives ou une analyse de documents.

### Proposition d’évolution sans IA payante imposée

Commencer par un routeur déterministe pour quelques intentions dont la sortie est déjà soutenue :

| Intention proposée | Exemple | Capacités utilisables au départ | Confirmation requise |
| --- | --- | --- | --- |
| Identité personne/œuvre/événement | « Je veux explorer Marie Curie » | Recherche Wikidata et sélection d’entité. | Choix de la bonne notice parmi les homonymes. |
| Parcours d’une personne | « Quelles œuvres et institutions sont liées à cette personne ? » | Relations déjà supportées, fiche, sources, quelques dates. | Identité exacte et type de relations/périmètre. |
| Relier deux personnes | « Comment ces deux personnes sont-elles reliées ? » | Deux recherches QID et `findRemotePath()` borné. | Les deux identités exactes, puis la portée explorée. |
| Période dans un graphe déjà consulté | « Montre les liens connus entre 1920 et 1940 » | Filtre des qualificatifs relationnels déjà extraits P580/P582/P585. | Interprétation de l’intervalle et inclusion des dates inconnues. |
| Recherche d’événement ou de lieu | « Que s’est-il passé à Lyon ? » | Recherche d’identité seule, puis exploration locale limitée des liens disponibles. | Entité exacte ; expliquer que le code ne fait pas encore une recherche événementielle exhaustive. |
| Question ouverte | « D’où vient cette idée ? » | À terme, proposer une reformulation vers l’une des intentions prises en charge. | Demander quelle idée/personne/œuvre et préciser que l’influence n’est montrée que si une assertion correspondante est disponible. |

La séquence devrait être : classifier grossièrement l’intention sans inventer de contenu, reformuler (« Je peux explorer une personne ou relier deux identités »), confirmer l’identité, afficher le plan de recherche (sources, propriétés, période, limites), lancer l’adaptateur actuel, puis montrer résultat et provenance. Toute intention non soutenue doit être refusée ou reformulée en choix explicite, plutôt que traduite en graphe conjectural.

Un modèle de langage facultatif pourrait, plus tard, aider à reformuler une question ; il ne doit pas sélectionner silencieusement une identité, créer une arête, choisir une source inaccessible ou présenter une inférence comme assertion. Le premier parseur peut être déterministe et limité à quelques formes testées.

## 3. Architecture documentaire compatible avec l’existant

Préserver les frontières déjà visibles : `/home/runner/work/RELIA/RELIA/src/data.js` gère l’adaptation Wikidata et l’éligibilité, `graph.js` la présentation Three.js, `app.js` l’orchestration UX, `discovery.js` les instantanés/comparaisons et `bnf.js` l’enrichissement BnF expérimental. Discovery doit garder ses règles de racines exactes, paramètres comparables, attribution par assertion, incomplétude et réconciliation par identifiant ; une ressource média ne doit pas être traitée comme une nouvelle source de relations par simple ajout à une fiche.

### Objets conceptuels distincts

Ce schéma est une cible logique, pas une proposition d’implémentation immédiate ni une migration obligatoire de Discovery.

| Objet | Rôle et données minimales envisagées |
| --- | --- |
| **Entité** | Identifiant canonique (QID courant), type, libellés/descriptions, identifiants externes qualifiés, et provenance de la classification. |
| **Relation** | Assertion orientée, propriété/terme, identifiant d’assertion, rang, qualificatifs, statut, références et source d’origine. La règle `eligible()` actuelle demeure autorité pour les chemins. |
| **Événement** | Occurrence décrite comme événement, identité exacte, lieu/participants éventuellement référencés, date ou intervalle et source de cette date. Ne pas créer un événement seulement par proximité de noms ou d’années. |
| **Date/période** | Valeur originale, borne/intervalle, précision, calendrier si disponible, type sémantique (naissance, début de relation, événement, création de média, publication, consultation) et assertion qui la porte. |
| **Ressource documentaire** | Notice ou document consultable : fournisseur, URI/identifiant exact, titre/libellés retournés par la notice, type de ressource, URL officielle, attribution, statut de droits et date de récupération. |
| **Média** | Fichier image/son/vidéo ou manifeste de diffusion : ID source, URL originale et miniature éventuelle, type MIME déclaré, titre, langue, dates propres au média, conditions d’affichage, et lien(s) vers notice(s) exactes. |
| **Attachement média–entité/événement** | Lien séparé avec cible ID, méthode (P18, identifiant stable de catalogue, relation du fournisseur, curation humaine), URI de l’assertion ou de la notice et degré de confiance documenté. Un simple résultat de recherche par nom n’est pas un rattachement acceptable. |
| **Droits et attribution** | Valeur de droits telle que fournie, URI de licence/notice, texte d’attribution, fournisseur, éventuelle restriction d’intégration, provenance et date de vérification. Ne pas inférer « libre » d’un accès public. |
| **Résultat calculé** | Chemin, filtrage temporel, intersections ou séquence d’étapes ; références aux assertions d’entrée, paramètres, portée, limites et statut complet/partiel. Un résultat calculé n’est pas une assertion source. |
| **Présentation** | Fiche, constellation, frise ou lecteur, qui référence les objets précédents sans les fusionner ni changer leur statut probatoire. |

La relation entre assertion et document cité peut être une relation de **provenance** distincte : un document/média ne justifie une assertion que si le fournisseur relie explicitement ce document à l’assertion ou si un processus de vérification documenté l’établit. Une photo attachée à une personne ne prouve pas qu’elle a participé à un événement représenté.

### Dates sans confusion

La normalisation actuelle produit une date exploitable à partir d’une précision suffisante et les relations conservent P580 (début), P582 (fin), P585 (date ponctuelle), P577 (publication) (`/home/runner/work/RELIA/RELIA/src/data.js:92-97,149-152`). Le filtre `inPeriod()` utilise P580/P582/P585 et ne traite pas la publication comme date de relation (`/home/runner/work/RELIA/RELIA/src/data.js:168-175`). Les dates de naissance/décès (P569/P570) existent sur une fiche mais ne sont pas des dates de relation. Il n’existe pas encore de frise synchronisée ni de schéma média.

La chronologie V5 doit conserver au minimum ces champs séparés :

- **date de l’événement** (sur l’événement ou la relation qui l’atteste) ;
- **date de création/enregistrement du média** (quand connue) ;
- **date de publication/mise en ligne** ;
- **date de récupération par RELIA** ;
- éventuellement, **période d’activité** explicitement sourcée, sans l’inférer d’une naissance ou d’une carrière incomplète.

La frise représente un jour/mois/année ou un intervalle seulement à la précision réellement fournie. Une vidéo mise en ligne en 2021 qui parle d’un événement de 1910 reste une publication de 2021 ; sans métadonnée/notice attestant sa date d’enregistrement ou son lien à l’événement, l’époque filmée reste inconnue. Une rubrique **« Date inconnue »** doit rester consultable et comptée, ne pas disparaître quand l’utilisateur filtre une période. Les dates négatives, calendriers et approximations doivent être affichés comme tels, avec leur précision, plutôt que normalisés silencieusement en dates exactes.

## 4. Parcours documentaire animé

1. **Question.** L’accueil clair pose « Que voulez-vous découvrir ? » avec quelques exemples non techniques : « Explorer une personne », « Suivre une œuvre », « Relier deux personnes ».
2. **Intention.** RELIA propose l’intention comprise, explique ce qu’elle sait réellement faire et offre une alternative si la demande est trop large.
3. **Confirmation.** Présenter les identités candidates (nom, description, catégorie, identifiant source et visuel uniquement s’il est déjà rattaché) ; demander confirmation avant requête. Pas d’autosélection d’un homonyme.
4. **Plan visible.** Indiquer les sources consultées et le périmètre : type de relation, période éventuelle, limites d’expansion. Montrer progression bornée, requêtes indisponibles et état partiel.
5. **Constellation.** Révéler l’entité racine, ses liens chargés et les nœuds selon leur type. L’animation n’ajoute pas de liaison et se réduit ou s’arrête si le système ou l’utilisateur demande moins de mouvement.
6. **Frise synchronisée.** Faire avancer le curseur sur les étapes datées exploitables ; mettre en évidence uniquement les arêtes/entités concernées par les dates documentées et présentes dans l’exploration. Ne pas interpoler entre années lacunaires. Inclure « Date inconnue » comme section stable.
7. **Médias au point d’usage.** Révéler seulement les médias de notices exactes et identifiés comme pertinents par leurs métadonnées. Afficher la date correspondant au média, pas celle de l’événement, et ses droits. Images différées/lazy; lecteur vidéo chargé après action explicite.
8. **Fiche.** Sélection d’une personne, œuvre ou événement ouvre la fiche sans perdre la position temporelle. Les sections Sources et connexions restent à portée immédiate.
9. **Vérification permanente.** La relation active peut être ouverte dans Sources à tout moment. Le retour à la vue accessible présente les mêmes étapes et libellés.
10. **Résultat incomplet ou nul.** Dire ce qui a été trouvé, ce qui n’est pas daté et ce qui n’a pas pu être consulté. « Aucun chemin trouvé dans les données explorées » n’est jamais formulé comme « aucun lien n’existe ».

### Animation et contrôle

La caméra, le reveal des connexions et le déplacement temporel doivent être coordonnés mais indépendamment contrôlables : lecture/pause, étape précédente/suivante, réduction du mouvement, déplacement direct dans la frise et arrêt au focus. Respecter `prefers-reduced-motion`, déjà consommé par la scène (`/home/runner/work/RELIA/RELIA/src/graph.js:38,55,103-108`; `/home/runner/work/RELIA/RELIA/src/styles.css:13`). Pas de lecture automatique audio ou vidéo, pas de mouvement indispensable à comprendre l’ordre des étapes.

## 5. Fiche documentaire repliable

La fiche actuelle est un panneau latéral défilant qui peut inclure image, description, extrait Wikipédia, enrichissement BnF, dates, professions, relations, chronologie et sources (`/home/runner/work/RELIA/RELIA/src/app.js:292-408`). Elle affiche déjà le portrait en chargement différé et un lien Commons pour le crédit, mais n’interroge pas les métadonnées de licence de chaque fichier.

Proposition de hiérarchie sans transformer l’écran en tableau de bord :

1. **Toujours visible au premier regard :** nom (grand, lisible et pouvant revenir à la ligne), type, visuel principal déjà rattaché, introduction courte issue d’une source indiquée, dates principales connues et action fermer/retour.
2. **« Parcours dans le temps »** : frise compacte, nombre d’étapes datées et section « Date inconnue » clairement disponible.
3. **« Images et documents »** : vignettes/notice seulement si un élément vérifié existe ; afficher son origine et les droits disponibles. État vide : « Aucun média documenté disponible pour cette fiche dans les sources consultées. »
4. **« Vidéos et archives »** : replié par défaut, chargé uniquement à la demande ; liens officiels avant lecteur, lecture déclenchée par l’utilisateur.
5. **« Connexions »** : relations voisines par type, date connue/inconnue et nature exacte de l’assertion. Ouvrir la preuve sans assimiler le visuel à la relation.
6. **« Sources et limites »** : source, identifiant, URL de notice, attribution/licence, date de récupération, statut de référence et état d’incomplétude.

Les rubriques sans contenu ne sont pas remplies par un placeholder suggestif ou un média générique. Un élément d’un fournisseur non joignable affiche une erreur et un lien de repli, pas une ressource supposée. Les sections repliables restent utilisables au clavier, correctement étiquetées et annoncées à l’écran.

## 6. Fournisseurs et connecteurs envisageables

### État vérifiable dans le dépôt

| Source actuelle | Utilité/capacité | Ce qu’elle ne prouve pas |
| --- | --- | --- |
| Wikidata API | QID, labels/descriptions, claims d’une liste de propriétés, P18, dates, sitelinks et références de claims. Le cache est de cinq minutes, plafonné à 80 URL ; appels avec délai de 11 secondes (`/home/runner/work/RELIA/RELIA/src/data.js:16-71`). | Exhaustivité, validation des documents externes, droits automatiques sur un média ou rattachement historique absent des claims. |
| Wikipédia API | Quatre phrases introductives maximum depuis le sitelink exact d’une entité, plafond texte de 1 800 caractères (`/home/runner/work/RELIA/RELIA/src/data.js:73-87`). | Source de relation ou vérification automatique ; aucune recherche par nom de remplacement. |
| Wikimedia Commons | URLs P18 exactes utilisées pour un portrait/illustration ; lien de crédit et licence vers la page de fichier ; avatars plafonnés à 12 et chargés par groupes de trois (`/home/runner/work/RELIA/RELIA/src/data.js:109-119`, `/home/runner/work/RELIA/RELIA/src/app.js:362-366`, `/home/runner/work/RELIA/RELIA/src/graph.js:8-15,190-240`). | RELIA ne récupère pas la licence ou l’attribution de manière structurée et ne vérifie pas les droits du fichier. L’association Wikidata P18 est plus fiable qu’une recherche par nom, mais ne valide pas chaque interprétation du visuel. |
| data.bnf.fr | Adaptateur SPARQL pour une notice reliée au QID exact par `owl:sameAs`; libellés et attribution, seulement. Cache de cinq minutes/40 entrées, délai de 8 secondes (`/home/runner/work/RELIA/RELIA/src/bnf.js:11-21,34-58,61-89`). | Pas de média ni d’arête; connexion, schéma de production, alignements et licence réelle non validés selon `/home/runner/work/RELIA/RELIA/PHASE2_REPORT.md:9-21`. |

### Options à évaluer avant tout développement

La colonne « associations » désigne le mécanisme de rattachement à vérifier. Un ID de fichier/notice stable permet de retrouver une notice ; il ne suffit pas à établir seul que le média représente la bonne personne, le bon événement ou la bonne date.

| Fournisseur / source officielle | API, identifiant et association envisageables | Réutilisation, attribution et affichage | Évaluation pour RELIA |
| --- | --- | --- | --- |
| **Wikimedia Commons** — [API Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo), [CommonsMetadata](https://www.mediawiki.org/wiki/Extension:CommonsMetadata), [réutilisation](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [licences](https://commons.wikimedia.org/wiki/Commons:Licensing) | L’API MediaWiki peut retourner métadonnées de fichier et champs de droits via `imageinfo`/`extmetadata`. P18 fournit un rattachement exact dans la déclaration Wikidata ; conserver titre/ID de la page de fichier Commons comme notice. Le fichier lui-même ne garantit pas que la personne représentée soit correctement identifiée. | Licence, auteur, crédit et restrictions varient selon le fichier. Lire les champs exacts (licence, auteur/artist, crédit, source) et afficher les conditions/attribution de ce fichier ; ne pas déduire la licence de la seule présence de P18. Image directe techniquement possible sous vérification des conditions et conservation d’un lien de notice. | **Priorité d’audit faible/coût faible** car l’usage P18 existe déjà. À améliorer d’abord : extraire/vérifier attribution et droits, mettre en cache la métadonnée sans transformer l’image en preuve de relation. |
| **Wikidata / Wikipédia** — [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [REST API Wikipédia](https://www.mediawiki.org/wiki/Wikimedia_REST_API) | QID et sitelink exact fournissent les rattachements actuels. Claims P18 et P854/P248 peuvent relier une image ou une référence à une déclaration. | Licence du texte et des médias dépend des pages/fichiers et de leurs conditions propres ; attribution et partage à l’identique peuvent s’appliquer au texte Wikipédia. Utiliser lien source exact et afficher provenance. | **Déjà intégré, capacité de base.** Ne pas assimiler extrait encyclopédique à texte éditorial validé par RELIA. |
| **BnF / data.bnf.fr** — [web sémantique](https://data.bnf.fr/fr/semanticweb/), [guide SPARQL](https://api.bnf.fr/fr/sparql-endpoint-de-databnffr), [réutilisation des données](https://www.bnf.fr/fr/reutilisation-des-donnees-de-la-bnf), [API SRU](https://api.bnf.fr/fr/api-sru-catalogue-general) | URIs/ARK de notices et alignements `owl:sameAs` peuvent être examinés comme identifiants d’autorité. L’adaptateur RELIA requête déjà un QID exact. Un identifiant d’autorité candidat exige vérification du type de notice et de l’alignement, pas seulement du libellé. | Le code déclare Licence Ouverte et attribution, mais le rapport Phase 2 dit que service, schéma, CORS, alignements et licence de production restent à valider. Licence d’une métadonnée ne vaut pas autorisation de réutiliser une image numérisée ou un contenu partenaire lié à la notice. Intégration par notice/lien avant tout affichage embarqué. | **À valider, pas à étendre maintenant.** Intéressant pour identité/catalogue, non démontré comme fournisseur de média ou de relation. |
| **Europeana** — [portail API](https://pro.europeana.eu/page/apis), [documentation](https://api.europeana.eu/docs/), [conditions/politiques](https://pro.europeana.eu/page/terms-and-policies), [droits des objets](https://www.europeana.eu/en/rights) | API catalogue avec identifiants de notice/objet et clé à obtenir selon les modalités du service. L’ID Europeana identifie une notice ; inspecter le fournisseur et ses champs d’autorité pour établir le rapport au sujet, plutôt que s’en remettre à une recherche textuelle. | La documentation distingue les métadonnées de catalogue (en général CC0) des droits propres au média de chaque objet. Vérifier l’URI de droits de la ressource exacte ; ne pas présumer que vignette, aperçu ou fichier peuvent être republiés parce que la métadonnée est réutilisable. Préserver fournisseur et attribution. | **Bon candidat de phase ultérieure** pour découverte de collections, sous réserve de clé API, politiques en vigueur et audit objet-par-objet. La notice de catalogue n’est pas la source d’une relation Wikidata sauf lien/documentation explicite. |
| **Library of Congress** — [APIs JSON/YAML](https://www.loc.gov/apis/json-and-yaml/), [endpoints](https://www.loc.gov/apis/json-and-yaml/api-endpoints/), [exemples](https://www.loc.gov/apis/json-and-yaml/examples/), [droits et réutilisation](https://www.loc.gov/legal/) | APIs JSON/YAML de recherche, collections et ressources avec URLs/identifiants de notice LOC. Le lien stable identifie la notice, non automatiquement la personne représentée ; examiner les champs auteur/sujet et leurs identifiants d’autorité. | Les mentions de droits peuvent différer selon l’objet et son statut ; l’accès API ne concède aucun droit de média. Examiner notice et conditions de l’item avant copie/intégration. Lien vers la notice officielle est une solution de repli sobre. | **Candidat documentaire** pour fonds historiques ; contrôler formats, politiques d’API, droits, stabilité des endpoints et qualité des identifiants avant connecteur. |
| **Smithsonian Open Access** — [Developer tools](https://www.si.edu/openaccess/devtools), [conditions Open Access](https://www.si.edu/openaccess/terms), [programme](https://www.si.edu/openaccess) | API de collections avec identifiants de ressources officielles (IDs/GUIDs). Vérifier le marqueur Open Access au niveau de l’objet et que le média en ligne retourné correspond au bon sujet. | CC0 est limité aux données/assets désignés Open Access ; ne pas l’étendre à toute la collection, aux autres médias ou au texte éditorial. Conserver le statut, l’identifiant, l’institution et l’attribution encouragée. | **Candidat pour objets patrimoniaux**, notamment image/document. Exiger vérification item-par-item et contrôle de la clé API, quotas et URL d’image. |
| **Rijksmuseum** — [API officielle](https://www.rijksmuseum.nl/en/api), [métadonnées d’objet](https://data.rijksmuseum.nl/object-metadata/api/), [conditions](https://www.rijksmuseum.nl/en/rijksstudio/terms-and-conditions) | API et identifiants d’objet/catalogue ; le numéro d’objet identifie une notice. Évaluer le rattachement via description, créateur, dates et provenance de cette notice ; le titre ou un résultat de recherche seul ne prouve pas un sujet représenté. | Les droits sont à contrôler pour l’image/objet exact ; API ou URL haute résolution ne constitue pas une licence de réutilisation. Conserver mention de droits et attribution, préférer le lien vers la page objet au hotlink non documenté. | **Candidat ciblé art**, utile pour catalogue/visuel après validation accès, attribution, licence exacte et limites de réutilisation. |
| **YouTube** — [Data API](https://developers.google.com/youtube/v3), [ressource vidéo](https://developers.google.com/youtube/v3/docs/videos), [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [politiques API](https://developers.google.com/youtube/terms/api-services-terms-of-service), [mode de confidentialité renforcée](https://support.google.com/youtube/answer/171780) | L’identifiant vidéo exact et une notice ou un lien officiel vérifié sont nécessaires. La ressource expose notamment le statut d’intégration permis (`status.embeddable`), à vérifier au moment de l’affichage. Les résultats d’une recherche YouTube par nom ne suffisent pas à rattacher une vidéo à la bonne personne, œuvre ou date d’un événement. | L’API ne donne pas droit à télécharger, extraire ou republier le flux ; utiliser le lecteur officiel et respecter les politiques, caractéristiques visibles du lecteur et disponibilité variable. Pas d’autoplay. `youtube-nocookie.com` ne supprime pas les obligations de confidentialité : le chargement tiers reste une communication au fournisseur. Proposer « Charger la vidéo » ou le lien externe après information claire. | **Pas de recherche vidéo approximative.** Intégrer seulement un ID exact documenté par source/notice ou revue éditoriale, vérifier l’intégrabilité, séparer création/enregistrement/publication et obtenir une décision de confidentialité/consentement. |
| **INA et fonds audiovisuels patrimoniaux** — [catalogue INA](https://www.ina.fr/) | Les notices officielles peuvent fournir des identifiants exacts et descriptions. Une API publique générale exploitable n’est pas présumée ici ; confirmer les produits et modalités institutionnelles avant étude technique. | Consultation, extrait, diffusion et réutilisation peuvent être soumis à droits/licences distincts. Un lien catalogue est préférable à une intégration de lecteur non autorisée. | **Candidat sous partenariat/étude de droits**, pas dans la première version. Rattachement exige notice exacte ; ni titre similaire ni date d’upload ne prouve un tournage à l’événement. |
| **Internet Archive** — [API de métadonnées](https://archive.org/developers/metadata.html), [recherche avancée](https://archive.org/developers/search.html), [lecteur incorporé](https://archive.org/help/embedding.php) | Identifiants d’items et liens de métadonnées sont utiles pour retrouver une notice. Le dépôt est hétérogène : ID d’item, description ou uploader ne suffisent pas à établir une autorité, une identité de personne représentée ou la fiabilité d’une date. | Droits et accès varient par item ; un champ de licence fourni par l’uploader n’est pas nécessairement une vérification institutionnelle. L’embed documenté ne vaut pas licence de republication. Vérifier la notice, droits et disponibilité avant affichage. | **Candidat conditionnel de découverte** pour livres, sons et vidéos numérisés ; moins adapté comme source d’autorité. Lien de notice avant toute ingestion ou intégration. |

**Portée de cette comparaison :** les URLs ci-dessus désignent des points d’entrée officiels pour une étude de faisabilité, pas une certification juridique ni un test de disponibilité en production. La recherche spécialisée a identifié ces documents officiels mais n’a pas pu en récupérer le contenu en direct dans l’environnement de rédaction (résolution des hôtes impossible et recherches expirées) ; l’état des pages et détails date-sensibles au 8 octobre 2026 ne peut donc pas être certifié ici. Avant tout connecteur, confirmer la documentation actuelle, les modalités d’API, la licence exacte de l’item, les règles de cache/affichage, les limites, le traitement des données personnelles et l’autorisation d’intégration. Si une condition ou une provenance n’est pas claire, RELIA doit montrer un lien vers la notice plutôt qu’héberger ou embarquer la ressource.

## 7. Sources, droits et risques documentaires

### Un média n’est pas une preuve de relation

Un portrait lié à un QID est un média attaché à cette identité par une assertion ou un lien de catalogue. Il n’atteste pas la présence de la personne à un événement. Un scan de manuscrit associé à une œuvre ne prouve ni son auteur ni sa date sans métadonnées ou source explicite. Une vidéo parlant d’un événement historique n’établit pas que l’événement y est filmé.

Pour une relation, continuer d’exiger la politique actuelle : relation réelle admissible uniquement si elle n’est pas fictive, dépréciée ou non référencée et si une référence exploitable P854/P248 est disponible ; P19/P20/P131 demeurent du contexte non admissible aux chemins (`/home/runner/work/RELIA/RELIA/src/data.js:15,126-166`). **Cette règle ne doit pas être affaiblie par la présence d’un fichier attaché.**

### Précautions de droits et de confidentialité

- Les licences portent sur des œuvres/ressources précises ; distinguer droits des métadonnées, texte, photographie, vidéo, son, miniature et lecteur.
- Conserver le lien vers la notice officielle, la licence/mention des droits, l’attribution requise, le fournisseur et la date de vérification. Ne pas synthétiser un droit manquant en « libre ».
- Respecter les API terms, clés, quotas, règles de cache, formats d’attribution, politiques de streaming/lecteur, limitations géographiques et autorisation de hotlink, s’il y a lieu.
- Éviter que le simple chargement d’une fiche envoie immédiatement l’adresse IP ou d’autres métadonnées à des plateformes médias. Charger de façon différée ; lecteur tiers après action claire, avec information de confidentialité et possibilité de n’ouvrir que la page officielle.
- Ne pas télécharger ni recopier une vidéo/audio depuis une plateforme pour créer un lecteur interne sans autorisation.
- Pour une vidéo, vérifier le champ de statut d’intégration et la disponibilité de l’ID exact ; titre, nom de chaîne, résultat de recherche, date de publication et contexte historique ne prouvent ni le sujet filmé ni la date de tournage.
- Les informations de personnes vivantes, mineurs, fonds restreints et documents personnels exigent des contrôles spécifiques. Un identifiant public n’annule pas ces risques.
- Séparer « référence fournie par la base », « notice officielle consultée », « droits affichés par fournisseur » et « vérification éditoriale RELIA ». Ne pas utiliser le terme « vérifié » si seul un lien existe.

## 8. Impacts de performance et de robustesse

### Réutiliser les garde-fous existants

L’exploration réelle est limitée à 100 nœuds, 180 relations, 12 expansions, 40 requêtes et 4 niveaux ; les requêtes Wikidata ont un cache mémoire de cinq minutes/80 URL et un délai de 11 secondes (`/home/runner/work/RELIA/RELIA/src/data.js:1,28-53`). BnF a un cache séparé et délai de huit secondes. Les avatars sont plafonnés à 12, chargés au maximum par groupes de trois, et supprimés/ignorés sur appareils ou graphes plus contraints (`/home/runner/work/RELIA/RELIA/src/graph.js:8-15,190-240`).

L’interface charge déjà les images de fiche avec `loading="lazy"` et utilise `referrerPolicy="no-referrer"` (`/home/runner/work/RELIA/RELIA/src/app.js:362-366`). Ces règles sont de bons points de départ, mais ne suffisent pas à gérer une bibliothèque de médias hétérogène.

### Garde-fous V5 proposés

1. Ne charger que le résumé, le petit visuel/portrait exact et les métadonnées minimales de la fiche initiale.
2. Charger le contenu des rubriques repliées seulement après ouverture ; différer les fichiers volumineux, miniatures et détails de notice jusqu’à proximité d’écran.
3. Pour les images, préférer le thumbnail fourni par l’API et une taille bornée ; éviter le chargement de plusieurs images originales dans le graphe.
4. Pour vidéo et audio, afficher d’abord titre, source, miniature autorisée et lien ; créer l’iframe/le lecteur après clic explicite. Désactiver l’autoplay et nettoyer les lecteurs fermés.
5. Garder plafonds par session, timeouts/abort, cache TTL et limites concurrentes ; afficher erreurs et partialité au lieu de relancer silencieusement en boucle.
6. Restreindre les fournisseurs, domaines et types MIME autorisés. Éviter de rendre des URL arbitraires fournies dans une réponse non validée ; vérifier protocoles/hosts et échapper les titres comme texte.
7. Mesurer le coût du réseau, de la mémoire, du décodage d’image et du WebGL sur mobile faible puissance ; conserver la liste HTML accessible lorsque la 3D ou un lecteur ne fonctionne pas.
8. Ne pas intégrer toutes les images dans les snapshots Discovery par défaut. Stocker les IDs, URLs, attributions et dates minimales ; réévaluer les droits et la péremption à l’import/affichage.

## 9. Structure visuelle claire et sobre

### Scène principale

- Garder la constellation interactive au centre, avec liens A/B ou racine visibles et labels assez grands. L’architecture labels/collisions et mouvements réduits est déjà plus structurée qu’une simple scène décorative.
- Afficher la frise comme une commande secondaire liée au graphe, pas comme un panneau analytique fixe. Une sélection temporelle met en évidence les relations documentées et leurs entités ; elle ne supprime pas l’accès aux non-datés.
- Ne montrer les médias dans le graphe que si un identifiant exact et le rattachement sont disponibles. La couleur, taille, position ou proximité n’indique jamais « plus fiable » ou « plus important » sans une règle expliquée.
- Laisser le visiteur choisir une date/étape. Pas de narration automatique qui saute les preuves ou fait défiler un média sans consentement.

### Écran de recherche

À l’accueil, une barre unique visuellement dominante : **« Que voulez-vous découvrir ? »**. Suggestions en langage naturel et exemples cliquables couvrent les seuls parcours disponibles. Après saisie, afficher identité et rôle probable, sans choisir d’homonyme. Le détail QID/source peut être accessible en complément et non imposé aux enfants.

### Direction claire

Fond clair, surfaces blanches, texte encre, accent RELIA violet et palette de nœuds catégorielle cohérente ; aucun code visuel ne doit signaler seul preuve, date certaine ou média sous licence. Garder du texte, des icônes et un statut visible. Le CSS contient déjà une série de règles lumière, mais la feuille commence par les styles sombres globaux et conserve un thème sombre dans la scène ; finaliser la direction claire serait une étape applicative distincte, pas un prérequis pour l’étude documentaire (`/home/runner/work/RELIA/RELIA/src/styles.css:1-20`, `/home/runner/work/RELIA/RELIA/src/graph.js:5-7,249,334-386`).

## 10. Phases de réalisation

### PHASE A — Architecture avant connecteurs

1. Maintenir entité, assertion, événement, référence, média, droits et résultat calculé comme objets distincts.
2. Écrire les règles d’association média–identité (P18 exact, ID catalogue contrôlé, lien officiel, curation) et de mise en temps (date d’événement, média, publication, récupération).
3. Valider les intentions prises en charge et afficher plan de requête/sources avant collecte ; aucune recherche vidéo par similitude.
4. Définir un manifeste de source/licence et les champs obligatoires pour attribution, URI et date de vérification.
5. Conserver les invariants d’éligibilité de chemin et de comparabilité Discovery ; une image ne change pas le résultat du moteur.
6. Étudier juridiquement et techniquement un seul fournisseur candidat à la fois, avec fixture de réponse officielle vérifiée, tests d’échec et protocole de retrait.

### PHASE B — Première expérience avec les données accessibles

Réaliser un **parcours documentaire chronologique d’une personne ou d’une œuvre** à partir des entités/relation(s) Wikidata déjà accessibles et des médias actuels uniquement :

- identité choisie explicitement par QID ;
- portrait P18 actuel et source Commons, sans nouveau fournisseur ;
- introduction depuis les descriptions ou le sitelink Wikipédia exact, attribution/avertissement conservé ;
- frise de relations avec dates P580/P582/P585 effectivement connues, dates biographiques étiquetées à part ;
- liste/rubrique « Date inconnue » des relations sans date exploitable ;
- ouverture de chaque connexion vers ses propriétés et références ;
- aucun média vidéo, archive ou image trouvé par recherche de nom dans cette première étape.

Si aucune image ou introduction n’est disponible, montrer un état vide honnête et poursuivre avec le nom, le type, les connexions et les sources. Ne pas fabriquer d’illustration de substitution ou d’événement de chronologie.

### PHASE C — Évolution UX/UI concrète et progressive

1. Transformer la recherche d’entité en point d’entrée de questions guidées ; garder les demandes libres en reformulation tant que leurs sources/intents ne sont pas implémentés.
2. Remplacer l’accumulation de panneaux par la constellation principale, un contrôle de frise et une fiche documentaire unique avec accordéons accessibles.
3. Améliorer la lisibilité enfants/mobile : noms non tronqués au focus, corps de texte lisible, cibles tactiles et alternative en liste.
4. Synchroniser la sélection d’étape, le filtre du graphe et l’ouverture de la fiche, avec la rubrique inconnue permanente.
5. Après mesure, éventuellement connecter un fournisseur à la fois, d’abord avec des liens de notices exactes, et seulement ensuite avec des embeds autorisés et consentis.

## 11. Première version réellement implémentable

### « Une vie en connexions documentées »

L’utilisateur recherche puis choisit une personne ou une œuvre dans les résultats Wikidata. RELIA construit le réseau déjà accessible dans ses limites. La fiche initiale présente un visuel P18 s’il est disponible, le nom et le type, l’introduction provenant de la source exacte déjà prise en charge, les relations datées dans une frise, et les autres relations dans « Date inconnue ». Cliquer une étape met en évidence l’arête/la personne/l’œuvre dans la constellation et donne accès à l’assertion et à sa provenance Wikidata. Aucune vidéo ou nouvelle collection n’est chargée.

**Pourquoi c’est réalisable :** l’application a déjà les QID, l’entité normalisée, les relations, les références, le portrait différé, l’extrait Wikipédia par sitelink et un rendu chronologique sommaire (`/home/runner/work/RELIA/RELIA/src/data.js:58-123,142-175`; `/home/runner/work/RELIA/RELIA/src/app.js:292-408`; `/home/runner/work/RELIA/RELIA/src/graph.js:8-15,190-240`). Ce qui manque est surtout l’expérience synchronisée et la séparation explicite des temporalités.

**Critères d’acceptation fonctionnels proposés :**

- aucun nom ambigu n’est choisi sans confirmation ;
- seules les relations déjà consultées figurent dans la frise ;
- relation sans date exploitable visible dans une section persistante « Date inconnue » ;
- naissance/décès, date de relation, publication de source et récupération ne sont pas confondues ;
- cliquer une étape sélectionne l’arête et ouvre sa fiche de provenance ;
- pas de vidéo, nouveau fournisseur, recherche de média approximative, nouvelle arête ou modification des règles de chemin ;
- si les données manquent, l’interface le dit sans inventer un contenu ;
- le parcours reste compréhensible sans WebGL, sans animation et au clavier/tactile ;
- aucun changement au schéma Discovery ou au contenu d’un snapshot existant.

## 12. Intervention V5 recommandée pour une PR limitée et testable

**PR proposée : « Relier une frise documentaire aux relations existantes »** — dans un seul parcours de fiche personne/œuvre, réorganiser les relations actuelles datées en frise accessible et conserver les non datées sous « Date inconnue ». La sélection d’une étape met en évidence uniquement l’arête correspondante dans la constellation et ouvre son panneau de source existant. Afficher séparément la date de naissance/décès, la date portée par la relation et la date de publication/récupération ; garder l’image P18 et l’extrait Wikipédia actuels avec leur notice/lien exact. Ne pas ajouter de connecteur, de moteur de langage, de vidéo, de lecture automatique ou de nouvelles propriétés Wikidata.

Cette portée est testable par fixtures sur relation datée/non datée, date à précision partielle, période négative si couverte, relation référencée/non admissible, date de publication seule et entité sans image/extrait. Vérifier également sélection synchronisée graphe–frise, navigation clavier, affichage sans WebGL, reduced motion et état mobile. Discovery reste inchangé.

**RELIA — Tout est relié. Le temps d’un document, l’époque d’un événement et la preuve d’une relation ne sont jamais la même chose.**
