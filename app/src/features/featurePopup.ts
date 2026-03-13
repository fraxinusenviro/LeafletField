import maplibregl from 'maplibre-gl';
import type { AppFeature } from '../types.js';
import { escapeHtml } from '../coord/formatters.js';
import { touchFeature } from './featureProperties.js';
import { updateFeature, removeFeature, saveFeatures } from './featureStore.js';
import { refreshFeatureLayer, setSelectedFeatureId } from './featureLayer.js';
import length from '@turf/length';
import area from '@turf/area';

let _popup: maplibregl.Popup | null = null;
let _map: maplibregl.Map;
let _selectedId: string | null = null;

export function initFeaturePopup(map: maplibregl.Map): void {
  _map = map;
}

export function getSelectedFeatureId(): string | null {
  return _selectedId;
}

export function openFeaturePopup(feature: AppFeature): void {
  closeFeaturePopup();

  if (!feature.geometry || !feature.properties) return;

  const p = feature.properties;
  _selectedId = p.id;
  setSelectedFeatureId(_map, p.id);

  const geomSummary = featureGeometrySummary(feature);
  const created = p.created_at ? new Date(p.created_at).toLocaleString() : '';
  const surveyorDisplay = String(p.META_SurveyorInit ?? '');

  const html = `
    <div class="feature-popover">
      <div><strong>Name:</strong> ${escapeHtml(p.name)}</div>
      <div><strong>Type:</strong> ${escapeHtml(p.type)}</div>
      <div><strong>Notes:</strong> ${escapeHtml(p.notes)}</div>
      <div><strong>Geometry:</strong> ${escapeHtml(geomSummary)}</div>
      <div><strong>Created:</strong> ${escapeHtml(created)}</div>
      <div><strong>META_SurveyorInit:</strong> ${escapeHtml(surveyorDisplay)}</div>
      <div><strong>META_Project:</strong> ${escapeHtml(p.META_Project)}</div>
      <div><strong>META_Site:</strong> ${escapeHtml(p.META_Site)}</div>
      <div class="feature-popover-actions">
        <button type="button" data-feature-action="edit-attrs">Edit Attributes</button>
        <button type="button" data-feature-action="delete">Delete Feature</button>
      </div>
    </div>
  `;

  const center = featureCenter(feature);
  _popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '320px' })
    .setLngLat(center)
    .setHTML(html)
    .addTo(_map);

  _popup.on('close', () => {
    _selectedId = null;
    setSelectedFeatureId(_map, null);
    _popup = null;
  });

  // Wire action buttons after DOM insertion
  requestAnimationFrame(() => {
    const el = _popup?.getElement();
    if (!el) return;

    el.querySelector('[data-feature-action="edit-attrs"]')?.addEventListener('click', () => {
      editAttributes(feature);
    });

    el.querySelector('[data-feature-action="delete"]')?.addEventListener('click', () => {
      deleteFeature(feature);
    });
  });
}

export function closeFeaturePopup(): void {
  if (_popup) { _popup.remove(); _popup = null; }
  _selectedId = null;
  setSelectedFeatureId(_map, null);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function editAttributes(feature: AppFeature): void {
  const p = feature.properties;
  if (!p) return;
  const name = prompt('Name', p.name || '');
  if (name === null) return;
  const type = prompt('Type', p.type || '');
  if (type === null) return;
  const notes = prompt('Notes', p.notes || '');
  if (notes === null) return;

  p.name = name;
  p.type = type;
  p.notes = notes;
  touchFeature(feature);
  updateFeature(feature);
  refreshFeatureLayer(_map);
  saveFeatures();
  openFeaturePopup(feature);
}

function deleteFeature(feature: AppFeature): void {
  if (!confirm('Delete selected feature?')) return;
  const id = feature.properties?.id;
  if (!id) return;
  removeFeature(id);
  closeFeaturePopup();
  refreshFeatureLayer(_map);
  saveFeatures();
}

function featureCenter(feature: AppFeature): maplibregl.LngLatLike {
  const geom = feature.geometry;
  if (geom.type === 'Point') return geom.coordinates as [number, number];
  if (geom.type === 'LineString') {
    const coords = geom.coordinates;
    const mid = coords[Math.floor(coords.length / 2)];
    return mid as [number, number];
  }
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0];
    const sumLng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const sumLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return [sumLng, sumLat];
  }
  return _map.getCenter();
}

function featureGeometrySummary(feature: AppFeature): string {
  const geom = feature.geometry;
  if (geom.type === 'LineString') {
    const km = length(feature, { units: 'kilometers' });
    return `LineString (${(km * 1000).toFixed(2)} m)`;
  }
  if (geom.type === 'Polygon') {
    const m2 = area(feature);
    return `Polygon (${m2.toFixed(2)} m²)`;
  }
  return 'Point';
}
