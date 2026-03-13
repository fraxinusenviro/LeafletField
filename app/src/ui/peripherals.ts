import maplibregl from 'maplibre-gl';
import { getLatestCoordText } from './coordinateHud.js';

// ─── Wake lock ────────────────────────────────────────────────────────────────

let _wakeLockSentinel: WakeLockSentinel | null = null;
let _wakeLockRequested = false;

export async function setWakeLock(enabled: boolean, silent = false): Promise<void> {
  if (!('wakeLock' in navigator)) {
    if (!silent) alert('Screen Wake Lock is not supported on this device/browser.');
    return;
  }
  _wakeLockRequested = enabled;
  const btn = document.getElementById('wake-lock-btn');
  try {
    if (enabled) {
      _wakeLockSentinel = await navigator.wakeLock.request('screen');
      btn?.classList.add('active');
      setWakeLockIcon(true);
      _wakeLockSentinel.addEventListener('release', () => {
        _wakeLockSentinel = null;
        if (!_wakeLockRequested) { btn?.classList.remove('active'); setWakeLockIcon(false); }
      });
    } else {
      await _wakeLockSentinel?.release();
      _wakeLockSentinel = null;
      btn?.classList.remove('active');
      setWakeLockIcon(false);
    }
  } catch (err) {
    _wakeLockRequested = false;
    btn?.classList.remove('active');
    setWakeLockIcon(false);
    if (!silent) alert(`Wake lock unavailable: ${(err as Error).message}`);
  }
  refreshIcons();
}

function setWakeLockIcon(active: boolean): void {
  const btn = document.getElementById('wake-lock-btn');
  if (!btn) return;
  btn.innerHTML = active ? '<i data-lucide="sun-medium"></i>' : '<i data-lucide="moon-star"></i>';
}

export function wireWakeLock(): void {
  document.getElementById('wake-lock-btn')?.addEventListener('click', () => {
    setWakeLock(!_wakeLockSentinel);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _wakeLockRequested && !_wakeLockSentinel) {
      setWakeLock(true, true);
    }
  });
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

export function wireFullscreen(): void {
  const btn = document.getElementById('fullscreen-btn');
  btn?.addEventListener('click', () => toggleFullscreen());
  document.addEventListener('fullscreenchange', updateFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
}

async function toggleFullscreen(): Promise<void> {
  const active = Boolean(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  try {
    if (!active) {
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else if ((document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
        (document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
      } else { alert('Fullscreen not supported.'); }
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
        (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
      }
    }
  } catch (err) {
    alert(`Fullscreen error: ${(err as Error).message}`);
  }
  updateFullscreenBtn();
}

function updateFullscreenBtn(): void {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;
  const active = Boolean(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  btn.classList.toggle('active', active);
  btn.innerHTML = active ? '<i data-lucide="minimize"></i>' : '<i data-lucide="maximize"></i>';
  refreshIcons();
}

// ─── Locate ───────────────────────────────────────────────────────────────────

export function wireLocate(map: maplibregl.Map): void {
  document.getElementById('locate-header-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: Math.max(map.getZoom(), 17) }),
      (err) => alert(`Unable to get location: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });
}

// ─── Copy coordinates ─────────────────────────────────────────────────────────

export function wireCopyCoords(): void {
  const btn = document.getElementById('copy-coords');
  btn?.addEventListener('click', async () => {
    const text = getLatestCoordText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (btn) { btn.innerHTML = '<i data-lucide="check"></i>'; refreshIcons(); }
      setTimeout(() => { if (btn) { btn.innerHTML = '<i data-lucide="copy"></i>'; refreshIcons(); } }, 900);
    } catch { alert('Unable to copy coordinates.'); }
  });
}

// ─── Icon refresh ─────────────────────────────────────────────────────────────

function refreshIcons(): void {
  window.lucide?.createIcons();
}
