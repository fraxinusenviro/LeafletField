/**
 * Registers a `localcache://` MapLibre protocol that serves tiles from the
 * Cache API. URL format: localcache://<cacheName>/<urlTemplate-encoded>/{z}/{x}/{y}
 *
 * The cache name and base URL are encoded in the protocol URL so that the
 * map source tiles array can vary per cache selection.
 */
import maplibregl from 'maplibre-gl';
import { BLANK_TILE_DATA_URI } from '../constants.js';
import type { CacheMeta } from '../types.js';
import { buildTileUrl } from './basemaps.js';

let _activeCacheRecord: CacheMeta | null = null;

export function setActiveCacheRecord(record: CacheMeta | null): void {
  _activeCacheRecord = record;
}

export function getActiveCacheRecord(): CacheMeta | null {
  return _activeCacheRecord;
}

export function registerOfflineProtocol(): void {
  maplibregl.addProtocol(
    'localcache',
    (params) => {
      return new Promise((resolve) => {
        const record = _activeCacheRecord;
        if (!record || !('caches' in window)) {
          resolve({ data: dataUriToBuffer(BLANK_TILE_DATA_URI) });
          return;
        }

        // Parse tile coords from the protocol URL.
        // Format: localcache://__placeholder__/{z}/{x}/{y}
        const url = params.url;
        const parts = url.split('/');
        const z = parseInt(parts[parts.length - 3], 10);
        const x = parseInt(parts[parts.length - 2], 10);
        const y = parseInt(parts[parts.length - 1], 10);

        if (isNaN(z) || isNaN(x) || isNaN(y)) {
          resolve({ data: dataUriToBuffer(BLANK_TILE_DATA_URI) });
          return;
        }

        if (z < record.zoomStart || z > record.zoomEnd) {
          resolve({ data: dataUriToBuffer(BLANK_TILE_DATA_URI) });
          return;
        }

        const tileUrl = buildTileUrl(record.urlTemplate, z, x, y, record.subdomain || 'a');

        caches.open(record.cacheName)
          .then((cache) => cache.match(tileUrl))
          .then((response) => response ? response.arrayBuffer() : null)
          .then((buffer) => {
            if (buffer && buffer.byteLength > 0) {
              resolve({ data: buffer });
            } else {
              resolve({ data: dataUriToBuffer(BLANK_TILE_DATA_URI) });
            }
          })
          .catch(() => resolve({ data: dataUriToBuffer(BLANK_TILE_DATA_URI) }));
      });
    }
  );
}

function dataUriToBuffer(dataUri: string): ArrayBuffer {
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}
