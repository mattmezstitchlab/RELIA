# RELIA Phase 2 — bilan de validation

## Portée livrée

- **BnF : adaptateur expérimental uniquement.** `src/bnf.js` interroge l’endpoint SPARQL indiqué avec un QID Wikidata exact, puis ne normalise que les libellés SKOS/RDFS d’une notice BnF reliée par `owl:sameAs`. L’interface conserve la notice, l’attribution à la Bibliothèque nationale de France et la date de récupération. Ce contexte d’identité n’est jamais transformé en relation ou en étape de chemin.
- **Portraits :** seules les images P18 de l’entité Wikidata explicitement sélectionnée peuvent être utilisées. Les vignettes sont circulaires, limitées à 12, chargées par groupes de trois et accompagnées du halo déjà présent. Les sphères existantes restent le fallback. Les portraits sont désactivés en `prefers-reduced-motion`, sur les appareils signalant moins de 2 Go de mémoire, sur mobile au-delà de 14 nœuds et sur ordinateur au-delà de 36 nœuds. La fiche donne accès au fichier Wikimedia Commons et à ses informations de crédit/licence.
- Les règles Phase 1 de preuve, d’exclusion géographique/familiale et de chemins restent inchangées.

## Vérifications et limites

- Les URL fournies pour la documentation BnF sont le [guide SPARQL](https://api.bnf.fr/index.php/fr/sparql-endpoint-de-databnffr), les [conditions de réutilisation](https://api.bnf.fr/fr/node/2763), l’[API SRU](https://api.bnf.fr/fr/api-sru-catalogue-general) et l’endpoint `https://data.bnf.fr/sparql`. L’utilisateur indique que les métadonnées BnF relèvent de la Licence Ouverte et que le service expose RDF/JSON.
- Les tentatives de lecture des pages et d’une requête SPARQL limitée pour un QID connu (`Q42`) ont échoué dans l’environnement d’exécution avec une erreur DNS (`No address associated with hostname`). **La connexion de production n’est donc pas validée.**
- Les tests BnF utilisent une fixture représentative du format standard JSON SPARQL, et non une réponse capturée du service ni une fixture officielle vérifiée. Les identifiants ARK, les propriétés réellement publiées, les alignements Wikidata, les relations, le comportement CORS et les limites de requêtes restent à contrôler en direct. Aucun rapprochement ni lien d’œuvre/personne n’est déclaré trouvé sur cette base.
- Les portraits s’appuient sur le fichier associé par P18, sans recherche par nom. RELIA fournit un lien vers la notice Commons où figurent le crédit et la licence ; la licence de chaque fichier n’est pas récupérée ou auditée automatiquement par l’application. L’affichage des avatars reste donc limité aux fichiers explicitement liés et leur notice source reste accessible.
- Les cas Sandrine Sarroche, Pierre Lefebvre, l’homonymie réelle, l’apport réel de BnF, mobile/tactile et les performances visuelles n’ont pas pu être validés en navigateur dans cette session. Les tests automatisés vérifient la normalisation, le refus de correspondances par nom, les limites/fallback des avatars et les régressions des règles existantes.

## État

**Fonctionnel selon tests :** adaptateur isolé prêt à tenter un lien explicite `owl:sameAs`, provenance d’attribution/date, mode de repli réseau, portraits P18 circulaires plafonnés, sphères de repli, priorité visuelle du survol/de la sélection/des chemins.

**Partiel / à valider :** schéma réel et licence BnF à confirmer par appel réel ; notices/images particulières et rendu/performance sur appareils mobiles à contrôler manuellement. Les assertions BnF ne sont pas admissibles dans les chemins.
