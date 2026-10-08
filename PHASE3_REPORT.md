# RELIA Discovery — Phase 3

## Vérification préalable

- La PR #3 (« Phase 2: BnF identity context and circular constellation portraits ») est fusionnée dans `main`.
- Commit de référence confirmé : `f73fd97318ce04883b8036b39ba517fcc739a01b` (`Merge pull request #3…`).
- Cette branche de travail part de ce commit de `main`; aucune nouvelle reconstruction de l’application n’a été faite.
- La Phase 2 conserve le rendu Three.js et les portraits circulaires. Les changements Discovery n’altèrent ni la scène ni son moteur de rendu.
- BnF reste expérimental : l’accès réel, le schéma en production, les alignements, la licence et la provenance des assertions n’ont pas été validés. BnF n’est pas une source d’arêtes et n’entre pas dans les chemins.

## Fonctionnalités développées

- `src/discovery.js` produit des snapshots JSON versionnés et déterministes. Ils conservent identités exactes, sources interrogées, date, paramètres, entités, assertions orientées, références, chemins demandés, identités explorées, erreurs et limites.
- Le comparateur n’associe jamais des identités par leur libellé. Les rapprochements externes nécessitent un identifiant déclaré fiable et univoque des deux côtés. L’espace de noms BnF est exclu tant que son adaptateur n’est pas validé.
- Le comparateur sépare nouvelles entités, relations documentées, chemins, références additionnelles, identités réconciliées, contradictions, hypothèses et états incomparables. Les hypothèses sans preuve exploitable ne participent pas aux chemins.
- Les comparaisons refusent les origines fictives/réelles mélangées, les racines ou paramètres différents, les sources de référence absentes et l’absence de source supplémentaire. Une relation, preuve ou entité nouvelle doit porter la provenance explicite de la source ajoutée; sinon elle est déclarée incomparable, pas attribuée à une mise à jour de Wikidata. Un état A incomplet ne peut pas produire de nouveauté confirmée.
- L’interface « Découvrir » permet d’enregistrer les graphes réels consultés comme A/B, d’importer des snapshots, de consulter le registre, de garder les états sur cet appareil et de télécharger les snapshots et le registre JSON. Un défaut de stockage local est signalé.
- Aucun nouveau mouvement 3D n’a été ajouté : l’animation « Révéler » est différée pour préserver la lisibilité et éviter une charge visuelle non mesurée.

## Protocole contrôlé et résultats

Les tests exécutent 20 paires de racines synthétiques (`SYN-*`), uniques par identifiant, avec deux dates de collecte, sources explicites, états A/B, paramètres, assertions et références de fixture. Ces données sont **simulées**, ne représentent pas des personnes réelles et ne sont jamais étiquetées comme résultats documentaires réels.

| Paires | État enrichi contrôlé | Résultat admissible attendu |
| --- | --- | --- |
| 01–10 | Ajout d’un intermédiaire et de deux assertions sourcées | 1 entité, 2 relations et 1 chemin par paire |
| 11 | Assertion inchangée avec une référence indépendante en plus | Nouvelle preuve uniquement |
| 12 | Notice d’intermédiaire avec identifiant externe fiable commun | Identité réconciliée, sans nouveau chemin |
| 13 | Assertion sans référence exploitable | Hypothèse, exclue des chemins |
| 14 | Référence initiale partielle | Candidats incomparables, aucune nouveauté confirmée |
| 15 | État enrichi incomplet après échec simulé d’API | Comparaison signalée incomplète |
| 16 | Profondeur différente | Incomparable |
| 17 | Deux notices homonymes portant des identifiants distincts | Identité nouvelle distincte, sans rapprochement par nom |
| 18 | Assertion documentée orientée à rebours du parcours | Nouveau chemin; sens original conservé |
| 19 | Cible modifiée sous un identifiant d’assertion stable | Contradiction à examiner |
| 20 | Mélange d’un état simulé et d’un état déclaré réel | Incomparable |

La matrice vérifie aussi l’export reproductible, les références non confondues avec les dates de récupération, les signatures des snapshots et la séparation des résultats fictifs/réels.

**Connexions nouvelles réellement démontrées : aucune.** Aucune nouvelle source de relations n’est actuellement branchée ou validée. L’enregistrement direct de RELIA ne capture que Wikidata; comparer deux captures de même source est donc volontairement « incomparable ». Un état enrichi ne peut être comparé qu’après import d’un snapshot ayant une source additionnelle réelle, autorisée et explicitement documentée. Aucune requête BnF ni donnée réelle enrichie n’a été utilisée pour revendiquer une connexion.

## Conservation et reproductibilité

- Le navigateur conserve les deux snapshots dans `localStorage` de l’origine RELIA. Ce stockage local n’est ni une sauvegarde garantie ni une synchronisation entre appareils.
- « Télécharger le registre JSON » produit un export ordonné et versionné contenant snapshots et comparaison. Exporter les fichiers est le mécanisme de conservation durable recommandé.
- Une empreinte déterministe de contenu détecte les modifications accidentelles d’un snapshot importé; elle ne constitue pas une signature cryptographique ni une preuve d’authenticité.
- Les assertions conservent `from` et `to`. Le parcours du graphe peut être inverse, sans inverser artificiellement l’assertion documentaire.
- Pour produire un état B à partir d’un futur adaptateur, réutiliser `createSnapshot` de `src/discovery.js` avec les mêmes racines ordonnées, le même objet `parameters`, les sources A plus l’identifiant de la nouvelle source et les mêmes limites. Chaque nouvelle entité/relation doit porter `sourceIds`; une référence ajoutée doit porter `sourceId` (ou appartenir à une assertion dont `sourceIds` désigne la nouvelle source). La fonction calcule l’identifiant et les empreintes attendues par l’import. Les exports importés sont limités à 5 Mo, 100 entités, 180 assertions et 20 chemins.
- Les identifiants externes peuvent être conservés sous `externalIds` avec `namespace`, `value`, `reliable`, `sourceId` et leurs références de provenance. Le namespace BnF demeure explicitement non admissible tant que l’adaptateur expérimental n’est pas validé.

## Validation, coûts et limites

- `npm test` : **42 tests réussis**, dont onze tests Discovery et 20 paires synthétiques.
- `npm run build` : réussi. Vite signale un bundle JavaScript minifié de 641,93 kB, au-dessus de son seuil de 500 kB. Le rapport de la Phase 2 signalait déjà un avertissement de taille; la scène 3D n’a pas été modifiée. Aucun ajout de dépendance.
- Comparaison des 20 paires synthétiques : environ 17–38 ms selon les exécutions dans l’environnement de test courant; cela mesure les fixtures uniquement, pas le coût d’appels documentaires ou les performances navigateur.
- Le moteur de comparaison n’effectue aucun appel réseau. Le coût de collecte réelle reste celui des adaptateurs existants et de leurs plafonds. RELIA borne actuellement l’exploration à 100 entités, 180 relations, 12 expansions, 40 requêtes et 4 niveaux.
- Les limites d’exploration, les erreurs et la profondeur déterminent la portée de la conclusion; une absence dans un graphe partiel n’est jamais une preuve d’absence mondiale. Le collecteur ne conserve pas encore le détail de chaque erreur API, et les snapshots l’indiquent explicitement.
- Les références documentent la provenance d’une assertion et n’en confirment pas la véracité. Les chemins restent restreints aux propriétés sélectionnées et aux assertions avec référence exploitable.
- Pour un usage scientifique, il reste à intégrer une source de relations autorisée et testée, enregistrer finement chaque requête/erreur/profondeur, valider les licences et schémas, définir des règles d’alignement auditées, vérifier les résultats par un humain et constituer un corpus réel répété. BnF ne pourra contribuer à des arêtes qu’après ces validations.
