// Builds and syncs the Advanced (spectral) panel from js/spectral/params.js.
import { sections, controlByPath, optionLabel, formatValue, sliderValue, isChanged, sectionSummary } from './spectral/params.js';

const escapeHtml = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
export const controlId = path => `adv-${path.replace(/[^a-z0-9]+/gi, '-')}`;
const CHEVRON = '<svg class="adv-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function controlHtml(control) {
  const id = controlId(control.path);
  const depends = control.dependsOn ? ` data-depends="${control.dependsOn}"` : '';
  const hint = control.hint ? `<p class="adv-hint" id="${id}-hint">${escapeHtml(control.hint)}</p>` : '';
  const described = control.hint ? ` aria-describedby="${id}-hint"` : '';
  if (control.kind === 'select') {
    return `<div class="adv-control adv-select"${depends}><label for="${id}">${escapeHtml(control.label)}</label><select id="${id}" data-path="${control.path}"${described}>${control.options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(optionLabel(option))}</option>`).join('')}</select>${hint}</div>`;
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

export function buildAdvanced({ pipeline, container }) {
  pipeline.innerHTML = sections.map((section, index) => `<button class="pipeline-step" type="button" data-step="${section.id}" aria-pressed="false">${section.step}<span class="pipeline-dot" aria-hidden="true"></span></button>${index < sections.length - 1 ? '<span class="pipeline-arrow" aria-hidden="true">›</span>' : ''}`).join('');
  container.innerHTML = sections.map(section => `<section class="adv-section" data-section="${section.id}" aria-labelledby="adv-head-${section.id}">
    <h3 class="adv-heading"><button class="adv-head" id="adv-head-${section.id}" type="button" aria-expanded="false" aria-controls="adv-body-${section.id}" data-toggle="${section.id}">${CHEVRON}<span class="adv-head-text"><span class="adv-title">${escapeHtml(section.title)}</span><span class="adv-summary" id="adv-summary-${section.id}"></span></span><span class="adv-edited" hidden>Edited</span></button></h3>
    <div class="adv-body" id="adv-body-${section.id}" role="group" aria-label="${escapeHtml(section.title)}">${section.controls.map(controlHtml).join('')}</div>
  </section>`).join('');
}

export function syncAdvanced({ pipeline, container }, params, { open, current, mobile }) {
  for (const section of sections) {
    const root = container.querySelector(`[data-section="${section.id}"]`);
    const isOpen = mobile ? section.id === current : open.has(section.id);
    const edited = section.controls.some(control => isChanged(params, control.path));
    root.classList.toggle('is-current', section.id === current);
    root.querySelector('.adv-head').setAttribute('aria-expanded', isOpen);
    root.querySelector('.adv-body').hidden = !isOpen;
    root.querySelector('.adv-edited').hidden = !edited;
    root.querySelector('.adv-summary').textContent = sectionSummary[section.id](params);
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
}
