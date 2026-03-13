import type { StyleConfig, VisibilityConfig } from '../types.js';
import { STORAGE_KEYS, DEFAULTS } from '../constants.js';
import { parseStored } from '../storage.js';

let _styles: StyleConfig = parseStored<StyleConfig>(STORAGE_KEYS.styles, DEFAULTS.styles);
let _visibility: VisibilityConfig = parseStored<VisibilityConfig>(STORAGE_KEYS.visibility, DEFAULTS.visibility);
let _labelVisibility: VisibilityConfig = parseStored<VisibilityConfig>(STORAGE_KEYS.labelVisibility, DEFAULTS.labelVisibility);

export function getStyles(): StyleConfig { return _styles; }
export function getVisibility(): VisibilityConfig { return _visibility; }
export function getLabelVisibility(): VisibilityConfig { return _labelVisibility; }

export function setStyles(s: StyleConfig): void {
  _styles = s;
  localStorage.setItem(STORAGE_KEYS.styles, JSON.stringify(s));
}

export function setVisibility(v: VisibilityConfig): void {
  _visibility = v;
  localStorage.setItem(STORAGE_KEYS.visibility, JSON.stringify(v));
}

export function setLabelVisibility(v: VisibilityConfig): void {
  _labelVisibility = v;
  localStorage.setItem(STORAGE_KEYS.labelVisibility, JSON.stringify(v));
}
