# RELIA → application de mariage : audit de faisabilité

> Question posée : *RELIA, avec sa simplicité graphique, serait-elle capable de faire tout ce que fait `mattmezsax.base44.app`, et pourrait-elle devenir une application méga innovante pour le mariage ?*
> Méthode : lecture intégrale du dépôt (`index.html`, 4 192 lignes de code applicatif, 1 016 lignes de CSS, 74 tests), build de production réel, et inventaire fonctionnel complet du site cible (page d'accueil + `/comment-ca-se-passe`). Audit statique et code : le rendu visuel en production n'a pas été validé navigateur par navigateur.
> Date : 8 octobre 2026.

---

## 0. Verdict en cinq lignes

**Non — et ce n'est pas un problème de design.** Les deux produits ne partagent aucune couche : RELIA est un **lecteur en lecture seule d'un graphe public** (aucun compte, aucune base de données, aucune écriture, aucun paiement), le site base44 est un **système d'exploitation commercial** (CRM, devis, signature, encaissement, portail mariés, RSVP, export).

Sur les 22 fonctions relevées sur le site cible : **0 existent** dans RELIA, **4 sont adaptables** à coût raisonnable, **18 demandent de créer des couches qui n'existent pas du tout**.

Le « design graphique simple » est en revanche **le seul actif directement transférable**, et il est de bonne qualité (40 tokens, thème sombre, mouvement réduit, mode texte large, 184 classes réutilisables). Mais un design system ne fait pas un backend.

Et surtout : **le marché visé n'est pas vide** — il est déjà occupé en France par des acteurs qui font précisément ce périmètre. L'opportunité réelle n'est donc pas « faire comme base44 », elle est dans le seul endroit où le graphe de RELIA devient un avantage concurrentiel (voir §5).

---

## 1. Ce que RELIA est réellement (mesuré)

| Fait mesuré | Valeur |
| --- | --- |
| Code applicatif | 4 192 lignes (hors tests) dans 14 modules |
| Tests | 993 lignes, **74 tests qui passent** (`npm test`) — tous sur des fonctions pures, **aucun test E2E ni DOM** |
| Dépendances runtime | **une seule** : `three@0.186.1` (Vite en dev) |
| Build de production | 1 seul chunk : **682,86 kB minifié / 179,73 kB gzip** (+ avertissement Vite > 500 kB), CSS 38,82 kB / 8,12 kB gzip |
| Écrans | 12 vues empilées dans **un seul** panneau (`index.html`), pile de navigation en mémoire |
| Routeur / état d'URL | **0** : pas de `pushState`, pas de `popstate`, pas de hash, pas de `URLSearchParams` en lecture |
| Saisie | **0** `<form>`, **0** `createElement('input' \| 'textarea' \| 'select')` dans `app.js` — les seules entrées sont 2 champs de recherche et 2 champs d'année |
| Écriture réseau | **Aucune.** Tous les appels sont des GET en lecture : Wikidata (API + SPARQL), Wikipédia (extraits), Wikimedia Commons (images/vidéos), YouTube (posters/embeds), `data.bnf.fr` (SPARQL expérimental) |
| Persistance | `localStorage`, **3 clés** : `relia-theme`, `relia-text`, `relia-discovery-v1`. + exports JSON téléchargés par l'utilisateur |
| Authentification / comptes / rôles | **0** |
| Multi-tenant | **0** — marque, texte, palette et propriétés du graphe sont codés en dur pour un seul produit |
| i18n | **0** — 184 littéraux français dans `app.js`, aucune table de traduction |
| SEO / PWA / hors-ligne | **0** service worker, **0** manifeste, aucun pré-rendu. Une seule `index.html`, `<title>` + 1 meta description ; `body { overflow: hidden }` sur scène WebGL |
| Données personnelles traitées aujourd'hui | **Aucune.** Deux préférences d'affichage locales et des identifiants publics Wikidata |

**La bonne nouvelle technique :** l'architecture est propre. La séparation `data / graph / app / discovery / narration` est réelle, les appels sont annulables avec budgets et caches bornés (plafonds : 100 entités, 180 relations, 12 expansions, 40 requêtes, 4 niveaux), les limites de preuve sont un concept de premier ordre et non un cache-misère. C'est une base saine.

**La mauvaise nouvelle, structurelle :** RELIA est **un lecteur**. Tout le site base44 est **un système de saisie, d'engagement et d'encaissement**. Ce n'est pas un écart de fonctionnalités, c'est un écart de **nature**.

---

## 2. Ce que le site cible fait réellement (inventaire exhaustif)

Relevé sur la page d'accueil et `/comment-ca-se-passe` (celle-ci servie en anglais alors que l'accueil est en français : le multilingue est actif).

**Bloc vitrine**
1. One-page avec hero, 3 chiffres de réassurance (120+ événements, 4,9/5, réponse 48 h)
2. Catalogue de 4 formules détaillées (durées, inclusions, « sur devis »)
3. Galerie photo + carrousel vidéo (« Instants », « En mouvement », pagination)
4. Page artiste + témoignage client
5. Bloc contact (email, téléphone) + promesse de service

**Bloc conversion**
6. **Assistant conversationnel** de pré-vente sur l'accueil
7. **Vérification de disponibilité d'une date** (« Vérifier ma date »)
8. Formulaire de demande : ~18 champs typés (type d'événement, noms, second contact, email, téléphone, date, nombre d'invités, horaires, lieu, adresse, code postal, ville, formule, budget, projet) avec validation

**Bloc transaction**
9. Devis personnalisé **généré en PDF**, publié sur **une page au nom du client**, consultable et imprimable
10. **Signature en ligne** au doigt ou à la souris, sans compte à créer
11. **Encaissement de l'acompte** (virement ou lien CB sécurisé) ; solde à échéance
12. Ajustement du devis par simple réponse email

**Bloc opérationnel jour J**
13. Programme musical éditable par moment (entrée, bagues, sortie, cocktail, première danse), **verrouillé à J-1**
14. **Programme partagé** avec le wedding planner et le lieu, **sans les prix**
15. Contact sur place désigné ; exécution du déroulé minute par minute, **y compris sans réseau**

**Bloc invités**
16. **Mini-site privé** des mariés : votre histoire, le programme, le lieu avec itinéraire, la musique, les infos pratiques
17. **RSVP** : présence, nombre de personnes, allergies ; suivi de la liste en direct ; **export Excel**
18. URL **privée et non indexée**, protection par code optionnelle, QR code sur les faire-part
19. Multilingue (FR / EN / NL au minimum)

**Bloc contenu & réassurance**
20. Page méthodologique 6 étapes (« Comment ça se passe »)
21. FAQ à recherche par question libre, ~22 questions, réponses écrites par le prestataire
22. Règle de **ceinture et bretelles juridique/éthique** : « une date disponible aujourd'hui n'est pas réservée tant que l'acompte n'est pas reçu », politique de conservation du mini-site après le mariage

---

## 3. Grille de couverture fonction par fonction

Légende — **Présent** : existe dans le dépôt · **Adaptable** : réutilise une capacité existante à coût borné · **Absent-couche** : exige une infrastructure inexistante.

| # | Fonction du site cible | État dans RELIA | Ce qu'il faut créer | Difficulté |
| --- | --- | --- | --- | --- |
| 1 | Vitrine / hero / stats | Absent-couche | Pages éditoriales indexables. Le shell actuel est une app WebGL `overflow:hidden` sans routeur ni SSR : une landing quirank au premier regard exige une **deuxième surface** (Astro/Next/ou statique) | Faible |
| 2 | Catalogue de formules | Adaptable | `src/data.js` sait déjà modéliser des entités typées avec propriétés et preuves → un catalogue n'est pas un problème de données, c'est un problème de **CMS** (qui les édite ?) | Faible |
| 3 | Galerie photo/vidéo | **Partiellement présent** | `videos.js` + carrousel CSS + `view-media` existent déjà. À brancher sur un stockage de fichiers (S3/R2) et une upload côté pro | Faible → Moyenne |
| 4 | Page artiste / témoignages | Adaptable | Composants `card`, `savoir-card`, `note-card` déjà là | Faible |
| 5 | Assistant conversationnel | Absent-couche | Boucle LLM + garde-fous + **outils côté données** (lire une dispo, créer une demande). Aucun serveur où loger cela | Élevée |
| 6 | Vérification de date | Absent-couche | **Calendrier d'occupation en base, avec verrou optimiste/pessimiste**. C'est le point le plus sous-estimé : deux demandes simultanées sur le même 12 juin = double réservation = litige. Un `localStorage` ne peut pas faire cela | Élevée |
| 7 | Formulaire 18 champs | Absent-couche | 0 formulaire, 0 validation, 0 endpoint. Tout est à écrire (UX + serveur + anti-spam + RGPD) | Moyenne |
| 8-9 | Devis PDF + page client | Absent-couche | Génération PDF côté serveur + **URLs signées** pour pages privées + logique de numérotation/mentions légales/TVA. Et il faut d'abord **un routeur** : RELIA ne sait pas afficher « une page à une adresse » | Élevée |
| 10 | Signature en ligne | Absent-couche | Cf. §4.5 — ce n'est pas un composant dessinable, c'est une **question de valeur probante** | Élevée |
| 11 | Acompte CB / virement | Absent-couche | Stripe (ou équivalent) : webhooks, réconciliation, remboursement, TVA, facturation conforme, et une banque. **Zéro ligne de code existante mobilisable** | Élevée |
| 12 | Ajustement par email | Absent-couche | Threads, boîte d'envoi transactionnelle, historique | Moyenne |
| 13 | Programme éditable, verrou J-1 | Absent-couche | Écriture concurrente + horodatage + verrou temporel + règles de version. **Le modèle de snapshot versionné de `discovery.js` est ici le seul actif directement pertinent** | Moyenne → Élevée |
| 14 | Partage sans prix | Absent-couche | Rôles et périmètres de visibilité (pro / mariés / planner / lieu / invités). **Aucun système d'autorisation n'existe** | Élevée |
| 15 | Exécution jour J, hors-réseau | Absent-couche | **Service worker + cache des données + mode lecture seule**. RELIA n'a ni manifeste ni cache applicatif ; c'est pourtant ce que le site cible promet explicitement | Élevée |
| 16 | Mini-site privé mariés | Absent-couche | Un **produit multi-tenant** : une instance par couple, données cloisonnées, thème, contenus. RELIA est mono-tenant par construction | Très élevée |
| 17 | RSVP + allergies + export Excel | Absent-couche | Formulaire public à haut volume, unicité/dédoublonnage, exports, **et données de santé au sens large** (cf. §4.4) | Élevée |
| 18 | Lien privé non indexé, code, QR | Absent-couche | `noindex`, tokens d'accès, expiration, rotation, génération de QR. Aucun routeur = aucune URL à protéger | Moyenne |
| 19 | Multilingue | Absent-couche | 184 chaînes codées en dur à extraire, gestion des dates/noms/adresses, versions indexables | Moyenne |
| 20 | Page contenu 6 étapes | Absent-couche | Moteur éditorial + sitemap + balises. À faire dans la surface de §1, pas dans l'app WebGL | Faible |
| 21 | FAQ à recherche libre | **Présent en pattern** | `searchEntitiesPage` + recherche plein texte + « le saviez-vous » (`savoir.js`) : le *moteur de recherche sur corpus court* existe. Il faut un corpus et une base | Faible → Moyenne |
| 22 | Transparence sur l'engagement | **Présent — et c'est la vraie signature de RELIA** | Rien à construire : c'est exactement l'ADN du projet (« dire ce qui est documenté, et ce qui ne l'est pas ») | Faible |

**Bilan chiffré : 2 adaptables · 3 partiellement présentes ou réutilisables comme pattern · 17 à créer de zéro, dont 8 classées « élevée/très élevée ».**

---

## 4. Les six murs structurels (et pourquoi le design ne les franchit pas)

### 4.1 Il n'y a pas de serveur — et pas d'endroit où le mettre
Le dépôt est un statique Vite déployable sur Vercel (`vercel.json` : `dist`, aucune fonction). Chaque fonction transactionnelle du site cible suppose un état durable et autoritaire : dispo d'une date, ligne de devis, statut de signature, paiement encaissé, réponse RSVP. **Aucune de ces couches n'est absente « pour l'instant » : elle est hors du paradigme du projet** — un client qui interroge des APIs publiques à la demande.

### 4.2 Pas de routeur, donc pas de pages
12 vues, une seule pile en mémoire, zéro état dans l'URL. Conséquence directe : il est **structurellement impossible** de produire « un lien de devis à votre nom », « un lien privé de mini-site », « un lien de suivi des réponses » — les trois piliers du site cible. Corriger cela n'est pas cosmétique : c'est réécrire la navigation, l'accessibilité de parcours, le retour arrière, et le modèle d'état de `app.js` (2 194 lignes).

### 4.3 Une app plein écran ≠ un site indexable
Le SEO n'est pas un réglage ici : la page est un shell `overflow:hidden` avec un canvas. Or un prestataire de mariage vit de « saxophoniste mariage Hauts-de-France ». Passer de « outil d'exploration » à « site qui capte une intention de recherche » demande un rendu serveur/pré-rendu, un sitemap, des données structurées — une **surface éditoriale séparée** de l'app. C'est un second produit, pas une feature.

### 4.4 Des données personnelles, y compris sensibles
Aujourd'hui RELIA ne traite **aucune** donnée personnelle. Un produit mariage traite : identité et coordonnées de tiers **qui ne sont pas vos clients** (les invités), nombre d'accompagnants, **allergies** (données qui peuvent révéler un état de santé), et un historique de paiement. Cela impose au minimum : base légale par finalité, information des invités par les mariés, DPA avec l'hébergeur, registre des traitements, durées de conservation et suppression (le site cible répond déjà à la question « que devient le mini-site après le mariage »), chiffrement, journalisation. C'est **un chantier juridique et produit**, pas une bibliothèque npm.

### 4.5 « Signer du doigt » ≠ signature à valeur probante
Le site cible propose une signature au doigt ou à la souris sans compte. C'est une **signature électronique simple** (eIDAS niveau ESL) : parfaite pour fluidifier, faible en force probante seule. Les acteurs français du créneau vendent au contraire le niveau avancé avec vérification d'identité, horodatage qualifié, intégrité du PDF et *audit trail*, et l'affichent explicitement comme indispensable (« un contrat signé via WhatsApp n'a aucune valeur juridique en cas de litige »). Reproduire le geste est trivial ; **reproduire la preuve ne l'est pas**, et c'est là que se trouve la valeur commerciale pour le prestataire.

### 4.6 Multi-tenant : le saut conceptuel le plus lourd
Le site cible reste un outil **mono-prestataire** (un seul Matthieu, un seul catalogue). Une « application pour le mariage » suppose N professionnels, N catalogues, N agendas, N branding, isolation stricte, quotas, onboarding, support, sauvegardes, modération. Passer de `state` global + chaînes codées en dur à un modèle multi-tenant est la transformation la plus profonde du dépôt — plus lourde que toutes les fonctionnalités listées au §2 réunies.

---

## 5. Le seul endroit où l'idée devient réellement innovante

Oublier « faire comme base44 » : sur ce terrain, la partie est déjà jouée.

**Côté prestataires français**, le devis-signature-acompte-relance-fiche événement est une catégorie mature : WeddingPlan (interface photographe + interface des mariés, signature Yousign, agenda connecté, liste invités, allergies, playlist, programme du jour J, rétro-planning, trombinoscope, 30–40 €/mois) [2](https://www.weddingplan.fr/fr/le-logiciel-pour-les-photographes-et-videastes) [3](https://coach.weddymonmariage.com/fr/logiciel-pour-les-prestataires-de-mariage), EventSuite pour les DJ (devis → signature eIDAS → acompte Stripe → Factur-X) [1](https://eventsuite.fr/blog/logiciel-dj-mariage/), Noxio (eIDAS + acompte automatique + conversion en facture) [5](https://noxio.fr/devis/). **Côté couples**, Zola / The Knot / WeddingWire / Joy offrent gratuitement site + liste + RSVP + registre [1](https://www.zola.com/expert-advice/best-free-wedding-planning-websites) [4](https://www.nathantailors.com/en/blog/zola-vs-the-knot-vs-weddingwire-2026), et des spécialistes comme RSVPify ou Invyt couvrent le multi-événement [5](https://www.theprivateweddingapp.com/blog/best-wedding-guest-list-rsvp-tracker-apps-2026).

Ce que **personne** ne fait bien, et que l'audit concurrentiel des acteurs en place signale comme leur limite : **l'arbitrage relationnel du plan de table**. Le plan de table de Zola est verrouillé dans l'app iOS (achat in-app au-delà de 15 invités), celui de The Knot est un *drag-and-drop* basique, Joy n'en a pas, RSVPify le paywallise — et « le dernier mois, on finit dans un tableur pour le traiteur et le lieu » [5](https://www.theprivateweddingapp.com/blog/best-wedding-guest-list-rsvp-tracker-apps-2026). Or **c'est un problème de graphe**. Et un moteur de graphe, vous en avez déjà un, testé, avec 74 tests qui passent.

### Le pivot crédible : « RELIA Wedding Graph » — relier les gens entre eux, pas vendre des devis

| Capacité déjà implémentée dans RELIA | Son équivalent mariage, aucun concurrent ne le fait |
| --- | --- |
| Recherche d'identité et désambiguïsation (`data.js`, `wbsearchentities`, choix explicite du Q) | Retrouver l'invité exact parmi 3 « Sophie », le rapprocher par famille/branch (côté mariée / côté marié), éviter le doublon traiteur |
| Chemin le plus court entre deux personnes, affiché **étape par étape** | « Pourquoi Denise et Paul ne peuvent pas être à la même table » — et surtout **le chemin qui prouve qu'il faut les séparer** : ex-conjoint·e·s, frères et sœurs brouillés, un seul siège entre deux invités qui ne se connaissent pas |
| Séparation assertion référencée / hypothèse / donnée ancienne, et **résultat nul expliqué** | Le cœur du produit : un plan de table qui **dit ses certitudes**. « Contrainte non déclarée par l'hôte = hypothèse, elle ne bloque pas la table, elle est posée comme question. » C'est exactement la discipline de `discovery.js` appliquée à un usage grand public |
| Instantanés A/B, empreintes déterministes, registre, export JSON | Versionnage du plan de table et du programme : « qu'est-ce qui a changé depuis la dernière fois, qui l'a changé, avec quelle source ? » — et un PDF de plan **reproductible** pour le traiteur |
| Filtre par période, frise, narration « story » auto-play avec synthèse vocale | Le déroulé du jour J **joué** minute par minute sur le téléphone — le vrai « mode hors-réseau, on suit le programme », déjà à 80 % écrit |
| Mode liste accessible quand WebGL est indisponible | L'accessibilité n'est pas une case ici : les mariés incluent grand-parents, enfants, invités en situation de handicap. Ce garde-fou vaut un argument de vente |
| Graphe 3D avec types colorés, `prefers-reduced-motion`, texte large, thème sombre | La démonstration visuelle : une sphère de 140 prénoms qui s'agrège en tables. **C'est l'effet « waouh » que les 5 concurrents ci-dessus n'ont pas, et c'est déjà codé** |

Coût de ce pivot : on **garde** le moteur (`data.js`/`graph.js`/`discovery.js`/`timeline.js`/`narration.js`), on **remplace le fournisseur de données** (Wikidata → le fichier des invités + les déclarations des mariés), et on **ajoute** seulement le strict nécessaire : persistance du projet, édition, export PDF/tableur. Pas de paiement, pas d'eIDAS, pas de multi-tenant au premier jour.

Le site base44, dans ce scénario, n'est plus un modèle à imiter : il devient **le premier client et le premier cas d'usage** — un prestataire qui envoie à chaque couple un lien pour que *les couples eux-mêmes* résolvent le plan de table, ce qui **réduit son propre travail** au lieu d'ajouter un CRM à un CRM déjà saturé.

---

## 6. Ce qui est directement transférable (la vraie réponse à « sa simplicité graphique »)

Votre intuition est juste sur un point précis, et je le confirme en lisant le CSS : le système visuel de RELIA est **bon et portable**, indépendamment du domaine.

| Actif | Preuve dans le dépôt | Valeur pour un produit mariage |
| --- | --- | --- |
| Système de tokens | 40 variables dans `:root` + variante `data-theme="dark"` complète, couleurs sémantiques par type d'entité (7 `--t-*`) | Haute : changer de marque = changer 40 lignes, pas refaire 1 016 |
| Feuille inférieure à 3 positions | `sheet.js` (32 lignes) + `clampHeight/nextSnap/settleSnap/snapTargets`, 3 `snaps` peek/half/full, glisser via `#grabber` | Haute : c'est l'ergonomie mobile qui manque à la plupart des outils mariage |
| Colonne latérale ≥ 900 px | 3 media queries dédiées | Moyenne : répond au vrai usage (le couple planifie sur ordinateur, l'invité consulte sur téléphone) |
| Lisibilité imposée par le système | `--ts` texte large persisté, `prefers-reduced-motion` honoré, focus visible 3 px, ARIA, `sr-only`, `aria-live` | Haute — et rare sur ce marché |
| Vocabulaire visuel de la preuve | `evidence-badge`, `badge warn`, `role-badge`, note de provenance, résultat nul raconté | **Très haute** : c'est le différentiateur §5 |
| Icônes | 71 lignes, jeu inline | Haute |
| Narration + audio | `narration.js` (SoundEngine, VoiceNarrator), découpage du texte lu testé | Moyenne → utile pour le mode piéton/conduite du déroulé |
| Graphe 3D | `graph.js`, 517 lignes, labels DOM projetés, budgets anti-densité | Haute pour la démo, à surveiller en coût (cf. §7) |

Ce qui **ne transfère pas** : la promesse (« tout est relié » appliqué à des proches devient une question de vie privée, pas un argument), les plafonds calibrés pour de l'exploration encyclopédique, et l'absence totale des couches §4.

---

## 7. Risques que l'enthousiasme a tendance à effacer

1. **Confusion des produits.** Le dépôt contient trois documents de vision (V4, Innovation Lab, V5, ~130 000 caractères) qui tracent une trajectoire cohérente vers l'exploration documentaire sourcée. Un pivot mariage n'est pas une itération de cette trajectoire, c'est **un autre projet**. L'Innovation Lab le dit déjà textuellement pour un domaine voisin : *« Famille et personnes vivantes hors périmètre → traiter comme un produit séparé, fondé sur des sources légitimes et consenties, protections des personnes vivantes, règles de conservation et contrôle strict. »* C'est la phrase la plus juste du dossier sur ce sujet, et elle vise exactement le cas marriage.
2. **Poids de la 3D sur un usage quotidien.** 179 kB gzip pour le JS, un seul chunk, et une scène qui dessine une étiquette par nœud sans budget anti-chevauchement dépendant du zoom (§ V4). Sur un plan de table de 150 invités ouverts 40 fois par un couple stressé, la constellation doit être un moment, pas l'interface. Le mode liste accessible est déjà là : il mérite de devenir le défaut.
3. **Le piège du « et si on faisait tout ».** Le site cible résulte forcément d'un long tri. Un premier produit qui prétend couvrir ses 22 fonctions, face à cinq acteurs installés dont plusieurs sont gratuits, se fera juger sur la profondeur, pas sur la largeur.
4. **Coût de la donnée personnelle.** Le risque réputationnel d'une fuite de liste d'invités avec allergies, pour un produit sans notoriété, est asymétrique : le bénéfice est un abonnement, le préjudice est la fin de l'activité. À chiffrer **avant** d'écrire la première ligne, pas après.
5. **Rentabilité du SaaS mono-métier.** Les prix de référence français observés sont 30–40 €/mois (WeddingPlan), avec 50 signatures/an incluses. Cela fixe le revenu maximal par client et donc le volume nécessaire pour couvrir hébergement, support, conformité et paiements. À modéliser avant de coder.
6. **Droits et licences des images.** Le site cible héberge ses propres visuels ; `videos.js` et les portraits de RELIA dépendent de licences tierces. Le V5 documente déjà la règle : un média n'est pas une preuve, et une API publique n'accorde pas le droit d'aspirer/republier. Un produit qui fait entrer les photos des clients chez vous change ce risque d'échelle.

---

## 8. Trois options, avec ce que chacune coûte vraiment

| | A. Garder RELIA, **vendre le design system** | B. **Parité avec le site base44** (le pivot demandé) | C. **Relier les invités** (le seul vrai angle mort du marché) |
| --- | --- | --- | --- |
| Principe | RELIA reste le produit culturel ; le moteur de graphe et la feuille UI servent de socle à une vitrine pour un pro du mariage | Reconstruire vitrine + formulaire + devis PDF + signature + acompte + agenda + mini-site + RSVP + export + i18n | Un produit : on saisit les invités et leurs relations, le moteur trouve les chemins, contraintes et conflits, on exporte plan + programme |
| Réutilise du code existant | ~1 100 lignes (CSS + `sheet.js` + `icons.js`) | ~400 lignes effectives (patterns), tout le reste est nouveau | `data.js`, `graph.js`, `discovery.js`, `timeline.js`, `narration.js`, le CSS : **la majeure partie du cœur** |
| Nouvelles couches | une surface éditoriale statique | **6** (base, auth/rôles, facturation/paiement, documents, i18n/SEO, hors-ligne) + multi-tenant | 2 (persistance du projet, édition collaborative) |
| Ordre de grandeur | jours | **plusieurs mois d'ingénierie + comptabilité + juridique + support**, et un produit qui arrive après cinq concurrents installés, dont deux gratuits | prototype à **quelques semaines**, avec un test de valeur net : « le graphe a-t-il trouvé un conflit que le tableur avait maniqué ? » |
| Avantage concurrentiel | design, non défendable | aucun (parité ≠ avantage) | **fort** : le seul acteur du panel avec un vrai moteur de relations, un récit de la preuve, et une UI sobre |
| Risque principal | effort dispersé | épuisement, conformité, guerre des prix | marché plus étroit, à valider avant de bâtir |

---

## 9. Recommandation

1. **Ne pas faire la parité base44.** Ce n'est pas une limite de RELIA, c'est un mauvais combat : le périmètre est déjà industrialisé en France, et chaque brique de ce périmètre (paiement, eIDAS, agenda anti double-réservation, RGPD invités) est précisément l'anti-RELIA — de l'écrit, du conservé, du garanti, là où RELIA excelle dans le consulté, l'explicite et le borné.
2. **Garder l'ambition, changer d'angle d'attaque.** La valeur n°1 transférable n'est ni le graphe 3D ni la beauté sobre : c'est **la discipline de l'honnêteté** (source de chaque lien, résultat nul expliqué, plafond affiché, hypothèse exclue des chemins). Appliquée au mariage, cela donne un produit qui dit *ce qu'il sait, comment il le sait, et où il faut demander* — à des couples qui prennent 200 décisions avec 30 % d'information. Aucun concurrent du panel ne fait cela.
3. **Valider le §5 avant une ligne de code** : une demi-journée avec deux wedding planners et un prestataire (le saxophoniste du site cible est le candidat idéal, il a déjà construit l'outil) pour vérifier que le plan de table sous contrainte est un problème assez douloureux pour être payé.
4. **Décision de gouvernance** : RELIA-mariage doit être **un dépôt séparé**, pas une branche de RELIA. Le texte de l'Innovation Lab sur les personnes vivantes l'exige, et le code de production (propriétés Wikidata codées en dur, plafond à 100 entités, marques en dur) s'y prêterait mal de toute façon. Le partage se fait par **copie du design system** (40 tokens, 184 classes, la feuille à 3 positions, les badges de preuve), ce qui est propre, et par une éventuelle extraction future en paquet, ce qui ne l'est pas encore.

### Ce que je peux livrer immédiatement, au choix
- **A.** Un prototype `plan-de-table` sur le moteur existant : saisir 12 invités + 6 relations, laisser `findRemotePath` et `discovery.js` trouver les conflits, restituer la scène 3D et le mode liste, avec le récit de la preuve. Faisable dans ce dépôt, sans dépendance nouvelle.
- **B.** Un fichier de **modèle de données mariage** (`data.js`-compatible : entités invitées, types de relation, preuve, contraintes), qui sert de pont entre les deux mondes et de cahier des charges au dépôt séparé.
- **C.** Une étude chiffrée du marché (WeddingPlan, EventSuite, Noxio, Zola, Joy, Invyt, RSVPify : prix, périmètre, lacunes) pour trancher « on entre où ? ».
- **D.** Rien de tout cela : on oublie le mariage, et on reprend la V5 (recherche universelle + connecteurs), qui est la trajectoire pour laquelle le code est fait.

---

## Sources consultées pour cet audit

- Dépôt `mattmezsax.base44.app` : page d'accueil (vitrine, formules, galerie, formulaire, assistant, vérification de date) et `/comment-ca-se-passe` (6 étapes, FAQ, mini-site, RSVP, signature, acompte, export Excel, langues)
- `RELIA_PRODUCT_VISION.md` (V4, 8 oct. 2026), `RELIA_INNOVATION_LAB.md`, `RELIA_V5_DOCUMENTARY_EXPERIENCE.md`, `PHASE2_REPORT.md`, `PHASE3_REPORT.md`
- [Zola — Best Free Wedding Planning Websites (17 avr. 2026)](https://www.zola.com/expert-advice/best-free-wedding-planning-websites)
- [The Private Wedding App — 5 best guest list & RSVP trackers 2026 (27 juil. 2026)](https://www.theprivateweddingapp.com/blog/best-wedding-guest-list-rsvp-tracker-apps-2026)
- [Invyt — Best Wedding Planning Apps 2026 (18 juin 2026)](https://www.invyt.app/blog/top-wedding-planning-apps)
- [Zola vs The Knot vs WeddingWire 2026 (27 févr. 2026)](https://www.nathantailors.com/en/blog/zola-vs-the-knot-vs-weddingwire-2026)
- [WeddingPlan — logiciel photographes & vidéastes](https://www.weddingplan.fr/fr/le-logiciel-pour-les-photographes-et-videastes) · [WeddingPlan — aperçu prestataires](https://coach.weddymonmariage.com/fr/logiciel-pour-les-prestataires-de-mariage)
- [EventSuite — Logiciel DJ mariage 2026 (18 août 2026)](https://eventsuite.fr/blog/logiciel-dj-mariage/)
- [Noxio — devis prestataires événementiels, eIDAS & acompte](https://noxio.fr/devis/)

*Ces sources sont des pages marketing ou des comparatifs éditoriaux : elles servent ici à établir l'existence et le périmètre des offres, pas à garantir leurs prix ni leurs promesses. Les chiffres de bundle, lignes, tests et tokens ont été mesurés dans ce dépôt le 8 octobre 2026.*
