/**
 * Manages the MapLibre GeoJSON source + layers that render drawn features.
 * Keeps computed style properties (_fillColor, _visible, etc.) up to date
 * by decorating feature properties before calling setData().
 */
import maplibregl from 'maplibre-gl';
import type { AppFeature } from '../types.js';
import { getFeatureCollection } from './featureStore.js';
import { getStyles, getVisibility, getLabelVisibility } from '../style/styleStore.js';
import { getOrAssignTypeColor } from '../style/typeColors.js';

const SOURCE_ID = 'features';

export function initFeatureLayers(map: maplibregl.Map): void {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    generateId: false
  });

  // Polygon fill
  map.addLayer({
    id: 'features-fill',
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['get', '_fillColor'],
      'fill-opacity': ['get', '_fillOpacity']
    }
  });

  // Polygon + line stroke
  map.addLayer({
    id: 'features-stroke',
    type: 'line',
    source: SOURCE_ID,
    filter: ['any',
      ['==', ['geometry-type'], 'Polygon'],
      ['==', ['geometry-type'], 'LineString']
    ],
    paint: {
      'line-color': ['get', '_strokeColor'],
      'line-width': ['get', '_weight'],
      'line-opacity': ['case', ['boolean', ['get', '_visible'], true], 1, 0]
    }
  });

  // Points
  map.addLayer({
    id: 'features-points',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['get', '_fillColor'],
      'circle-radius': ['case', ['boolean', ['get', '_visible'], true], ['get', '_radius'], 0],
      'circle-stroke-color': '#000000',
      'circle-stroke-width': ['case', ['boolean', ['get', '_visible'], true], 1, 0],
      'circle-opacity': ['case', ['boolean', ['get', '_visible'], true], 1, 0]
    }
  });

  // Labels
  map.addLayer({
    id: 'features-labels',
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'text-field': ['case',
        ['boolean', ['get', '_labelVisible'], false],
        ['get', '_labelText'],
        ''
      ],
      'text-size': 11,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-anchor': 'bottom',
      'text-offset': [0, -0.5],
      'text-allow-overlap': false
    },
    paint: {
      'text-color': '#0f2942',
      'text-halo-color': 'rgba(255,255,255,0.86)',
      'text-halo-width': 1.5
    }
  });

  // Selection highlight (circle on selected point)
  map.addLayer({
    id: 'features-selected',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', '_selected'], true],
    paint: {
      'circle-color': '#ff9800',
      'circle-radius': 12,
      'circle-opacity': 0.5,
      'circle-stroke-color': '#ff9800',
      'circle-stroke-width': 2
    }
  });
}

/** Recompute all style properties and push to the map source. */
export function refreshFeatureLayer(map: maplibregl.Map): void {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;

  const styles = getStyles();
  const visibility = getVisibility();
  const labelVisibility = getLabelVisibility();
  const fc = getFeatureCollection();

  const decorated = fc.features.map((f) => decorateFeature(f, styles, visibility, labelVisibility));
  source.setData({ type: 'FeatureCollection', features: decorated });
}

export function setSelectedFeatureId(map: maplibregl.Map, id: string | null): void {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!source) return;
  const fc = getFeatureCollection();
  const styles = getStyles();
  const visibility = getVisibility();
  const labelVisibility = getLabelVisibility();
  const decorated = fc.features.map((f) => {
    const d = decorateFeature(f, styles, visibility, labelVisibility);
    if (d.properties) {
      (d.properties as unknown as Record<string, unknown>)['_selected'] = d.properties.id === id;
    }
    return d;
  });
  source.setData({ type: 'FeatureCollection', features: decorated });
}

export function queryFeatureAtPoint(map: maplibregl.Map, point: maplibregl.PointLike): AppFeature | null {
  const layers = ['features-points', 'features-stroke', 'features-fill'];
  const results = map.queryRenderedFeatures(point, { layers });
  if (!results.length) return null;
  const hit = results[0];
  return getFeatureCollection().features.find(
    (f) => f.properties?.id === (hit.properties as Record<string, unknown>)['id']
  ) ?? null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function decorateFeature(
  feature: AppFeature,
  styles: ReturnType<typeof getStyles>,
  visibility: ReturnType<typeof getVisibility>,
  labelVisibility: ReturnType<typeof getLabelVisibility>
): AppFeature {
  const p = feature.properties;
  if (!p) return feature;
  const geomType = feature.geometry.type;

  let fillColor = styles.Point.color;
  let strokeColor = '#000000';
  let radius = styles.Point.radius;
  let weight = 3;
  let fillOpacity = 1;
  let visible = true;

  if (geomType === 'Point') {
    fillColor = p.type ? getOrAssignTypeColor(p.type, styles.Point.color) : styles.Point.color;
    strokeColor = '#000000';
    radius = styles.Point.radius;
    weight = 1;
    fillOpacity = 0.9;
    visible = visibility.Point;
  } else if (geomType === 'LineString') {
    fillColor = styles.LineString.color;
    strokeColor = styles.LineString.color;
    radius = 0;
    weight = styles.LineString.weight;
    fillOpacity = 0;
    visible = visibility.LineString;
  } else if (geomType === 'Polygon') {
    fillColor = styles.Polygon.fillColor;
    strokeColor = styles.Polygon.color;
    radius = 0;
    weight = styles.Polygon.weight;
    fillOpacity = visible ? styles.Polygon.fillOpacity : 0;
    visible = visibility.Polygon;
  }

  const typeKey = geomType as 'Point' | 'LineString' | 'Polygon';
  const labelVis = labelVisibility[typeKey] && visible;
  const nameText = String(p.name || '').trim();
  const typeText = String(p.type || '').trim();
  const notesText = String(p.notes || '').trim();
  const labelText = [nameText, typeText, notesText].filter(Boolean).join('\n');

  return {
    ...feature,
    properties: {
      ...p,
      _fillColor: fillColor,
      _strokeColor: strokeColor,
      _radius: radius,
      _weight: weight,
      _fillOpacity: visible ? fillOpacity : 0,
      _visible: visible,
      _labelVisible: labelVis && Boolean(labelText),
      _labelText: labelText
    }
  };
}
