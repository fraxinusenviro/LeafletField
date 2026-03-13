import maplibregl from 'maplibre-gl';
import { latLonToUtm } from '../coord/utm.js';

let _latestCoordText = '';

export function getLatestCoordText(): string { return _latestCoordText; }

export function updateCoordinateHud(lngLat: maplibregl.LngLat | { lng: number; lat: number }): void {
  const { lat, lng } = lngLat;
  const utm = latLonToUtm(lat, lng);
  const latLonText = `Lat/Lon: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const utmText = `UTM: ${utm.zone}${utm.hemisphere} E ${utm.easting.toFixed(2)} N ${utm.northing.toFixed(2)}`;

  const llEl = document.getElementById('coord-latlon');
  const utmEl = document.getElementById('coord-utm');
  if (llEl) llEl.textContent = latLonText;
  if (utmEl) utmEl.textContent = utmText;
  _latestCoordText = `${latLonText} | ${utmText}`;
}

export function wireCoordinateHud(map: maplibregl.Map): void {
  let crosshairActive = false;
  const crosshairEl = document.getElementById('map-crosshair');
  const crosshairBtn = document.getElementById('crosshair-header-btn');

  crosshairBtn?.addEventListener('click', () => {
    crosshairActive = !crosshairActive;
    crosshairBtn.classList.toggle('active', crosshairActive);
    crosshairEl?.classList.toggle('hidden', !crosshairActive);
    if (crosshairActive) updateCoordinateHud(map.getCenter());
  });

  map.on('mousemove', (e) => {
    if (!crosshairActive) updateCoordinateHud(e.lngLat);
  });

  map.on('move', () => {
    if (crosshairActive) updateCoordinateHud(map.getCenter());
  });
}
