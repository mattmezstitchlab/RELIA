// Montage éditorial pilote. Seuls des IDs réellement présents dans le catalogue sont retenus.
// Pas de copie de catalogue, pas de détection automatique de chanson à partir d’un titre.
// Les empreintes suspendent les relectures lorsque les métadonnées changent.
import { unknownClaim } from './model.js';

const REVIEWED_AT = '2026-10-10T18:27:04Z';
const REVIEWER = 'RELIA · relecture éditoriale du prototype';
const RIGHTS = 'Notice consultable chez l’éditeur. Crédits et résumé original uniquement ; aucune parole, partition ou piste audio reproduite.';

export const MUSICAL_SOURCES = Object.freeze([
  {
    id: 'music:shallow:hal-leonard', kind: 'licensed_music',
    label: 'Hal Leonard · Shallow · notice 07013434',
    url: 'https://www.halleonard.com/product/7013434/shallow-from-a-star-is-born',
    checkedAt: REVIEWED_AT, access: 'page', rights: RIGHTS,
    note: 'Notice de l’éditeur : enregistrement par Lady Gaga et Bradley Cooper ; compositeurs Stefani Germanotta, Anthony Rossomando, Andrew Wyatt et Mark Ronson. L’arrangeur de cette partition n’est pas crédité comme auteur de l’œuvre.',
  },
  {
    id: 'music:flowers:alfred', kind: 'licensed_music',
    label: 'Alfred Music · Flowers · notice 00-50748',
    url: 'https://www.alfred.com/products/flowers-00-50748',
    checkedAt: REVIEWED_AT, access: 'page', rights: RIGHTS,
    note: 'Notice de l’éditeur : interprétation Miley Cyrus ; paroles et musique Michael Pollack, Gregory Aldae Hein et Miley Cyrus. Le commentaire présente un message d’autonomie. Aucun rapprochement avec la vie privée de Matt Mez Sax.',
  },
  {
    id: 'music:raise:secret-garden', kind: 'official_artist',
    label: 'Secret Garden · Our story',
    url: 'https://www.secretgarden.no/ourstory',
    checkedAt: REVIEWED_AT, access: 'page', rights: RIGHTS,
    note: 'Le site officiel attribue You Raise Me Up au répertoire de Secret Garden et distingue les interprétations ultérieures de Josh Groban et d’autres artistes. Josh Groban n’est pas présenté comme le créateur de l’œuvre.',
  },
  {
    id: 'music:raise:hal-leonard', kind: 'licensed_music',
    label: 'Hal Leonard · You Raise Me Up · notice 08744081',
    url: 'https://www.halleonard.com/product/8744081/you-raise-me-up',
    checkedAt: REVIEWED_AT, access: 'page', rights: RIGHTS,
    note: 'Notice de l’éditeur : auteurs crédités Brendan Graham et Rolf Lovland ; interprétation de référence Josh Groban ; présentation du morceau comme un message d’espoir et d’encouragement. Résumé, pas citation des paroles.',
  },
  {
    id: 'music:photograph:hal-leonard', kind: 'licensed_music',
    label: 'Hal Leonard · Photograph · notice 01206361 / 01070960',
    url: 'https://www.halleonard.com/product/1206361/photograph-arr-cristi-cary-miller',
    checkedAt: REVIEWED_AT, access: 'page', rights: RIGHTS,
    note: 'Notice et crédits de l’éditeur : Ed Sheeran, Johnny McDaid, Martin Peter Harrington et Tom Leonard. La présentation situe la chanson dans un amour à distance. Les quatre noms de la notice actuelle sont conservés, pas seulement les deux fréquemment cités.',
  },
]);

function confirmed(value, sourceIds, note, confidence = 'high') {
  return { value, status: 'confirmed', confidence, sourceIds, note, reviewedBy: REVIEWER, reviewedAt: REVIEWED_AT };
}
function hypothesis(value, sourceIds, note) {
  return { value, status: 'hypothesis', confidence: 'low', sourceIds, note, reviewedBy: REVIEWER, reviewedAt: REVIEWED_AT };
}
function cover(id, song) {
  const source = [`catalog:${id}`];
  return {
    song: confirmed(song, source, 'Morceau explicitement nommé dans un titre portant la mention Cover ; identification déclarée par la chaîne.'),
    classification: confirmed('cover', source, 'La mention Cover du titre confirme une reprise déclarée, pas une analyse automatique du son.'),
  };
}
function shallow(id) {
  return {
    ...cover(id, 'Shallow'),
    originalArtist: confirmed('Lady Gaga · Bradley Cooper', ['music:shallow:hal-leonard'], 'Interprètes de l’enregistrement de l’œuvre indiqués par l’éditeur.'),
    writers: confirmed('Stefani Germanotta · Anthony Rossomando · Andrew Wyatt · Mark Ronson', ['music:shallow:hal-leonard'], 'Liste de compositeurs de la notice, sans l’arrangeur Rick Stitzel.'),
  };
}

function sequence(id, fingerprint, selectionReason, text, transition, claims = {}, { sources = [], themeTags = [], catalogBindings = {} } = {}) {
  const allClaims = Object.fromEntries(['song', 'originalArtist', 'versionArtist', 'writers', 'classification', 'theme', 'eventDate', 'memory'].map(key => [key, claims[key] || unknownClaim()]));
  const confirmedClaims = Object.entries(allClaims).filter(([, claim]) => claim.status === 'confirmed');
  return [id, {
    selected: true, selectionReason, reviewFingerprint: fingerprint, claims: allClaims, themeTags,
    excerpt: { startSeconds: 0, durationSeconds: 20 },
    narration: {
      text, transition, status: 'reviewed', catalogFingerprint: fingerprint,
      sourceIds: [...new Set([`catalog:${id}`, ...confirmedClaims.flatMap(([, claim]) => claim.sourceIds), ...sources])],
      claimBindings: Object.fromEntries(confirmedClaims.map(([key, claim]) => [key, claim.value])),
      catalogBindings: { [id]: fingerprint, ...catalogBindings },
    },
  }];
}

export const MATT_MEZ_DOCUMENTARY = Object.freeze({
  schemaVersion: 1,
  identityId: 'relia:person:matt-mez-sax',
  title: 'Raconter une vie en musique',
  from: 2006, to: 2026,
  sources: MUSICAL_SOURCES,
  chapters: [
    { id: 'traces', from: 2006, to: 2012, title: 'Les premières traces', subtitle: 'Commencer par ce qui est conservé.', note: 'Premières publications de ce catalogue, pas début de carrière. Une date de mise en ligne n’est jamais une date de tournage.' },
    { id: 'ellipse', from: 2013, to: 2018, title: 'L’ellipse et le partage', subtitle: 'Laisser une place à ce que l’archive ne dit pas.', note: 'Les années sans publication recensée restent des lacunes du catalogue, pas des années sans activité.' },
    { id: 'passerelles', from: 2019, to: 2021, title: 'Des chansons, des passerelles', subtitle: 'De l’œuvre à son interprétation.', note: 'Les titres documentent des déclarations de reprise et des noms d’interprètes, sans dater la naissance d’une collaboration.' },
    { id: 'dialogues', from: 2022, to: 2023, title: 'Les noms se répondent', subtitle: 'Un duo nommé, un titre qui revient, une idée d’autonomie.', note: 'Le rapprochement entre les séquences est un choix de montage. Les thèmes des chansons ne sont pas une biographie.' },
    { id: 'liens', from: 2024, to: 2025, title: 'La musique et le lien', subtitle: 'Encourager, garder une trace, laisser un souvenir.', note: 'Un titre mentionnant un EHPAD ne prouve ni une date de visite, ni un état de santé, ni un effet thérapeutique.' },
    { id: 'present', from: 2026, to: 2026, title: 'Un présent ouvert', subtitle: 'Une archive, et une histoire à poursuivre.', note: 'Le périmètre s’arrête en 2026. Pas de prédiction et pas de composition originale présumée.' },
  ],
  records: Object.fromEntries([
    sequence('XgKcenvjMdI', 'v1:80f9ddeb', 'La plus ancienne publication du catalogue : un point d’entrée vérifiable, pas un début de carrière.',
      'Avant de raconter, prenons le temps de regarder ce qui reste. Le 20 novembre 2006, une vidéo intitulée UPTOWN est publiée sur la chaîne aujourd’hui rattachée à Matt Mez Sax. C’est notre point d’entrée dans les archives, pas le début supposé d’une carrière. Un titre, une date de publication, une première porte à ouvrir.',
      'Une archive ne dit jamais tout. Elle nous donne un repère, puis nous invite à chercher ce qui peut lui répondre. Avançons, sans remplir les silences à sa place.'),
    sequence('YT9M8JSJqwY', 'v1:efbadc8b', 'Une trace de 2011 distinguant explicitement vidéo et musique dans son intitulé.',
      'En 2011, le titre de Slowly attribue la vidéo à Matt Mez et mentionne une musique de Candy Dulfer. Il rapproche déjà l’image et le son. Cela ne suffit pas à identifier le morceau, ni à confirmer une reprise. Pour notre récit, c’est une invitation : regarder comment une archive peut être accompagnée par la musique.',
      'Entre deux publications, il peut manquer des années. Nous gardons ces intervalles ouverts. Le récit se poursuit avec une archive dont le titre nomme cette fois un moment de partage.'),
    sequence('q9kVRm-ApXc', 'v1:aa4b3d0d', 'Un titre associant explicitement une reprise et une ouverture de bal, sans date d’événement.',
      'En 2018, une publication fait se rencontrer Helium et les mots « mariage, ouverture de bal ». La mention Cover Sax confirme une reprise déclarée. Nous ne connaissons pas la date de cette cérémonie. Le titre nous donne un cadre, mais le souvenir précis appartient encore aux personnes qui pourront le raconter.',
      'Une chanson peut accompagner un moment, puis trouver une autre place dans une autre interprétation. Ce sont ces passages que notre montage choisit de suivre.',
      { ...cover('q9kVRm-ApXc', 'Helium'), originalArtist: hypothesis('Sia', ['catalog:q9kVRm-ApXc'], 'Nom cité dans le titre ; crédits originaux non vérifiés auprès d’une source musicale pour ce prototype.') }),
    sequence('-mTxWSZW6ME', 'v1:532a1484', 'Première des deux publications Shallow retenues : un motif documentaire récurrent.',
      'Au début de 2019, Shallow apparaît dans le catalogue sous la forme d’une reprise au saxophone. Les crédits de l’œuvre nous ramènent à Lady Gaga et Bradley Cooper, et à une équipe de quatre auteurs. Une interprétation devient une passerelle : elle laisse une œuvre circuler, sans effacer ceux qui l’ont créée.',
      'Suivre une chanson, ce n’est pas seulement suivre un titre. Dans les archives suivantes, les noms d’interprètes vont aussi se répondre.', shallow('-mTxWSZW6ME')),
    sequence('PRAnYsdEC2M', 'v1:16d77e79', 'Une reprise dont le titre associe explicitement Matt Mez Sax et Juliette Djender violoniste.',
      'En 2021, le titre de la reprise Always Remember Us This Way associe Matt Mez Sax et Juliette Djender, présentée comme violoniste. Deux noms dans une même archive. Pour notre montage, c’est un point de passage vers le dialogue. Ce document ne date pas le début d’un duo ; il nous offre une trace à laquelle un souvenir pourra être relié.',
      'D’une publication à l’autre, un nom collectif apparaît. Nous le suivons comme un fil documentaire, sans lui inventer une histoire en coulisses.',
      { ...cover('PRAnYsdEC2M', 'Always Remember Us This Way'), originalArtist: hypothesis('Lady Gaga', ['catalog:PRAnYsdEC2M'], 'Artiste cité dans le titre, attribution originale à vérifier auprès d’une source musicale.') }),
    sequence('1X3dI1w3qTY', 'v1:7226e51d', 'Le nom Duo Butterfly figure avec les deux interprètes dans une publication de 2022.',
      'En 2022, une vidéo emploie le nom Duo Butterfly et associe de nouveau Matt Mez Sax et Juliette Djender. Son titre est Hymne à l’amour. Nous gardons l’identification musicale comme une piste à confirmer : un intitulé ne suffit pas à établir une œuvre et ses crédits. Le lien certain, ici, est celui des noms réunis dans le titre.',
      'Le montage peut faire dialoguer des noms, mais aussi des titres qui reviennent. Retrouvons Shallow dans une nouvelle publication.',
      { song: hypothesis('Hymne à l’amour', ['catalog:1X3dI1w3qTY'], 'Candidat éditorial issu de l’intitulé, sans confirmation de l’œuvre ni du statut reprise/original.') }, { sources: ['catalog:VyOYHeLM-9k'], catalogBindings: { 'VyOYHeLM-9k': 'v1:00787eea' } }),
    sequence('VyOYHeLM-9k', 'v1:00787eea', 'Retour du titre Shallow dans une reprise déclarée en 2023, après la publication retenue de 2019.',
      'Le nom Shallow réapparaît dans les archives en 2023. Dans notre sélection, il répond au titre publié en 2019. Ce retour donne au film un point de rappel. Il ne nous dit rien, à lui seul, d’un changement dans la vie de l’artiste : c’est notre manière de relier deux traces, et non une explication biographique.',
      'À ce titre qui revient succède une autre idée musicale : l’autonomie. Nous pouvons écouter ce thème sans en faire le récit de la vie privée de quelqu’un.', shallow('VyOYHeLM-9k'), { sources: ['catalog:-mTxWSZW6ME'], catalogBindings: { '-mTxWSZW6ME': 'v1:532a1484' } }),
    sequence('wYbC0r8Vc68', 'v1:8b795291', 'Reprise explicitement identifiée et thème d’autonomie documenté par l’éditeur musical.',
      'Flowers est publiée ici comme une reprise de Miley Cyrus. L’éditeur musical décrit une chanson tournée vers l’autonomie et la confiance en soi. Dans notre film, ce thème ouvre une question de montage : comment une interprétation peut-elle donner une nouvelle place à une idée ? Il ne prouve aucune séparation, ni aucun événement personnel de Matt Mez Sax.',
      'Après l’autonomie, notre regard se déplace vers le lien. Non parce qu’une chanson expliquerait une vie, mais parce que les archives nous offrent plusieurs façons de penser le partage.',
      {
        ...cover('wYbC0r8Vc68', 'Flowers'),
        originalArtist: confirmed('Miley Cyrus', ['music:flowers:alfred'], 'Interprète indiqué sur la notice officielle de l’éditeur.'),
        writers: confirmed('Michael Pollack · Gregory Aldae Hein · Miley Cyrus', ['music:flowers:alfred'], 'Paroles et musique : crédits de la notice, pas de l’arrangement choral.'),
        theme: confirmed('Un message d’autonomie et de confiance en soi.', ['music:flowers:alfred'], 'Résumé original du commentaire éditorial présentant un message de self-reliance ; aucune parole reproduite.', 'medium'),
      }, { themeTags: ['autonomie'] }),
    sequence('3k8uuhyIVCc', 'v1:65a6dd74', 'Un contexte d’anniversaire nommé par le titre, gardé à distance de toute inférence médicale ou personnelle.',
      'Une publication de 2024 porte le titre « Ehpad — Anniversaire 100 ans d’une résidente ». Nous pouvons citer ce titre, pas confirmer la date de l’anniversaire ni raconter la vie de cette personne. Ici, notre montage laisse une place à la rencontre, comme intention de récit. Il n’en déduit ni état de santé, ni effet thérapeutique de la musique.',
      'À côté d’un contexte nommé par une archive, une chanson peut proposer un langage d’encouragement. Les deux se répondent dans le montage ; ils ne se prouvent pas l’un l’autre.'),
    sequence('mdqILjZhhw0', 'v1:1fbdf690', 'Une reprise dont l’original, la version citée et les auteurs sont distingués par deux sources autorisées.',
      'You Raise Me Up porte, selon son éditeur, un message d’espoir et d’encouragement. L’œuvre appartient au répertoire de Secret Garden ; Josh Groban est l’interprétation de référence citée dans le titre de cette reprise. Dans le film, l’espoir devient un fil d’écoute. Il reste le thème d’une chanson, pas la preuve d’une épreuve vécue par l’artiste.',
      'Encourager, puis garder une trace. C’est la passerelle que nous proposons vers Photograph : une association éditoriale, ouverte à votre lecture.',
      {
        ...cover('mdqILjZhhw0', 'You Raise Me Up'),
        originalArtist: confirmed('Secret Garden', ['music:raise:secret-garden'], 'Le site officiel rattache l’œuvre à Secret Garden et distingue les interprétations ultérieures.'),
        versionArtist: confirmed('Josh Groban', ['music:raise:hal-leonard'], 'Version citée dans le titre de la reprise ; ne pas confondre avec l’origine de l’œuvre.'),
        writers: confirmed('Brendan Graham · Rolf Løvland', ['music:raise:hal-leonard'], 'Auteurs crédités par l’éditeur ; Josh Groban n’est pas crédité comme auteur.'),
        theme: confirmed('L’espoir et l’encouragement, dans une relation qui aide à avancer.', ['music:raise:hal-leonard'], 'Résumé original de la présentation de l’éditeur. Aucun événement biographique inféré.', 'medium'),
      }, { themeTags: ['espoir'], sources: ['catalog:By6BUKObbNs'], catalogBindings: { 'By6BUKObbNs': 'v1:ca9a4af4' } }),
    sequence('By6BUKObbNs', 'v1:ca9a4af4', 'Une reprise et ses crédits vérifiés, avec un lien éditorial explicite entre le titre et le travail d’archive.',
      'Photograph est une reprise d’Ed Sheeran. La notice de l’éditeur situe la chanson dans l’amour à distance. Pour notre montage, le titre devient aussi un petit miroir de ce travail : conserver une trace, puis la retrouver autrement. Ce lien avec la mémoire est notre proposition narrative. Il ne décrit pas la relation personnelle de Matt Mez Sax.',
      'Une archive garde une trace sans fermer l’histoire. Avançons vers le présent, en laissant les mots que nous ne pouvons pas confirmer à leur juste place.',
      {
        ...cover('By6BUKObbNs', 'Photograph'),
        originalArtist: confirmed('Ed Sheeran', ['music:photograph:hal-leonard'], 'Artiste de l’enregistrement indiqué par l’éditeur.'),
        writers: confirmed('Tom Leonard · Johnny McDaid · Martin Peter Harrington · Ed Sheeran', ['music:photograph:hal-leonard'], 'Les quatre noms de la notice actuelle sont conservés ; l’arrangeuse Cristi Cary Miller n’est pas une auteure de l’œuvre.'),
        theme: confirmed('L’amour à distance et le lien qui demeure.', ['music:photograph:hal-leonard'], 'Résumé original du contexte de la chanson présenté par l’éditeur, sans attribuer cette histoire à Matt Mez Sax.', 'medium'),
      }, { themeTags: ['amour', 'distance'] }),
    sequence('ZK2gy2XUCDc', 'v1:7db3ec77', 'Une publication de mars 2026, laissée ouverte faute de crédits et de qualification musicale confirmés.',
      'Une publication de mars 2026 porte un mot : Presence. Un titre bref, ouvert. Sans autre source musicale, nous ne le transformons ni en nom de chanson confirmé, ni en composition originale. Le récit arrive au présent avec cette place laissée libre : celle des crédits à vérifier et des souvenirs que vous pourrez choisir de raconter.',
      'RELIA peut relier les traces. Pour aller plus loin, il faut des sources, des corrections, et les mots de ceux qui se souviennent. L’histoire reste ouverte.'),
  ]),
});
