import maplibregl from 'maplibre-gl';
import type { OverlayRecord, OverlayStyle } from '../types.js';
import { newId, escapeHtml, buildIdentifier } from '../coord/formatters.js';
import { IMPORTED_DEFAULT_STYLE } from '../constants.js';
import type { FeatureCollection } from 'geojson';

const _records: OverlayRecord[] = [];
let _map: maplibregl.Map;

export function initOverlays(map: maplibregl.Map): void {
  _map = map;
}

export function getOverlayRecords(): OverlayRecord[] {
  return _records;
}

export function addOverlay(fileName: string, geojson: FeatureCollection): OverlayRecord {
  const id = newId();
  const fields = collectFieldNames(geojson);
  const geometryTypes = collectGeometryTypes(geojson);
  const style: OverlayStyle = {
    Point: { ...IMPORTED_DEFAULT_STYLE.Point, visible: true },
    LineString: { ...IMPORTED_DEFAULT_STYLE.LineString, visible: true },
    Polygon: { ...IMPORTED_DEFAULT_STYLE.Polygon, visible: true }
  };
  const record: OverlayRecord = {
    id, name: fileName || `overlay-${buildIdentifier()}`, fields, labelField: '', geometryTypes, geojson, style
  };
  _records.push(record);
  _addMapSourceAndLayers(record);
  renderOverlaysPanel();
  return record;
}

export function removeOverlay(id: string): void {
  const idx = _records.findIndex((r) => r.id === id);
  if (idx < 0) return;
  _records.splice(idx, 1);
  _removeMapSourceAndLayers(id);
  renderOverlaysPanel();
}

export function updateOverlayStyle(id: string, geomType: keyof OverlayStyle, patch: Partial<OverlayStyle[keyof OverlayStyle]>): void {
  const record = _records.find((r) => r.id === id);
  if (!record) return;
  Object.assign(record.style[geomType], patch);
  _refreshOverlayLayers(record);
}

export function updateOverlayLabelField(id: string, field: string): void {
  const record = _records.find((r) => r.id === id);
  if (!record) return;
  record.labelField = field;
  _refreshOverlayLayers(record);
}

// ─── Map layer management ─────────────────────────────────────────────────────

function _addMapSourceAndLayers(record: OverlayRecord): void {
  const src = `overlay-${record.id}`;
  _map.addSource(src, { type: 'geojson', data: decorateOverlayGeojson(record) });

  _map.addLayer({
    id: `overlay-fill-${record.id}`,
    type: 'fill',
    source: src,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#000000', 'fill-opacity': 0 }
  });
  _map.addLayer({
    id: `overlay-stroke-${record.id}`,
    type: 'line',
    source: src,
    paint: {
      'line-color': ['get', '_color'],
      'line-width': ['get', '_size'],
      'line-opacity': ['case', ['boolean', ['get', '_visible'], true], 1, 0]
    }
  });
  _map.addLayer({
    id: `overlay-circle-${record.id}`,
    type: 'circle',
    source: src,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['get', '_color'],
      'circle-radius': ['get', '_size'],
      'circle-stroke-color': ['get', '_stroke'],
      'circle-stroke-width': 1,
      'circle-opacity': ['case', ['boolean', ['get', '_visible'], true], 1, 0]
    }
  });
  _map.addLayer({
    id: `overlay-labels-${record.id}`,
    type: 'symbol',
    source: src,
    layout: {
      'text-field': ['case', ['boolean', ['get', '_labelVisible'], false], ['get', '_label'], ''],
      'text-size': 10,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-offset': [0, -0.5],
      'text-anchor': 'bottom',
      'text-allow-overlap': false
    },
    paint: { 'text-color': '#0f2942', 'text-halo-color': 'rgba(255,255,255,0.88)', 'text-halo-width': 1.5 }
  });
}

function _removeMapSourceAndLayers(id: string): void {
  const layerIds = [`overlay-fill-${id}`, `overlay-stroke-${id}`, `overlay-circle-${id}`, `overlay-labels-${id}`];
  for (const lid of layerIds) {
    if (_map.getLayer(lid)) _map.removeLayer(lid);
  }
  if (_map.getSource(`overlay-${id}`)) _map.removeSource(`overlay-${id}`);
}

function _refreshOverlayLayers(record: OverlayRecord): void {
  const src = _map.getSource(`overlay-${record.id}`) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(decorateOverlayGeojson(record));
}

function decorateOverlayGeojson(record: OverlayRecord): FeatureCollection {
  const features = (record.geojson.features ?? []).map((f) => {
    const geomType = normalizeGeomType(f.geometry?.type ?? '');
    const styleSlot = geomType ? record.style[geomType as keyof OverlayStyle] : null;
    const labelValue = record.labelField ? String(f.properties?.[record.labelField] ?? '').trim() : '';
    return {
      ...f,
      properties: {
        ...(f.properties ?? {}),
        _color: styleSlot?.color ?? '#000000',
        _size: styleSlot?.size ?? 2,
        _stroke: 'stroke' in (styleSlot ?? {}) ? (styleSlot as { stroke?: string }).stroke ?? '#000' : '#000',
        _visible: styleSlot?.visible ?? true,
        _labelVisible: Boolean(styleSlot?.visible && labelValue),
        _label: labelValue
      }
    };
  });
  return { type: 'FeatureCollection', features };
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

export function renderOverlaysPanel(): void {
  const el = document.getElementById('imported-overlays');
  if (!el) return;

  if (!_records.length) {
    el.innerHTML = '<div class="imported-empty">No imported overlays loaded.</div>';
    return;
  }

  el.innerHTML = _records.map((record) => {
    const fieldOptions = ['<option value="">No labels</option>']
      .concat(record.fields.map((f) =>
        `<option value="${escapeHtml(f)}"${record.labelField === f ? ' selected' : ''}>${escapeHtml(f)}</option>`
      ))
      .join('');
    const rows = (['Point', 'LineString', 'Polygon'] as const).map((gt) => {
      const s = record.style[gt];
      const present = record.geometryTypes[gt];
      return `
        <div class="imported-overlay-grid${present ? '' : ' disabled'}" data-geometry-row="${gt}">
          <span>${gt === 'LineString' ? 'Line' : gt}</span>
          <input type="checkbox" data-overlay-action="visible" data-overlay-id="${record.id}" data-geometry="${gt}"${s.visible ? ' checked' : ''}${present ? '' : ' disabled'} />
          <input type="color" data-overlay-action="color" data-overlay-id="${record.id}" data-geometry="${gt}" value="${s.color}"${present ? '' : ' disabled'} />
          <input type="number" min="1" max="30" data-overlay-action="size" data-overlay-id="${record.id}" data-geometry="${gt}" value="${s.size}"${present ? '' : ' disabled'} />
        </div>
      `;
    }).join('');

    return `
      <div class="imported-overlay-card" data-overlay-id="${record.id}">
        <div class="imported-overlay-head">
          <span class="imported-overlay-name">${escapeHtml(record.name)}</span>
          <button type="button" class="overlay-remove-btn" data-overlay-action="remove" data-overlay-id="${record.id}">Remove</button>
        </div>
        <div class="imported-overlay-grid overlay-grid-header">
          <span>Geometry</span><span>On/Off</span><span>Color</span><span>Size</span>
        </div>
        ${rows}
        <label class="overlay-label-field">Label Field
          <select data-overlay-action="label-field" data-overlay-id="${record.id}">${fieldOptions}</select>
        </label>
      </div>
    `;
  }).join('');
}

export function wireOverlayPanelEvents(): void {
  const el = document.getElementById('imported-overlays');
  if (!el) return;

  el.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const action = target?.dataset?.['overlayAction'];
    const overlayId = target?.dataset?.['overlayId'];
    if (!action || !overlayId) return;

    if (action === 'visible' || action === 'color' || action === 'size') {
      const geomType = target.dataset['geometry'] as keyof OverlayStyle;
      if (!geomType) return;
      const patch: Partial<OverlayStyle[keyof OverlayStyle]> = {};
      if (action === 'visible') (patch as Record<string, unknown>)['visible'] = (target as HTMLInputElement).checked;
      if (action === 'color') patch.color = (target as HTMLInputElement).value;
      if (action === 'size') patch.size = Number((target as HTMLInputElement).value);
      updateOverlayStyle(overlayId, geomType, patch);
    }
    if (action === 'label-field') {
      updateOverlayLabelField(overlayId, (target as HTMLSelectElement).value);
    }
  });

  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement)?.closest('[data-overlay-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset['overlayAction'];
    const overlayId = target.dataset['overlayId'];
    if (action === 'remove' && overlayId) removeOverlay(overlayId);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeGeomType(type: string): string {
  if (type === 'Point' || type === 'MultiPoint') return 'Point';
  if (type === 'LineString' || type === 'MultiLineString') return 'LineString';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'Polygon';
  return '';
}

function collectFieldNames(fc: FeatureCollection): string[] {
  const fields = new Set<string>();
  for (const f of fc.features ?? []) {
    if (f.properties && typeof f.properties === 'object') {
      Object.keys(f.properties).forEach((k) => fields.add(k));
    }
  }
  return Array.from(fields).sort((a, b) => a.localeCompare(b));
}

function collectGeometryTypes(fc: FeatureCollection): OverlayRecord['geometryTypes'] {
  const types = new Set<string>();
  for (const f of fc.features ?? []) {
    const gt = normalizeGeomType(f.geometry?.type ?? '');
    if (gt) types.add(gt);
  }
  return { Point: types.has('Point'), LineString: types.has('LineString'), Polygon: types.has('Polygon') };
}
