import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const COLORS = { person: '#ecebf9', work: '#a081ff', place: '#58dfcc', institution: '#719fff', event: '#e7b969', unknown: '#8f899f' };
export class NetworkView {
  constructor(container, { onSelect, onEdge, onHover, onUnavailable }) {
    this.container = container;
    this.nodes = new Map(); this.edges = new Map(); this.path = new Set(); this.pathNodes = new Set();
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
      this.controls.enableDamping = !this.reduced.matches; this.dirty = true;
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
    const nodes = this.raycaster.intersectObjects([...this.nodes.values()].map(n => n.mesh), false);
    if (nodes[0]) return { kind: 'node', record: this.nodes.get(nodes[0].object.userData.id) };
    const edges = this.raycaster.intersectObjects([...this.edges.values()].map(e => e.line), false);
    if (edges[0]) return { kind: 'edge', record: this.edges.get(edges[0].object.userData.id) };
    return null;
  }
  setData(graph, visibleEdges = [...graph.edges.values()]) {
    if (!this.available) return;
    const ids = new Set(graph.nodes.keys()), edgeIDs = new Set(visibleEdges.map(e => e.id));
    for (const [id, node] of this.nodes) if (!ids.has(id)) {
      this.scene.remove(node.mesh, node.halo); node.mesh.material.dispose(); node.halo.material.dispose(); node.label.remove(); this.nodes.delete(id);
    }
    for (const [id, edge] of this.edges) if (!edgeIDs.has(id)) {
      this.scene.remove(edge.line, edge.particle); edge.line.geometry.dispose(); edge.line.material.dispose(); edge.particle.material.dispose(); this.edges.delete(id);
    }
    let index = 0;
    const degree = new Map();
    for (const edge of visibleEdges) for (const id of [edge.from, edge.to]) degree.set(id, (degree.get(id) || 0) + 1);
    for (const data of graph.nodes.values()) {
      if (!this.nodes.has(data.id)) {
        const color = COLORS[data.type] || COLORS.institution;
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, transparent: true }));
        mesh.userData.id = data.id;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.setScalar(data.type === 'person' ? 14 : 11);
        const angle = index * 2.39996;
        const radius = 38 + Math.sqrt(index + 1) * 15;
        const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.64, Math.sin(index * 1.9) * 29);
        const label = document.createElement('span'); label.textContent = data.label; label.className = 'graph-label'; this.labels.append(label);
        this.nodes.set(data.id, { id: data.id, data, mesh, halo, position, velocity: new THREE.Vector3(), label, born: performance.now() + index * 28 });
        this.scene.add(mesh, halo);
      } else { this.nodes.get(data.id).data = data; }
      const node = this.nodes.get(data.id);
      const relevance = Math.min(1.8, 1 + Math.log2(1 + (degree.get(data.id) || 0)) * 0.17);
      node.mesh.scale.setScalar((data.type === 'person' ? 1.55 : 1.2) * relevance);
      node.halo.scale.setScalar((data.type === 'person' ? 14 : 11) * relevance);
      node.mesh.material.color.set(COLORS[data.type] || COLORS.unknown);
      node.halo.material.color.set(COLORS[data.type] || COLORS.unknown);
      index++;
    }
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
    this.iterations = 0; this.dirty = true;
    if (this.reduced.matches) for (let i = 0; i < 180; i++) this.physics();
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
    const neighbors = new Set([this.hovered]);
    if (this.hovered) for (const edge of this.edges.values()) {
      if (edge.data.from === this.hovered) neighbors.add(edge.data.to);
      if (edge.data.to === this.hovered) neighbors.add(edge.data.from);
    }
    for (const [index, node] of [...this.nodes.values()].entries()) {
      node.mesh.position.copy(node.position);
      if (animate) {
        node.mesh.position.x += Math.sin(time / 5000 + index) * 0.9;
        node.mesh.position.y += Math.cos(time / 6500 + index * 2) * 0.8;
      }
      node.halo.position.copy(node.mesh.position);
      const opacity = animate ? Math.max(0, Math.min(1, (time - node.born) / 850)) : 1;
      const highlighted = this.pathNodes.has(node.id);
      const dim = this.hovered && !neighbors.has(node.id) || this.pathNodes.size && !highlighted;
      const color = highlighted ? '#edc879' : COLORS[node.data.type] || COLORS.unknown;
      node.mesh.material.color.set(color); node.halo.material.color.set(color);
      node.mesh.material.opacity = opacity * (dim ? 0.18 : 0.96);
      node.halo.material.opacity = opacity * (dim ? 0.12 : 0.7);
      const screen = node.mesh.position.clone().project(this.camera);
      node.label.style.transform = `translate(${(screen.x + 1) / 2 * this.width + 10}px, ${(-screen.y + 1) / 2 * this.height - 5}px)`;
      node.label.style.opacity = screen.z > 1 || screen.z < -1 ? 0 : opacity * (dim ? 0.16 : 0.64);
    }
    for (const edge of this.edges.values()) {
      const from = this.nodes.get(edge.data.from).mesh.position, to = this.nodes.get(edge.data.to).mesh.position;
      const positions = edge.line.geometry.attributes.position;
      positions.setXYZ(0, from.x, from.y, from.z); positions.setXYZ(1, to.x, to.y, to.z); positions.needsUpdate = true;
      edge.line.geometry.computeBoundingSphere();
      const highlighted = this.path.has(edge.data.id), near = edge.data.from === this.hovered || edge.data.to === this.hovered;
      edge.line.material.color.set(highlighted ? '#edc879' : edge.data.evidence === 'unverified' ? '#67586c' : near ? '#bda6f1' : '#69567f');
      const reveal = animate ? Math.max(0, Math.min(1, (time - Math.max(this.nodes.get(edge.data.from).born, this.nodes.get(edge.data.to).born)) / 850)) : 1;
      edge.line.material.opacity = reveal * (highlighted ? 0.9 : this.pathNodes.size ? 0.06 : near ? 0.72 : 0.26);
      edge.particle.visible = animate && reveal > 0.6 && (!this.pathNodes.size || highlighted);
      edge.particle.position.lerpVectors(from, to, (time / 6500 + edge.offset) % 1);
      edge.particle.material.color.set(highlighted ? '#ffe1a1' : '#b8a2e8');
    }
    this.renderer.render(this.scene, this.camera); this.dirty = false;
  }
  highlightPath(path) {
    this.path = new Set(path?.edges.map(e => e.id) || []); this.pathNodes = new Set(path?.nodes || []); this.dirty = true;
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
    this.controls?.dispose();
    this.scene.traverse(object => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach(m => m.dispose()); else object.material?.dispose(); });
    this.glowTexture?.dispose(); this.renderer?.dispose(); this.labels?.remove(); this.renderer?.domElement.remove();
  }
}
