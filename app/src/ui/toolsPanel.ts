import maplibregl from 'maplibre-gl';
import { getStyles, getVisibility, getLabelVisibility, setStyles, setVisibility, setLabelVisibility } from '../style/styleStore.js';
import { refreshFeatureLayer } from '../features/featureLayer.js';
import { getFeatureCollection, clearFeatures, saveFeatures } from '../features/featureStore.js';
import { isFeatureCollection } from '../features/featureProperties.js';
import { addOverlay, wireOverlayPanelEvents, renderOverlaysPanel } from '../overlays/overlayManager.js';
import { buildIdentifier, escapeHtml } from '../coord/formatters.js';
import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../map/basemaps.js';
import { switchBasemap } from '../map/mapInstance.js';
import { updateCacheEstimateSoon } from '../cache/tileCache.js';
import { getSelectedCacheId } from '../cache/cacheStore.js';
import { gps } from '../gps/gpsManager.js';

export function wireToolsPanel(map: maplibregl.Map): void {
  // Open / close
  document.getElementById('tools-header-btn')?.addEventListener('click', () => {
    document.getElementById('tools-panel')?.classList.toggle('hidden');
  });
  document.getElementById('tools-close')?.addEventListener('click', () => {
    document.getElementById('tools-panel')?.classList.add('hidden');
  });

  wireStyleInputs(map);
  wireBasemapSelect(map);
  wireExportImport(map);
  wireGpsFollowUser();
  wireClearFeatures(map);
  wireOverlayPanelEvents();
  renderOverlaysPanel();
  populateBasemapSelect();
}

// ─── Basemap select ───────────────────────────────────────────────────────────

function populateBasemapSelect(): void {
  const sel = document.getElementById('basemap-select') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = BASEMAPS.map((bm) =>
    `<option value="${escapeHtml(bm.id)}"${bm.id === DEFAULT_BASEMAP_ID ? ' selected' : ''}>${escapeHtml(bm.label)}</option>`
  ).join('') + `<option value="offline-cache">Offline Cache</option>`;
}

function wireBasemapSelect(map: maplibregl.Map): void {
  const sel = document.getElementById('basemap-select') as HTMLSelectElement | null;
  if (!sel) return;
  sel.addEventListener('change', () => {
    switchBasemap(map, sel.value);
    updateCacheEstimateSoon();
    if (sel.value === 'offline-cache' && !getSelectedCacheId()) {
      alert('No offline cache selected. Go to OFFLINE MAP CACHE and select one.');
    }
  });
}

// ─── Layers & Styling ────────────────────────────────────────────────────────

function wireStyleInputs(map: maplibregl.Map): void {
  const styles = getStyles();
  const vis = getVisibility();
  const labelVis = getLabelVisibility();

  // Set initial values
  setInputValue('style-point-color', styles.Point.color);
  setInputValue('style-point-size', String(styles.Point.radius));
  setInputValue('style-line-color', styles.LineString.color);
  setInputValue('style-line-width', String(styles.LineString.weight));
  setInputValue('style-polygon-color', styles.Polygon.color);
  setInputValue('style-polygon-width', String(styles.Polygon.weight));
  setChecked('vis-point', vis.Point);
  setChecked('vis-line', vis.LineString);
  setChecked('vis-polygon', vis.Polygon);
  setChecked('label-point', labelVis.Point);
  setChecked('label-line', labelVis.LineString);
  setChecked('label-polygon', labelVis.Polygon);

  const sync = () => {
    setStyles({
      Point: {
        color: getInputValue('style-point-color') || styles.Point.color,
        radius: Number(getInputValue('style-point-size')) || styles.Point.radius
      },
      LineString: {
        color: getInputValue('style-line-color') || styles.LineString.color,
        weight: Number(getInputValue('style-line-width')) || styles.LineString.weight
      },
      Polygon: {
        color: getInputValue('style-polygon-color') || styles.Polygon.color,
        weight: Number(getInputValue('style-polygon-width')) || styles.Polygon.weight,
        fillColor: getStyles().Polygon.fillColor,
        fillOpacity: getStyles().Polygon.fillOpacity
      }
    });
    setVisibility({
      Point: getChecked('vis-point'),
      LineString: getChecked('vis-line'),
      Polygon: getChecked('vis-polygon')
    });
    setLabelVisibility({
      Point: getChecked('label-point'),
      LineString: getChecked('label-line'),
      Polygon: getChecked('label-polygon')
    });
    refreshFeatureLayer(map);
  };

  ['style-point-color', 'style-point-size', 'style-line-color', 'style-line-width',
   'style-polygon-color', 'style-polygon-width',
   'vis-point', 'vis-line', 'vis-polygon',
   'label-point', 'label-line', 'label-polygon'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', sync);
    document.getElementById(id)?.addEventListener('change', sync);
  });
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function wireExportImport(map: maplibregl.Map): void {
  document.getElementById('download-geojson')?.addEventListener('click', () => {
    const fc = getFeatureCollection();
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `field-mapper-${new Date().toISOString().replace(/[:.]/g, '-')}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileInput = document.getElementById('import-file') as HTMLInputElement | null;
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    let json: unknown;
    try { json = JSON.parse(await file.text()); } catch { alert('Invalid JSON file.'); fileInput.value = ''; return; }
    if (!isFeatureCollection(json)) { alert('Invalid GeoJSON: expected FeatureCollection.'); fileInput.value = ''; return; }
    addOverlay(file.name || `overlay-${buildIdentifier()}.geojson`, json as GeoJSON.FeatureCollection);
    fileInput.value = '';
  });
}

// ─── GPS follow user ──────────────────────────────────────────────────────────

function wireGpsFollowUser(): void {
  const checkbox = document.getElementById('gps-follow-user') as HTMLInputElement | null;
  if (!checkbox) return;
  gps.followUser = checkbox.checked;
  checkbox.addEventListener('change', () => { gps.followUser = checkbox.checked; });
}

// ─── Clear features ───────────────────────────────────────────────────────────

function wireClearFeatures(map: maplibregl.Map): void {
  document.getElementById('clear-features')?.addEventListener('click', () => {
    const warning = [
      'WARNING: This will permanently remove all collected features stored in local memory.',
      'Export your data before proceeding.',
      'Are you sure you want to clear all features?'
    ].join('\n\n');
    if (!confirm(warning)) return;
    clearFeatures();
    refreshFeatureLayer(map);
    saveFeatures();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setInputValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getInputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
}

function setChecked(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked;
}

function getChecked(id: string): boolean {
  return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
}
