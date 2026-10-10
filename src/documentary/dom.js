// DOM construit avec textContent : texte libre et sources ne deviennent jamais du HTML.
import { iconFor } from '../icons.js';
import { sourceURL } from './model.js';

export function node(tag, className = '', value = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== '') element.textContent = value;
  return element;
}
export function icon(name) {
  const element = node('span', 'ico');
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = iconFor(name); // Seules les constantes internes de icons.js sont du HTML.
  return element;
}
export function action(label, callback, className = 'pill small', iconName = '') {
  const element = node('button', className);
  element.type = 'button';
  if (iconName) element.append(icon(iconName));
  element.append(node('span', '', label));
  element.addEventListener('click', callback);
  return element;
}
export function externalLink(label, value, className = 'text-link') {
  const url = sourceURL(value);
  if (!url) return node('span', 'fine-print', label);
  const element = node('a', className, label);
  element.href = url;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}
export function timecode(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function field(label, input, hint = '') {
  const wrap = node('div', 'doc-field');
  const title = node('label', '', label);
  title.htmlFor = input.id;
  wrap.append(title, input);
  if (hint) {
    const help = node('small', 'fine-print', hint);
    help.id = `${input.id}-hint`;
    input.setAttribute('aria-describedby', help.id);
    wrap.append(help);
  }
  return wrap;
}
