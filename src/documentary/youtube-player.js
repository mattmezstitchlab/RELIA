// Lecteur officiel à la demande. Aucun téléchargement, proxy du flux, clé ou extraction audio.
// Le SDK et l’iframe ne sont chargés QU’APRÈS le consentement explicite de cette session.
let apiPromise = null;

export function loadYouTubeAPI({ windowRef = window, documentRef = document, timeoutMs = 15000 } = {}) {
  if (windowRef.YT?.Player) return Promise.resolve(windowRef.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = windowRef.onYouTubeIframeAPIReady;
    const script = documentRef.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    let settled = false;
    let timer;
    const finish = error => {
      if (settled) return;
      settled = true;
      windowRef.clearTimeout(timer);
      if (windowRef.onYouTubeIframeAPIReady === ready) windowRef.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); apiPromise = null; reject(error); }
      else resolve(windowRef.YT);
    };
    const ready = () => {
      try { previous?.(); } catch { /* callback d’un autre composant */ }
      if (windowRef.YT?.Player) finish();
      else finish(new Error('API YouTube indisponible.'));
    };
    windowRef.onYouTubeIframeAPIReady = ready;
    script.addEventListener('error', () => finish(new Error('YouTube inaccessible.')), { once: true });
    timer = windowRef.setTimeout(() => finish(new Error('Délai de chargement de YouTube dépassé.')), timeoutMs);
    documentRef.head.append(script);
  });
  return apiPromise;
}

export function youtubeErrorMessage(code) {
  if ([100, 101, 150].includes(code)) return 'Vidéo retirée, privée ou non intégrable. Ouvrez YouTube, passez cette séquence ou utilisez la maquette.';
  if (code === 153) return 'YouTube refuse ce contexte de lecture. Ouvrez le lien externe ou revenez à la maquette.';
  return 'Lecture YouTube indisponible. Le récit textuel reste accessible ; vous pouvez passer la séquence.';
}

export class DocumentaryYouTubePlayer {
  constructor(container, { windowRef = window, loadAPI = () => loadYouTubeAPI(), pollMs = 200, readyTimeoutMs = 15000 } = {}) {
    this.container = container;
    this.window = windowRef;
    this.loadAPI = loadAPI;
    this.pollMs = pollMs;
    this.readyTimeoutMs = readyTimeoutMs;
    this.readyTimer = null;
    this.consent = false;
    this.epoch = 0;
    this.request = 0;
    this.player = null;
    this.ready = false;
    this.active = false;
    this.videoId = null;
    this.callbacks = {};
    this.poll = null;
  }
  setConsent(value) {
    this.consent = Boolean(value);
    if (!this.consent) this.unload();
  }
  stopReadinessWait() {
    if (this.readyTimer !== null) this.window.clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }
  stopPolling() {
    if (this.poll !== null) this.window.clearInterval(this.poll);
    this.poll = null;
  }
  startPolling() {
    this.stopPolling();
    this.poll = this.window.setInterval(() => {
      if (!this.active || !this.ready) return;
      try {
        const seconds = this.player.getCurrentTime();
        if (Number.isFinite(seconds)) this.callbacks.onProgress?.(seconds);
      } catch { /* Attendre une vraie information du lecteur, pas une estimation. */ }
    }, this.pollMs);
  }
  async play(step, callbacks) {
    if (!this.consent) throw new Error('Consentement YouTube requis.');
    if (!step.video.embeddable) { this.unload(); callbacks.onError?.(youtubeErrorMessage(101)); return; }
    if (this.videoId !== step.videoId || (this.player && !this.ready)) this.unload();
    const epoch = this.epoch;
    const request = ++this.request;
    this.active = true;
    this.callbacks = callbacks;
    const api = await this.loadAPI();
    // Un ancien chargement ne peut pas relancer un média après pause / saut / sortie.
    if (epoch !== this.epoch || request !== this.request || !this.active || !this.consent) return;
    const { startSeconds, endSeconds } = step.excerpt;
    if (this.player && this.ready) {
      const current = this.player.getCurrentTime();
      if (!Number.isFinite(current) || current < startSeconds || current >= endSeconds) this.player.seekTo(startSeconds, true);
      this.player.playVideo();
      this.startPolling();
      return;
    }
    this.videoId = step.videoId;
    this.container.replaceChildren();
    const mount = this.container.ownerDocument.createElement('div');
    this.container.append(mount);
    this.player = new api.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      width: '100%', height: '100%', videoId: step.videoId,
      playerVars: {
        autoplay: 0, controls: 1, playsinline: 1, rel: 0,
        origin: this.window.location.origin, start: startSeconds, end: endSeconds,
      },
      events: {
        onReady: event => {
          if (epoch !== this.epoch || !this.consent) { event.target.destroy(); return; }
          this.stopReadinessWait();
          this.ready = true;
          const frame = event.target.getIframe();
          frame.title = `Archive YouTube · ${step.video.title}`;
          frame.referrerPolicy = 'strict-origin-when-cross-origin';
          if (!this.active || request !== this.request) { event.target.pauseVideo(); return; }
          event.target.seekTo(startSeconds, true);
          event.target.playVideo();
          this.startPolling();
        },
        onStateChange: event => {
          if (epoch !== this.epoch || !this.active) return;
          if (event.data === 0) { this.stopPolling(); this.callbacks.onEnded?.(); }
          else if (event.data === 1) { this.callbacks.onState?.(true); this.callbacks.onStatus?.('Lecture dans le lecteur officiel YouTube.'); this.startPolling(); }
          else if (event.data === 2) { this.stopPolling(); this.callbacks.onState?.(false); this.callbacks.onStatus?.('En pause dans le lecteur YouTube.'); }
          else if (event.data === 3) { this.stopPolling(); this.callbacks.onStatus?.('Chargement de la vidéo… le récit attend le lecteur.'); }
        },
        onError: event => {
          if (epoch !== this.epoch || !this.active) return;
          this.stopReadinessWait();
          this.stopPolling();
          this.callbacks.onError?.(youtubeErrorMessage(event.data));
        },
        onAutoplayBlocked: () => {
          if (epoch !== this.epoch || !this.active) return;
          this.callbacks.onError?.('Le navigateur bloque le démarrage. Appuyez sur PLAY pour réessayer, utilisez le lecteur YouTube ou revenez à la maquette.');
        },
      },
    });
    if (!this.ready && this.active) this.readyTimer = this.window.setTimeout(() => {
      if (epoch !== this.epoch || request !== this.request || !this.active || this.ready) return;
      this.pause();
      this.callbacks.onError?.('Le lecteur YouTube ne répond pas. Réessayez avec PLAY, ouvrez YouTube ou revenez à la maquette.');
    }, this.readyTimeoutMs);
  }
  pause() {
    this.stopReadinessWait();
    this.request += 1;
    this.active = false;
    this.stopPolling();
    try { this.player?.pauseVideo(); } catch { /* Chargement encore en cours. */ }
  }
  unload() {
    this.pause();
    this.epoch += 1;
    try { this.player?.destroy(); } catch { /* Iframe déjà retirée. */ }
    this.player = null;
    this.ready = false;
    this.videoId = null;
    this.callbacks = {};
    this.container.replaceChildren();
  }
}
