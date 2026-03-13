import { STORAGE_KEYS } from '../constants.js';
import { parseStored } from '../storage.js';

let _typeColors: Record<string, string> = parseStored<Record<string, string>>(STORAGE_KEYS.pointTypeColors, {});

export function getTypeColor(typeValue: string): string | null {
  const key = typeValue.trim().toLowerCase();
  return _typeColors[key] ?? null;
}

export function getOrAssignTypeColor(typeValue: string, fallback: string): string {
  const key = typeValue.trim().toLowerCase();
  if (!key) return fallback;
  if (!_typeColors[key]) {
    _typeColors[key] = randomHslColor();
    localStorage.setItem(STORAGE_KEYS.pointTypeColors, JSON.stringify(_typeColors));
  }
  return _typeColors[key];
}

function randomHslColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 72%, 52%)`;
}
