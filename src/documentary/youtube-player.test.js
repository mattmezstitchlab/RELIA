import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentaryYouTubePlayer, youtubeErrorMessage } from './youtube-player.js';

function environment() {
  let id = 0;
  const intervals = new Map(); const timeouts = new Map(); const scripts = [];
  const documentRef = { createElement: tag => ({ tag, listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; }, remove() { this.removed = true; } }), head: { append: script => scripts.push(script) } };
  const windowRef = {
    location: { origin: 'https://5173-relia-preview.e2b.app' },
    setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: n => intervals.delete(n),
    setTimeout: fn => { timeouts.set(++id, fn); return id; }, clearTimeout: n => timeouts.delete(n),
  };
  const container = { ownerDocument: documentRef, children: [], replaceChildren() { this.children = []; }, append(child) { this.children.push(child); } };
  const instances = [];
  class Player {
    constructor(mount, options) { this.mount = mount; this.options = options; this.time = 10; this.plays = 0; this.pauses = 0; this.destroyed = 0; this.seeks = []; this.frame = {}; instances.push(this); }
    getCurrentTime() { return this.time; } seekTo(value) { this.time = value; this.seeks.push(value); }
    playVideo() { this.plays++; } pauseVideo() { this.pauses++; } destroy() { this.destroyed++; }
    getIframe() { return this.frame; }
    ready() { this.options.events.onReady({ target: this }); }
    state(data) { this.options.events.onStateChange({ data }); }
    error(data) { this.options.events.onError({ data }); }
  }
  return { windowRef, documentRef, container, intervals, timeouts, scripts, api: { Player }, instances, tick: () => [...intervals.values()].forEach(fn => fn()) };
}
const step = (videoId = 'XgKcenvjMdI') => ({ videoId, video: { title: 'Titre fourni par le catalogue', embeddable: true }, excerpt: { startSeconds: 10, endSeconds: 15, durationSeconds: 5 } });
const callbacks = () => ({ progress: [], states: [], errors: [], ended: 0, onProgress(value) { this.progress.push(value); }, onState(value) { this.states.push(value); }, onError(value) { this.errors.push(value); }, onEnded() { this.ended++; } });
function harness() {
  const env = environment(); let loads = 0;
  const player = new DocumentaryYouTubePlayer(env.container, { windowRef: env.windowRef, loadAPI: async () => { loads++; return env.api; } });
  return { ...env, player, get loads() { return loads; } };
}

test('construction, consentement et pause seuls ne chargent ni SDK ni iframe', async () => {
  const h = harness(); assert.equal(h.loads, 0);
  await assert.rejects(h.player.play(step(), callbacks()), /Consentement/);
  h.player.setConsent(true); h.player.pause();
  assert.equal(h.loads, 0); assert.equal(h.instances.length, 0); assert.equal(h.container.children.length, 0);
});

test('le lecteur officiel porte le host nocookie, les bornes, l’origine réelle et un titre accessible', async () => {
  const h = harness(); const cb = callbacks(); h.player.setConsent(true); await h.player.play(step(), cb);
  assert.equal(h.instances.length, 1); const sdk = h.instances[0];
  assert.equal(sdk.options.host, 'https://www.youtube-nocookie.com');
  assert.equal(sdk.options.playerVars.autoplay, 0); assert.equal(sdk.options.playerVars.controls, 1);
  assert.equal(sdk.options.playerVars.origin, h.windowRef.location.origin);
  assert.equal(sdk.options.playerVars.start, 10); assert.equal(sdk.options.playerVars.end, 15);
  assert.equal(sdk.plays, 0, 'il attend onReady'); sdk.ready();
  assert.equal(sdk.plays, 1); assert.equal(sdk.frame.title, 'Archive YouTube · Titre fourni par le catalogue');
  assert.equal(sdk.frame.referrerPolicy, 'strict-origin-when-cross-origin');
  sdk.time = 12.5; h.tick(); assert.deepEqual(cb.progress, [12.5]);
  sdk.time = NaN; h.tick(); assert.deepEqual(cb.progress, [12.5]);
});

test('buffering et pause native arrêtent le polling, la reprise lit le temps réel', async () => {
  const h = harness(); const cb = callbacks(); h.player.setConsent(true); await h.player.play(step(), cb); const sdk = h.instances[0]; sdk.ready();
  sdk.state(3); assert.equal(h.intervals.size, 0); assert.equal(cb.ended, 0);
  sdk.state(2); assert.equal(h.intervals.size, 0); assert.deepEqual(cb.states, [false]);
  sdk.state(1); assert.equal(h.intervals.size, 1); assert.deepEqual(cb.states, [false, true]);
  sdk.time = 14; h.tick(); assert.deepEqual(cb.progress, [14]);
  sdk.state(0); assert.equal(cb.ended, 1); assert.equal(h.intervals.size, 0);
});

test('la reprise du même extrait conserve sa position, sinon elle revient à son début', async () => {
  const h = harness(); h.player.setConsent(true); await h.player.play(step(), callbacks()); const sdk = h.instances[0]; sdk.ready();
  sdk.time = 12.5; h.player.pause(); await h.player.play(step(), callbacks());
  assert.equal(h.instances.length, 1); assert.equal(sdk.time, 12.5); assert.equal(sdk.plays, 2);
  sdk.time = 20; h.player.pause(); await h.player.play(step(), callbacks());
  assert.equal(sdk.time, 10); assert.equal(sdk.plays, 3);
});

test('une pause pendant le chargement API empêche l’ancien appel de créer un lecteur', async () => {
  const h = environment(); let resolve;
  const player = new DocumentaryYouTubePlayer(h.container, { windowRef: h.windowRef, loadAPI: () => new Promise(done => { resolve = done; }) });
  player.setConsent(true); const pending = player.play(step(), callbacks()); player.pause(); resolve(h.api); await pending;
  assert.equal(h.instances.length, 0); assert.equal(h.container.children.length, 0);
});

test('une pause avant onReady empêche le démarrage, mais permet une reprise explicite', async () => {
  const h = harness(); h.player.setConsent(true); await h.player.play(step(), callbacks()); const sdk = h.instances[0];
  h.player.pause(); sdk.ready(); assert.equal(sdk.plays, 0); assert.equal(h.intervals.size, 0);
  await h.player.play(step(), callbacks()); assert.equal(sdk.plays, 1); assert.equal(h.instances.length, 1);
});

test('retirer le consentement détruit l’iframe et invalide ses événements tardifs', async () => {
  const h = harness(); const cb = callbacks(); h.player.setConsent(true); await h.player.play(step(), cb); const sdk = h.instances[0];
  h.player.setConsent(false); sdk.ready(); sdk.state(1); sdk.state(0); sdk.error(100);
  assert.ok(sdk.destroyed > 0); assert.equal(sdk.plays, 0); assert.equal(h.container.children.length, 0);
  assert.equal(cb.ended, 0); assert.deepEqual(cb.errors, []); assert.deepEqual(cb.states, []); assert.equal(h.intervals.size, 0);
});

test('changer de vidéo détruit l’ancien lecteur avant toute nouvelle lecture', async () => {
  const h = harness(); const oldEvents = callbacks(); h.player.setConsent(true); await h.player.play(step(), oldEvents); const old = h.instances[0]; old.ready();
  const newEvents = callbacks(); await h.player.play(step('YT9M8JSJqwY'), newEvents); const fresh = h.instances[1]; fresh.ready();
  old.state(0); old.error(100); old.state(1);
  assert.equal(old.destroyed, 1); assert.equal(oldEvents.ended, 0); assert.deepEqual(oldEvents.errors, []);
  assert.equal(fresh.options.videoId, 'YT9M8JSJqwY'); assert.equal(fresh.plays, 1); assert.equal(h.intervals.size, 1);
});

test('une vidéo non intégrable ne charge pas le SDK et fournit une issue explicite', async () => {
  const h = harness(); const cb = callbacks(); const item = step(); item.video.embeddable = false; h.player.setConsent(true); await h.player.play(item, cb);
  assert.equal(h.loads, 0); assert.match(cb.errors[0], /non intégrable/);
  assert.match(youtubeErrorMessage(153), /contexte de lecture/);
  assert.match(youtubeErrorMessage(2), /récit textuel reste accessible/);
});

test('les erreurs SDK et les blocages autoplay sont visibles et n’annoncent pas de fin fictive', async () => {
  const h = harness(); const cb = callbacks(); h.player.setConsent(true); await h.player.play(step(), cb); const sdk = h.instances[0]; sdk.ready();
  sdk.error(150); assert.match(cb.errors[0], /non intégrable/); assert.equal(h.intervals.size, 0); assert.equal(cb.ended, 0);
  sdk.options.events.onAutoplayBlocked(); assert.match(cb.errors[1], /bloque le démarrage/);
});

let imports = 0;
const freshLoader = async () => (await import(`./youtube-player.js?loader-test=${++imports}`)).loadYouTubeAPI;

test('le chargement SDK est partagé et restaure le callback antérieur sans poller indéfiniment', async () => {
  const load = await freshLoader(); const h = environment(); let previousCalls = 0;
  const previous = () => { previousCalls++; throw new Error('Composant externe'); }; h.windowRef.onYouTubeIframeAPIReady = previous;
  const a = load(h); const b = load(h); assert.equal(a, b); assert.equal(h.scripts.length, 1);
  const script = h.scripts[0]; assert.equal(script.src, 'https://www.youtube.com/iframe_api'); assert.equal(script.referrerPolicy, 'strict-origin-when-cross-origin');
  h.windowRef.YT = h.api; h.windowRef.onYouTubeIframeAPIReady(); assert.equal(await a, h.api);
  assert.equal(previousCalls, 1); assert.equal(h.windowRef.onYouTubeIframeAPIReady, previous); assert.equal(h.timeouts.size, 0);
});

test('un échec ou délai SDK supprime le script et permet une nouvelle tentative', async () => {
  for (const failWith of ['error', 'timeout']) {
    const load = await freshLoader(); const h = environment();
    const pending = load(h); const rejects = assert.rejects(pending, /inaccessible|Délai/);
    if (failWith === 'error') h.scripts[0].listeners.error(); else [...h.timeouts.values()][0]();
    await rejects; assert.equal(h.scripts[0].removed, true); assert.equal(h.timeouts.size, 0);
    const retry = load(h); h.windowRef.YT = h.api; h.windowRef.onYouTubeIframeAPIReady(); await retry;
    assert.equal(h.scripts.length, 2);
  }
});

test('un SDK déjà présent n’insère aucun autre script', async () => {
  const load = await freshLoader(); const h = environment(); h.windowRef.YT = h.api;
  assert.equal(await load(h), h.api); assert.equal(h.scripts.length, 0);
});


test('un iframe qui ne devient pas prêt déclenche un délai visible sans fin ni lecture tardive', async () => {
  const h = harness(); const cb = callbacks(); h.player.setConsent(true); await h.player.play(step(), cb); const sdk = h.instances[0];
  assert.equal(h.timeouts.size, 1); [...h.timeouts.values()][0]();
  assert.match(cb.errors[0], /lecteur YouTube ne répond pas/); assert.equal(cb.ended, 0); assert.equal(h.timeouts.size, 0);
  sdk.ready(); assert.equal(sdk.plays, 0); assert.equal(h.intervals.size, 0);
  await h.player.play(step(), callbacks()); assert.equal(sdk.plays, 1);
});
