import maplibregl from 'maplibre-gl';
import { latLonToUtm, latLonToUtmInZone, utmToLatLon } from '../coord/utm.js';
import { GRID_STEPS } from '../constants.js';
import type { Feature, LineString, Point, FeatureCollection } from 'geojson';

const GRID_LINE_SOURCE = 'utm-grid-lines';
const GRID_LABEL_SOURCE = 'utm-grid-labels';

let _active = false;

export function isUtmGridActive(): boolean {
  return _active;
}

export function initUtmGridLayers(map: maplibregl.Map): void {
  map.addSource(GRID_LINE_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
  map.addSource(GRID_LABEL_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'utm-grid-lines',
    type: 'line',
    source: GRID_LINE_SOURCE,
    paint: {
      'line-color': '#2d7fbf',
      'line-width': 1,
      'line-opacity': 0.45
    }
  });

  map.addLayer({
    id: 'utm-grid-labels',
    type: 'symbol',
    source: GRID_LABEL_SOURCE,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-rotation-alignment': 'map',
      'text-rotate': ['get', 'rotate']
    },
    paint: {
      'text-color': '#1f4f7d',
      'text-halo-color': 'rgba(255,255,255,0.88)',
      'text-halo-width': 2
    }
  });
}

export function toggleUtmGrid(map: maplibregl.Map): boolean {
  _active = !_active;
  renderUtmGrid(map);
  return _active;
}

export function renderUtmGrid(map: maplibregl.Map): void {
  const lineSource = map.getSource(GRID_LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const labelSource = map.getSource(GRID_LABEL_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!lineSource || !labelSource) return;

  if (!_active) {
    lineSource.setData({ type: 'FeatureCollection', features: [] });
    labelSource.setData({ type: 'FeatureCollection', features: [] });
    updateGridInfo(null);
    return;
  }

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const center = map.getCenter();
  const centerUtm = latLonToUtm(center.lat, center.lng);
  const { zone, hemisphere } = centerUtm;

  const sw = latLonToUtmInZone(bounds.getSouth(), bounds.getWest(), zone);
  const nw = latLonToUtmInZone(bounds.getNorth(), bounds.getWest(), zone);
  const se = latLonToUtmInZone(bounds.getSouth(), bounds.getEast(), zone);
  const ne = latLonToUtmInZone(bounds.getNorth(), bounds.getEast(), zone);

  const minE = Math.min(sw.easting, nw.easting, se.easting, ne.easting);
  const maxE = Math.max(sw.easting, nw.easting, se.easting, ne.easting);
  const minN = Math.min(sw.northing, nw.northing, se.northing, ne.northing);
  const maxN = Math.max(sw.northing, nw.northing, se.northing, ne.northing);

  let step = gridStepForZoom(zoom);
  let lineCountEstimate = ((maxE - minE) / step) + ((maxN - minN) / step);
  while (lineCountEstimate > 120) {
    const coarser = nextCoarserStep(step);
    if (coarser === step) break;
    step = coarser;
    lineCountEstimate = ((maxE - minE) / step) + ((maxN - minN) / step);
  }

  updateGridInfo(step);

  const startE = Math.floor(minE / step) * step;
  const endE = Math.ceil(maxE / step) * step;
  const startN = Math.floor(minN / step) * step;
  const endN = Math.ceil(maxN / step) * step;

  const lineFeatures: Feature<LineString>[] = [];
  const labelFeatures: Feature<Point>[] = [];
  const segments = 8;
  const labelInset = Math.max(step * 0.15, 6);

  for (let e = startE; e <= endE; e += step) {
    const coords: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const n = minN + ((maxN - minN) * i / segments);
      const ll = utmToLatLon(e, n, zone, hemisphere);
      coords.push([ll.lon, ll.lat]);
    }
    lineFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });

    const topLl = utmToLatLon(e, maxN - labelInset, zone, hemisphere);
    labelFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [topLl.lon, topLl.lat] },
      properties: { label: String(Math.round(e)), rotate: 0 }
    });
  }

  for (let n = startN; n <= endN; n += step) {
    const coords: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const e = minE + ((maxE - minE) * i / segments);
      const ll = utmToLatLon(e, n, zone, hemisphere);
      coords.push([ll.lon, ll.lat]);
    }
    lineFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });

    const leftLl = utmToLatLon(minE + labelInset, n, zone, hemisphere);
    labelFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [leftLl.lon, leftLl.lat] },
      properties: { label: String(Math.round(n)), rotate: -90 }
    });
  }

  const lineCollection: FeatureCollection<LineString> = { type: 'FeatureCollection', features: lineFeatures };
  const labelCollection: FeatureCollection<Point> = { type: 'FeatureCollection', features: labelFeatures };
  lineSource.setData(lineCollection as FeatureCollection);
  labelSource.setData(labelCollection as FeatureCollection);
}

function gridStepForZoom(zoom: number): number {
  if (zoom >= 19) return 10;
  if (zoom >= 18) return 50;
  if (zoom >= 17) return 100;
  if (zoom >= 16) return 250;
  if (zoom >= 15) return 500;
  if (zoom >= 14) return 1000;
  if (zoom >= 12) return 2000;
  if (zoom >= 10) return 5000;
  return 10000;
}

function nextCoarserStep(step: number): number {
  const index = (GRID_STEPS as readonly number[]).indexOf(step);
  if (index < 0 || index === GRID_STEPS.length - 1) return step;
  return GRID_STEPS[index + 1];
}

function updateGridInfo(step: number | null): void {
  const el = document.getElementById('grid-info');
  if (!el) return;
  if (step === null) {
    el.textContent = 'Grid: --';
    el.classList.add('hidden');
  } else {
    const areaHa = (step * step) / 10000;
    el.textContent = `Grid: ${step} m | Cell area: ${areaHa.toFixed(2)} ha`;
    el.classList.remove('hidden');
  }
}
