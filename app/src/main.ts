import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { createIcons, icons } from 'lucide';

import { initMap, addBasemapSources, addBasemapLayer } from './map/mapInstance.js';
import { STORAGE_KEYS } from './constants.js';
import { DEFAULT_BASEMAP_ID, OFFLINE_BASEMAP_ID } from './map/basemaps.js';
import { registerOfflineProtocol } from './map/offlineLayer.js';
import { initUtmGridLayers, renderUtmGrid, toggleUtmGrid } from './map/utmGrid.js';

import { loadFeatures } from './features/featureStore.js';
import { initFeatureLayers, refreshFeatureLayer } from './features/featureLayer.js';
import { initFeaturePopup } from './features/featurePopup.js';

import { initGpsLayer, initPreviewLayers, startGps, startPointStream, stopPointStream,
  startTrackRecording, stopTrackRecording, startCustomLineRecording, stopCustomLineRecording,
  captureSingleGpsPoint, gps, updateStatus } from './gps/gpsManager.js';

import { initDrawLayers, setDrawMode, getDrawMode } from './draw/drawManager.js';

import { initOverlays } from './overlays/overlayManager.js';

import { initTileCache, wireCachePanelEvents, updateCacheEstimateSoon } from './cache/tileCache.js';

import { wireToolsPanel } from './ui/toolsPanel.js';
import { wireSurveyMetadataInputs } from './ui/surveyMeta.js';
import { wireTypePresetInputs, renderMapTypePresetOptions } from './ui/typePresets.js';
import { wireCoordinateHud, updateCoordinateHud } from './ui/coordinateHud.js';
import { wireWakeLock, wireFullscreen, wireLocate, wireCopyCoords, setWakeLock } from './ui/peripherals.js';

// ─── HTTPS warning ────────────────────────────────────────────────────────────
if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  document.getElementById('https-warning')?.classList.remove('hidden');
}

// ─── Map initialisation ───────────────────────────────────────────────────────
registerOfflineProtocol();
const map = initMap('map');

map.on('load', () => {
  // Basemaps
  addBasemapSources(map);
  const savedBasemap = localStorage.getItem(STORAGE_KEYS.basemap) ?? DEFAULT_BASEMAP_ID;
  addBasemapLayer(map, savedBasemap === OFFLINE_BASEMAP_ID ? DEFAULT_BASEMAP_ID : savedBasemap);

  // Feature layers
  initFeatureLayers(map);
  initFeaturePopup(map);
  loadFeatures();
  refreshFeatureLayer(map);

  // GPS layers
  initGpsLayer(map);
  initPreviewLayers(map);

  // Draw layers
  initDrawLayers(map);

  // UTM grid
  initUtmGridLayers(map);

  // Overlays
  initOverlays(map);

  // Cache
  initTileCache(map);
  wireCachePanelEvents();

  // Map event listeners
  map.on('moveend', () => {
    if ((window as Window & { _utmGridActive?: boolean })._utmGridActive) renderUtmGrid(map);
    updateCacheEstimateSoon();
  });
  map.on('zoomend', () => {
    if ((window as Window & { _utmGridActive?: boolean })._utmGridActive) renderUtmGrid(map);
    updateCacheEstimateSoon();
  });

  // UI wiring
  wireToolsPanel(map);
  wireSurveyMetadataInputs();
  wireTypePresetInputs();
  renderMapTypePresetOptions();
  wireCoordinateHud(map);
  wireWakeLock();
  wireFullscreen();
  wireLocate(map);
  wireCopyCoords();

  // UTM grid toggle
  const utmBtn = document.getElementById('utm-grid-btn');
  utmBtn?.addEventListener('click', () => {
    const active = toggleUtmGrid(map);
    utmBtn.classList.toggle('active', active);
    (window as Window & { _utmGridActive?: boolean })._utmGridActive = active;
  });

  // GPS toolbar controls
  wireGpsControls();
  wireDrawControls();

  // Initial HUD
  updateCoordinateHud(map.getCenter());
  updateStatus();

  // Start GPS and wake lock silently
  startGps();
  setWakeLock(true, true);

  // Icons
  createIcons({ icons });

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
});

// ─── GPS toolbar controls ─────────────────────────────────────────────────────

function wireGpsControls(): void {
  // Single GPS point
  const singleBtn = document.getElementById('gps-single-btn');
  singleBtn?.addEventListener('click', () => {
    captureSingleGpsPoint();
    updateStatus();
  });

  // GPS point stream
  const streamBtn = document.getElementById('gps-stream-btn');
  streamBtn?.addEventListener('click', () => {
    if (gps.pointStream) { stopPointStream(); streamBtn.classList.remove('active'); }
    else { if (startPointStream()) streamBtn.classList.add('active'); }
    updateStatus();
  });

  // Track recording
  const trackBtn = document.getElementById('gps-track-btn');
  trackBtn?.addEventListener('click', () => {
    if (gps.trackRec) { stopTrackRecording(true); trackBtn.classList.remove('active'); }
    else { if (startTrackRecording()) trackBtn.classList.add('active'); }
    updateStatus();
  });

  // Custom GPS line
  const customLineBtn = document.getElementById('gps-custom-line-btn');
  const customLinePopover = document.getElementById('custom-line-popover');

  customLineBtn?.addEventListener('click', () => {
    if (gps.customLineRec) {
      stopCustomLineRecording(true);
      customLineBtn.classList.remove('active');
      customLinePopover?.classList.add('hidden');
    } else {
      customLinePopover?.classList.toggle('hidden');
    }
    updateStatus();
  });

  document.getElementById('custom-line-start')?.addEventListener('click', () => {
    const type = (document.getElementById('custom-line-type') as HTMLInputElement)?.value.trim() ?? '';
    const notes = (document.getElementById('custom-line-notes') as HTMLTextAreaElement)?.value.trim() ?? '';
    if (startCustomLineRecording({ type, notes })) {
      customLineBtn?.classList.add('active');
      customLinePopover?.classList.add('hidden');
    }
    updateStatus();
  });

  document.getElementById('custom-line-cancel')?.addEventListener('click', () => {
    customLinePopover?.classList.add('hidden');
  });

  // Close popovers on map click
  map.on('click', () => customLinePopover?.classList.add('hidden'));

  // GPS follow user
  const followCheckbox = document.getElementById('gps-follow-user') as HTMLInputElement | null;
  if (followCheckbox) {
    gps.followUser = followCheckbox.checked;
    followCheckbox.addEventListener('change', () => { gps.followUser = followCheckbox.checked; });
  }
}

// ─── Draw toolbar controls ────────────────────────────────────────────────────

function wireDrawControls(): void {
  const buttons: Record<string, string> = {
    'draw-select-btn': 'select',
    'draw-point-btn': 'drawPoint',
    'draw-line-btn': 'drawLine',
    'draw-polygon-btn': 'drawPolygon'
  };

  const setActive = (activeId: string | null) => {
    Object.keys(buttons).forEach((id) => {
      document.getElementById(id)?.classList.toggle('active', id === activeId);
    });
  };

  Object.entries(buttons).forEach(([btnId, mode]) => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      const current = getDrawMode();
      if (current === mode) {
        setDrawMode('idle');
        setActive(null);
      } else {
        setDrawMode(mode as Parameters<typeof setDrawMode>[0]);
        setActive(btnId);
      }
    });
  });

  // Reset button state when draw mode changes externally (e.g. after placing a point)
  document.addEventListener('drawModeChanged', (e) => {
    const mode = (e as CustomEvent<{ mode: string }>).detail.mode;
    if (mode === 'idle') setActive(null);
  });
}
