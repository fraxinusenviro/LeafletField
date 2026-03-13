import maplibregl from 'maplibre-gl';
import type { GpsState, GpsFix, GpsCaptureMode } from '../types.js';
import { addFeature, saveFeatures } from '../features/featureStore.js';
import { touchFeature, ensureFeatureProperties } from '../features/featureProperties.js';
import { refreshFeatureLayer } from '../features/featureLayer.js';
import { buildTrackName } from '../coord/formatters.js';
import { requireSurveyMetadata } from '../ui/surveyMeta.js';
import { getSelectedTypePreset } from '../ui/typePresets.js';

let _map: maplibregl.Map;

export const gps: GpsState = {
  watchId: null,
  enabled: false,
  pointStream: false,
  trackRec: false,
  customLineRec: false,
  trackPoints: [],
  customLinePoints: [],
  customLineAttrs: null,
  lastFix: null,
  lastAccepted: null,
  lastAcceptedTs: 0,
  acceptedCount: 0,
  captureMode: 'idle',
  followUser: false
};

// Live marker source
const GPS_SOURCE = 'gps-live';

export function initGpsLayer(map: maplibregl.Map): void {
  _map = map;
  map.addSource(GPS_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'gps-accuracy',
    type: 'circle',
    source: GPS_SOURCE,
    filter: ['==', ['get', 'kind'], 'accuracy'],
    paint: {
      'circle-color': '#2196f3',
      'circle-opacity': 0.1,
      'circle-stroke-color': '#2196f3',
      'circle-stroke-width': 1,
      'circle-radius': ['get', 'radius'],
      'circle-pitch-alignment': 'map'
    }
  });
  map.addLayer({
    id: 'gps-position',
    type: 'circle',
    source: GPS_SOURCE,
    filter: ['==', ['get', 'kind'], 'position'],
    paint: {
      'circle-color': '#2196f3',
      'circle-radius': 6,
      'circle-opacity': 0.9,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  });
}

export function gpsConfig() {
  return {
    minDistance: Number((document.getElementById('gps-min-distance') as HTMLInputElement)?.value) || 3,
    minIntervalMs: (Number((document.getElementById('gps-min-interval') as HTMLInputElement)?.value) || 1) * 1000,
    maxAccuracy: Number((document.getElementById('gps-max-accuracy') as HTMLInputElement)?.value) || 25
  };
}

export function startGps(): boolean {
  if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return false; }
  if (gps.enabled) return true;
  gps.watchId = navigator.geolocation.watchPosition(onGpsFix, onGpsError, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 15000
  });
  gps.enabled = true;
  updateStatus();
  return true;
}

export function stopGps(): void {
  if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId);
  gps.watchId = null;
  gps.enabled = false;
  gps.pointStream = false;
  gps.trackRec = false;
  gps.customLineRec = false;
  gps.trackPoints = [];
  gps.customLinePoints = [];
  updateGpsAccuracyBadge(null);
  updateStatus();
  updateLiveMarker(null);
}

export function setCaptureMode(mode: GpsCaptureMode): void {
  gps.captureMode = mode;
  if (mode !== 'gps') {
    gps.pointStream = false;
    gps.trackRec = false;
    gps.customLineRec = false;
  }
  updateStatus();
}

export function startPointStream(): boolean {
  if (!requireSurveyMetadata()) return false;
  if (!startGps()) return false;
  gps.captureMode = 'gps';
  gps.pointStream = true;
  updateStatus();
  return true;
}

export function stopPointStream(): void {
  gps.pointStream = false;
  updateStatus();
}

export function startTrackRecording(): boolean {
  if (!requireSurveyMetadata()) return false;
  if (!startGps()) return false;
  gps.captureMode = 'gps';
  gps.trackRec = true;
  gps.trackPoints = [];
  updateStatus();
  return true;
}

export function stopTrackRecording(save: boolean): void {
  if (!gps.trackRec) return;
  gps.trackRec = false;
  if (save && gps.trackPoints.length >= 2) {
    addGpsFeature(
      { type: 'LineString', coordinates: gps.trackPoints },
      { type: 'TRACK LOG', notes: 'NULL' },
      false
    );
  } else if (save && gps.trackPoints.length > 0) {
    alert('Need at least 2 accepted points to save a track.');
  }
  gps.trackPoints = [];
  refreshFeatureLayer(_map);
  saveFeatures();
  updateStatus();
}

export function startCustomLineRecording(attrs: { type: string; notes: string }): boolean {
  if (!requireSurveyMetadata()) return false;
  if (!startGps()) return false;
  gps.captureMode = 'gps';
  gps.customLineRec = true;
  gps.customLinePoints = [];
  gps.customLineAttrs = attrs;
  updateStatus();
  return true;
}

export function stopCustomLineRecording(save: boolean): void {
  if (!gps.customLineRec) return;
  gps.customLineRec = false;
  if (save && gps.customLinePoints.length >= 2) {
    addGpsFeature(
      { type: 'LineString', coordinates: gps.customLinePoints },
      { type: gps.customLineAttrs?.type ?? '', notes: gps.customLineAttrs?.notes ?? '' },
      true
    );
  } else if (save && gps.customLinePoints.length > 0) {
    alert('Need at least 2 accepted points to save a custom GPS line.');
  }
  gps.customLinePoints = [];
  gps.customLineAttrs = null;
  refreshFeatureLayer(_map);
  saveFeatures();
  updateStatus();
}

// Capture a single point on the next accepted fix
let _pendingSinglePoint = false;

export function captureSingleGpsPoint(): boolean {
  if (!requireSurveyMetadata()) return false;
  if (!startGps()) return false;
  gps.captureMode = 'gps';
  _pendingSinglePoint = true;
  // If a good fix is already available, use it immediately
  const cfg = gpsConfig();
  if (gps.lastFix && gps.lastFix.accuracy <= cfg.maxAccuracy) {
    commitSinglePoint(gps.lastFix);
    return true;
  }
  updateStatus();
  return true;
}

function commitSinglePoint(fix: GpsFix): void {
  _pendingSinglePoint = false;
  addGpsFeature({ type: 'Point', coordinates: [fix.lng, fix.lat] }, {}, true);
  refreshFeatureLayer(_map);
  saveFeatures();
  updateStatus();
}

// ─── Internal GPS event handlers ─────────────────────────────────────────────

function onGpsFix(position: GeolocationPosition): void {
  const { latitude, longitude, accuracy } = position.coords;
  const fix: GpsFix = { lat: latitude, lng: longitude, accuracy, timestamp: position.timestamp };
  gps.lastFix = fix;

  updateGpsAccuracyBadge(accuracy);
  updateLiveMarker(fix);

  if (gps.followUser && _map) {
    _map.panTo([longitude, latitude], { animate: true, duration: 300 });
  }

  if (gps.captureMode !== 'gps' && !gps.trackRec) { updateStatus(); return; }

  const cfg = gpsConfig();
  if (accuracy > cfg.maxAccuracy) { updateStatus(); return; }
  const tooSoon = position.timestamp - gps.lastAcceptedTs < cfg.minIntervalMs;
  const tooClose = gps.lastAccepted
    ? haversineDistance(gps.lastAccepted, { lng: longitude, lat: latitude }) < cfg.minDistance
    : false;
  if (tooSoon || tooClose) { updateStatus(); return; }

  gps.lastAccepted = { lng: longitude, lat: latitude };
  gps.lastAcceptedTs = position.timestamp;
  gps.acceptedCount++;

  if (_pendingSinglePoint) {
    commitSinglePoint(fix);
    return;
  }

  if (gps.pointStream) {
    addGpsFeature({ type: 'Point', coordinates: [longitude, latitude] }, {}, true);
    refreshFeatureLayer(_map);
    saveFeatures();
  }

  if (gps.trackRec) {
    gps.trackPoints.push([longitude, latitude]);
    updateTrackPreview();
  }

  if (gps.customLineRec) {
    gps.customLinePoints.push([longitude, latitude]);
    updateCustomLinePreview();
  }

  updateStatus();
}

function onGpsError(error: GeolocationPositionError): void {
  updateGpsAccuracyBadge(null);
  const el = document.getElementById('gps-status');
  if (el) el.textContent = `GPS error: ${error.message}`;
}

// ─── Preview layers for track / custom line ───────────────────────────────────

const TRACK_PREVIEW_SOURCE = 'gps-track-preview';
const CUSTOM_LINE_PREVIEW_SOURCE = 'gps-custom-line-preview';

export function initPreviewLayers(map: maplibregl.Map): void {
  map.addSource(TRACK_PREVIEW_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(CUSTOM_LINE_PREVIEW_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addLayer({
    id: 'gps-track-preview',
    type: 'line',
    source: TRACK_PREVIEW_SOURCE,
    paint: { 'line-color': '#e63946', 'line-width': 2, 'line-opacity': 0.9 }
  });

  map.addLayer({
    id: 'gps-custom-line-preview',
    type: 'line',
    source: CUSTOM_LINE_PREVIEW_SOURCE,
    paint: { 'line-color': '#1d3557', 'line-width': 2, 'line-opacity': 0.9 }
  });
}

function updateTrackPreview(): void {
  const src = _map.getSource(TRACK_PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src || gps.trackPoints.length < 2) return;
  src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: gps.trackPoints }, properties: {} });
}

function updateCustomLinePreview(): void {
  const src = _map.getSource(CUSTOM_LINE_PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src || gps.customLinePoints.length < 2) return;
  src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: gps.customLinePoints }, properties: {} });
}

// ─── Live marker ──────────────────────────────────────────────────────────────

function updateLiveMarker(fix: GpsFix | null): void {
  const src = _map?.getSource(GPS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!fix) {
    src.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  // Convert accuracy metres to MapLibre circle-radius pixels at current zoom
  // We use a special source property; rendering as geographic circle via 'circle-pitch-alignment: map'
  // combined with a pixel radius requires knowing the map resolution.
  // For simplicity we render accuracy as a separate circle using meters-to-pixels conversion.
  const metersPerPixel = 156543.03392 * Math.cos(fix.lat * Math.PI / 180) / Math.pow(2, _map.getZoom());
  const radiusPx = Math.max(2, fix.accuracy / metersPerPixel);

  src.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] },
        properties: { kind: 'accuracy', radius: radiusPx }
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] },
        properties: { kind: 'position', radius: 6 }
      }
    ]
  });
}

// ─── Status display ───────────────────────────────────────────────────────────

export function updateStatus(): void {
  const el = document.getElementById('gps-status');
  if (!el) return;
  const accuracy = gps.lastFix ? `${gps.lastFix.accuracy.toFixed(1)} m` : 'n/a';
  if (!gps.enabled) { el.textContent = 'GPS inactive'; return; }
  if (gps.trackRec) { el.textContent = `Tracking | accuracy ${accuracy} | ${gps.trackPoints.length} pts`; return; }
  if (gps.customLineRec) { el.textContent = `Custom line | accuracy ${accuracy} | ${gps.customLinePoints.length} pts`; return; }
  if (gps.pointStream) { el.textContent = `Point stream | accuracy ${accuracy} | accepted ${gps.acceptedCount}`; return; }
  if (_pendingSinglePoint) { el.textContent = `Waiting for GPS fix | accuracy ${accuracy}`; return; }
  el.textContent = `GPS active | accuracy ${accuracy} | accepted ${gps.acceptedCount}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addGpsFeature(
  geometry: GeoJSON.Geometry,
  extraProps: Partial<{ type: string; notes: string }>,
  applyPresetType: boolean
): void {
  const presetType = applyPresetType ? getSelectedTypePreset() : '';
  const feature = ensureFeatureProperties(
    {
      type: 'Feature',
      geometry,
      properties: {
        source: 'gps',
        type: extraProps.type ?? presetType,
        notes: extraProps.notes ?? ''
      } as Parameters<typeof ensureFeatureProperties>[0]['properties']
    } as Parameters<typeof ensureFeatureProperties>[0],
    'gps'
  );
  touchFeature(feature);
  addFeature(feature);
}

function updateGpsAccuracyBadge(accuracy: number | null): void {
  const badge = document.getElementById('gps-accuracy-badge');
  const text = document.getElementById('gps-accuracy-text');
  if (!badge || !text) return;
  badge.classList.remove('gps-accuracy-good', 'gps-accuracy-warn', 'gps-accuracy-bad', 'gps-accuracy-na');
  if (accuracy !== null && Number.isFinite(accuracy)) {
    text.textContent = `+-${accuracy.toFixed(1)}m`;
    if (accuracy < 3) badge.classList.add('gps-accuracy-good');
    else if (accuracy <= 6) badge.classList.add('gps-accuracy-warn');
    else badge.classList.add('gps-accuracy-bad');
  } else {
    text.textContent = '--';
    badge.classList.add('gps-accuracy-na');
  }
}

function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}
