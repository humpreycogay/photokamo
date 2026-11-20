// Option picker: a bottom sheet with a grouped listbox, for select rows in the phone film sheet
// (docs/handover-mobile-film-panel, SPEC §4 "ParamRow — select"). Same keyboard model as the
// engine picker: the listbox keeps focus and points at the active row with aria-activedescendant.
// Keys: ↑/↓ Home/End move, Enter/Space choose, Esc closes; tapping outside closes (popover light dismiss).
//
// createOptionPicker({ sheet, title, list })
//   sheet: [popover] element; title: its heading; list: the [role=listbox] inside.
// Returns { open({ anchor, label, options: [{ value, label, group }], value, onChoose }) }.

const escapeHtml = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const check = '<svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export function createOptionPicker({ sheet, title, list }) {
  let rows = []; let active = null; let current = null; let chosen = null; let anchor = null;

  function setActive(index, scroll = true) {
    rows.forEach((row, i) => row.classList.toggle('is-active', i === index));
    active = index;
    list.setAttribute('aria-activedescendant', rows[index].id);
    if (scroll) rows[index].scrollIntoView({ block: 'nearest' });
  }
  function choose(index) {
    chosen = rows[index].dataset.value;
    sheet.hidePopover();
  }

  sheet.addEventListener('toggle', event => {
    if (event.newState === 'open') {
      const selected = Math.max(0, rows.findIndex(row => row.dataset.value === current));
      setActive(selected);
      rows[selected].scrollIntoView({ block: 'center' });
      list.focus();
      return;
    }
    anchor?.setAttribute('aria-expanded', 'false');
    anchor?.focus();
    if (chosen !== null && chosen !== current) open.onChoose?.(chosen);
    chosen = null;
  });
  list.addEventListener('keydown', event => {
    const move = { ArrowDown: Math.min(rows.length - 1, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: rows.length - 1 }[event.key];
    if (move !== undefined) { event.preventDefault(); setActive(move); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return; }
    if (event.key === 'Tab') { event.preventDefault(); sheet.hidePopover(); }
  });
  list.addEventListener('click', event => { const row = event.target.closest('[role=option]'); if (row) choose(rows.indexOf(row)); });

  function open({ anchor: button, label, options, value, onChoose }) {
    anchor = button; current = String(value); chosen = null; open.onChoose = onChoose;
    title.textContent = label;
    const groups = new Map();
    for (const option of options) {
      const group = option.group || '';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(option);
    }
    let index = 0;
    list.innerHTML = [...groups].map(([group, items]) => {
      const body = items.map(option => `<div class="option-row" role="option" id="option-${index++}" data-value="${escapeHtml(option.value)}" aria-selected="${String(option.value) === current}"><span class="option-name">${escapeHtml(option.label)}</span>${check}</div>`).join('');
      return group ? `<div class="option-group" role="group" aria-label="${escapeHtml(group)}"><p class="option-group-label" aria-hidden="true">${escapeHtml(group)}</p>${body}</div>` : `<div class="option-group" role="group">${body}</div>`;
    }).join('');
    rows = [...list.querySelectorAll('[role=option]')];
    button.setAttribute('aria-expanded', 'true');
    sheet.showPopover();
  }
  return { open };
}
