// Builds and syncs the Advanced panel from the active engine's `sections`
// (js/engines/<id>/index.js), so each engine shows its own controls.

const escapeHtml = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
export const controlId = path => `adv-${path.replace(/[^a-z0-9]+/gi, '-')}`;
const CHEVRON = '<svg class="adv-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function controlHtml(control, engine) {
  const depends = control.dependsOn ? ` data-depends="${control.dependsOn}"` : '';
  if (control.kind === 'heading') return `<h4 class="adv-group-heading"${depends}>${escapeHtml(control.label)}</h4>`;
  if (control.kind === 'note') return `<p class="adv-hint adv-section-note" data-note="${escapeHtml(control.id || '')}"${depends}>${escapeHtml(control.label)}</p>`;
  const id = controlId(control.path);
  const hint = control.hint ? `<p class="adv-hint" id="${id}-hint">${escapeHtml(control.hint)}</p>` : '';
  const described = control.hint ? ` aria-describedby="${id}-hint"` : '';
  if (control.kind === 'select') {
    const option = value => `<option value="${escapeHtml(value)}">${escapeHtml(engine.optionLabel(value, control.path))}</option>`;
    let options;
    if (engine.optionGroup) {
      // Grouped options (<optgroup>), in the order the groups first appear.
      const groups = new Map();
      for (const value of control.options) {
        const group = engine.optionGroup(value, control.path) || '';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(value);
      }
      options = [...groups].map(([group, values]) => group ? `<optgroup label="${escapeHtml(group)}">${values.map(option).join('')}</optgroup>` : values.map(option).join('')).join('');
    } else options = control.options.map(option).join('');
    return `<div class="adv-control adv-select"${depends}><label for="${id}">${escapeHtml(control.label)}</label><select id="${id}" data-path="${control.path}"${described}>${options}</select>${hint}</div>`;
  }
  if (control.kind === 'bool') {
    const header = control.role === 'effect-header';
    return `<div class="adv-control ${header ? 'adv-effect' : 'adv-toggle'}"${depends}><div class="adv-switch-row"><span id="${id}-label">${escapeHtml(control.label)}</span><button class="switch" id="${id}" type="button" role="switch" aria-checked="false" aria-labelledby="${id}-label" data-path="${control.path}"${described}><span class="switch-knob"></span></button></div>${hint}</div>`;
  }
  // float / vec2 slider
  const track = control.track ? `<div class="adv-track" style="background:var(${control.track})" aria-hidden="true"></div>` : '';
  const ends = control.lo ? `<div class="adv-track-labels" id="${id}-ends"><span>${escapeHtml(control.lo)}</span><span>${escapeHtml(control.hi)}</span></div>` : '';
  const describedSlider = [control.hint ? `${id}-hint` : '', control.lo ? `${id}-ends` : ''].filter(Boolean).join(' ');
  return `<div class="adv-control adv-slider"${depends}>
    <div class="adv-slider-head"><label for="${id}">${escapeHtml(control.label)}</label><span class="adv-slider-meta"><button class="adv-reset" type="button" data-reset="${control.path}" hidden>Reset<span class="visually-hidden"> ${escapeHtml(control.label)}</span></button><output class="adv-value" id="${id}-value" for="${id}"></output></span></div>
    ${track}<input id="${id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" data-path="${control.path}"${describedSlider ? ` aria-describedby="${describedSlider}"` : ''}>${ends}${hint}
  </div>`;
}

/** Renders the pipeline steps and sections of `engine`; clears them when `engine` is null. */
export function buildAdvanced({ pipeline, container }, engine) {
  if (!engine) { pipeline.innerHTML = ''; container.innerHTML = ''; return; }
  const { sections } = engine;
  pipeline.innerHTML = sections.map((section, index) => `<button class="pipeline-step" type="button" data-step="${section.id}" aria-pressed="false">${section.step}<span class="pipeline-dot" aria-hidden="true"></span></button>${index < sections.length - 1 ? '<span class="pipeline-arrow" aria-hidden="true">›</span>' : ''}`).join('');
  container.innerHTML = sections.map(section => `<section class="adv-section" data-section="${section.id}" aria-labelledby="adv-head-${section.id}">
    <h3 class="adv-heading"><button class="adv-head" id="adv-head-${section.id}" type="button" aria-expanded="false" aria-controls="adv-body-${section.id}" data-toggle="${section.id}">${CHEVRON}<span class="adv-head-text"><span class="adv-title">${escapeHtml(section.title)}</span><span class="adv-summary" id="adv-summary-${section.id}"></span></span><span class="adv-edited" hidden>Edited</span></button></h3>
    <div class="adv-body" id="adv-body-${section.id}" role="group" aria-label="${escapeHtml(section.title)}">${section.controls.map(control => controlHtml(control, engine)).join('')}</div>
  </section>`).join('');
}

export function syncAdvanced({ pipeline, container }, engine, params, { open, current, mobile }) {
  const { sections, controlByPath, isChanged, sectionSummary, sliderValue, formatValue } = engine;
  for (const section of sections) {
    const root = container.querySelector(`[data-section="${section.id}"]`);
    const isOpen = mobile ? section.id === current : open.has(section.id);
    const edited = section.controls.some(control => control.path && isChanged(params, control.path));
    root.classList.toggle('is-current', section.id === current);
    root.querySelector('.adv-head').setAttribute('aria-expanded', isOpen);
    root.querySelector('.adv-body').hidden = !isOpen;
    root.querySelector('.adv-edited').hidden = !edited;
    root.querySelector('.adv-summary').textContent = sectionSummary[section.id]?.(params) ?? '';
    const step = pipeline.querySelector(`[data-step="${section.id}"]`);
    step.setAttribute('aria-pressed', mobile ? section.id === current : open.has(section.id));
    step.classList.toggle('is-edited', edited);
  }
  container.querySelectorAll('[data-path]').forEach(element => {
    const control = controlByPath[element.dataset.path];
    const value = params[control.path];
    if (element.matches('select')) element.value = value;
    else if (element.matches('[role=switch]')) element.setAttribute('aria-checked', Boolean(value));
    else {
      const number = sliderValue(control, value);
      if (document.activeElement !== element || Number(element.value) !== number) element.value = number;
      const output = container.querySelector(`#${element.id}-value`);
      output.value = formatValue(control, value);
      const changed = isChanged(params, control.path);
      output.classList.toggle('is-edited', changed);
      container.querySelector(`[data-reset="${control.path}"]`).hidden = !changed;
    }
  });
  container.querySelectorAll('[data-depends]').forEach(element => { element.hidden = !params[element.dataset.depends]; });
  engine.ui?.sync?.(params, path => container.querySelector(`[data-path="${path}"]`), container);
}

// ---------- Engine "About" panel (from engines/<id>/credits.json) ----------
const safeUrl = value => { try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const link = (text, href) => { const url = safeUrl(href); return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}<span class="visually-hidden"> (opens in a new tab)</span></a>` : escapeHtml(text); };

/** HTML for the About-this-engine dialog body. `entry` is the registry entry, `credits` its credits.json. */
export function engineAboutHtml(entry, credits) {
  const licenceUrl = credits.licence?.file ? new URL(credits.licence.file, entry.folder).href : credits.licence?.url;
  const people = (credits.credits || []).map(item => `<li>${link(item.name, item.url)}${item.by ? ` · ${escapeHtml(item.by)}` : ''}${item.licence ? ` <span class="engine-licence">${escapeHtml(item.licence)}</span>` : ''}${item.role ? `<br><span class="engine-role">${escapeHtml(item.role)}</span>` : ''}</li>`).join('');
  const changes = (credits.changes || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const dataLicences = (credits.dataLicences || []).map(item => `<li>${link(item.name, new URL(item.file, entry.folder).href)}</li>`).join('');
  return `<p class="eyebrow">About this engine</p><h2 id="engineAboutTitle">${escapeHtml(credits.name || entry.label)}</h2>
    <p>${escapeHtml(credits.summary || entry.description)}</p>
    <dl class="engine-facts">
      <dt>Licence</dt><dd>${link(credits.licence?.name || entry.licence, licenceUrl)}</dd>
      <dt>Version</dt><dd>${escapeHtml(credits.version || '—')}</dd>
      <dt>Source</dt><dd>${credits.source?.upstream ? link('Original project', credits.source.upstream) : ''}${credits.source?.local ? ` · our copy in <code>${escapeHtml(credits.source.local)}</code>` : ''}</dd>
      <dt>Download</dt><dd>${escapeHtml(entry.approxDownload)}, only when you use this engine</dd>
    </dl>
    ${people ? `<h3 class="engine-sub">Credits</h3><ul class="engine-list">${people}</ul>` : ''}
    ${dataLicences ? `<h3 class="engine-sub">Data licences</h3><ul class="engine-list">${dataLicences}</ul>` : ''}
    ${changes ? `<h3 class="engine-sub">Changed by PhotoKamo</h3><ul class="engine-list">${changes}</ul>` : ''}`;
}

/** Credit line under the controls, from the registry entry's `credit` parts. */
export function creditHtml(entry) {
  return (entry.credit || []).map(part => typeof part === 'string' ? escapeHtml(part) : link(part.text, part.href)).join('');
}
