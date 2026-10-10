import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { MATT_MEZ_DOCUMENTARY as seed } from '../src/documentary/matt-mez.js';
import { emptyDraft, recordFor } from '../src/documentary/model.js';

const catalog = JSON.parse(readFileSync(new URL('../src/data/youtube/matt-mez-sax.json', import.meta.url)));
const NOW = '2026-10-10T18:40:00Z';
const KEY = `relia-documentary-v1:${seed.identityId}`;
const route = '/#raconter/matt-mez-sax';
const firstId = 'XgKcenvjMdI';
const firstTitle = catalog.videos.find(video => video.videoId === firstId).title;
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=', 'base64');

function draftWithText(text) {
  const draft = emptyDraft(seed.identityId, NOW);
  draft.records[firstId] = recordFor(catalog.videos.find(video => video.videoId === firstId), seed, draft);
  draft.records[firstId].narration.text = text;
  draft.records[firstId].narration.status = 'draft';
  return draft;
}
const upload = (page, value, name = 'brouillon.json') => page.locator('#doc-import-draft').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const stored = page => page.evaluate(key => localStorage.getItem(key), KEY);
async function open(page) { await page.goto(route); await expect(page.locator('#doc-sequence-title')).toHaveText(firstTitle); }
async function edit(page) { await page.locator('#doc-edit-sequence').click(); await expect(page.locator('#doc-editor-form')).toBeVisible(); }
async function claim(page, key) { await page.locator(`details[data-claim="${key}"] > summary`).click(); }
async function axe(page, selector) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
}
async function noOverflow(page) {
  expect(await page.locator('#sheet-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

// Services simulés seulement dans Playwright : ni appel aux plateformes ni voix payante.
const sdk = `
window.__youtubeInstances = [];
window.YT = { Player: class {
  constructor(mount, options) {
    this.options=options; this.time=options.playerVars.start; this.plays=0; this.pauses=0;
    this.frame=document.createElement('iframe'); this.frame.src='about:blank'; mount.replaceWith(this.frame);
    window.__youtubeInstances.push(this); setTimeout(()=>options.events.onReady({target:this}),0);
  }
  getIframe(){return this.frame} getCurrentTime(){return this.time}
  seekTo(time){this.time=time}
  playVideo(){this.plays++;this.options.events.onStateChange({data:1})}
  pauseVideo(){this.pauses++;this.options.events.onStateChange({data:2})}
  destroy(){this.frame.remove()}
}};
window.onYouTubeIframeAPIReady();
`;

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.externalRequests = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== 'http://127.0.0.1:5173') page.externalRequests.push(request.url()); });
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(() => {
    // Le double décrit RELIA uniquement, pas les documents tiers / opaques des iframes.
    if (window.top !== window) return;
    if (new URL(location.href).searchParams.has('test-storage-blocked')) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Stockage refusé pour ce test', 'SecurityError'); } });
    else { localStorage.setItem('relia-sound', 'false'); localStorage.setItem('relia-voice', 'false'); }
    window.__testVoices = []; window.__speechCalls = []; window.__voiceListeners = [];
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => window.__testVoices,
      addEventListener: (event, fn) => window.__voiceListeners.push(fn),
      cancel: () => {}, speak: utterance => window.__speechCalls.push(utterance),
    } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } } });
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== 'lent.json') return original.call(this);
      return new Promise(resolve => { window.__pendingImport = true; window.__releaseImport = () => original.call(this).then(resolve); });
    };
  });
  await page.route('**/*', async intercepted => {
    const url = new URL(intercepted.request().url());
    if (url.origin === 'http://127.0.0.1:5173') return intercepted.continue();
    if (url.hostname === 'i.ytimg.com') return intercepted.fulfill({ contentType: 'image/png', body: image });
    if (url.href === 'https://www.youtube.com/iframe_api') return intercepted.fulfill({ contentType: 'application/javascript', body: sdk });
    if (url.hostname === 'commons.wikimedia.org') return intercepted.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: {} } }) });
    return intercepted.abort();
  });
});
test.afterEach(async ({ page }) => { if (page) expect(page.runtimeErrors || []).toEqual([]); });

test('ouverture en pause, texte réel, six chapitres et aucun média / voix automatique', async ({ page }) => {
  await open(page);
  await expect(page.locator('.doc-chapter-button')).toHaveCount(6);
  await expect(page.locator('#documentary-body')).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  await expect(page.locator('#doc-narration-text')).toContainText('2006');
  await expect(page.locator('#story-prev')).toBeDisabled();
  await expect(page.locator('#story-controls')).toBeVisible();
  await expect(page.locator('#doc-enable-youtube')).toBeVisible();
  expect(page.externalRequests).toEqual([]);
  expect(await page.evaluate(() => window.__speechCalls.length)).toBe(0);
  await expect(page.locator('#documentary-body iframe')).toHaveCount(0);
  await noOverflow(page);
  await axe(page, '#view-story');
});

test('navigation de toutes les séquences, sources visibles et lecture mock-up sans requête YouTube', async ({ page }) => {
  await open(page);
  await page.locator('#story-play').click(); await expect(page.locator('#story-play-label')).toHaveText('Pause');
  await page.clock.fastForward(50_000);
  await expect(page.locator('#documentary-body')).toHaveAttribute('data-phase', 'video');
  await page.locator('#story-play').click();
  for (let index = 1; index < 12; index++) await page.locator('#story-next').click();
  await expect(page.locator('#doc-sequence-title')).toHaveText(catalog.videos.find(video => video.videoId === 'ZK2gy2XUCDc').title);
  await expect(page.locator('#story-next')).toBeDisabled();
  await page.locator('[data-chapter="dialogues"]').click();
  await expect(page.locator('#doc-sequence-title')).toHaveText(catalog.videos.find(video => video.videoId === '1X3dI1w3qTY').title);
  await page.locator('#story-next').click(); await page.locator('#story-next').click();
  await page.locator('#story-play').click();
  await page.locator('#doc-sources > summary').click();
  await expect(page.locator('#documentary-body')).toHaveAttribute('data-playing', 'false');
  await expect(page.locator('#doc-sources a[href="https://www.alfred.com/products/flowers-00-50748"]')).toBeVisible();
  expect(page.externalRequests).toEqual([]);
});

test('la chronologie complète reste indépendante et restaure les commandes du mode Raconter', async ({ page }) => {
  await open(page); await page.locator('#doc-chronology').click();
  await expect(page.locator('#view-local')).toBeVisible();
  await expect(page.locator('.local-video')).toHaveCount(catalog.videos.length);
  expect(await page.evaluate(() => location.hash)).toBe('#chronologie/matt-mez-sax');
  expect(await page.locator('#story-controls').evaluate(el => el.parentElement.id)).toBe('view-story');
  expect(await page.locator('#story-foot').evaluate(el => el.parentElement.id)).toBe('view-story');
  await page.locator('.local-video').first().locator('.rail-thumb').click();
  await expect(page.locator('#view-local iframe')).toHaveCount(1);
  await page.locator('#view-local [data-launch-documentary]').click();
  await expect(page.locator('#view-local iframe')).toHaveCount(0);
  await expect(page.locator('#documentary-body')).toHaveAttribute('data-playing', 'false');
  expect(await page.locator('#story-controls').evaluate(el => el.parentElement.className)).toBe('doc-controls-slot');
  await expect(page.locator('#story-play')).toHaveCount(1);
  await page.locator('#back').click(); await expect(page.locator('#view-local')).toBeVisible();
  await page.locator('#back').click(); await expect(page.locator('#view-home')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('un souvenir local reste hypothèse, littéral et absent du script ; les faits existants ne sont pas reconfirmés', async ({ page }) => {
  await open(page); await page.locator('[data-chapter="dialogues"]').click();
  await page.locator('#story-next').click(); await page.locator('#story-next').click();
  await edit(page); await claim(page, 'memory');
  const memory = '<img src=x onerror="window.__pwned=true"> Souvenir de test non corroboré.';
  await page.locator('#doc-edit-memory-value').fill(memory);
  await expect(page.locator('#doc-edit-memory-status')).toHaveValue('hypothesis');
  await page.locator('#doc-editor-save').click(); await expect(page.locator('#view-story')).toBeVisible();
  const value = JSON.parse(await stored(page));
  expect(value.records.wYbC0r8Vc68.claims.writers.reviewedBy).toBe(seed.records.wYbC0r8Vc68.claims.writers.reviewedBy);
  expect(value.records.wYbC0r8Vc68.claims.writers.reviewedAt).toBe(seed.records.wYbC0r8Vc68.claims.writers.reviewedAt);
  await expect(page.locator('#doc-script-warning')).toBeHidden();
  await expect(page.locator('#doc-narration-text')).not.toContainText(memory);
  await page.locator('.doc-disclosure > summary').filter({ hasText: 'Informations, faits et hypothèses' }).click();
  await expect(page.locator('.doc-fact[data-status="hypothesis"]')).toContainText(memory);
  await expect(page.locator('.doc-fact img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await page.reload(); await expect(page.locator('#doc-sequence-title')).toHaveText(firstTitle);
  await page.locator('[data-chapter="dialogues"]').click(); await page.locator('#story-next').click(); await page.locator('#story-next').click();
  await edit(page); await claim(page, 'memory'); await expect(page.locator('#doc-edit-memory-value')).toHaveValue(memory);
});

test('un texte corrigé sans relecture est conservé mais PLAY est bloqué', async ({ page }) => {
  await open(page); await edit(page);
  const text = '<script>window.__pwned=true</script> Texte libre à relire.';
  await page.locator('#doc-edit-script').fill(text); await page.locator('#doc-editor-save').click();
  await expect(page.locator('#doc-narration-text')).toHaveText(text);
  await expect(page.locator('#doc-script-warning')).toBeVisible();
  await page.locator('#story-play').click(); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  await expect(page.locator('#documentary-body .doc-warning[role="alert"]')).toContainText('doit être relue');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('#doc-narration-text script')).toHaveCount(0);
});

test('le script peut être relu explicitement, séparément de tout audio', async ({ page }) => {
  await open(page); await edit(page);
  await page.locator('#doc-edit-script').fill('Une première trace, et la place de ce que nous ne savons pas.');
  await page.locator('#doc-edit-script-reviewed').check();
  await page.locator('#doc-edit-reviewer').fill('Éditeur de test'); await page.locator('#doc-edit-consulted').check();
  await page.locator('#doc-editor-save').click(); await expect(page.locator('#doc-script-warning')).toBeHidden();
  await page.locator('#story-play').click(); await expect(page.locator('#story-play-label')).toHaveText('Pause');
  expect(await page.evaluate(() => window.__speechCalls.length)).toBe(0);
  const draft = JSON.parse(await stored(page)); expect(draft.records[firstId].narration.status).toBe('reviewed');
  expect(draft).not.toHaveProperty('audio'); expect(draft).not.toHaveProperty('videos');
});

test('quitter un atelier modifié demande confirmation et conserve le formulaire en cas de refus', async ({ page }) => {
  await open(page); await edit(page); await page.locator('#doc-edit-script').fill('Brouillon non enregistré.');
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#back').click();
  await expect(page.locator('#doc-editor-form')).toBeVisible(); await expect(page.locator('#doc-edit-script')).toHaveValue('Brouillon non enregistré.');
  page.once('dialog', dialog => dialog.dismiss()); await page.evaluate(() => { location.hash = 'chronologie/matt-mez-sax'; });
  await expect(page.locator('#doc-editor-form')).toBeVisible(); expect(await page.evaluate(() => location.hash)).toBe('#raconter/matt-mez-sax');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#back').click(); await expect(page.locator('#view-story')).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test('import invalide transactionnel, export privé JSON et script Markdown sourcé', async ({ page }) => {
  await open(page); await edit(page); await page.locator('#doc-edit-selection-reason').fill('Choix local de test.'); await page.locator('#doc-editor-save').click();
  const before = await stored(page); page.on('dialog', dialog => dialog.accept());
  await page.locator('.doc-draft-tools > summary').click(); await upload(page, '{');
  await expect(page.locator('#status-text')).toContainText('Import refusé'); expect(await stored(page)).toBe(before);
  await upload(page, { ...emptyDraft(seed.identityId, NOW), identityId: 'relia:person:autre' });
  await expect(page.locator('#status-text')).toContainText('autre identité'); expect(await stored(page)).toBe(before);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#doc-export-draft').click()]);
  const stream = await download.createReadStream(); let json = ''; for await (const chunk of stream) json += chunk;
  expect(download.suggestedFilename()).toBe('relia-matt-mez-sax-brouillon-prive.json'); expect(JSON.parse(json).records[firstId].selectionReason).toBe('Choix local de test.');
  const [script] = await Promise.all([page.waitForEvent('download'), page.locator('#doc-export-script').click()]);
  const scriptStream = await script.createReadStream(); let markdown = ''; for await (const chunk of scriptStream) markdown += chunk;
  expect(markdown).toContain('Transition originale'); expect(markdown).toContain('https://www.halleonard.com/');
});

test('deux imports concurrents ne laissent pas un ancien fichier écraser le plus récent', async ({ page }) => {
  await open(page); page.on('dialog', dialog => dialog.accept()); await page.locator('.doc-draft-tools > summary').click();
  await upload(page, draftWithText('Ancien import retardé.'), 'lent.json'); await page.waitForFunction(() => window.__pendingImport);
  await upload(page, draftWithText('Import récent conservé.'));
  await expect(page.locator('#doc-narration-text')).toHaveText('Import récent conservé.');
  await page.evaluate(() => window.__releaseImport());
  await expect(page.locator('#doc-narration-text')).toHaveText('Import récent conservé.');
  expect(JSON.parse(await stored(page)).records[firstId].narration.text).toBe('Import récent conservé.');
});

test('un import retardé ne remplace pas le brouillon pendant l’ouverture de l’éditeur', async ({ page }) => {
  await open(page); page.on('dialog', dialog => dialog.accept()); await page.locator('.doc-draft-tools > summary').click();
  await upload(page, draftWithText('Import qui doit être abandonné.'), 'lent.json'); await page.waitForFunction(() => window.__pendingImport);
  await edit(page); await page.locator('#doc-edit-selection-reason').fill('Travail en cours intact.');
  await page.evaluate(() => window.__releaseImport()); await expect(page.locator('#status-text')).toContainText('Import abandonné');
  await expect(page.locator('#doc-edit-selection-reason')).toHaveValue('Travail en cours intact.'); expect(await stored(page)).toBeNull();
});

test('YouTube : consentement de séance, horloge réelle, buffering, pause native et arrêt de l’iframe', async ({ page }) => {
  await open(page); expect(page.externalRequests).toEqual([]);
  await page.locator('#doc-enable-youtube').click(); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  expect(page.externalRequests).toEqual([]);
  await page.locator('[data-phase="video"]').click(); await page.locator('#story-play').click();
  await expect(page.locator('#documentary-body iframe')).toHaveCount(1);
  const params = await page.evaluate(() => window.__youtubeInstances[0].options);
  expect(params.host).toBe('https://www.youtube-nocookie.com'); expect(params.playerVars.origin).toBe('http://127.0.0.1:5173');
  await page.evaluate(() => window.__youtubeInstances[0].options.events.onStateChange({ data: 3 })); await page.clock.fastForward(60_000);
  await expect(page.locator('#documentary-body')).toHaveAttribute('data-phase', 'video');
  await page.evaluate(() => window.__youtubeInstances[0].options.events.onStateChange({ data: 2 })); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  await page.locator('#story-play').click();
  await page.evaluate(() => { const player = window.__youtubeInstances[0]; player.time = player.options.playerVars.end; });
  await page.clock.fastForward(250); await expect(page.locator('#documentary-body')).toHaveAttribute('data-phase', 'transition');
  expect(await page.evaluate(() => window.__youtubeInstances[0].pauses)).toBeGreaterThan(0);
  await page.locator('#doc-use-mock').click(); await expect(page.locator('#documentary-body iframe')).toHaveCount(0);
  await page.locator('#doc-chronology').click(); await page.locator('#view-local [data-launch-documentary]').click();
  await expect(page.locator('#doc-enable-youtube')).toBeVisible(); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
});

test('la voix locale est une option explicite, jamais une préférence distante ni une imitation', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__testVoices.push({ name: 'Voix française distante de test', lang: 'fr-FR', voiceURI: 'remote-test', localService: false }, { name: 'Voix française installée de test', lang: 'fr-FR', voiceURI: 'local-test', localService: true });
    window.__voiceListeners.forEach(fn => fn());
  });
  await page.locator('#story-voice-toggle').click(); await page.locator('#story-play').click();
  expect(await page.evaluate(() => window.__speechCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.__speechCalls[0].voice.localService)).toBe(true);
  await page.clock.fastForward(60_000); await expect(page.locator('#documentary-body')).toHaveAttribute('data-phase', 'narration');
  await page.evaluate(() => { for (let i = 0; i < window.__speechCalls.length && i < 20; i++) window.__speechCalls[i].onend(); }); await expect(page.locator('#documentary-body')).toHaveAttribute('data-phase', 'video');
  expect(page.externalRequests).toEqual([]);
});

test('sombre / grands textes, faits / sources ouverts et atelier : accessibilité et absence de débordement', async ({ page }) => {
  await open(page); await page.locator('[data-chapter="dialogues"]').click(); await page.locator('#story-next').click(); await page.locator('#story-next').click();
  await page.locator('.doc-disclosure > summary').filter({ hasText: 'Informations, faits et hypothèses' }).click(); await page.locator('#doc-sources > summary').click();
  await page.evaluate(() => { document.body.dataset.theme = 'dark'; document.body.dataset.text = 'large'; });
  await noOverflow(page); await axe(page, '#view-story');
  await edit(page); await page.locator('details.doc-claim-editor > summary').evaluateAll(items => items.forEach(item => { item.parentElement.open = true; }));
  await noOverflow(page); await axe(page, '#view-documentary-editor');
  await page.evaluate(() => { document.body.dataset.theme = 'light'; document.body.dataset.text = 'normal'; });
  await axe(page, '#view-documentary-editor');
});

test('le mode Raconter historique fonctionne encore après sortie du documentaire (réponses Wikidata simulées)', async ({ page }) => {
  // Réponses de test, absentes de la production et sans prétendre documenter une personne réelle.
  const person = { id: 'Q100000001', labels: { fr: { value: 'Identité fictive de test' } }, descriptions: { fr: { value: 'Fixture du test navigateur, pas une biographie' } }, claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
    P69: [{ id: 'Q100000001$fixture', rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q100000002' } } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2010-01-01T00:00:00Z', precision: 9 } } }] }, references: [{ snaks: { P854: [{ datatype: 'url', datavalue: { value: 'https://example.org/test-only' } }] } }] }],
  } };
  const school = { id: 'Q100000002', labels: { fr: { value: 'Institution fictive de test' } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q43229' } } } }] } };
  await page.route('**://www.wikidata.org/w/api.php?**', intercepted => {
    const url = new URL(intercepted.request().url()); const params = url.searchParams;
    const body = params.get('action') === 'wbsearchentities' ? { search: [{ id: person.id, label: person.labels.fr.value, description: person.descriptions.fr.value }] } : { entities: Object.fromEntries(params.get('ids').split('|').map(id => [id, id === person.id ? person : school])) };
    return intercepted.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**://query.wikidata.org/**', intercepted => intercepted.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: { bindings: [] } }) }));
  await open(page); await page.locator('#back').click(); await page.locator('#back').click();
  await page.locator('#input-a').fill('Identité de test'); await page.locator('#input-a').press('Enter');
  await page.getByRole('option').filter({ hasText: 'Identité fictive de test' }).click();
  await page.locator('#identity-actions').getByRole('button', { name: 'Raconter', exact: true }).click();
  await expect(page.locator('#story-standard')).toBeVisible(); await expect(page.locator('#documentary-body')).toBeHidden();
  await expect(page.locator('#story-title')).toContainText('Institution fictive');
  await page.locator('#story-play').click(); await expect(page.locator('#story-play-label')).toHaveText('Lecture');
  expect(await page.locator('#story-controls').evaluate(el => el.parentElement.id)).toBe('view-story');
  expect(await page.evaluate(() => document.body.classList.contains('documentary-open'))).toBe(false);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('corriger l’identification suspend les anciens crédits, thèmes et narration qui en dépend', async ({ page }) => {
  await open(page); await page.locator('[data-chapter="dialogues"]').click(); await page.locator('#story-next').click(); await page.locator('#story-next').click();
  await edit(page); await claim(page, 'song');
  await page.locator('#doc-edit-song-value').fill('Autre piste musicale de test, non corroborée');
  await page.locator('#doc-edit-song-status').selectOption('hypothesis');
  await page.locator('#doc-editor-save').click();
  await expect(page.locator('#doc-script-warning')).toBeVisible();
  const record = JSON.parse(await stored(page)).records.wYbC0r8Vc68;
  expect(record.claims.writers.status).toBe('hypothesis'); expect(record.claims.theme.status).toBe('hypothesis'); expect(record.themeTags).toEqual([]);
  await page.locator('#story-play').click(); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  await expect(page.locator('#documentary-body .doc-warning[role="alert"]')).toContainText('relue');
});

test('une sélection vide ne remplace jamais le documentaire par une lecture automatique des archives', async ({ page }) => {
  await open(page); page.on('dialog', dialog => dialog.accept());
  const draft = emptyDraft(seed.identityId, NOW);
  for (const id of Object.keys(seed.records)) { draft.records[id] = structuredClone(seed.records[id]); draft.records[id].selected = false; }
  await page.locator('.doc-draft-tools > summary').click(); await upload(page, draft);
  await expect(page.locator('#view-local')).toBeVisible(); await expect(page.locator('.local-video')).toHaveCount(catalog.videos.length);
  expect(await page.evaluate(() => location.hash)).toBe('#chronologie/matt-mez-sax');
  await page.locator(`.local-video[data-video-id="${firstId}"]`).getByRole('button', { name: 'Informations musicales & souvenir' }).click();
  await page.locator('#doc-edit-selected').check(); await page.locator('#doc-editor-save').click();
  await expect(page.locator('#view-local')).toBeVisible(); await page.locator('#view-local [data-launch-documentary]').click();
  await expect(page.locator('.doc-sequence-count')).toHaveText('1 / 1'); await expect(page.locator('#story-play-label')).toHaveText('PLAY');
  await expect(page.locator('#doc-sequence-title')).toHaveText(firstTitle);
});


test('un stockage totalement refusé laisse l’atelier utilisable et le brouillon exportable pour la session', async ({ page }) => {
  await page.goto('/?test-storage-blocked=1#raconter/matt-mez-sax');
  await expect(page.locator('#doc-sequence-title')).toHaveText(firstTitle); await edit(page);
  await page.locator('#doc-edit-selection-reason').fill('Correction en mémoire de session.'); await page.locator('#doc-editor-save').click();
  await expect(page.locator('#documentary-body .doc-warning[role="status"]')).toContainText('session seulement');
  await page.locator('.doc-draft-tools > summary').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#doc-export-draft').click()]);
  const stream = await download.createReadStream(); let text = ''; for await (const chunk of stream) text += chunk;
  expect(JSON.parse(text).records[firstId].selectionReason).toBe('Correction en mémoire de session.');
  await expect(page.locator('#story-play-label')).toHaveText('PLAY');
});
