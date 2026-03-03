  const STORAGE_KEYS = {
    mapView: 'lfm_map_view',
    basemap: 'lfm_basemap',
    features: 'lfm_features',
    styles: 'lfm_styles',
    visibility: 'lfm_visibility',
    surveyMeta: 'lfm_survey_meta'
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

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function pad2(value) {
  return String(value).padStart(2, '0');
}

function buildTrackName(date = new Date()) {
  const yyyy = date.getFullYear();
  const mon = MONTH_ABBR[date.getMonth()];
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `TRACK_${yyyy}${mon}${dd}_${hh}${mm}${ss}`;
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
      source: props.source || sourceHint,
      META_Surveyor: props.META_Surveyor ?? surveyMetadata.META_Surveyor,
      META_Project: props.META_Project ?? surveyMetadata.META_Project,
      META_Site: props.META_Site ?? surveyMetadata.META_Site,
      META_Date: props.META_Date ?? surveyMetadata.META_Date
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

const surveyMetadata = parseStored(STORAGE_KEYS.surveyMeta, {
  META_Surveyor: '',
  META_Project: '',
  META_Site: '',
  META_Date: new Date().toISOString()
});

function updateSurveyMetadata(partial = {}) {
  Object.assign(surveyMetadata, partial, { META_Date: new Date().toISOString() });
  document.getElementById('meta-surveyor').value = surveyMetadata.META_Surveyor || '';
  document.getElementById('meta-project').value = surveyMetadata.META_Project || '';
  document.getElementById('meta-site').value = surveyMetadata.META_Site || '';
  document.getElementById('meta-date').value = surveyMetadata.META_Date || '';
  localStorage.setItem(STORAGE_KEYS.surveyMeta, JSON.stringify(surveyMetadata));
}

const crosshairEl = document.getElementById('map-crosshair');
const coordLatLonEl = document.getElementById('coord-latlon');
const coordUtmEl = document.getElementById('coord-utm');
const gridInfoEl = document.getElementById('grid-info');
const copyCoordsBtn = document.getElementById('copy-coords');
const COPY_ICON = '⧉';
const COPIED_ICON = '✓';
let crosshairActive = false;
let latestCoordText = '';
let utmGridActive = false;
const utmGridLayer = L.layerGroup().addTo(map);
const GRID_STEPS = [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
  
  const toolsPanel = document.getElementById('tools-panel');
  const toolsCloseButton = document.getElementById('tools-close');
  const ToolsControl = L.Control.extend({
    onAdd() {
      const button = L.DomUtil.create('button', 'tools-toggle-btn');
      button.type = 'button';
      button.textContent = '🛠';
      button.title = 'Toggle tools';
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', () => toolsPanel.classList.toggle('hidden'));
      return button;
    }
  });
new ToolsControl({ position: 'topleft' }).addTo(map);
if (toolsCloseButton) {
  toolsCloseButton.addEventListener('click', () => toolsPanel.classList.add('hidden'));
}

let pointToolButton = null;
let pointToolMenu = null;
let pointAction = 'idle';
let pendingSingleGpsPoint = false;
let tapPointHandler = null;
let trackToolButton = null;
let customLineToolButton = null;
let customLinePopover = null;
let lineAction = 'idle';
let selectedLayer = null;
let selectModeActive = false;
let selectToolButton = null;
let geometryEditHandler = null;
let geometryEditFeatureGroup = null;

const SelectFeatureControl = L.Control.extend({
  onAdd() {
    const button = L.DomUtil.create('button', 'select-tool-btn');
    button.type = 'button';
    button.textContent = 'SEL';
    button.title = 'Select feature';
    selectToolButton = button;
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      selectModeActive = !selectModeActive;
      button.classList.toggle('active', selectModeActive);
      if (!selectModeActive) {
        clearSelectedHighlight();
        selectedLayer = null;
        map.closePopup();
      }
    });
    return button;
  }
});
new SelectFeatureControl({ position: 'topleft' }).addTo(map);

const CrosshairControl = L.Control.extend({
  onAdd() {
    const button = L.DomUtil.create('button', 'crosshair-toggle-btn');
    button.type = 'button';
    button.textContent = '+';
    button.title = 'Toggle center crosshair';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      crosshairActive = !crosshairActive;
      button.classList.toggle('active', crosshairActive);
      crosshairEl.classList.toggle('hidden', !crosshairActive);
      if (crosshairActive) updateCoordinateHud(map.getCenter());
    });
    return button;
  }
});
new CrosshairControl({ position: 'topleft' }).addTo(map);

const LocateControl = L.Control.extend({
  onAdd() {
    const button = L.DomUtil.create('button', 'locate-btn');
    button.type = 'button';
    button.textContent = '◎';
    button.title = 'Center on current location';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by this browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latlng = [position.coords.latitude, position.coords.longitude];
          map.flyTo(latlng, Math.max(map.getZoom(), 17));
        },
        (error) => alert(`Unable to get location: ${error.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    });
    return button;
  }
});
new LocateControl({ position: 'topleft' }).addTo(map);

const UtmGridControl = L.Control.extend({
  onAdd() {
    const button = L.DomUtil.create('button', 'grid-toggle-btn');
    button.type = 'button';
    button.textContent = 'GRID';
    button.title = 'Toggle UTM grid';
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.on(button, 'click', () => {
      utmGridActive = !utmGridActive;
      button.classList.toggle('active', utmGridActive);
      renderUtmGrid();
    });
    return button;
  }
});
new UtmGridControl({ position: 'topleft' }).addTo(map);

function setLineButtonsActive() {
  if (trackToolButton) trackToolButton.classList.toggle('active', lineAction === 'track' && gps.trackRec);
  if (customLineToolButton) customLineToolButton.classList.toggle('active', lineAction === 'custom' && gps.customLineRec);
}

function closeCustomLinePopover() {
  if (customLinePopover) customLinePopover.classList.add('hidden');
}

function lineButtonDefaults() {
  return;
}

function stopTrackRecording(save = true) {
  if (!gps.trackRec) return;
  gps.trackRec = false;
  if (save && gps.trackPoints.length >= 2) {
    addGpsFeature({ type: 'LineString', coordinates: gps.trackPoints }, {
      name: buildTrackName(gps.trackStartTime || new Date()),
      type: 'TRACK LOG',
      notes: 'NULL'
    });
  } else if (save && gps.trackPoints.length > 0) {
    alert('Need at least 2 accepted points to save a track.');
  }
  gps.trackPoints = [];
  gps.trackStartTime = null;
  if (lineAction === 'track') lineAction = 'idle';
  setLineButtonsActive();
}

function stopCustomLineRecording(save = true) {
  if (!gps.customLineRec) return;
  gps.customLineRec = false;
  if (save && gps.customLinePoints.length >= 2) {
    addGpsFeature({ type: 'LineString', coordinates: gps.customLinePoints }, {
      name: gps.customLineAttrs?.name || '',
      type: gps.customLineAttrs?.type || '',
      notes: gps.customLineAttrs?.notes || ''
    });
  } else if (save && gps.customLinePoints.length > 0) {
    alert('Need at least 2 accepted points to save a custom GPS line.');
  }
  gps.customLinePoints = [];
  gps.customLineAttrs = null;
  if (lineAction === 'custom') lineAction = 'idle';
  setLineButtonsActive();
}

function stopAdvancedLineTools(save = false) {
  stopTrackRecording(save);
  stopCustomLineRecording(save);
}

function startTrackRecording() {
  setCaptureMode('gps');
  if (!startGps()) return;
  deactivatePointAction();
  gps.pointStream = false;
  gps.lineRec = false;
  gps.polygonRec = false;
  pendingSingleGpsPoint = false;
  stopTapPointPlacement();
  stopCustomLineRecording(true);
  lineButtonDefaults();
  gps.trackRec = true;
  gps.trackPoints = [];
  gps.trackStartTime = new Date();
  lineAction = 'track';
  setLineButtonsActive();
  updateStatus();
}

function startCustomLineRecording(attrs) {
  setCaptureMode('gps');
  if (!startGps()) return;
  deactivatePointAction();
  gps.pointStream = false;
  gps.lineRec = false;
  gps.polygonRec = false;
  pendingSingleGpsPoint = false;
  stopTapPointPlacement();
  stopTrackRecording(true);
  lineButtonDefaults();
  gps.customLineRec = true;
  gps.customLinePoints = [];
  gps.customLineAttrs = attrs;
  lineAction = 'custom';
  setLineButtonsActive();
  updateStatus();
}

function closePointMenu() {
  if (pointToolMenu) pointToolMenu.classList.add('hidden');
}

function setPointButtonActive(active) {
  if (!pointToolButton) return;
  pointToolButton.classList.toggle('active', active);
}

function stopTapPointPlacement() {
  if (!tapPointHandler) return;
  tapPointHandler.disable();
  tapPointHandler = null;
}

function deactivatePointAction() {
  pointAction = 'idle';
  pendingSingleGpsPoint = false;
  stopTapPointPlacement();
  setPointButtonActive(false);
}

function handlePointAction(action) {
  closePointMenu();

  if (action === 'gps-single') {
    stopAdvancedLineTools(true);
    stopTapPointPlacement();
    gps.pointStream = false;
    gps.lineRec = false;
    gps.polygonRec = false;
    pointAction = 'gps-single';
    pendingSingleGpsPoint = true;
    setPointButtonActive(true);
    setCaptureMode('gps');
    if (!startGps()) {
      deactivatePointAction();
      return;
    }
    const cfg = gpsConfig();
    if (gps.lastFix && gps.lastFix.accuracy <= cfg.maxAccuracy) {
      gps.lastAccepted = gps.lastFix.latlng;
      gps.lastAcceptedTs = Date.now();
      gps.acceptedCount += 1;
      addCurrentFixPoint();
      deactivatePointAction();
      updateStatus();
      return;
    }
    document.getElementById('gps-status').textContent = 'Waiting for accepted GPS fix for single point...';
    updateStatus();
    return;
  }

  if (action === 'tap-single') {
    stopAdvancedLineTools(true);
    gps.pointStream = false;
    gps.lineRec = false;
    gps.polygonRec = false;
    pendingSingleGpsPoint = false;
    pointAction = 'tap-single';
    setPointButtonActive(true);
    setCaptureMode('sketch');
    stopTapPointPlacement();
    tapPointHandler = new L.Draw.Marker(map, {});
    tapPointHandler.enable();
    updateStatus();
    return;
  }

  if (action === 'gps-stream' && pointAction === 'gps-stream' && gps.pointStream) {
    gps.pointStream = false;
    deactivatePointAction();
    updateStatus();
    return;
  }

  if (action === 'gps-stream') {
    stopAdvancedLineTools(true);
    stopTapPointPlacement();
    pointAction = 'gps-stream';
    pendingSingleGpsPoint = false;
    setPointButtonActive(true);
    setCaptureMode('gps');
    if (!startGps()) {
      deactivatePointAction();
      return;
    }
    gps.pointStream = true;
    gps.lineRec = false;
    gps.polygonRec = false;
    updateStatus();
  }
}

const PointToolControl = L.Control.extend({
  onAdd() {
    const wrap = L.DomUtil.create('div', 'point-tool-wrap');
    pointToolButton = L.DomUtil.create('button', 'point-tool-btn', wrap);
    pointToolButton.type = 'button';
    pointToolButton.textContent = 'P';
    pointToolButton.title = 'Point capture options';

    pointToolMenu = L.DomUtil.create('div', 'point-tool-menu hidden', wrap);
    pointToolMenu.innerHTML = `
      <button type="button" data-point-action="gps-single">Create single point (GPS)</button>
      <button type="button" data-point-action="tap-single">Create single point (Tap to place)</button>
      <button type="button" data-point-action="gps-stream">Stream multiple points (GPS)</button>
    `;

    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);

    L.DomEvent.on(pointToolButton, 'click', (e) => {
      L.DomEvent.stop(e);
      pointToolMenu.classList.toggle('hidden');
    });

    pointToolMenu.querySelectorAll('button').forEach((button) => {
      L.DomEvent.on(button, 'click', (e) => {
        L.DomEvent.stop(e);
        handlePointAction(button.dataset.pointAction);
      });
    });

    return wrap;
  }
});
new PointToolControl({ position: 'topleft' }).addTo(map);
map.on('click', closePointMenu);

const TrackToolControl = L.Control.extend({
  onAdd() {
    const wrap = L.DomUtil.create('div', 'point-tool-wrap');
    trackToolButton = L.DomUtil.create('button', 'line-tool-btn', wrap);
    trackToolButton.type = 'button';
    trackToolButton.textContent = 'TRK';
    trackToolButton.title = 'Track logger';

    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);
    L.DomEvent.on(trackToolButton, 'click', (e) => {
      L.DomEvent.stop(e);
      closeCustomLinePopover();
      closePointMenu();
      if (gps.trackRec && lineAction === 'track') {
        stopTrackRecording(true);
      } else {
        startTrackRecording();
      }
      updateStatus();
    });
    return wrap;
  }
});
new TrackToolControl({ position: 'topleft' }).addTo(map);

const CustomLineToolControl = L.Control.extend({
  onAdd() {
    const wrap = L.DomUtil.create('div', 'point-tool-wrap');
    customLineToolButton = L.DomUtil.create('button', 'line-tool-btn', wrap);
    customLineToolButton.type = 'button';
    customLineToolButton.textContent = 'LINE';
    customLineToolButton.title = 'Custom GPS line';

    customLinePopover = L.DomUtil.create('div', 'line-attr-popover hidden', wrap);
    customLinePopover.innerHTML = `
      <label>Name <input id="custom-line-name" type="text" /></label>
      <label>Type <input id="custom-line-type" type="text" /></label>
      <label>Notes <textarea id="custom-line-notes" rows="3"></textarea></label>
      <button type="button" id="custom-line-start">Start Custom Line</button>
      <button type="button" id="custom-line-cancel">Cancel</button>
    `;

    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.disableScrollPropagation(wrap);
    L.DomEvent.on(customLineToolButton, 'click', (e) => {
      L.DomEvent.stop(e);
      closePointMenu();
      if (gps.customLineRec && lineAction === 'custom') {
        stopCustomLineRecording(true);
        closeCustomLinePopover();
      } else {
        if (gps.trackRec && lineAction === 'track') stopTrackRecording(true);
        customLinePopover.classList.toggle('hidden');
      }
      updateStatus();
    });

    const startBtn = customLinePopover.querySelector('#custom-line-start');
    const cancelBtn = customLinePopover.querySelector('#custom-line-cancel');
    L.DomEvent.on(startBtn, 'click', (e) => {
      L.DomEvent.stop(e);
      const attrs = {
        name: (customLinePopover.querySelector('#custom-line-name').value || '').trim(),
        type: (customLinePopover.querySelector('#custom-line-type').value || '').trim(),
        notes: (customLinePopover.querySelector('#custom-line-notes').value || '').trim()
      };
      startCustomLineRecording(attrs);
      closeCustomLinePopover();
    });
    L.DomEvent.on(cancelBtn, 'click', (e) => {
      L.DomEvent.stop(e);
      closeCustomLinePopover();
    });

    return wrap;
  }
});
new CustomLineToolControl({ position: 'topleft' }).addTo(map);
map.on('click', closeCustomLinePopover);
map.on('click', () => {
  if (!selectModeActive) return;
  clearSelectedHighlight();
  selectedLayer = null;
  map.closePopup();
});

const drawnItems = new L.FeatureGroup().addTo(map);
  let styles = parseStored(STORAGE_KEYS.styles, DEFAULTS.styles);
  let visibility = parseStored(STORAGE_KEYS.visibility, DEFAULTS.visibility);
  
  const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: { rectangle: false, circle: false, circlemarker: false, marker: true, polyline: true, polygon: true },
    edit: { featureGroup: drawnItems }
  });
  map.addControl(drawControl);
  
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
      layer.setStyle({ color: styles.LineString.color, weight: Number(styles.LineString.weight), opacity: isVisible ? 1 : 0 });
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
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layerCenter(layer) {
  if (layer.getLatLng) return layer.getLatLng();
  if (layer.getBounds) return layer.getBounds().getCenter();
  return map.getCenter();
}

function clearSelectedHighlight() {
  if (!selectedLayer) return;
  applyStyle(selectedLayer);
}

function highlightSelectedLayer(layer) {
  const type = getGeometryType(layer);
  if (type === 'Point') {
    layer.setStyle({ color: '#ff9800', fillColor: '#ff9800', radius: Number(styles.Point.radius) + 2, weight: 2, opacity: 1, fillOpacity: 1 });
    return;
  }
  if (type === 'LineString') {
    layer.setStyle({ color: '#ff9800', weight: Number(styles.LineString.weight) + 2, opacity: 1 });
    return;
  }
  layer.setStyle({
    color: '#ff9800',
    weight: Number(styles.Polygon.weight) + 2,
    opacity: 1,
    fillColor: styles.Polygon.fillColor,
    fillOpacity: Number(styles.Polygon.fillOpacity)
  });
}

function featureGeometrySummary(layer) {
  const feature = layer.toGeoJSON();
  if (feature.geometry.type === 'LineString') {
    const lengthMeters = turf.length(feature, { units: 'kilometers' }) * 1000;
    return `LineString (${lengthMeters.toFixed(2)} m)`;
  }
  if (feature.geometry.type === 'Polygon') {
    const area = turf.area(feature);
    return `Polygon (${area.toFixed(2)} m2)`;
  }
  return 'Point';
}

function openSelectedFeaturePopover(layer) {
  const p = layer.feature?.properties || {};
  const created = p.created_at ? new Date(p.created_at).toLocaleString() : '';
  const html = `
    <div class="feature-popover">
      <div><strong>Name:</strong> ${escapeHtml(p.name)}</div>
      <div><strong>Type:</strong> ${escapeHtml(p.type)}</div>
      <div><strong>Notes:</strong> ${escapeHtml(p.notes)}</div>
      <div><strong>Geometry:</strong> ${escapeHtml(featureGeometrySummary(layer))}</div>
      <div><strong>Created:</strong> ${escapeHtml(created)}</div>
      <div><strong>META_Surveyor:</strong> ${escapeHtml(p.META_Surveyor)}</div>
      <div><strong>META_Project:</strong> ${escapeHtml(p.META_Project)}</div>
      <div><strong>META_Site:</strong> ${escapeHtml(p.META_Site)}</div>
      <div><strong>META_Date:</strong> ${escapeHtml(p.META_Date)}</div>
      <div class="feature-popover-actions">
        <button type="button" data-feature-action="edit-attrs">Edit Attributes</button>
        <button type="button" data-feature-action="edit-geom">Edit Geometry</button>
        <button type="button" data-feature-action="delete">Delete Feature</button>
      </div>
    </div>
  `;
  L.popup({ closeButton: true, autoClose: false, closeOnClick: false })
    .setLatLng(layerCenter(layer))
    .setContent(html)
    .openOn(map);
}

function selectFeature(layer) {
  if (!selectModeActive) return;
  clearSelectedHighlight();
  selectedLayer = layer;
  highlightSelectedLayer(layer);
  openSelectedFeaturePopover(layer);
}

function bindFeatureEvents(layer) {
  layer.on('click', (event) => {
    if (!selectModeActive) return;
    L.DomEvent.stopPropagation(event);
    selectFeature(layer);
  });
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
  if (layer instanceof L.Marker && !(layer instanceof L.CircleMarker)) layer = L.circleMarker(layer.getLatLng());
  layer.feature = ensureFeatureProperties(layer.toGeoJSON(), 'sketch');
  touchFeature(layer.feature);
  applyStyle(layer);
  bindFeatureEvents(layer);
  drawnItems.addLayer(layer);
  if (pointAction === 'tap-single') deactivatePointAction();
  saveFeatures();
});

map.on(L.Draw.Event.DRAWSTOP, () => {
  if (pointAction === 'tap-single') deactivatePointAction();
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
    clearSelectedHighlight();
    selectedLayer = null;
    map.closePopup();
    saveFeatures();
  });

map.on('popupopen', (event) => {
  const popupEl = event.popup.getElement();
  if (!popupEl) return;
  L.DomEvent.disableClickPropagation(popupEl);
  L.DomEvent.disableScrollPropagation(popupEl);
  const editAttrsBtn = popupEl.querySelector('[data-feature-action=\"edit-attrs\"]');
  const editGeomBtn = popupEl.querySelector('[data-feature-action=\"edit-geom\"]');
  const deleteBtn = popupEl.querySelector('[data-feature-action=\"delete\"]');

  if (editAttrsBtn) {
    editAttrsBtn.addEventListener('click', () => {
      if (!selectedLayer?.feature) return;
      const p = selectedLayer.feature.properties || {};
      const name = prompt('Name', p.name || '');
      if (name === null) return;
      const type = prompt('Type', p.type || '');
      if (type === null) return;
      const notes = prompt('Notes', p.notes || '');
      if (notes === null) return;
      p.name = name;
      p.type = type;
      p.notes = notes;
      touchFeature(selectedLayer.feature);
      openSelectedFeaturePopover(selectedLayer);
      saveFeatures();
    });
  }

  if (editGeomBtn) {
    editGeomBtn.addEventListener('click', () => {
      if (!selectedLayer) return;
      if (geometryEditHandler) geometryEditHandler.disable();
      geometryEditFeatureGroup = new L.FeatureGroup();
      geometryEditFeatureGroup.addLayer(selectedLayer);
      geometryEditHandler = new L.EditToolbar.Edit(map, { featureGroup: geometryEditFeatureGroup });
      geometryEditHandler.enable();
      alert('Geometry edit mode enabled for selected feature. Use map edit Save/Cancel controls when done.');
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!selectedLayer) return;
      if (!confirm('Delete selected feature?')) return;
      drawnItems.removeLayer(selectedLayer);
      selectedLayer = null;
      map.closePopup();
      saveFeatures();
    });
  }
});
  
  document.getElementById('clear-features').addEventListener('click', () => {
    if (!confirm('Clear all features?')) return;
    drawnItems.clearLayers();
    map.closePopup();
    clearSelectedHighlight();
    selectedLayer = null;
    saveFeatures();
  });
  
  function syncVisibilityAndStyle() {
    drawnItems.eachLayer(applyStyle);
    localStorage.setItem(STORAGE_KEYS.styles, JSON.stringify(styles));
    localStorage.setItem(STORAGE_KEYS.visibility, JSON.stringify(visibility));
  }
  
  function wireStyleInputs() {
    const ids = {
      pointColor: 'style-point-color', pointSize: 'style-point-size',
      lineColor: 'style-line-color', lineWidth: 'style-line-width',
      polygonColor: 'style-polygon-color', polygonWidth: 'style-polygon-width'
    };
  
    document.getElementById(ids.pointColor).value = styles.Point.color;
    document.getElementById(ids.pointSize).value = styles.Point.radius;
    document.getElementById(ids.lineColor).value = styles.LineString.color;
    document.getElementById(ids.lineWidth).value = styles.LineString.weight;
    document.getElementById(ids.polygonColor).value = styles.Polygon.color;
    document.getElementById(ids.polygonWidth).value = styles.Polygon.weight;
  
    const updateStyles = () => {
      styles = {
        Point: { color: document.getElementById(ids.pointColor).value, radius: Number(document.getElementById(ids.pointSize).value) },
        LineString: { color: document.getElementById(ids.lineColor).value, weight: Number(document.getElementById(ids.lineWidth).value) },
        Polygon: {
          color: document.getElementById(ids.polygonColor).value,
          weight: Number(document.getElementById(ids.polygonWidth).value),
          fillColor: styles.Polygon.fillColor,
          fillOpacity: styles.Polygon.fillOpacity
        }
      };
      syncVisibilityAndStyle();
    };
    Object.values(ids).forEach((id) => document.getElementById(id).addEventListener('input', updateStyles));
  
    document.getElementById('vis-point').checked = visibility.Point;
    document.getElementById('vis-line').checked = visibility.LineString;
    document.getElementById('vis-polygon').checked = visibility.Polygon;
  
    document.getElementById('vis-point').addEventListener('change', (e) => { visibility.Point = e.target.checked; syncVisibilityAndStyle(); });
    document.getElementById('vis-line').addEventListener('change', (e) => { visibility.LineString = e.target.checked; syncVisibilityAndStyle(); });
    document.getElementById('vis-polygon').addEventListener('change', (e) => { visibility.Polygon = e.target.checked; syncVisibilityAndStyle(); });
  }

function wireSurveyMetadataInputs() {
  if (!surveyMetadata.META_Date) surveyMetadata.META_Date = new Date().toISOString();
  document.getElementById('meta-surveyor').value = surveyMetadata.META_Surveyor || '';
  document.getElementById('meta-project').value = surveyMetadata.META_Project || '';
  document.getElementById('meta-site').value = surveyMetadata.META_Site || '';
  document.getElementById('meta-date').value = surveyMetadata.META_Date || '';
  localStorage.setItem(STORAGE_KEYS.surveyMeta, JSON.stringify(surveyMetadata));

  const saveMeta = () => {
    updateSurveyMetadata({
      META_Surveyor: document.getElementById('meta-surveyor').value.trim(),
      META_Project: document.getElementById('meta-project').value.trim(),
      META_Site: document.getElementById('meta-site').value.trim()
    });
  };
  document.getElementById('meta-surveyor').addEventListener('input', saveMeta);
  document.getElementById('meta-project').addEventListener('input', saveMeta);
  document.getElementById('meta-site').addEventListener('input', saveMeta);
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
    try { json = JSON.parse(await file.text()); } catch { alert('Invalid JSON file.'); e.target.value = ''; return; }
    if (!isFeatureCollection(json)) { alert('Invalid GeoJSON: expected FeatureCollection.'); e.target.value = ''; return; }
  
    if (document.getElementById('import-mode').value === 'replace') drawnItems.clearLayers();
    json.features.forEach((feature) => {
      if (feature?.type !== 'Feature' || !feature.geometry?.type) return;
      addFeatureToMap(feature);
    });
    saveFeatures();
    e.target.value = '';
  });

function latLonToUtm(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const degToRad = Math.PI / 180;

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lambda0 = (((zone - 1) * 6) - 180 + 3) * degToRad;
  const phi = lat * degToRad;
  const lambda = lon * degToRad;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * (lambda - lambda0);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi)
  );

  const easting = k0 * N * (
    A
    + (1 - T + C) * Math.pow(A, 3) / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120
  ) + 500000;

  let northing = k0 * (
    M + N * tanPhi * (
      (A * A) / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720
    )
  );

  const hemisphere = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere, easting, northing };
}

function latLonToUtmInZone(lat, lon, zone) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const degToRad = Math.PI / 180;
  const lambda0 = (((zone - 1) * 6) - 180 + 3) * degToRad;
  const phi = lat * degToRad;
  const lambda = lon * degToRad;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * (lambda - lambda0);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi)
  );

  const easting = k0 * N * (
    A
    + (1 - T + C) * Math.pow(A, 3) / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120
  ) + 500000;

  let northing = k0 * (
    M + N * tanPhi * (
      (A * A) / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720
    )
  );

  const hemisphere = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere, easting, northing };
}

function utmToLatLon(easting, northing, zone, hemisphere) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const deg = 180 / Math.PI;
  const x = easting - 500000;
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;

  const lambda0 = (((zone - 1) * 6) - 180 + 3) * (Math.PI / 180);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
    + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi1 / R1) * (
    (D * D) / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
  );

  const lon = lambda0 + (
    D
    - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
  ) / cosPhi1;

  return { lat: lat * deg, lon: lon * deg };
}

function gridStepForZoom(zoom) {
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

function nextCoarserStep(step) {
  const index = GRID_STEPS.indexOf(step);
  if (index < 0 || index === GRID_STEPS.length - 1) return step;
  return GRID_STEPS[index + 1];
}

function renderUtmGrid() {
  utmGridLayer.clearLayers();
  if (!utmGridActive) {
    if (gridInfoEl) {
      gridInfoEl.classList.add('hidden');
      gridInfoEl.textContent = 'Grid: --';
    }
    return;
  }

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const center = map.getCenter();
  const centerUtm = latLonToUtm(center.lat, center.lng);
  const zone = centerUtm.zone;
  const hemisphere = centerUtm.hemisphere;

  const sw = latLonToUtmInZone(bounds.getSouthWest().lat, bounds.getSouthWest().lng, zone);
  const nw = latLonToUtmInZone(bounds.getNorthWest().lat, bounds.getNorthWest().lng, zone);
  const se = latLonToUtmInZone(bounds.getSouthEast().lat, bounds.getSouthEast().lng, zone);
  const ne = latLonToUtmInZone(bounds.getNorthEast().lat, bounds.getNorthEast().lng, zone);

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

  if (gridInfoEl) {
    const areaHa = (step * step) / 10000;
    gridInfoEl.textContent = `Grid: ${step} m | Cell area: ${areaHa.toFixed(2)} ha`;
    gridInfoEl.classList.remove('hidden');
  }

  const startE = Math.floor(minE / step) * step;
  const endE = Math.ceil(maxE / step) * step;
  const startN = Math.floor(minN / step) * step;
  const endN = Math.ceil(maxN / step) * step;

  const lineStyle = { color: '#2d7fbf', weight: 1, opacity: 0.45 };
  const labelStyle = { className: 'utm-grid-label' };

  for (let e = startE; e <= endE; e += step) {
    const points = [];
    const segments = 8;
    for (let i = 0; i <= segments; i += 1) {
      const n = minN + ((maxN - minN) * i / segments);
      const ll = utmToLatLon(e, n, zone, hemisphere);
      points.push([ll.lat, ll.lon]);
    }
    L.polyline(points, lineStyle).addTo(utmGridLayer);
    const topPoint = utmToLatLon(e, maxN, zone, hemisphere);
    L.marker([topPoint.lat, topPoint.lon], { interactive: false, icon: L.divIcon({ ...labelStyle, html: `${Math.round(e)}` }) }).addTo(utmGridLayer);
  }

  for (let n = startN; n <= endN; n += step) {
    const points = [];
    const segments = 8;
    for (let i = 0; i <= segments; i += 1) {
      const e = minE + ((maxE - minE) * i / segments);
      const ll = utmToLatLon(e, n, zone, hemisphere);
      points.push([ll.lat, ll.lon]);
    }
    L.polyline(points, lineStyle).addTo(utmGridLayer);
    const leftPoint = utmToLatLon(minE, n, zone, hemisphere);
    L.marker([leftPoint.lat, leftPoint.lon], { interactive: false, icon: L.divIcon({ ...labelStyle, html: `${Math.round(n)}` }) }).addTo(utmGridLayer);
  }
}

function updateCoordinateHud(latlng) {
  if (!latlng) return;
  const lat = latlng.lat;
  const lon = latlng.lng;
  const utm = latLonToUtm(lat, lon);

  const latLonText = `Lat/Lon: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const utmText = `UTM: ${utm.zone}${utm.hemisphere} E ${utm.easting.toFixed(2)} N ${utm.northing.toFixed(2)}`;
  coordLatLonEl.textContent = latLonText;
  coordUtmEl.textContent = utmText;
  latestCoordText = `${latLonText} | ${utmText}`;
}
  
  const gps = {
    watchId: null,
    enabled: false,
    pointStream: false,
    lineRec: false,
    polygonRec: false,
    linePoints: [],
    polygonPoints: [],
    liveMarker: null,
    accuracyCircle: null,
    lastAccepted: null,
    lastAcceptedTs: 0,
    lastFix: null,
    acceptedCount: 0,
    captureMode: 'sketch',
    trackRec: false,
    customLineRec: false,
    trackPoints: [],
    customLinePoints: [],
    trackStartTime: null,
    customLineAttrs: null
  };
  
  function gpsConfig() {
  return {
    minDistance: Number(document.getElementById('gps-min-distance').value) || 3,
    minIntervalMs: (Number(document.getElementById('gps-min-interval').value) || 1) * 1000,
    maxAccuracy: Number(document.getElementById('gps-max-accuracy').value) || 25
  };
}

function currentModeLabel() {
  if (gps.captureMode === 'sketch') return 'Sketch';
  if (gps.trackRec) return 'GPS Track Log';
  if (gps.customLineRec) return 'GPS Custom Line';
  if (gps.polygonRec) return 'GPS Polygon';
  if (gps.lineRec) return 'GPS Line';
  if (gps.pointStream) return 'GPS Point (stream)';
  return 'GPS';
}

function updateStatus() {
  const accuracy = gps.lastFix ? `${gps.lastFix.accuracy.toFixed(1)} m` : 'n/a';
  document.getElementById('status-bar').textContent = `Mode: ${currentModeLabel()} | GPS accuracy: ${accuracy}`;
  if (gps.enabled && pendingSingleGpsPoint && pointAction === 'gps-single') {
    document.getElementById('gps-status').textContent = `GPS active | waiting for accepted fix | last accuracy ${accuracy}`;
    return;
  }
  document.getElementById('gps-status').textContent = gps.enabled
    ? `GPS active | last accuracy ${accuracy} | accepted points ${gps.acceptedCount}`
    : 'GPS inactive';
}

function startGps() {
  if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return false; }
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
  gps.pointStream = false;
  gps.lineRec = false;
  gps.polygonRec = false;
  gps.linePoints = [];
  gps.polygonPoints = [];
  stopAdvancedLineTools(false);
  if (pointAction === 'gps-stream' || pointAction === 'gps-single') deactivatePointAction();
  updateStatus();
}

function addGpsFeature(geometry, extraProperties = {}) {
  const layer = addFeatureToMap({ type: 'Feature', properties: { source: 'gps', ...extraProperties }, geometry });
  if (layer?.feature) touchFeature(layer.feature);
  saveFeatures();
}

function addCurrentFixPoint() {
  if (!gps.lastFix) return;
  addGpsFeature({ type: 'Point', coordinates: [gps.lastFix.latlng.lng, gps.lastFix.latlng.lat] });
}

function onGpsFix(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latlng = L.latLng(latitude, longitude);
  gps.lastFix = { latlng, accuracy };

  if (!gps.liveMarker) {
    gps.liveMarker = L.circleMarker(latlng, { radius: 6, color: '#2196f3', fillColor: '#2196f3', fillOpacity: 0.8 }).addTo(map);
    gps.accuracyCircle = L.circle(latlng, { radius: accuracy, color: '#2196f3', fillOpacity: 0.1 }).addTo(map);
  } else {
    gps.liveMarker.setLatLng(latlng);
    gps.accuracyCircle.setLatLng(latlng).setRadius(accuracy);
  }

  if (gps.captureMode !== 'gps') { updateStatus(); return; }

  const cfg = gpsConfig();
  if (accuracy > cfg.maxAccuracy) { updateStatus(); return; }
  const tooSoon = position.timestamp - gps.lastAcceptedTs < cfg.minIntervalMs;
  const tooClose = gps.lastAccepted ? map.distance(gps.lastAccepted, latlng) < cfg.minDistance : false;
  if (tooSoon || tooClose) { updateStatus(); return; }

  gps.lastAccepted = latlng;
  gps.lastAcceptedTs = position.timestamp;
  gps.acceptedCount += 1;

  if (pendingSingleGpsPoint && pointAction === 'gps-single') {
    addGpsFeature({ type: 'Point', coordinates: [latlng.lng, latlng.lat] });
    deactivatePointAction();
    updateStatus();
    return;
  }

  if (gps.pointStream) addGpsFeature({ type: 'Point', coordinates: [latlng.lng, latlng.lat] });
  if (gps.lineRec) gps.linePoints.push([latlng.lng, latlng.lat]);
  if (gps.trackRec) gps.trackPoints.push([latlng.lng, latlng.lat]);
  if (gps.customLineRec) gps.customLinePoints.push([latlng.lng, latlng.lat]);
  if (gps.polygonRec) gps.polygonPoints.push([latlng.lng, latlng.lat]);

  updateStatus();
}

function onGpsError(error) {
  document.getElementById('gps-status').textContent = `GPS error: ${error.message}`;
}

function setCaptureMode(mode) {
  gps.captureMode = mode;
  if (gps.captureMode !== 'gps') {
    gps.pointStream = false;
    gps.lineRec = false;
    gps.polygonRec = false;
    pendingSingleGpsPoint = false;
    stopAdvancedLineTools(false);
    if (pointAction === 'gps-stream' || pointAction === 'gps-single') deactivatePointAction();
  }
  updateStatus();
}

map.on(L.Draw.Event.DRAWSTART, () => {
  setCaptureMode('sketch');
  stopAdvancedLineTools(true);
  deactivatePointAction();
});

map.on('mousemove', (e) => {
  if (crosshairActive) return;
  updateCoordinateHud(e.latlng);
});
map.on('move zoom', () => {
  if (!crosshairActive) return;
  updateCoordinateHud(map.getCenter());
});
map.on('moveend zoomend', () => {
  if (!utmGridActive) return;
  renderUtmGrid();
});

copyCoordsBtn.addEventListener('click', async () => {
  if (!latestCoordText) return;
  try {
    await navigator.clipboard.writeText(latestCoordText);
    copyCoordsBtn.textContent = COPIED_ICON;
    setTimeout(() => { copyCoordsBtn.textContent = COPY_ICON; }, 1000);
  } catch {
    alert('Unable to copy coordinates.');
  }
});

wireStyleInputs();
wireSurveyMetadataInputs();
loadFeatures();
updateStatus();
updateCoordinateHud(map.getCenter());

map.getContainer().addEventListener('touchmove', (e) => {
  if (document.body.classList.contains('leaflet-draw-draw-polyline') || document.body.classList.contains('leaflet-draw-draw-polygon')) {
    e.preventDefault();
  }
}, { passive: false });


