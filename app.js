const STORAGE_KEYS = {
  mapView: 'lfm_map_view',
  basemap: 'lfm_basemap',
  features: 'lfm_features',
  styles: 'lfm_styles',
  visibility: 'lfm_visibility'
};

const DEFAULTS = {
  center: [45.0, -63.0],
  zoom: 7,
  basemap: 'Esri World Imagery',
  visibility: { Point: true, LineString: true, Polygon: true },
  styles: {
    Point: { color: '#e63946', radius: 7 },
    LineString: { color: '#1d3557', weight: 3 },
    Polygon: { color: '#457b9d', weight: 2, fillColor: '#a8dadc', fillOpacity: 0.4 }
  }
};

function parseStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureFeatureProperties(feature, sourceHint = 'sketch') {
  const now = new Date().toISOString();
  const props = feature.properties || {};
  feature.properties = {
    id: props.id || newId(),
    name: props.name || '',
    type: props.type || '',
    notes: props.notes || '',
    created_at: props.created_at || now,
    updated_at: props.updated_at || props.created_at || now,
    source: props.source || sourceHint
  };
  return feature;
}

function touchFeature(feature) {
  feature.properties.updated_at = new Date().toISOString();
}

function getGeometryType(layer) {
  if (layer instanceof L.CircleMarker || layer instanceof L.Marker) return 'Point';
  if (layer instanceof L.Polygon && !(layer instanceof L.Rectangle)) return 'Polygon';
  return 'LineString';
}

function isFeatureCollection(fc) {
  return Boolean(fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features));
}

const savedMap = parseStored(STORAGE_KEYS.mapView, null);
const map = L.map('map', {
  center: savedMap?.center || DEFAULTS.center,
  zoom: savedMap?.zoom || DEFAULTS.zoom
});

if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  document.getElementById('https-warning').classList.remove('hidden');
}

const basemaps = {
  'OpenStreetMap Standard': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }),
  'Esri World Imagery': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
  'Esri World Topo': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
  'Carto Positron': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap contributors &copy; CARTO' })
};

let currentBasemap = localStorage.getItem(STORAGE_KEYS.basemap) || DEFAULTS.basemap;
if (!basemaps[currentBasemap]) currentBasemap = DEFAULTS.basemap;
basemaps[currentBasemap].addTo(map);
L.control.layers(basemaps, null, { position: 'topright' }).addTo(map);
map.on('baselayerchange', (e) => localStorage.setItem(STORAGE_KEYS.basemap, e.name));
map.on('moveend zoomend', () => {
  localStorage.setItem(STORAGE_KEYS.mapView, JSON.stringify({ center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() }));
});

const toolsPanel = document.getElementById('tools-panel');
const ToolsControl = L.Control.extend({
  onAdd() {
    const button = L.DomUtil.create('button', 'tools-toggle-btn');
    button.type = 'button';
    button.textContent = '🛠';
    button.title = 'Toggle tools';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      const hidden = toolsPanel.classList.toggle('hidden');
      drawControl._container.classList.toggle('hidden', hidden);
    });
    return button;
  }
});
new ToolsControl({ position: 'topleft' }).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);
let styles = parseStored(STORAGE_KEYS.styles, DEFAULTS.styles);
let visibility = parseStored(STORAGE_KEYS.visibility, DEFAULTS.visibility);

const drawControl = new L.Control.Draw({
  position: 'topleft',
  draw: { rectangle: false, circle: false, circlemarker: false, marker: true, polyline: true, polygon: true },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);
drawControl._container.classList.add('hidden');

function applyStyle(layer) {
  const type = getGeometryType(layer);
  const isVisible = visibility[type];

  if (type === 'Point') {
    layer.setStyle({
      color: styles.Point.color,
      fillColor: styles.Point.color,
      radius: isVisible ? Number(styles.Point.radius) : 0,
      weight: isVisible ? 1 : 0,
      opacity: isVisible ? 1 : 0,
      fillOpacity: isVisible ? 0.9 : 0
    });
    return;
  }

  if (type === 'LineString') {
    layer.setStyle({
      color: styles.LineString.color,
      weight: Number(styles.LineString.weight),
      opacity: isVisible ? 1 : 0
    });
    return;
  }

  layer.setStyle({
    color: styles.Polygon.color,
    weight: Number(styles.Polygon.weight),
    opacity: isVisible ? 1 : 0,
    fillColor: styles.Polygon.fillColor,
    fillOpacity: isVisible ? Number(styles.Polygon.fillOpacity) : 0
  });
}

function selectFeature(layer) {
  selectedLayer = layer;
  const p = layer.feature?.properties || {};
  document.getElementById('attr-name').value = p.name || '';
  document.getElementById('attr-type').value = p.type || '';
  document.getElementById('attr-notes').value = p.notes || '';
  showMeasurements(layer);
}

function bindFeatureEvents(layer) {
  layer.on('click', () => selectFeature(layer));
}

function normalizeDrawLayer(layer, source = 'sketch') {
  const feature = ensureFeatureProperties(layer.toGeoJSON(), source);
  layer.feature = feature;
  applyStyle(layer);
  bindFeatureEvents(layer);
  return layer;
}

function addFeatureToMap(feature) {
  const normalized = ensureFeatureProperties(feature, feature.properties?.source || 'sketch');
  const layers = L.geoJSON(normalized, { pointToLayer: (_, latlng) => L.circleMarker(latlng) }).getLayers();
  if (!layers.length) return null;
  const layer = layers[0];
  layer.feature = normalized;
  applyStyle(layer);
  bindFeatureEvents(layer);
  drawnItems.addLayer(layer);
  return layer;
}

function featureCollectionFromMap() {
  const features = [];
  drawnItems.eachLayer((layer) => {
    const feature = ensureFeatureProperties(layer.toGeoJSON(), layer.feature?.properties?.source || 'sketch');
    feature.properties.updated_at = layer.feature?.properties?.updated_at || feature.properties.updated_at;
    features.push(feature);
  });
  return { type: 'FeatureCollection', features };
}

function saveFeatures() {
  localStorage.setItem(STORAGE_KEYS.features, JSON.stringify(featureCollectionFromMap()));
}

function loadFeatures() {
  const fc = parseStored(STORAGE_KEYS.features, { type: 'FeatureCollection', features: [] });
  if (!isFeatureCollection(fc)) return;
  fc.features.forEach((feature) => addFeatureToMap(feature));
}

map.on(L.Draw.Event.CREATED, (e) => {
  let layer = e.layer;
  if (layer instanceof L.Marker && !(layer instanceof L.CircleMarker)) {
    layer = L.circleMarker(layer.getLatLng());
  }
  normalizeDrawLayer(layer, 'sketch');
  touchFeature(layer.feature);
  drawnItems.addLayer(layer);
  saveFeatures();
});

map.on(L.Draw.Event.EDITED, (e) => {
  e.layers.eachLayer((layer) => {
    if (!layer.feature) layer.feature = ensureFeatureProperties(layer.toGeoJSON(), 'sketch');
    touchFeature(layer.feature);
    applyStyle(layer);
  });
  saveFeatures();
});

map.on(L.Draw.Event.DELETED, () => {
  selectedLayer = null;
  document.getElementById('measurements').textContent = '';
  saveFeatures();
});

let selectedLayer = null;
function showMeasurements(layer) {
  const container = document.getElementById('measurements');
  const feature = layer.toGeoJSON();
  if (feature.geometry.type === 'LineString') {
    const lengthMeters = turf.length(feature, { units: 'kilometers' }) * 1000;
    container.textContent = `Length: ${lengthMeters.toFixed(2)} m`;
  } else if (feature.geometry.type === 'Polygon') {
    const area = turf.area(feature);
    const perimeter = turf.length(turf.polygonToLine(feature), { units: 'kilometers' }) * 1000;
    container.textContent = `Area: ${area.toFixed(2)} m² | Perimeter: ${perimeter.toFixed(2)} m`;
  } else {
    container.textContent = 'Point selected';
  }
}

document.getElementById('save-attrs').addEventListener('click', () => {
  if (!selectedLayer?.feature) return;
  selectedLayer.feature.properties.name = document.getElementById('attr-name').value;
  selectedLayer.feature.properties.type = document.getElementById('attr-type').value;
  selectedLayer.feature.properties.notes = document.getElementById('attr-notes').value;
  touchFeature(selectedLayer.feature);
  saveFeatures();
});

document.getElementById('clear-features').addEventListener('click', () => {
  if (!confirm('Clear all features?')) return;
  drawnItems.clearLayers();
  selectedLayer = null;
  document.getElementById('measurements').textContent = '';
  saveFeatures();
});

function syncVisibilityAndStyle() {
  drawnItems.eachLayer(applyStyle);
  localStorage.setItem(STORAGE_KEYS.styles, JSON.stringify(styles));
  localStorage.setItem(STORAGE_KEYS.visibility, JSON.stringify(visibility));
}

function wireStyleInputs() {
  const ids = {
    pointColor: 'style-point-color',
    pointSize: 'style-point-size',
    lineColor: 'style-line-color',
    lineWidth: 'style-line-width',
    polygonColor: 'style-polygon-color',
    polygonWidth: 'style-polygon-width',
    polygonFill: 'style-polygon-fill',
    polygonOpacity: 'style-polygon-opacity'
  };

  document.getElementById(ids.pointColor).value = styles.Point.color;
  document.getElementById(ids.pointSize).value = styles.Point.radius;
  document.getElementById(ids.lineColor).value = styles.LineString.color;
  document.getElementById(ids.lineWidth).value = styles.LineString.weight;
  document.getElementById(ids.polygonColor).value = styles.Polygon.color;
  document.getElementById(ids.polygonWidth).value = styles.Polygon.weight;
  document.getElementById(ids.polygonFill).value = styles.Polygon.fillColor;
  document.getElementById(ids.polygonOpacity).value = styles.Polygon.fillOpacity;

  const updateStyles = () => {
    styles = {
      Point: { color: document.getElementById(ids.pointColor).value, radius: Number(document.getElementById(ids.pointSize).value) },
      LineString: { color: document.getElementById(ids.lineColor).value, weight: Number(document.getElementById(ids.lineWidth).value) },
      Polygon: {
        color: document.getElementById(ids.polygonColor).value,
        weight: Number(document.getElementById(ids.polygonWidth).value),
        fillColor: document.getElementById(ids.polygonFill).value,
        fillOpacity: Number(document.getElementById(ids.polygonOpacity).value)
      }
    };
    syncVisibilityAndStyle();
  };

  Object.values(ids).forEach((id) => document.getElementById(id).addEventListener('input', updateStyles));

  document.getElementById('vis-point').checked = visibility.Point;
  document.getElementById('vis-line').checked = visibility.LineString;
  document.getElementById('vis-polygon').checked = visibility.Polygon;

  document.getElementById('vis-point').addEventListener('change', (e) => {
    visibility.Point = e.target.checked;
    syncVisibilityAndStyle();
  });
  document.getElementById('vis-line').addEventListener('change', (e) => {
    visibility.LineString = e.target.checked;
    syncVisibilityAndStyle();
  });
  document.getElementById('vis-polygon').addEventListener('change', (e) => {
    visibility.Polygon = e.target.checked;
    syncVisibilityAndStyle();
  });
}

document.getElementById('download-geojson').addEventListener('click', () => {
  const fc = featureCollectionFromMap();
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `leaflet-field-${new Date().toISOString().replace(/[:.]/g, '-')}.geojson`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    alert('Invalid JSON file.');
    e.target.value = '';
    return;
  }

  if (!isFeatureCollection(json)) {
    alert('Invalid GeoJSON: expected FeatureCollection.');
    e.target.value = '';
    return;
  }

  const mode = document.getElementById('import-mode').value;
  if (mode === 'replace') drawnItems.clearLayers();

  json.features.forEach((feature) => {
    if (feature?.type !== 'Feature' || !feature.geometry?.type) return;
    addFeatureToMap(feature);
  });

  saveFeatures();
  e.target.value = '';
});

const gps = {
  watchId: null,
  enabled: false,
  stream: false,
  lineRec: false,
  polygonRec: false,
  linePoints: [],
  polygonPoints: [],
  liveMarker: null,
  accuracyCircle: null,
  lastAccepted: null,
  lastAcceptedTs: 0,
  lastFix: null,
  acceptedCount: 0
};

function currentMode() {
  if (gps.polygonRec) return 'GPS Polygon';
  if (gps.lineRec) return 'GPS Line';
  if (gps.stream) return 'GPS Stream';
  return 'Sketch';
}

function updateStatus() {
  const accuracy = gps.lastFix ? `${gps.lastFix.accuracy.toFixed(1)} m` : 'n/a';
  document.getElementById('status-bar').textContent = `Mode: ${currentMode()} | GPS accuracy: ${accuracy}`;
  document.getElementById('gps-status').textContent = gps.enabled
    ? `GPS active | last accuracy ${accuracy} | accepted points ${gps.acceptedCount}`
    : 'GPS inactive';
}

function gpsConfig() {
  return {
    minDistance: Number(document.getElementById('gps-min-distance').value) || 3,
    minIntervalMs: (Number(document.getElementById('gps-min-interval').value) || 1) * 1000,
    maxAccuracy: Number(document.getElementById('gps-max-accuracy').value) || 25
  };
}

function startGps() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by this browser.');
    return false;
  }
  if (gps.enabled) return true;

  gps.watchId = navigator.geolocation.watchPosition(onGpsFix, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
  });

  gps.enabled = true;
  updateStatus();
  return true;
}

function stopGps() {
  if (gps.watchId !== null) navigator.geolocation.clearWatch(gps.watchId);
  gps.watchId = null;
  gps.enabled = false;
  gps.stream = false;
  gps.lineRec = false;
  gps.polygonRec = false;
  gps.linePoints = [];
  gps.polygonPoints = [];

  document.getElementById('gps-stream').textContent = 'Start GPS Stream';
  document.getElementById('gps-line').textContent = 'Start Line Recording';
  document.getElementById('gps-polygon').textContent = 'Start Polygon Recording';
  document.getElementById('gps-enable').textContent = 'Enable GPS';
  updateStatus();
}

function onGpsFix(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latlng = L.latLng(latitude, longitude);
  gps.lastFix = { latlng, accuracy };

  if (!gps.liveMarker) {
    gps.liveMarker = L.circleMarker(latlng, {
      radius: 6,
      color: '#2196f3',
      fillColor: '#2196f3',
      fillOpacity: 0.8
    }).addTo(map);
    gps.accuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#2196f3',
      fillOpacity: 0.1
    }).addTo(map);
  } else {
    gps.liveMarker.setLatLng(latlng);
    gps.accuracyCircle.setLatLng(latlng).setRadius(accuracy);
  }

  const cfg = gpsConfig();
  if (accuracy > cfg.maxAccuracy) {
    updateStatus();
    return;
  }

  const tooSoon = position.timestamp - gps.lastAcceptedTs < cfg.minIntervalMs;
  const tooClose = gps.lastAccepted ? map.distance(gps.lastAccepted, latlng) < cfg.minDistance : false;
  if (tooSoon || tooClose) {
    updateStatus();
    return;
  }

  gps.lastAccepted = latlng;
  gps.lastAcceptedTs = position.timestamp;
  gps.acceptedCount += 1;

  if (gps.stream) addGpsPoint(latlng);
  if (gps.lineRec) gps.linePoints.push([latlng.lng, latlng.lat]);
  if (gps.polygonRec) gps.polygonPoints.push([latlng.lng, latlng.lat]);

  updateStatus();
}

function onGpsError(error) {
  document.getElementById('gps-status').textContent = `GPS error: ${error.message}`;
}

function addGpsPoint(latlng) {
  const feature = {
    type: 'Feature',
    properties: { source: 'gps' },
    geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] }
  };
  const layer = addFeatureToMap(feature);
  if (layer?.feature) touchFeature(layer.feature);
  saveFeatures();
}

function stopLineRecording() {
  if (gps.linePoints.length < 2) {
    alert('Need at least 2 accepted points to save a line.');
    gps.linePoints = [];
    return;
  }
  const feature = {
    type: 'Feature',
    properties: { source: 'gps' },
    geometry: { type: 'LineString', coordinates: gps.linePoints }
  };
  const layer = addFeatureToMap(feature);
  if (layer?.feature) touchFeature(layer.feature);
  gps.linePoints = [];
  saveFeatures();
}

function stopPolygonRecording() {
  const uniqueVertices = new Set(gps.polygonPoints.map((coords) => coords.join(',')));
  if (uniqueVertices.size < 3) {
    alert('Invalid polygon: at least 3 unique accepted vertices are required. Recording discarded.');
    gps.polygonPoints = [];
    return;
  }

  const ring = [...gps.polygonPoints];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!last || first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

  const feature = {
    type: 'Feature',
    properties: { source: 'gps' },
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
  const layer = addFeatureToMap(feature);
  if (layer?.feature) touchFeature(layer.feature);
  gps.polygonPoints = [];
  saveFeatures();
}

document.getElementById('gps-enable').addEventListener('click', () => {
  if (gps.enabled) {
    stopGps();
    return;
  }
  if (!startGps()) return;
  document.getElementById('gps-enable').textContent = 'Disable GPS';
});

document.getElementById('gps-add-point').addEventListener('click', () => {
  if (!startGps()) return;
  document.getElementById('gps-enable').textContent = 'Disable GPS';
  if (gps.lastFix) addGpsPoint(gps.lastFix.latlng);
});

document.getElementById('gps-stream').addEventListener('click', () => {
  if (!startGps()) return;
  document.getElementById('gps-enable').textContent = 'Disable GPS';

  gps.stream = !gps.stream;
  if (gps.stream) {
    gps.lineRec = false;
    gps.polygonRec = false;
  }

  document.getElementById('gps-stream').textContent = gps.stream ? 'Stop GPS Stream' : 'Start GPS Stream';
  document.getElementById('gps-line').textContent = 'Start Line Recording';
  document.getElementById('gps-polygon').textContent = 'Start Polygon Recording';
  updateStatus();
});

document.getElementById('gps-line').addEventListener('click', () => {
  if (!startGps()) return;
  document.getElementById('gps-enable').textContent = 'Disable GPS';

  if (gps.lineRec) {
    gps.lineRec = false;
    stopLineRecording();
  } else {
    gps.stream = false;
    gps.polygonRec = false;
    gps.lineRec = true;
    gps.linePoints = [];
  }

  document.getElementById('gps-stream').textContent = 'Start GPS Stream';
  document.getElementById('gps-line').textContent = gps.lineRec ? 'Stop Line Recording' : 'Start Line Recording';
  document.getElementById('gps-polygon').textContent = 'Start Polygon Recording';
  updateStatus();
});

document.getElementById('gps-polygon').addEventListener('click', () => {
  if (!startGps()) return;
  document.getElementById('gps-enable').textContent = 'Disable GPS';

  if (gps.polygonRec) {
    gps.polygonRec = false;
    stopPolygonRecording();
  } else {
    gps.stream = false;
    gps.lineRec = false;
    gps.polygonRec = true;
    gps.polygonPoints = [];
  }

  document.getElementById('gps-stream').textContent = 'Start GPS Stream';
  document.getElementById('gps-line').textContent = 'Start Line Recording';
  document.getElementById('gps-polygon').textContent = gps.polygonRec ? 'Stop Polygon Recording' : 'Start Polygon Recording';
  updateStatus();
});

wireStyleInputs();
loadFeatures();
updateStatus();

map.getContainer().addEventListener('touchmove', (e) => {
  if (document.body.classList.contains('leaflet-draw-draw-polyline') || document.body.classList.contains('leaflet-draw-draw-polygon')) {
    e.preventDefault();
  }
}, { passive: false });
