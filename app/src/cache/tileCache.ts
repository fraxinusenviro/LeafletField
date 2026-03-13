import maplibregl from 'maplibre-gl';
import type { CacheMeta } from '../types.js';
import { newId, formatBytes, buildIdentifier } from '../coord/formatters.js';
import {
  getCacheMetas, addCacheMeta, removeCacheMeta,
  setSelectedCacheId, getSelectedCacheId, averageTileSizeForBasemap
} from './cacheStore.js';
import { tileCountForExtent, tileRangeForBounds } from './tileUtils.js';
import { setActiveCacheRecord } from '../map/offlineLayer.js';
import { BASEMAPS } from '../map/basemaps.js';
import { buildTileUrl } from '../map/basemaps.js';

let _map: maplibregl.Map;

export function initTileCache(map: maplibregl.Map): void {
  _map = map;
  const selectedMeta = getCacheMetas().find((m) => m.id === getSelectedCacheId()) ?? null;
  setActiveCacheRecord(selectedMeta);
  renderCachePanel();
  updateCacheEstimate();
}

// ─── Estimate display ─────────────────────────────────────────────────────────

let _estimateRaf: number | null = null;

export function updateCacheEstimateSoon(): void {
  if (_estimateRaf) cancelAnimationFrame(_estimateRaf);
  _estimateRaf = requestAnimationFrame(() => { _estimateRaf = null; updateCacheEstimate(); });
}

function updateCacheEstimate(): void {
  const el = document.getElementById('offline-cache-estimate');
  if (!el) return;
  if (!('caches' in window)) {
    el.textContent = 'Offline cache is not supported in this browser.';
    return;
  }
  const state = estimateState();
  el.textContent = `Estimated cache size: ${formatBytes(state.estBytes)} (${state.tileCount.toLocaleString()} tiles across z${state.zoomStart}-z${state.zoomEnd})`;
}

function estimateState() {
  const depth = Math.max(0, Number((document.getElementById('offline-cache-depth') as HTMLInputElement)?.value) || 0);
  const zoomStart = Math.round(_map.getZoom());
  const zoomEnd = zoomStart + depth;
  const b = _map.getBounds();
  const tileCount = tileCountForExtent(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), zoomStart, zoomEnd);
  const basemapId = getCurrentOnlineBasemapId();
  const basemapDef = BASEMAPS.find((bm) => bm.id === basemapId);
  const avgBytes = averageTileSizeForBasemap(basemapDef?.label ?? '');
  return { depth, zoomStart, zoomEnd, tileCount, avgBytes, estBytes: tileCount * avgBytes };
}

// ─── Build cache ──────────────────────────────────────────────────────────────

export async function buildOfflineCache(): Promise<void> {
  if (!('caches' in window)) { alert('Offline cache is not supported in this browser.'); return; }

  const basemapId = getCurrentOnlineBasemapId();
  const basemapDef = BASEMAPS.find((bm) => bm.id === basemapId);
  if (!basemapDef) { alert('Unable to determine active basemap for caching.'); return; }

  const state = estimateState();
  const defaultName = `${basemapDef.label} ${buildIdentifier()}`;
  const chosenName = prompt('Enter a name for this cache:', defaultName);
  if (chosenName === null) return;
  const cacheLabel = chosenName.trim();
  if (!cacheLabel) { alert('Cache name is required.'); return; }

  const ok = confirm(
    `Build offline cache for "${basemapDef.label}"?\n\n`
    + `Cache name: ${cacheLabel}\n`
    + `Zoom range: z${state.zoomStart} to z${state.zoomEnd}\n`
    + `Estimated size: ${formatBytes(state.estBytes)}\n`
    + `Estimated tiles: ${state.tileCount.toLocaleString()}`
  );
  if (!ok) return;

  const btn = document.getElementById('build-offline-cache') as HTMLButtonElement | null;
  const estEl = document.getElementById('offline-cache-estimate');
  if (btn) btn.disabled = true;
  if (estEl) estEl.textContent = 'Building cache...';

  const cacheId = newId();
  const cacheName = `lfm_tile_cache_${cacheId}`;
  const cache = await caches.open(cacheName);
  const b = _map.getBounds();
  const boundsRecord: CacheMeta['bounds'] = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
  const subdomain = 'a';

  let fetchedTiles = 0;
  let totalBytes = 0;

  try {
    for (let z = state.zoomStart; z <= state.zoomEnd; z++) {
      const range = tileRangeForBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth(), z);
      for (let x = range.xMin; x <= range.xMax; x++) {
        for (let y = range.yMin; y <= range.yMax; y++) {
          const url = buildTileUrl(basemapDef.tileUrl, z, x, y, subdomain);
          try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) continue;
            const blob = await response.blob();
            if (!blob.size) continue;
            totalBytes += blob.size;
            fetchedTiles++;
            await cache.put(url, new Response(blob, { status: 200, statusText: 'OK' }));
          } catch { /* skip tile */ }
        }
      }
    }

    if (!fetchedTiles) {
      await caches.delete(cacheName);
      alert('No tiles were cached. This may be due to network errors or provider restrictions.');
      return;
    }

    const meta: CacheMeta = {
      id: cacheId, displayName: cacheLabel, cacheName,
      basemapName: basemapDef.label, urlTemplate: basemapDef.tileUrl, subdomain,
      createdAt: new Date().toISOString(), zoomStart: state.zoomStart, zoomEnd: state.zoomEnd,
      depth: state.depth, tileCount: fetchedTiles, bytes: totalBytes,
      avgTileBytes: totalBytes / fetchedTiles, bounds: boundsRecord
    };
    addCacheMeta(meta);
    setSelectedCacheId(cacheId);
    setActiveCacheRecord(meta);
    renderCachePanel();
    updateCacheEstimate();
    // Trigger source reload
    const src = _map.getSource('basemap-offline-cache') as maplibregl.GeoJSONSource | undefined;
    if (src) { /* raster sources don't expose refresh, user needs to switch */ }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Delete cache ─────────────────────────────────────────────────────────────

export async function deleteCache(cacheId: string): Promise<void> {
  const removed = removeCacheMeta(cacheId);
  if (!removed) return;
  if (getSelectedCacheId() === cacheId) {
    setSelectedCacheId('');
    setActiveCacheRecord(null);
  }
  try { if ('caches' in window) await caches.delete(removed.cacheName); } catch { /* ignore */ }
  renderCachePanel();
  updateCacheEstimate();
}

// ─── Select cache for offline basemap ────────────────────────────────────────

export function selectCacheForBasemap(cacheId: string): void {
  setSelectedCacheId(cacheId);
  const meta = getCacheMetas().find((m) => m.id === cacheId) ?? null;
  setActiveCacheRecord(meta);
  renderCachePanel();
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

export function renderCachePanel(): void {
  const el = document.getElementById('offline-cache-list');
  if (!el) return;
  const metas = getCacheMetas();
  const selectedId = getSelectedCacheId();

  if (!metas.length) {
    el.innerHTML = '<div class="offline-cache-empty">No offline caches stored.</div>';
    return;
  }

  el.innerHTML = metas.map((m) => {
    const createdText = (() => { try { return new Date(m.createdAt).toLocaleString(); } catch { return ''; } })();
    return `
      <div class="offline-cache-card">
        <div class="offline-cache-head">
          <span class="offline-cache-name">${escapeHtmlS(m.displayName || m.basemapName)}</span>
          <button type="button" class="offline-cache-delete-btn" data-cache-action="delete" data-cache-id="${m.id}" aria-label="Delete cache">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <label class="offline-cache-basemap-pick">
          <input type="radio" name="offline-basemap-selected" data-cache-action="select-basemap" data-cache-id="${m.id}"${selectedId === m.id ? ' checked' : ''} />
          <span>Use in basemap selector</span>
        </label>
        <div class="offline-cache-meta">Basemap: ${escapeHtmlS(m.basemapName)}</div>
        <div class="offline-cache-meta">Extent z${m.zoomStart}–z${m.zoomEnd} | ${m.tileCount.toLocaleString()} tiles</div>
        <div class="offline-cache-meta">Storage: ${formatBytes(m.bytes)} | Built: ${escapeHtmlS(createdText)}</div>
        <button type="button" data-cache-action="zoom-to" data-cache-id="${m.id}">
          <i data-lucide="focus"></i><span>Zoom to Cache Extent</span>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

export function wireCachePanelEvents(): void {
  const depthInput = document.getElementById('offline-cache-depth') as HTMLInputElement | null;
  if (depthInput) {
    depthInput.addEventListener('input', () => {
      depthInput.value = String(Math.round(Math.max(0, Math.min(8, Number(depthInput.value) || 0))));
      updateCacheEstimateSoon();
    });
  }

  const buildBtn = document.getElementById('build-offline-cache');
  buildBtn?.addEventListener('click', () => buildOfflineCache());

  const listEl = document.getElementById('offline-cache-list');
  listEl?.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target?.dataset?.['cacheAction'] === 'select-basemap' && target.dataset['cacheId']) {
      selectCacheForBasemap(target.dataset['cacheId']);
    }
  });

  listEl?.addEventListener('click', async (event) => {
    const target = (event.target as HTMLElement)?.closest('[data-cache-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset['cacheAction'];
    const cacheId = target.dataset['cacheId'];
    if (!cacheId) return;
    if (action === 'delete') {
      if (!confirm('Delete this offline cache from local storage?')) return;
      await deleteCache(cacheId);
    }
    if (action === 'zoom-to') zoomToCache(cacheId);
  });
}

function zoomToCache(cacheId: string): void {
  const meta = getCacheMetas().find((m) => m.id === cacheId);
  if (!meta?.bounds) return;
  const [[south, west], [north, east]] = meta.bounds;
  _map.fitBounds([west, south, east, north], { padding: 20 });
}

function getCurrentOnlineBasemapId(): string {
  const select = document.getElementById('basemap-select') as HTMLSelectElement | null;
  return select?.value ?? BASEMAPS[1].id;
}

function escapeHtmlS(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Augment global Window to include lucide
declare global {
  interface Window {
    lucide?: { createIcons: (opts?: Record<string, unknown>) => void };
  }
}
