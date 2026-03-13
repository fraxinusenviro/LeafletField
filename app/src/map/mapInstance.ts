import maplibregl from 'maplibre-gl';
import { BASEMAPS, OFFLINE_BASEMAP_ID, DEFAULT_BASEMAP_ID, toMaplibreTileUrl } from './basemaps.js';
import { STORAGE_KEYS, DEFAULTS } from '../constants.js';
import { parseStored } from '../storage.js';

let _map: maplibregl.Map;

export function getMap(): maplibregl.Map {
  return _map;
}

export function initMap(containerId: string): maplibregl.Map {
  const savedView = parseStored<{ center: [number, number]; zoom: number } | null>(
    STORAGE_KEYS.mapView, null
  );

  _map = new maplibregl.Map({
    container: containerId,
    style: { version: 8, sources: {}, layers: [] },
    center: savedView?.center ?? [DEFAULTS.center[1], DEFAULTS.center[0]], // MapLibre is [lng, lat]
    zoom: savedView?.zoom ?? DEFAULTS.zoom,
    maxZoom: 24,
    attributionControl: false
  });

  _map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  _map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  _map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left');

  _map.on('moveend', () => {
    const c = _map.getCenter();
    localStorage.setItem(STORAGE_KEYS.mapView, JSON.stringify({ center: [c.lat, c.lng], zoom: _map.getZoom() }));
  });

  return _map;
}

// ─── Basemap management ────────────────────────────────────────────────────────

let _currentBasemapId: string;

export function getCurrentBasemapId(): string {
  return _currentBasemapId;
}

export function addBasemapSources(map: maplibregl.Map): void {
  for (const bm of BASEMAPS) {
    map.addSource(`basemap-${bm.id}`, {
      type: 'raster',
      tiles: toMaplibreTileUrl(bm.tileUrl),
      tileSize: bm.tileSize,
      attribution: bm.attribution,
      maxzoom: bm.maxZoom
    });
  }

  // Offline cache raster source (tiles supplied by custom protocol)
  map.addSource(`basemap-${OFFLINE_BASEMAP_ID}`, {
    type: 'raster',
    tiles: [`localcache://__placeholder__/{z}/{x}/{y}`],
    tileSize: 256,
    maxzoom: 24
  });
}

export function addBasemapLayer(map: maplibregl.Map, basemapId: string): void {
  const layerId = 'basemap-layer';
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  map.addLayer(
    {
      id: layerId,
      type: 'raster',
      source: `basemap-${basemapId}`,
      paint: { 'raster-opacity': 1 }
    },
    getFirstDataLayerId(map)
  );
  _currentBasemapId = basemapId;
  localStorage.setItem(STORAGE_KEYS.basemap, basemapId);
}

export function switchBasemap(map: maplibregl.Map, basemapId: string): void {
  addBasemapLayer(map, basemapId);
}

function getFirstDataLayerId(map: maplibregl.Map): string | undefined {
  // Insert basemap below all data layers
  const layers = map.getStyle().layers ?? [];
  const first = layers.find((l) => l.id.startsWith('features-') || l.id.startsWith('gps-') || l.id.startsWith('utm-') || l.id.startsWith('overlay-'));
  return first?.id;
}
