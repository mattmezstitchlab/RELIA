// Pictogrammes vectoriels de l’interface : une seule famille (24 × 24, trait arrondi).
// Les chaînes sont constantes et ne contiennent aucune donnée utilisateur : elles peuvent être insérées telles quelles.
const outline = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${body}</svg>`;
const solid = body => `<svg viewBox="0 0 24 24" fill="currentColor" focusable="false" aria-hidden="true">${body}</svg>`;

export const ICONS = Object.freeze({
  search: outline('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  close: outline('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  back: outline('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  chevron: outline('<path d="M9.5 6l6 6-6 6"/>'),
  chevronDown: outline('<path d="M6 9.5l6 6 6-6"/>'),
  arrowRight: outline('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>'),
  person: outline('<circle cx="12" cy="8.2" r="3.9"/><path d="M4.8 20.2c.9-3.7 3.7-5.8 7.2-5.8s6.3 2.1 7.2 5.8"/>'),
  userPlus: outline('<circle cx="10" cy="8.2" r="3.9"/><path d="M3.3 20.2c.9-3.7 3.6-5.8 6.7-5.8 1.5 0 2.9.4 4 1.2"/><path d="M18.5 13.5v6M15.5 16.5h6"/>'),
  link: outline('<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1"/>'),
  graph: outline('<circle cx="6" cy="6.5" r="2.3"/><circle cx="18" cy="6.5" r="2.3"/><circle cx="12" cy="17.5" r="2.3"/><path d="M8 7.8l2.6 7.6M16 7.8l-2.6 7.6M8.3 6.5h7.4"/>'),
  play: solid('<path d="M8.2 5.6v12.8a.8.8 0 0 0 1.2.7l10.3-6.4a.8.8 0 0 0 0-1.4L9.4 4.9a.8.8 0 0 0-1.2.7z"/>'),
  pause: solid('<rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/>'),
  next: solid('<path d="M6 6.4v11.2a.8.8 0 0 0 1.2.7l7.6-5.6a.8.8 0 0 0 0-1.3L7.2 5.7A.8.8 0 0 0 6 6.4z"/><rect x="16" y="5.5" width="2.4" height="13" rx="1.2"/>'),
  prev: solid('<path d="M18 6.4v11.2a.8.8 0 0 1-1.2.7l-7.6-5.6a.8.8 0 0 1 0-1.3l7.6-5.6a.8.8 0 0 1 1.2.7z"/><rect x="5.6" y="5.5" width="2.4" height="13" rx="1.2"/>'),
  speaker: outline('<path d="M4.5 9.6h3.1L12 6v12l-4.4-3.6H4.5z"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M18.1 6.6a7.6 7.6 0 0 1 0 10.8"/>'),
  speakerOff: outline('<path d="M4.5 9.6h3.1L12 6v12l-4.4-3.6H4.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  settings: outline('<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2.2"/><circle cx="9" cy="16.5" r="2.2"/>'),
  help: outline('<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 1 1 4 2c-.9.6-1.6 1.1-1.6 2.3"/><path d="M12 16.9v.2"/>'),
  list: outline('<path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>'),
  clock: outline('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l2.9 1.9"/>'),
  edit: outline('<path d="M4.5 19.5l4.7-1 10-10a2.6 2.6 0 0 0-3.7-3.7l-10 10z"/><path d="M14.2 6.1l3.7 3.7M4.5 19.5h15"/>'),
  doc: outline('<path d="M7 3.8h6.8L18.5 8.5V19a1.7 1.7 0 0 1-1.7 1.7H7A1.7 1.7 0 0 1 5.3 19V5.5A1.7 1.7 0 0 1 7 3.8z"/><path d="M13.6 3.8v4.7h4.9M9 12.5h6M9 15.8h6"/>'),
  book: outline('<path d="M4.5 5.8c2.4-1.1 5-1 7.5.7 2.5-1.7 5.1-1.8 7.5-.7v12.2c-2.4-1.1-5-1-7.5.7-2.5-1.7-5.1-1.8-7.5-.7z"/><path d="M12 6.5v12.2"/>'),
  pin: outline('<path d="M12 20.6s6.2-5.3 6.2-10.3a6.2 6.2 0 1 0-12.4 0c0 5 6.2 10.3 6.2 10.3z"/><circle cx="12" cy="10.3" r="2.3"/>'),
  building: outline('<path d="M4 20.5h16"/><path d="M6 20.5v-11L12 4.5l6 5v11"/><path d="M10 20.5v-5h4v5"/><path d="M9.5 12.2h.01M14.5 12.2h.01" stroke-width="2.8"/>'),
  flag: outline('<path d="M6 20.5V4"/><path d="M6 4.6h10.6c.9 0 1.3 1.1.6 1.7l-2.3 2.2 2.3 2.2c.6.6.2 1.7-.6 1.7H6"/>'),
  lightbulb: outline('<path d="M9.4 17.6h5.2M10.2 20.6h3.6"/><path d="M8.7 14.3c-1.3-1-2.2-2.6-2.2-4.5a5.5 5.5 0 1 1 11 0c0 1.9-.9 3.5-2.2 4.5-.6.5-.9 1.1-.9 1.8v.3h-5v-.3c0-.7-.3-1.3-.7-1.8z"/>'),
  video: outline('<rect x="3.5" y="6.5" width="12.5" height="11" rx="2.8"/><path d="M16 10.4l4.6-2.6v8.4L16 13.6"/>'),
  calendar: outline('<rect x="4" y="5.5" width="16" height="14.5" rx="3.2"/><path d="M4 10h16M8.5 3.5v3.6M15.5 3.5v3.6"/>'),
  photo: outline('<rect x="3.5" y="5" width="17" height="14" rx="3.2"/><circle cx="9" cy="10" r="1.7"/><path d="M4.2 16.8l4.6-4.2 3.2 2.8 2.3-2 5.5 4.2"/>'),
  external: outline('<path d="M13.5 4.5h6v6M19.5 4.5l-8.5 8.5"/><path d="M17 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18V8a1.5 1.5 0 0 1 1.5-1.5H10"/>'),
  target: outline('<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3"/>'),
  reset: outline('<path d="M4.8 12a7.2 7.2 0 1 0 2.1-5.1"/><path d="M4.6 4.6v4.2h4.2"/>'),
  sun: outline('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>'),
  moon: outline('<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>'),
  info: outline('<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.9v.1"/>'),
  alert: outline('<path d="M10.3 4.9L3.6 17.4a1.7 1.7 0 0 0 1.5 2.5h13.8a1.7 1.7 0 0 0 1.5-2.5L13.7 4.9a1.7 1.7 0 0 0-3.4 0z"/><path d="M12 9.6v4.2M12 16.6v.1"/>'),
  check: outline('<circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>'),
  shield: outline('<path d="M12 3.6l7 2.7v5.4c0 4.3-2.9 7.6-7 8.9-4.1-1.3-7-4.6-7-8.9V6.3z"/><path d="M9 12.2l2.2 2.2 3.9-4.1"/>'),
  compass: outline('<circle cx="12" cy="12" r="8.6"/><path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z"/>'),
  dot: solid('<circle cx="12" cy="12" r="4.2"/>'),
  spinner: outline('<circle cx="12" cy="12" r="8.4" opacity=".25"/><path d="M20.4 12a8.4 8.4 0 0 0-8.4-8.4"/>'),
});

// Type d’entité → pictogramme (la couleur vient de la classe CSS du type).
export const TYPE_ICON = Object.freeze({
  person: 'person',
  work: 'book',
  place: 'pin',
  institution: 'building',
  event: 'flag',
  unknown: 'dot',
});

export function iconFor(name) {
  return ICONS[name] || ICONS.dot;
}

export function typeIconName(type) {
  return TYPE_ICON[type] || TYPE_ICON.unknown;
}

// Balisage d’un pictogramme encapsulé (utilisé pour les étiquettes 3D et les gabarits statiques).
export function iconHTML(name, className = 'ico') {
  return `<span class="${className}" aria-hidden="true">${iconFor(name)}</span>`;
}
