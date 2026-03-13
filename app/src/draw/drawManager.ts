/**
 * Custom MapLibre draw manager.
 * Handles point, line and polygon drawing using map click events and a
 * temporary GeoJSON source for in-progress previews.
 * Feature selection queries rendered features and shows the feature popup.
 */
import maplibregl from 'maplibre-gl';
import type { DrawMode } from '../types.js';
import { addFeature, saveFeatures } from '../features/featureStore.js';
import { ensureFeatureProperties, touchFeature } from '../features/featureProperties.js';
import { openFeaturePopup, closeFeaturePopup } from '../features/featurePopup.js';
import { refreshFeatureLayer, queryFeatureAtPoint } from '../features/featureLayer.js';
import { getSelectedTypePreset } from '../ui/typePresets.js';
import { requireSurveyMetadata } from '../ui/surveyMeta.js';
import { getStyles } from '../style/styleStore.js';

const DRAW_SOURCE = 'draw-preview';

let _map: maplibregl.Map;
let _mode: DrawMode = 'idle';
let _vertices: [number, number][] = [];
let _clickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
let _dblClickHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
let _escHandler: ((e: KeyboardEvent) => void) | null = null;
let _mouseMoveHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

export function getDrawMode(): DrawMode { return _mode; }

export function initDrawLayers(map: maplibregl.Map): void {
  _map = map;
  map.addSource(DRAW_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addLayer({
    id: 'draw-preview-line',
    type: 'line',
    source: DRAW_SOURCE,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#ff9800', 'line-width': 2, 'line-dasharray': [2, 2] }
  });
  map.addLayer({
    id: 'draw-preview-fill',
    type: 'fill',
    source: DRAW_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#ff9800', 'fill-opacity': 0.2 }
  });
  map.addLayer({
    id: 'draw-preview-points',
    type: 'circle',
    source: DRAW_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': '#ff9800', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 }
  });
}

export function setDrawMode(mode: DrawMode): void {
  _clearHandlers();
  _vertices = [];
  _clearPreview();
  _mode = mode;
  _updateMapCursor();

  if (mode === 'drawPoint') {
    _clickHandler = (e) => {
      if (!requireSurveyMetadata()) { cancelDraw(); return; }
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      _commitPoint(coord);
    };
    _map.on('click', _clickHandler);
  }

  if (mode === 'drawLine' || mode === 'drawPolygon') {
    _clickHandler = (e) => {
      if (!requireSurveyMetadata()) { cancelDraw(); return; }
      _vertices.push([e.lngLat.lng, e.lngLat.lat]);
      _updatePreview();
    };
    _dblClickHandler = (e) => {
      e.preventDefault();
      _finishShape();
    };
    _mouseMoveHandler = (e) => {
      if (_vertices.length === 0) return;
      _updatePreviewWithCursor([e.lngLat.lng, e.lngLat.lat]);
    };
    _map.on('click', _clickHandler);
    _map.on('dblclick', _dblClickHandler);
    _map.on('mousemove', _mouseMoveHandler);
  }

  if (mode === 'select') {
    _clickHandler = (e) => {
      const feature = queryFeatureAtPoint(_map, e.point);
      if (feature) {
        openFeaturePopup(feature);
      } else {
        closeFeaturePopup();
      }
    };
    _map.on('click', _clickHandler);
  }

  _escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelDraw();
  };
  document.addEventListener('keydown', _escHandler);
}

export function cancelDraw(): void {
  _vertices = [];
  _clearPreview();
  setDrawMode('idle');
  document.dispatchEvent(new CustomEvent('drawModeChanged', { detail: { mode: 'idle' } }));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _clearHandlers(): void {
  if (_clickHandler) { _map?.off('click', _clickHandler); _clickHandler = null; }
  if (_dblClickHandler) { _map?.off('dblclick', _dblClickHandler); _dblClickHandler = null; }
  if (_mouseMoveHandler) { _map?.off('mousemove', _mouseMoveHandler); _mouseMoveHandler = null; }
  if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
}

function _clearPreview(): void {
  const src = _map?.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: [] });
}

function _updatePreview(): void {
  const src = _map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src || _vertices.length === 0) return;

  const features = [];
  // Vertex dots
  for (const v of _vertices) {
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} });
  }
  // In-progress line / polygon
  if (_vertices.length >= 2) {
    if (_mode === 'drawLine') {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: _vertices }, properties: {} });
    } else if (_mode === 'drawPolygon') {
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[..._vertices, _vertices[0]]] }, properties: {} });
    }
  }
  src.setData({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection);
}

function _updatePreviewWithCursor(cursor: [number, number]): void {
  const src = _map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src || _vertices.length === 0) return;
  const withCursor = [..._vertices, cursor];
  const features: GeoJSON.Feature[] = _vertices.map((v) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} } as GeoJSON.Feature));
  if (_mode === 'drawLine') {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: withCursor }, properties: {} } as GeoJSON.Feature);
  } else if (_mode === 'drawPolygon' && withCursor.length >= 3) {
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...withCursor, withCursor[0]]] }, properties: {} } as GeoJSON.Feature);
  }
  src.setData({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection);
}

function _commitPoint(coord: [number, number]): void {
  const feature = ensureFeatureProperties({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: { source: 'sketch', type: getSelectedTypePreset() } as Parameters<typeof ensureFeatureProperties>[0]['properties']
  } as Parameters<typeof ensureFeatureProperties>[0], 'sketch');
  touchFeature(feature);
  addFeature(feature);
  refreshFeatureLayer(_map);
  saveFeatures();
  cancelDraw();
  document.dispatchEvent(new CustomEvent('drawModeChanged', { detail: { mode: 'idle' } }));
}

function _finishShape(): void {
  if (_mode === 'drawLine' && _vertices.length < 2) { cancelDraw(); return; }
  if (_mode === 'drawPolygon' && _vertices.length < 3) { cancelDraw(); return; }

  const geometry: GeoJSON.Geometry = _mode === 'drawLine'
    ? { type: 'LineString', coordinates: _vertices }
    : { type: 'Polygon', coordinates: [[..._vertices, _vertices[0]]] };

  const styles = getStyles();
  const feature = ensureFeatureProperties({
    type: 'Feature',
    geometry,
    properties: { source: 'sketch', type: getSelectedTypePreset() } as Parameters<typeof ensureFeatureProperties>[0]['properties']
  } as Parameters<typeof ensureFeatureProperties>[0], 'sketch');
  touchFeature(feature);
  addFeature(feature);
  refreshFeatureLayer(_map);
  saveFeatures();
  void styles; // referenced to satisfy linter
  cancelDraw();
  document.dispatchEvent(new CustomEvent('drawModeChanged', { detail: { mode: 'idle' } }));
}

function _updateMapCursor(): void {
  if (!_map) return;
  const canvas = _map.getCanvas();
  if (_mode === 'idle') { canvas.style.cursor = ''; return; }
  if (_mode === 'select') { canvas.style.cursor = 'pointer'; return; }
  canvas.style.cursor = 'crosshair';
}
