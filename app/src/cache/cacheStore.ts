import type { CacheMeta } from '../types.js';
import { STORAGE_KEYS } from '../constants.js';
import { parseStored } from '../storage.js';

const _metas: CacheMeta[] = parseStored<CacheMeta[]>(STORAGE_KEYS.mapCaches, []).filter(isValidMeta);

let _selectedId: string = localStorage.getItem(STORAGE_KEYS.selectedMapCacheId) ?? '';

export function getCacheMetas(): CacheMeta[] { return _metas; }

export function getSelectedCacheId(): string { return _selectedId; }

export function getSelectedCacheMeta(): CacheMeta | null {
  return _metas.find((m) => m.id === _selectedId) ?? null;
}

export function addCacheMeta(meta: CacheMeta): void {
  _metas.push(meta);
  saveCacheMetas();
}

export function removeCacheMeta(id: string): CacheMeta | null {
  const idx = _metas.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  const [removed] = _metas.splice(idx, 1);
  saveCacheMetas();
  return removed;
}

export function setSelectedCacheId(id: string): void {
  _selectedId = id;
  if (id) localStorage.setItem(STORAGE_KEYS.selectedMapCacheId, id);
  else localStorage.removeItem(STORAGE_KEYS.selectedMapCacheId);
}

export function saveCacheMetas(): void {
  localStorage.setItem(STORAGE_KEYS.mapCaches, JSON.stringify(_metas));
}

export function averageTileSizeForBasemap(basemapName: string): number {
  const values = _metas.filter((m) => m.basemapName === basemapName && m.avgTileBytes > 0).map((m) => m.avgTileBytes);
  if (!values.length) return 45000;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function isValidMeta(m: unknown): m is CacheMeta {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return Boolean(o['id'] && o['cacheName'] && o['basemapName'] && o['urlTemplate']);
}
