// Fonctions pures de la narration vocale : choix de la voix française, débit et découpage du texte.
// Le navigateur fournit les voix (speechSynthesis) : RELIA ne peut pas garantir une voix féminine sur tous les appareils,
// il privilégie celle dont le nom et la qualité correspondent le mieux à une voix féminine moderne.

// Débits proposés : « Posée » est le réglage par défaut (plus lent que la voix standard).
export const NARRATION_RATES = Object.freeze({ calm: 0.82, normal: 1 });
export const DEFAULT_RATE_KEY = 'calm';
export const NARRATION_PITCH = 1;

// Prénoms français fréquemment attribués à des voix de synthèse féminines (comparés sans accents, en minuscules).
const FEMALE_NAMES = new Set([
  'amelie', 'audrey', 'aurelie', 'julie', 'hortense', 'denise', 'eloise', 'vivienne', 'lea', 'marie', 'sophie',
  'celine', 'justine', 'charline', 'sylvie', 'brigitte', 'coralie', 'yvette', 'virginie', 'juliette', 'chantal',
  'elodie', 'manon', 'caroline', 'emma', 'adele', 'claire', 'lucie', 'alice', 'zoe', 'anne', 'camille', 'ines',
  'nathalie', 'oceane', 'pauline', 'mathilde', 'ariane', 'celeste', 'margaux', 'flora', 'constance', 'madeleine',
  'anais', 'noemie', 'laura', 'lena', 'helene', 'agnes', 'monique', 'francoise',
]);

// Prénoms masculins usuels : ces voix sont classées après les voix féminines.
const MALE_NAMES = new Set([
  'thomas', 'jacques', 'paul', 'henri', 'remy', 'claude', 'antoine', 'nicolas', 'mathieu', 'hugo', 'jean', 'pierre',
  'luc', 'bernard', 'eric', 'olivier', 'guillaume', 'louis', 'gerard', 'raphael', 'xavier', 'bruno', 'marc', 'maxime',
  'yannick', 'alain', 'daniel', 'arthur', 'damien', 'julien', 'francois', 'kevin', 'philippe', 'stephane',
]);

// Marqueurs de qualité : voix naturelles, neurales, améliorées ou en ligne.
const MODERN_MARKERS = new Set(['natural', 'neural', 'premium', 'enhanced', 'amelioree', 'online', 'wavenet', 'studio']);

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function voiceTokens(name) {
  return normalizeText(name).split(/[^a-z0-9]+/).filter(Boolean);
}

export function voiceKey(voice) {
  return voice?.voiceURI || voice?.name || '';
}

// Score d’une voix française ; renvoie null pour une voix non française.
export function scoreFrenchVoice(voice) {
  const lang = String(voice?.lang || '').replace('_', '-');
  if (!/^fr(-|$)/i.test(lang)) return null;
  const tokens = voiceTokens(voice.name);
  const female = tokens.some(token => FEMALE_NAMES.has(token)) || (tokens.includes('google') && tokens.includes('francais'));
  const male = tokens.some(token => MALE_NAMES.has(token));
  const modern = tokens.some(token => MODERN_MARKERS.has(token)) || voice.localService === false;
  let score = 0;
  if (/^fr-FR$/i.test(lang)) score += 30;
  else if (/^fr-(CA|BE|CH)$/i.test(lang)) score += 20;
  else score += 10;
  if (female) score += 60;
  if (male) score -= 80;
  if (modern) score += 25;
  return { score, female, modern };
}

// Voix françaises, de la plus adaptée à la moins adaptée (ordre stable par nom en cas d’égalité).
export function rankFrenchVoices(voices = []) {
  return voices
    .map(voice => {
      const scored = scoreFrenchVoice(voice);
      if (!scored) return null;
      return { voice, key: voiceKey(voice), name: String(voice.name || ''), lang: voice.lang || '', ...scored };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
}

// Voix retenue : la voix choisie par l’utilisateur si elle existe, sinon la mieux classée.
export function pickNarratorVoice(voices = [], preferredKey = '') {
  const ranked = rankFrenchVoices(voices);
  if (preferredKey) {
    const chosen = ranked.find(entry => entry.key === preferredKey);
    if (chosen) return chosen.voice;
  }
  return ranked[0]?.voice ?? null;
}

// Libellé lisible d’une voix pour les réglages.
export function voiceLabel(entry) {
  const region = entry.lang ? entry.lang.replace('_', '-') : 'fr';
  const tags = [];
  if (entry.female) tags.push('voix féminine');
  if (entry.modern) tags.push('voix moderne');
  return `${entry.name} · ${region}${tags.length ? ` · ${tags.join(', ')}` : ''}`;
}

export function rateFor(key) {
  return NARRATION_RATES[key] ?? NARRATION_RATES[DEFAULT_RATE_KEY];
}

// Texte prononçable : retire adresses, pictogrammes et symboles, et lit les flèches et années négatives.
export function speechText(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)−(?=\d)/g, '$1moins ')
    .replace(/\s*→\s*/g, ', puis ')
    .replace(/\s*←\s*/g, ', depuis ')
    .replace(/&/g, ' et ')
    .replace(/\s*[·•|]\s*/g, ', ')
    .replace(/\p{S}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLong(sentence, maxLength) {
  if (sentence.length <= maxLength) return [sentence];
  const parts = [];
  let rest = sentence;
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf(' ', maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Découpe en morceaux courts : certains moteurs vocaux interrompent les longues phrases.
export function speechChunks(value, maxLength = 180) {
  const sentences = speechText(value).split(/(?<=[.!?…;:])\s+/).filter(Boolean);
  const pieces = sentences.flatMap(sentence => splitLong(sentence, maxLength));
  const chunks = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
