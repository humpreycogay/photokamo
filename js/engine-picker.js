// Engine picker: a button that opens a grouped listbox in a popover (SPEC §4 A/B).
// The listbox keeps focus and points at the active row with aria-activedescendant.
// Keys: ↑/↓ Home/End move, Enter/Space choose, Esc/Tab close; clicking outside closes.
// On phones the same popover is styled as a bottom sheet (css: .engine-list).
//
// createEnginePicker({ button, list, name, status, groups, onChoose, place })
//   groups: [{ id, label, items: [{ id, name }] }]. Rows show the name only; groups are
//   split by a line, and their label is for screen readers.
//   place(): false to skip positioning under the button (bottom sheet)
// Returns { setValue(id), setStatus(text, tone) }.

const check = '<svg class="engine-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export function createEnginePicker({ button, list, name, status, groups, onChoose, place = () => true }) {
  const items = groups.flatMap(group => group.items);
  const optionId = id => `engine-option-${id}`;
  let value = items[0].id;
  let active = value;

  list.innerHTML = groups.map(group => `<div class="engine-group" role="group" aria-label="${group.label}">${group.items.map(item => `<div class="engine-option" role="option" id="${optionId(item.id)}" data-engine="${item.id}" aria-selected="false"><span class="engine-option-name">${item.name}</span>${check}</div>`).join('')}</div>`).join('');
  const option = id => list.querySelector(`[data-engine="${id}"]`);

  function setActive(id, scroll = true) {
    active = id;
    list.querySelectorAll('.engine-option').forEach(row => row.classList.toggle('is-active', row.dataset.engine === id));
    list.setAttribute('aria-activedescendant', optionId(id));
    if (scroll) option(id).scrollIntoView({ block: 'nearest' });
  }
  function choose(id) {
    list.hidePopover();
    button.focus();
    if (id !== value) onChoose(id);
  }
  function position() {
    list.style.left = list.style.top = list.style.width = '';
    if (!place()) return;
    const rect = button.getBoundingClientRect();
    list.style.left = `${rect.left}px`; list.style.width = `${rect.width}px`;
    const height = list.offsetHeight;
    const below = rect.bottom + 6;
    list.style.top = `${below + height > innerHeight - 8 && rect.top - 6 - height > 8 ? rect.top - 6 - height : below}px`;
  }

  list.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    button.setAttribute('aria-expanded', open);
    if (!open) return;
    position();
    setActive(value);
    list.focus();
  });
  list.addEventListener('keydown', event => {
    const index = items.findIndex(item => item.id === active);
    const move = { ArrowDown: Math.min(items.length - 1, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: items.length - 1 }[event.key];
    if (move !== undefined) { event.preventDefault(); setActive(items[move].id); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return; }
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); list.hidePopover(); button.focus(); }
  });
  list.addEventListener('click', event => { const row = event.target.closest('[data-engine]'); if (row) choose(row.dataset.engine); });
  list.addEventListener('pointermove', event => { const row = event.target.closest('[data-engine]'); if (row && row.dataset.engine !== active) setActive(row.dataset.engine, false); });
  // ↑/↓ on the button open the list too, like a native select.
  button.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault(); list.showPopover();
  });
  addEventListener('resize', () => { if (list.matches(':popover-open')) position(); });

  return {
    setValue(id) {
      value = id;
      const item = items.find(entry => entry.id === id);
      name.textContent = item.name;
      list.querySelectorAll('.engine-option').forEach(row => row.setAttribute('aria-selected', row.dataset.engine === id));
    },
    setStatus(text, tone = '') {
      status.textContent = text; status.hidden = !text;
      status.dataset.tone = tone;
    }
  };
}
