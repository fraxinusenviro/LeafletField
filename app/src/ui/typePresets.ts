import { STORAGE_KEYS, DEFAULTS } from '../constants.js';
import { parseStored } from '../storage.js';
import { escapeHtml } from '../coord/formatters.js';

let _presets: string[] = normalizePresets(parseStored<string[]>(STORAGE_KEYS.typePresets, DEFAULTS.typePresets));

export function getTypePresets(): string[] { return _presets; }

export function getSelectedTypePreset(): string {
  const sel = document.getElementById('map-type-preset-select') as HTMLSelectElement | null;
  const v = sel?.value ?? '';
  return v && v !== '__NONE__' ? v : '';
}

export function wireTypePresetInputs(): void {
  const ids = ['type-preset-1', 'type-preset-2', 'type-preset-3', 'type-preset-4', 'type-preset-5'];
  ids.forEach((id, i) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return;
    input.value = _presets[i] || '';
    input.addEventListener('input', () => {
      _presets = ids.map((tid) => ((document.getElementById(tid) as HTMLInputElement)?.value || '').trim());
      localStorage.setItem(STORAGE_KEYS.typePresets, JSON.stringify(_presets));
      renderMapTypePresetOptions();
    });
  });
  renderMapTypePresetOptions();
}

export function renderMapTypePresetOptions(): void {
  const sel = document.getElementById('map-type-preset-select') as HTMLSelectElement | null;
  if (!sel) return;
  const prev = sel.value;
  const valid = _presets.filter(Boolean);
  sel.innerHTML = '<option value="__NONE__">None</option>' +
    valid.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (valid.includes(prev)) sel.value = prev;
  else sel.value = '__NONE__';
}

function normalizePresets(arr: unknown): string[] {
  if (!Array.isArray(arr)) return DEFAULTS.typePresets.slice();
  const cleaned = arr.slice(0, 5).map((v) => String(v ?? '').trim());
  while (cleaned.length < 5) cleaned.push('');
  return cleaned;
}
