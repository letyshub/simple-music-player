import { el } from '../util/dom.js';

/**
 * A single floating menu, reused by the track list and the sidebar.
 * Only one can be open, and it closes on the next click, scroll or Escape.
 */

let open = null;

export function closeContextMenu() {
  open?.remove();
  open = null;
}

/**
 * @param {number} x window coordinates of the click
 * @param {number} y
 * @param {Array} items  {label, action, danger} | {header} | 'separator'
 */
export function showContextMenu(x, y, items) {
  closeContextMenu();

  const menu = el('div', { class: 'context-menu' });
  for (const item of items) {
    if (item === 'separator') {
      menu.append(el('hr'));
    } else if (item.header) {
      menu.append(el('div', { class: 'menu-label', text: item.header }));
    } else {
      menu.append(el('button', {
        type: 'button',
        text: item.label,
        class: item.danger ? 'danger' : null,
        onClick: () => { closeContextMenu(); item.action(); },
      }));
    }
  }

  // Placed off-screen first so its real size can be measured before deciding
  // whether it has to flip to stay inside the window.
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';
  document.body.append(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  open = menu;
}

document.addEventListener('pointerdown', (event) => {
  if (open && !open.contains(event.target)) closeContextMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContextMenu();
});
window.addEventListener('blur', closeContextMenu);
document.addEventListener('scroll', closeContextMenu, true);
