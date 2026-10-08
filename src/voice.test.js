import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RATE_KEY, NARRATION_RATES, pickNarratorVoice, rankFrenchVoices, rateFor, scoreFrenchVoice,
  speechChunks, speechText, voiceLabel, voiceKey,
} from './voice.js';

const voice = (name, lang, extra = {}) => ({ name, lang, voiceURI: `uri:${name}:${lang}`, localService: true, ...extra });

const sample = [
  voice('Microsoft Paul Desktop', 'fr-FR'),
  voice('Thomas', 'fr-FR'),
  voice('Microsoft Hortense Desktop', 'fr-FR'),
  voice('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', { localService: false }),
  voice('Amélie (Améliorée)', 'fr-CA'),
  voice('Samantha', 'en-US'),
];

test('la voix française féminine et moderne est proposée en premier', () => {
  const ranked = rankFrenchVoices(sample).map(entry => entry.name);
  assert.equal(ranked[0], 'Microsoft Denise Online (Natural) - French (France)');
  assert.equal(ranked[1], 'Amélie (Améliorée)');
  assert.ok(!ranked.includes('Samantha'), 'les voix non françaises sont exclues');
});

test('les voix masculines sont classées après les voix féminines', () => {
  const ranked = rankFrenchVoices(sample).map(entry => entry.name);
  const lastFemale = Math.max(ranked.indexOf('Microsoft Hortense Desktop'), ranked.indexOf('Amélie (Améliorée)'));
  assert.ok(ranked.indexOf('Thomas') > lastFemale);
  assert.ok(ranked.indexOf('Microsoft Paul Desktop') > lastFemale);
});

test('à genre égal, fr-FR passe avant les autres variantes françaises', () => {
  const female = scoreFrenchVoice(voice('Marie', 'fr-FR'));
  const femaleCanada = scoreFrenchVoice(voice('Marie', 'fr-CA'));
  assert.ok(female.score > femaleCanada.score);
  assert.equal(female.female, true);
  assert.equal(scoreFrenchVoice(voice('Inconnue', 'de-DE')), null);
});

test('la voix choisie par l’utilisateur est respectée, sinon la mieux classée', () => {
  const chosen = pickNarratorVoice(sample, 'uri:Thomas:fr-FR');
  assert.equal(chosen.name, 'Thomas');
  const automatic = pickNarratorVoice(sample, '');
  assert.equal(automatic.name, 'Microsoft Denise Online (Natural) - French (France)');
  assert.equal(pickNarratorVoice([], ''), null);
  assert.equal(pickNarratorVoice([voice('Samantha', 'en-US')], ''), null);
});

test('le libellé de voix indique le genre probable et la qualité', () => {
  const [best] = rankFrenchVoices(sample);
  const label = voiceLabel(best);
  assert.match(label, /^Microsoft Denise Online \(Natural\) - French \(France\) · fr-FR · voix féminine, voix moderne$/);
  assert.equal(voiceKey(sample[0]), 'uri:Microsoft Paul Desktop:fr-FR');
});

test('le débit par défaut est plus lent que la voix standard', () => {
  assert.equal(DEFAULT_RATE_KEY, 'calm');
  assert.ok(rateFor(DEFAULT_RATE_KEY) < 1);
  assert.equal(rateFor('normal'), 1);
  assert.equal(rateFor('inconnu'), NARRATION_RATES.calm);
});

test('le texte lu retire les pictogrammes et adapte flèches et années négatives', () => {
  assert.equal(speechText('Lila Vesper → Le bruit des étoiles & Noé'), 'Lila Vesper, puis Le bruit des étoiles et Noé');
  assert.equal(speechText('Né en −500 ▶ Raconter ↗'), 'Né en moins 500 Raconter');
  assert.equal(speechText('Voir https://example.org/page maintenant'), 'Voir maintenant');
});

test('le découpage garde chaque morceau court et ne perd aucun mot', () => {
  const chunks = speechChunks('Un. Deux. Trois.', 6);
  assert.deepEqual(chunks, ['Un.', 'Deux.', 'Trois.']);
  const long = speechChunks('mot '.repeat(120), 60);
  assert.ok(long.every(chunk => chunk.length <= 60));
  assert.equal(long.join(' ').split(' ').filter(Boolean).length, 120);
  assert.deepEqual(speechChunks('   '), []);
});
