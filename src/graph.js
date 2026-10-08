import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { eligible } from './data.js';

export const COLORS = { person: '#7551b5', work: '#6d5bb7', place: '#087f78', institution: '#3f69a8', event: '#a75c12', unknown: '#687180' };
const DARK_COLORS = { person: '#ecebf9', work: '#a081ff', place: '#58dfcc', institution: '#719fff', event: '#e7b969', unknown: '#8f899f' };
const NETWORK_COLORS = { light: ['#2877c7', '#c44f68', '#8060b7'], dark: ['#83bdff', '#ff9eb0', '#c6a2ff'] };
export const AVATAR_LIMIT = 12;
export function selectAvatarCandidates(nodes, degree, { reduced = false, mobile = false, deviceMemory = 4, focused = null, pathNodes = new Set() } = {}) {
  if (reduced || deviceMemory < 2 || nodes.length > (mobile ? 14 : 36)) return [];
  return nodes.filter(node => node.type === 'person' && (node.avatarImage || node.image))
    .sort((a, b) => Number(b.id === focused) - Number(a.id === focused) ||
      Number(pathNodes.has(b.id)) - Number(pathNodes.has(a.id)) ||
      (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, AVATAR_LIMIT);
}
export function emphasizedScale(scale, emphasized) { return scale * (emphasized ? 1.12 : 1); }
export function selectVisibleLabels(candidates, limit, gap = 10) {
  const priority = candidate => candidate.identity ? 0 : candidate.selected ? 1 : candidate.path ? 2 : candidate.neighbor ? 3 : 4;
  const ordered = [...candidates].sort((a, b) => priority(a) - priority(b) || (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id));
  const accepted = [];
  for (const candidate of ordered) {
    const rank = priority(candidate);
    if (rank >= 3 && accepted.length >= limit) continue;
    const overlaps = accepted.some(other =>
      candidate.left < other.right + gap && candidate.right + gap > other.left &&
      candidate.top < other.bottom + gap && candidate.bottom + gap > other.top);
    if (overlaps && rank >= 3) continue;
    accepted.push(candidate);
  }
  return new Set(accepted.map(candidate => candidate.id));
}
export class NetworkView {
  constructor(container, { onSelect, onEdge, onHover, onUnavailable }) {
    this.container = container;
    this.nodes = new Map(); this.edges = new Map(); this.path = new Set(); this.pathNodes = new Set(); this.roots = [];
    this.onSelect = onSelect; this.onEdge = onEdge; this.onHover = onHover;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1200);
    this.camera.position.set(0, 0, 235);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 1.2;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      this.available = false; onUnavailable(); return;
    }
    this.available = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.available = false; onUnavailable(); });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.reduced.matches; this.controls.dampingFactor = 0.065;
    this.controls.enablePan = true; this.controls.minDistance = 38; this.controls.maxDistance = 420;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('start', () => this.cancelTransition());
    this.geometry = new THREE.SphereGeometry(1, 14, 10);
    this.avatarGeometry = new THREE.CircleGeometry(1, 32);
    this.avatarLoader = new THREE.TextureLoader().setCrossOrigin('anonymous');
    this.avatarQueue = []; this.avatarQueued = new Map(); this.avatarLoads = 0;
    this.mobile = window.matchMedia('(max-width: 700px)');
    this.mobileListener = () => this.updateAvatars(this.degree || new Map());
    this.mobile.addEventListener('change', this.mobileListener);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255,255,255,.7)'); glow.addColorStop(0.18, 'rgba(255,255,255,.25)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = glow; context.fillRect(0, 0, 128, 128);
    this.glowTexture = new THREE.CanvasTexture(canvas);
    this.addStars();
    this.labels = document.createElement('div'); this.labels.className = 'graph-labels'; this.labels.setAttribute('aria-hidden', 'true'); container.append(this.labels);
    const resize = () => {
      this.width = container.clientWidth; this.height = container.clientHeight;
      this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height); this.dirty = true;
    };
    this.resizeObserver = new ResizeObserver(resize); this.resizeObserver.observe(container); resize();
    let down;
    const canvasElement = this.renderer.domElement;
    canvasElement.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, time: Date.now() }; });
    canvasElement.addEventListener('pointerup', event => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 7 && Date.now() - down.time < 700) {
        const hit = this.hit(event);
        if (hit?.kind === 'node') onSelect(hit.record.id);
        if (hit?.kind === 'edge') onEdge(hit.record.data);
      }
      down = null;
    });
    canvasElement.addEventListener('dblclick', event => { const hit = this.hit(event); if (hit?.kind === 'node') this.focus(hit.record.id); });
    canvasElement.addEventListener('pointermove', event => {
      if (event.buttons || event.pointerType === 'touch') return;
      const hit = this.hit(event);
      this.hovered = hit?.kind === 'node' ? hit.record.id : null;
      canvasElement.style.cursor = hit ? 'pointer' : 'grab';
      this.dirty = true;
      onHover(hit?.record.data || null, event.clientX, event.clientY);
    });
    canvasElement.addEventListener('pointerleave', () => { this.hovered = null; this.dirty = true; onHover(null); });
    this.motionListener = () => {
      if (this.reduced.matches && this.transition) {
        this.camera.position.copy(this.transition.toCamera); this.controls.target.copy(this.transition.toTarget); this.transition = null;
      }
      this.controls.enableDamping = !this.reduced.matches; this.updateAvatars(this.degree || new Map()); this.dirty = true;
    };
    this.reduced.addEventListener('change', this.motionListener);
    this.tick = this.tick.bind(this); this.frame = requestAnimationFrame(this.tick);
  }
  addStars() {
    const positions = new Float32Array(450 * 3);
    let seed = 42;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = (random() - 0.5) * 550; positions[i + 1] = (random() - 0.5) * 370; positions[i + 2] = -80 - random() * 140;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#7d789b', size: 0.35, transparent: true, opacity: 0.36 }));
    this.scene.add(this.stars);
  }
  hit(event) {
    if (!this.available) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const targets = [...this.nodes.values()].flatMap(node => node.avatar ? [node.avatar, node.mesh] : [node.mesh]);
    const nodes = this.raycaster.intersectObjects(targets, false);
    if (nodes[0]) return { kind: 'node', record: this.nodes.get(nodes[0].object.userData.id) };
    const edges = this.raycaster.intersectObjects([...this.edges.values()].map(e => e.line), false);
    if (edges[0]) return { kind: 'edge', record: this.edges.get(edges[0].object.userData.id) };
    return null;
  }
  setData(graph, visibleEdges = [...graph.edges.values()]) {
    if (!this.available) return;
    const ids = new Set(graph.nodes.keys()), edgeIDs = new Set(visibleEdges.map(e => e.id));
    for (const [id, node] of this.nodes) if (!ids.has(id)) {
      this.scene.remove(node.mesh, node.halo); this.disposeAvatar(node); node.mesh.material.dispose(); node.halo.material.dispose(); node.label.remove(); this.nodes.delete(id);
    }
    for (const [id, edge] of this.edges) if (!edgeIDs.has(id)) {
      this.scene.remove(edge.line, edge.particle); edge.line.geometry.dispose(); edge.line.material.dispose(); edge.particle.material.dispose(); this.edges.delete(id);
    }
    let index = 0;
    const degree = new Map();
    for (const edge of visibleEdges) for (const id of [edge.from, edge.to]) degree.set(id, (degree.get(id) || 0) + 1);
    for (const data of graph.nodes.values()) {
      if (!this.nodes.has(data.id)) {
        const color = this.themeColors()[data.type] || this.themeColors().unknown;
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, transparent: true }));
        mesh.userData.id = data.id;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.setScalar(data.type === 'person' ? 14 : 11);
        const angle = index * 2.39996;
        const radius = 38 + Math.sqrt(index + 1) * 15;
        const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.64, Math.sin(index * 1.9) * 29);
        const label = document.createElement('span'); label.textContent = data.label; label.className = 'graph-label'; label.dataset.type = data.type; this.labels.append(label);
        this.nodes.set(data.id, { id: data.id, data, mesh, halo, position, velocity: new THREE.Vector3(), label, born: performance.now() + index * 28, avatar: null, avatarURL: null, avatarFailedURL: null });
        this.scene.add(mesh, halo);
      } else { this.nodes.get(data.id).data = data; }
      const node = this.nodes.get(data.id);
      const relevance = Math.min(1.8, 1 + Math.log2(1 + (degree.get(data.id) || 0)) * 0.17);
      node.mesh.scale.setScalar((data.type === 'person' ? 1.55 : 1.2) * relevance);
      node.baseScale = node.mesh.scale.x;
      node.halo.scale.setScalar((data.type === 'person' ? 14 : 11) * relevance);
      node.mesh.material.color.set(this.themeColors()[data.type] || this.themeColors().unknown);
      node.halo.material.color.set(this.themeColors()[data.type] || this.themeColors().unknown);
      index++;
    }
    this.updateAvatars(degree);
    for (const data of visibleEdges) if (this.nodes.has(data.from) && this.nodes.has(data.to)) {
      if (!this.edges.has(data.id)) {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#766790', transparent: true, opacity: 0.25 }));
        line.userData.id = data.id;
        const particle = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#c6b2f8', transparent: true, opacity: 0.6 }));
        particle.scale.setScalar(0.35);
        this.edges.set(data.id, { data, line, particle, offset: this.edges.size * 0.173 }); this.scene.add(line, particle);
      } else this.edges.get(data.id).data = data;
    }
    this.updateNetworks(); this.iterations = 0; this.dirty = true;
    if (this.reduced.matches) for (let i = 0; i < 180; i++) this.physics();
  }
  disposeAvatar(node) {
    if (node.avatar) {
      this.scene.remove(node.avatar);
      node.avatar.material.map?.dispose();
      node.avatar.material.dispose();
      node.avatar = null;
    }
  }
  updateAvatars(degree) {
    this.degree = degree;
    const nodes = [...this.nodes.values()].map(node => node.data);
    const candidates = selectAvatarCandidates(nodes, degree, {
      reduced: this.reduced.matches, mobile: this.mobile.matches,
      deviceMemory: navigator.deviceMemory ?? 4, focused: this.hovered || this.selected, pathNodes: this.pathNodes,
    });
    const wanted = new Map(candidates.map(data => [data.id, data.avatarImage || data.image]));
    for (const node of this.nodes.values()) {
      const url = wanted.get(node.id);
      if (!url) {
        this.disposeAvatar(node); node.avatarURL = null;
        continue;
      }
      if (node.avatarURL === url || node.avatarFailedURL === url) continue;
      this.disposeAvatar(node);
      node.avatarURL = url;
      this.avatarQueue.push({ id: node.id, url });
      this.avatarQueued.set(node.id, url);
    }
    this.loadAvatarQueue();
  }
  loadAvatarQueue() {
    while (this.avatarLoads < 3 && this.avatarQueue.length) {
      const { id, url } = this.avatarQueue.shift();
      if (this.avatarQueued.get(id) !== url) continue;
      this.avatarQueued.delete(id);
      const node = this.nodes.get(id);
      if (!node || node.avatarURL !== url) continue;
      this.avatarLoads++;
      const finish = () => { this.avatarLoads--; this.loadAvatarQueue(); };
      this.avatarLoader.load(url, texture => {
        const current = this.nodes.get(id);
        if (!current || current.avatarURL !== url) { texture.dispose(); finish(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        const width = texture.image?.naturalWidth || texture.image?.width || 1;
        const height = texture.image?.naturalHeight || texture.image?.height || 1;
        if (width > height) {
          texture.repeat.x = height / width; texture.offset.x = (1 - texture.repeat.x) / 2;
        } else if (height > width) {
          texture.repeat.y = width / height; texture.offset.y = (1 - texture.repeat.y) / 2;
        }
        current.avatar = new THREE.Mesh(this.avatarGeometry, new THREE.MeshBasicMaterial({
          map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        }));
        current.avatar.userData.id = id;
        this.scene.add(current.avatar); this.dirty = true; finish();
      }, undefined, () => {
        const current = this.nodes.get(id);
        if (current?.avatarURL === url) { current.avatarURL = null; current.avatarFailedURL = url; }
        finish();
      });
    }
  }
  setSelected(id) {
    this.selected = id || null;
    if (this.degree) this.updateAvatars(this.degree);
    this.dirty = true;
  }
    themeColors() { return document.body.dataset.theme === 'dark' ? DARK_COLORS : COLORS; }
    setTheme() { this.dirty = true; }
    setRoots(ids) {
      this.roots = ids.slice(0, 2);
      this.updateNetworks();
      this.dirty = true;
    }
    updateNetworks() {
      this.networks = new Map();
      const adjacency = new Map();
      for (const edge of this.edges.values()) {
        if (!eligible(edge.data)) continue;
        for (const [from, to] of [[edge.data.from, edge.data.to], [edge.data.to, edge.data.from]]) {
          if (!adjacency.has(from)) adjacency.set(from, []);
          adjacency.get(from).push(to);
        }
      }
      this.roots.forEach((root, side) => {
        const queue = [root], seen = new Set([root]);
        for (let index = 0; index < queue.length; index++) {
          const id = queue[index];
          this.networks.set(id, (this.networks.get(id) || 0) | (1 << side));
          for (const neighbor of adjacency.get(id) || []) if (!seen.has(neighbor)) {
            seen.add(neighbor); queue.push(neighbor);
          }
        }
      });
    }
    physics() {
    const nodes = [...this.nodes.values()];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], difference = a.position.clone().sub(b.position);
        const length = Math.max(12, difference.length());
        difference.multiplyScalar(50 / (length * length * length));
        a.velocity.add(difference); b.velocity.sub(difference);
      }
      a.velocity.addScaledVector(a.position, -0.00013);
    }
    for (const edge of this.edges.values()) {
      const a = this.nodes.get(edge.data.from), b = this.nodes.get(edge.data.to);
      const difference = b.position.clone().sub(a.position), length = difference.length();
      difference.multiplyScalar((length - 39) * 0.0014 / Math.max(1, length));
      a.velocity.add(difference); b.velocity.sub(difference);
    }
    for (const node of nodes) { node.velocity.multiplyScalar(0.84); node.position.add(node.velocity); }
    this.iterations++;
  }
  tick(time) {
    this.frame = requestAnimationFrame(this.tick);
    if (!this.available || document.hidden) return;
    const animate = !this.reduced.matches;
    if (animate && this.iterations < 400) { this.physics(); this.dirty = true; }
    if (!animate && !this.dirty) return;
    this.updateTransition(time);
    this.controls.update();
    const focused = this.hovered || this.selected;
    const neighbors = new Set([focused]);
    if (focused) for (const edge of this.edges.values()) {
      if (edge.data.from === focused) neighbors.add(edge.data.to);
      if (edge.data.to === focused) neighbors.add(edge.data.from);
    }
    const labelCandidates = [];
    const colors = this.themeColors();
    for (const [index, node] of [...this.nodes.values()].entries()) {
      const emphasized = node.id === focused;
      node.mesh.scale.setScalar(emphasizedScale(node.baseScale, emphasized));
      node.mesh.position.copy(node.position);
      if (animate) {
        node.mesh.position.x += Math.sin(time / 5000 + index) * 0.9;
        node.mesh.position.y += Math.cos(time / 6500 + index * 2) * 0.8;
      }
      node.halo.position.copy(node.mesh.position);
      if (node.avatar) {
        node.avatar.quaternion.copy(this.camera.quaternion);
        const towardCamera = node.mesh.position.clone().sub(this.camera.position).negate().normalize();
        node.avatar.position.copy(node.mesh.position).addScaledVector(towardCamera, node.mesh.scale.x * 1.06);
        node.avatar.scale.setScalar(node.baseScale * (emphasized ? 1.12 : 1));
      }
      const opacity = animate ? Math.max(0, Math.min(1, (time - node.born) / 850)) : 1;
      const highlighted = this.pathNodes.has(node.id);
      const dim = this.pathNodes.size ? !highlighted : focused && !neighbors.has(node.id);
      const rootSide = this.roots.indexOf(node.id);
      const mask = this.networks.get(node.id) || 0;
      const theme = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
      const networkColor = mask ? NETWORK_COLORS[theme][mask === 3 ? 2 : mask === 2 ? 1 : 0] : null;
      const color = highlighted || node.id === focused
        ? (theme === 'dark' ? '#edc879' : '#a76500')
        : rootSide >= 0 ? NETWORK_COLORS[theme][rootSide] : colors[node.data.type] || colors.unknown;
      node.mesh.material.color.set(color); node.halo.material.color.set(networkColor || color);
      node.mesh.material.opacity = opacity * (dim ? 0.18 : 0.96);
      node.halo.material.opacity = opacity * (dim ? 0.12 : 0.7);
      if (node.avatar) node.avatar.material.opacity = opacity * (dim ? 0.16 : 0.98);
      const screen = node.mesh.position.clone().project(this.camera);
      const x = (screen.x + 1) / 2 * this.width + 12, y = (-screen.y + 1) / 2 * this.height - 12;
      node.label.dataset.identity = rootSide < 0 ? '' : rootSide === 0 ? 'A' : 'B';
      node.label.dataset.network = String(mask);
      node.label.classList.toggle('graph-label--identity', rootSide >= 0);
      node.label.classList.toggle('graph-label--selected', node.id === focused);
      node.label.classList.toggle('graph-label--path', highlighted);
      node.label.classList.toggle('graph-label--neighbor', neighbors.has(node.id));
      const width = Math.min(230, Math.max(58, node.data.label.length * (rootSide >= 0 ? 9 : 7.5) + (rootSide >= 0 ? 38 : 24)));
      const height = rootSide >= 0 ? 34 : 28;
      if (screen.z <= 1 && screen.z >= -1 && x > -width && x < this.width && y > -height && y < this.height) {
        labelCandidates.push({
          id: node.id, left: x, top: y, right: x + width, bottom: y + height, x, y,
          identity: rootSide >= 0, selected: node.id === focused, path: highlighted,
          neighbor: neighbors.has(node.id), degree: this.degree?.get(node.id) || 0,
          opacity: opacity * (dim ? 0.4 : 1),
        });
      }
    }
    const distance = this.camera.position.distanceTo(this.controls.target);
    const zoom = Math.max(0.45, Math.min(1.8, 235 / distance));
    const labelLimit = Math.max(6, Math.min(32, Math.floor(this.width * this.height / 24000 * zoom)));
    const visibleLabels = selectVisibleLabels(labelCandidates, labelLimit);
    const candidatesById = new Map(labelCandidates.map(candidate => [candidate.id, candidate]));
    for (const node of this.nodes.values()) {
      const label = node.label, candidate = candidatesById.get(node.id);
      const visible = candidate && visibleLabels.has(node.id);
      label.hidden = !visible;
      if (!visible) continue;
      label.style.transform = `translate(${candidate.x}px, ${candidate.y}px)`;
      label.style.opacity = String(candidate.opacity);
      label.style.setProperty('--label-scale', String(Math.max(0.86, Math.min(1.12, zoom))));
    }
    for (const edge of this.edges.values()) {
      const from = this.nodes.get(edge.data.from).mesh.position, to = this.nodes.get(edge.data.to).mesh.position;
      const positions = edge.line.geometry.attributes.position;
      positions.setXYZ(0, from.x, from.y, from.z); positions.setXYZ(1, to.x, to.y, to.z); positions.needsUpdate = true;
      edge.line.geometry.computeBoundingSphere();
      const highlighted = this.path.has(edge.data.id), near = edge.data.from === focused || edge.data.to === focused;
      const mask = (this.networks.get(edge.data.from) || 0) | (this.networks.get(edge.data.to) || 0);
      const theme = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
      const palette = NETWORK_COLORS[theme];
      const lineColor = highlighted ? (theme === 'dark' ? '#edc879' : '#a76500') :
        mask ? palette[mask === 3 ? 2 : mask === 2 ? 1 : 0] : theme === 'dark' ? '#69567f' : '#9aa3b2';
      edge.line.material.color.set(lineColor);
      const reveal = animate ? Math.max(0, Math.min(1, (time - Math.max(this.nodes.get(edge.data.from).born, this.nodes.get(edge.data.to).born)) / 850)) : 1;
      edge.line.material.opacity = reveal * (highlighted ? 0.96 : this.pathNodes.size ? 0.12 : near ? 0.78 : mask ? 0.46 : 0.28);
      edge.particle.visible = animate && reveal > 0.6 && (!this.pathNodes.size || highlighted);
      edge.particle.position.lerpVectors(from, to, (time / 6500 + edge.offset) % 1);
      edge.particle.material.color.set(highlighted ? '#ffe1a1' : '#b8a2e8');
    }
    this.renderer.render(this.scene, this.camera); this.dirty = false;
  }
  highlightPath(path) {
    this.path = new Set(path?.edges.map(e => e.id) || []); this.pathNodes = new Set(path?.nodes || []);
    if (this.degree) this.updateAvatars(this.degree);
    this.dirty = true;
  }
  cancelTransition() {
    this.transition = null;
    if (this.controls) this.controls.enableDamping = !this.reduced.matches;
    this.dirty = true;
  }
  transitionTo(target, camera) {
    this.cancelTransition();
    if (this.reduced.matches) {
      this.controls.target.copy(target); this.camera.position.copy(camera); this.controls.update(); return;
    }
    this.controls.enableDamping = false;
    this.controls.update();
    this.transition = {
      fromCamera: this.camera.position.clone(), fromTarget: this.controls.target.clone(),
      toCamera: camera.clone(), toTarget: target.clone(), start: performance.now(), duration: 950,
    };
    this.dirty = true;
  }
  updateTransition(time) {
    if (!this.transition) return;
    const transition = this.transition;
    const progress = Math.min(1, Math.max(0, (time - transition.start) / transition.duration));
    const eased = progress * progress * (3 - 2 * progress);
    this.camera.position.lerpVectors(transition.fromCamera, transition.toCamera, eased);
    this.controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    this.dirty = true;
    if (progress === 1) this.cancelTransition();
  }
  focus(id) {
    if (!this.available || !this.nodes.has(id)) return;
    const destination = this.nodes.get(id).position;
    const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(95);
    this.transitionTo(destination, destination.clone().add(offset));
  }
  reset() {
    if (!this.available) return;
    this.transitionTo(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 235));
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.resizeObserver?.disconnect();
    if (this.motionListener) this.reduced.removeEventListener('change', this.motionListener);
    if (this.mobileListener) this.mobile.removeEventListener('change', this.mobileListener);
    this.controls?.dispose();
    this.scene.traverse(object => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach(m => m.dispose()); else object.material?.dispose(); });
    this.glowTexture?.dispose(); this.avatarGeometry?.dispose(); this.renderer?.dispose(); this.labels?.remove(); this.renderer?.domElement.remove();
  }
}
