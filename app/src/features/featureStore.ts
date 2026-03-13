import type { AppFeature, AppFeatureCollection } from '../types.js';
import { STORAGE_KEYS } from '../constants.js';
import { parseStored } from '../storage.js';
import { ensureFeatureProperties } from './featureProperties.js';

const _features: AppFeature[] = [];

export function getFeatures(): AppFeature[] {
  return _features;
}

export function getFeatureCollection(): AppFeatureCollection {
  return { type: 'FeatureCollection', features: _features };
}

export function addFeature(feature: AppFeature): AppFeature {
  const normalized = ensureFeatureProperties(feature, feature.properties?.source ?? 'sketch');
  _features.push(normalized);
  return normalized;
}

export function removeFeature(id: string): boolean {
  const idx = _features.findIndex((f) => f.properties?.id === id);
  if (idx < 0) return false;
  _features.splice(idx, 1);
  return true;
}

export function updateFeature(updated: AppFeature): void {
  const idx = _features.findIndex((f) => f.properties?.id === updated.properties?.id);
  if (idx >= 0) _features[idx] = updated;
}

export function clearFeatures(): void {
  _features.length = 0;
}

export function saveFeatures(): void {
  localStorage.setItem(STORAGE_KEYS.features, JSON.stringify(getFeatureCollection()));
}

export function loadFeatures(): AppFeature[] {
  const fc = parseStored<AppFeatureCollection>(STORAGE_KEYS.features, { type: 'FeatureCollection', features: [] });
  _features.length = 0;
  if (Array.isArray(fc.features)) {
    for (const f of fc.features) {
      _features.push(ensureFeatureProperties(f as AppFeature, (f as AppFeature).properties?.source ?? 'sketch'));
    }
  }
  return _features;
}
