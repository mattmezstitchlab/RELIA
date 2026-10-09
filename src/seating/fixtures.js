// Jeu de démonstration du prototype : un mariage de 30 personnes dans les Hauts-de-France.
// Les personnes sont fictives (aucun invitée réelle), mais la structure des données est celle
// d’un cas réel : chaque relation porte qui l’a déclarée et, quand elle est exploitable, la
// trace consultable qui la soutient. Trois cas sont plantés exprès pour tester la thèse du
// prototype : une contrainte induite invisible dans une liste, une contradiction à trancher,
// et des bruits non confirmés qui ne doivent rien imposer.

export const DEMO_SOURCES = {
  's-mariee': { label: 'Camille — formulaire du 28/09/2026', reliable: true },
  's-marie': { label: 'Nathan — message du 30/09/2026', reliable: true },
  's-planner': { label: 'Emma, wedding planner — appel du 02/10/2026', reliable: true },
  's-papa': { label: 'Marc Verhaeghe — courriel du 05/10/2026', reliable: true },
  's-temoin': { label: 'Propos rapportés par une témoin', reliable: false },
};

const ref = (sourceId, document, note = null) => ({ sourceId, documents: [document], urls: [], note, hash: document });

export const DEMO_GUESTS = [
  { id: 'camille', label: 'Camille Verhaeghe', side: 'mariee', role: 'la mariée', sourceIds: ['s-mariee'] },
  { id: 'nathan', label: 'Nathan Deschryver', side: 'marie', role: 'le marié', sourceIds: ['s-marie'] },

  { id: 'sophie', label: 'Sophie Verhaeghe', side: 'mariee', role: 'mère de la mariée', household: 'verhaeghe', sourceIds: ['s-mariee'] },
  { id: 'marc', label: 'Marc Verhaeghe', side: 'mariee', role: 'père de la mariée', household: 'verhaeghe', sourceIds: ['s-mariee'] },
  { id: 'elodie', label: 'Élodie Verhaeghe', side: 'mariee', role: 'sœur de la mariée', sourceIds: ['s-mariee'] },
  { id: 'leo', label: 'Léo Verhaeghe', side: 'mariee', role: '8 ans, fils d’Élodie', household: 'elodie-leo', diet: { note: 'sans porc', sensitive: false }, sourceIds: ['s-mariee'] },
  { id: 'ghislaine', label: 'Ghislaine Verhaeghe', side: 'mariee', role: 'tante (sœur de Marc)', sourceIds: ['s-papa'] },
  { id: 'jacky', label: 'Jacky Verhaeghe', side: 'mariee', role: 'oncle, mari de Ghislaine', household: 'ghislaine-jacky', sourceIds: ['s-papa'] },
  { id: 'brigitte', label: 'Brigitte Lemaire', side: 'mariee', role: 'belle-sœur de Marc', sourceIds: ['s-papa'] },
  { id: 'jeanne', label: 'Jeanne Dupont', side: 'mariee', role: 'sœur de Sophie', sourceIds: ['s-mariee'] },
  { id: 'raymonde', label: 'Raymonde Dupont', side: 'mariee', role: 'grand-mère maternelle', diet: { note: 'sans sel ajouté, se lève difficilement', sensitive: true }, notes: 'Table la plus proche de la sortie.', sourceIds: ['s-mariee'] },
  { id: 'yanick', label: 'Yannick Devries', side: 'mariee', role: 'cousin de la mariée', sourceIds: ['s-mariee'] },
  { id: 'lucie', label: 'Lucie Fontaine', side: 'mariee', role: 'témoin de la mariée', sourceIds: ['s-mariee'] },
  { id: 'sylvie', label: 'Sylvie Nguyen', side: 'mariee', role: 'cousine, vient seule', sourceIds: ['s-mariee'] },

  { id: 'aicha', label: 'Aïcha Deschryver', side: 'marie', role: 'mère du marié', household: 'dechryver', diet: { note: 'végétarienne', sensitive: false }, sourceIds: ['s-marie'] },
  { id: 'alain', label: 'Alain Deschryver', side: 'marie', role: 'père du marié', household: 'dechryver', sourceIds: ['s-marie'] },
  { id: 'ines', label: 'Inès Deschryver', side: 'marie', role: 'sœur du marié', sourceIds: ['s-marie'] },
  { id: 'theo', label: 'Théo Deschryver', side: 'marie', role: 'cousin du marié', sourceIds: ['s-planner'] },
  { id: 'bruno', label: 'Bruno Deschryver', side: 'marie', role: 'frère du marié', household: 'bruno-karine', sourceIds: ['s-marie'] },
  { id: 'karine', label: 'Karine Bertin', side: 'marie', role: 'compagne de Bruno', household: 'bruno-karine', sourceIds: ['s-marie'] },
  { id: 'nadia', label: 'Nadia Perrette', side: 'marie', role: 'ex-compagne de Bruno', sourceIds: ['s-planner'] },
  { id: 'karim', label: 'Karim Boulanger', side: 'marie', role: 'ami d’enfance du marié', sourceIds: ['s-marie'] },
  { id: 'thierry', label: 'Thierry Lefebvre', side: 'marie', role: 'voisin de toujours de la famille', sourceIds: ['s-marie'] },

  { id: 'cedric', label: 'Cédric Rivoire', side: 'commun', role: 'collègue, vient avec Sandra', household: 'cedric-sandra', sourceIds: ['s-mariee'] },
  { id: 'sandra', label: 'Sandra Rivoire', side: 'commun', role: 'épouse de Cédric', household: 'cedric-sandra', sourceIds: ['s-mariee'] },
  { id: 'paul', label: 'Paul Fontaine', side: 'commun', role: 'frère de Lucie', household: 'lucie-paul', sourceIds: ['s-mariee'] },

  { id: 'sarah', label: 'Sarah Malfilâtre', side: 'commun', role: 'témoin du marié', sourceIds: ['s-marie'] },
  { id: 'malik', label: 'Malik Zarour', side: 'commun', role: 'collègue de bureau', diet: { note: 'végétarien', sensitive: false }, sourceIds: ['s-mariee'] },
  { id: 'annesophie', label: 'Anne-Sophie Carnel', side: 'commun', role: 'collègue de bureau', sourceIds: ['s-mariee'] },
  { id: 'fanny', label: 'Fanny Wable', side: 'commun', role: 'amie, vient seule', diet: { note: 'allergie à l’arachide', sensitive: true }, sourceIds: ['s-temoin'] },

  { id: 'matthieu', label: 'Matthieu (saxophone)', side: 'prestataire', role: 'musicien, joue le cocktail', service: true, sourceIds: ['s-planner'] },
  { id: 'emma', label: 'Emma (wedding planner)', side: 'prestataire', role: 'coordination du jour J', service: true, sourceIds: ['s-planner'] },
];

export const DEMO_RELATIONS = [
  // --- Les mariés et leurs familles : regroupements forts -------------------------------
  { id: 'r1', from: 'camille', to: 'nathan', kind: 'couple', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-1')] },
  { id: 'r2', from: 'sophie', to: 'marc', kind: 'couple', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-4')] },
  { id: 'r3', from: 'aicha', to: 'alain', kind: 'couple', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-2')] },
  { id: 'r4', from: 'elodie', to: 'leo', kind: 'foyer', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-6')] },
  { id: 'r5', from: 'ghislaine', to: 'jacky', kind: 'foyer', declaredBy: 's-papa', references: [ref('s-papa', 'mail-2026-10-05#1')] },
  { id: 'r6', from: 'cedric', to: 'sandra', kind: 'couple', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-19')] },
  { id: 'r7', from: 'bruno', to: 'karine', kind: 'couple', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-7')] },

  { id: 'r10', from: 'camille', to: 'sophie', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-2')] },
  { id: 'r11', from: 'camille', to: 'marc', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-2')] },
  { id: 'r12', from: 'elodie', to: 'sophie', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-5')] },
  { id: 'r13', from: 'elodie', to: 'marc', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-5')] },
  { id: 'r14', from: 'ghislaine', to: 'marc', kind: 'famille', declaredBy: 's-papa', references: [ref('s-papa', 'mail-2026-10-05#2')] },
  { id: 'r15', from: 'jeanne', to: 'sophie', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-8')] },
  { id: 'r16', from: 'raymonde', to: 'jeanne', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-9')] },
  { id: 'r17', from: 'raymonde', to: 'sophie', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-9')] },
  { id: 'r18', from: 'ines', to: 'nathan', kind: 'famille', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-3')] },
  { id: 'r19', from: 'bruno', to: 'nathan', kind: 'famille', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-4')] },
  { id: 'r20', from: 'theo', to: 'alain', kind: 'famille', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-6')] },
  { id: 'r21', from: 'aicha', to: 'ines', kind: 'famille', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-5')] },
  { id: 'r22', from: 'paul', to: 'lucie', kind: 'famille', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-12')] },

  // --- Contraintes de séparation exploitables -------------------------------------------
  { id: 'r30', from: 'brigitte', to: 'ghislaine', kind: 'conflit', declaredBy: 's-papa', note: 'Brouille familiale ancienne, jamais réglée.', references: [ref('s-papa', 'mail-2026-10-05#3', 'Le père de la mariée l’écrit noir sur blanc.')] },
  { id: 'r31', from: 'bruno', to: 'nadia', kind: 'rupture', declaredBy: 's-planner', note: 'Séparation il y a six semaines, garde alternée en cours.', references: [ref('s-planner', 'call-2026-10-02#7')] },
  { id: 'r32', from: 'theo', to: 'karim', kind: 'conflit', declaredBy: 's-planner', references: [ref('s-planner', 'call-2026-10-02#8')] },

  // --- Contradiction plantée : même foyer, conflit déclaré -------------------------------
  { id: 'r33', from: 'cedric', to: 'sandra', kind: 'conflit', declaredBy: 's-planner', note: 'Procédure en cours ; le planner signale qu’ils ne veulent pas être côte à côte.', references: [ref('s-planner', 'call-2026-10-02#11')] },

  // --- Une information marquée ancienne, donc non bloquante ------------------------------
  { id: 'r34', from: 'jacky', to: 'bruno', kind: 'conflit', rank: 'deprecated', declaredBy: 's-temoin', note: 'Conflit d’affaires réglé au tribunal en 2024, d’après la mariée.', references: [ref('s-temoin', 'ouie-2026#3')] },

  // --- Bruits non confirmés : jamais une contrainte, toujours une question ----------------
  { id: 'r40', from: 'alain', to: 'thierry', kind: 'ondit', declaredBy: 's-temoin', note: 'Il paraît qu’ils ne se parlent plus depuis un litige de haie.', references: [] },
  { id: 'r41', from: 'yanick', to: 'camille', kind: 'ondit', declaredBy: 's-temoin', note: 'Un cousin qu’on dit fâché, sans que personne ne l’affirme.', references: [] },
  { id: 'r42', from: 'fanny', to: 'sarah', kind: 'ondit', declaredBy: 's-temoin', note: 'Une vieille histoire de garçon d’honneur, rapportée de seconde main.', references: [] },

  // --- Affinités et tensions -------------------------------------------------------------
  { id: 'r50', from: 'camille', to: 'lucie', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-13')] },
  { id: 'r51', from: 'lucie', to: 'sarah', kind: 'affinite', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-9')] },
  { id: 'r52', from: 'lucie', to: 'malik', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-14')] },
  { id: 'r53', from: 'malik', to: 'annesophie', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-15')] },
  { id: 'r54', from: 'sarah', to: 'annesophie', kind: 'affinite', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-10')] },
  { id: 'r55', from: 'karim', to: 'nathan', kind: 'affinite', declaredBy: 's-marie', references: [ref('s-marie', 'msg-2026-09-30#line-11')] },
  { id: 'r56', from: 'fanny', to: 'sylvie', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-21')] },
  { id: 'r57', from: 'jeanne', to: 'raymonde', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-9')] },
  { id: 'r58', from: 'sylvie', to: 'camille', kind: 'affinite', declaredBy: 's-mariee', references: [ref('s-mariee', 'form-2026-09-28#line-20')] },
  { id: 'r60', from: 'nadia', to: 'ines', kind: 'tension', declaredBy: 's-planner', references: [ref('s-planner', 'call-2026-10-02#12')] },
  { id: 'r61', from: 'brigitte', to: 'jeanne', kind: 'tension', declaredBy: 's-papa', references: [ref('s-papa', 'mail-2026-10-05#4')] },
  { id: 'r62', from: 'theo', to: 'karine', kind: 'tension', declaredBy: 's-planner', references: [ref('s-planner', 'call-2026-10-02#13')] },
];

export const DEMO_META = {
  event: { title: 'Camille & Nathan', date: '2026-07-04', venue: 'Ferme du Waterloy, Pevele', guests: 30, targetSize: 8 },
  limitations: [
    'Les invités de démonstration sont fictifs : le jeu de données sert à éprouver le moteur, pas à décrire de vraies personnes.',
  ],
};
