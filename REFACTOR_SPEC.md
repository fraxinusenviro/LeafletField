# Field Mapper — Refactor Specification

**Target stack:** TypeScript · Vite · MapLibre GL JS
**Source:** Current single-file PWA (`app.js`, `index.html`, `styles.css`)

---

## 1. Overview

Field Mapper is an offline-capable PWA for GPS-assisted field surveys. Users collect
spatial features (points, lines, polygons) either by sketching on a map or by
logging GPS fixes, then export the result as GeoJSON. Tile caching via the Cache
API enables fully offline operation.

The refactor preserves all existing functionality while replacing:

| Current | Target |
|---|---|
| Leaflet 1.9.4 | MapLibre GL JS |
| Leaflet-Draw | Custom draw handlers using MapLibre event API |
| Plain ES modules via CDN | Vite + npm packages |
| Single `app.js` (2 500 lines) | Typed module tree |
| No type safety | TypeScript strict mode |

---

## 2. Feature Inventory

### 2.1 Map

| Feature | Detail |
|---|---|
| Multiple basemaps | OpenStreetMap, Esri World Imagery, Esri World Topo, Carto Positron |
| Offline basemap | Custom layer reading tiles from Cache API |
| Basemap switcher | UI control to change active tile source |
| Persist map state | Center, zoom, active basemap saved to localStorage |
| UTM grid overlay | Adaptive grid lines + easting/northing labels, toggleable |
| Crosshair mode | Track map center coordinates in header HUD |

### 2.2 GPS

| Feature | Detail |
|---|---|
| Single fix | Capture one point after accuracy threshold met |
| Point stream | Continuous capture at configurable distance / time interval |
| Track recording | Continuous LineString logged from GPS fixes |
| Custom GPS line | LineString with user-supplied type and notes |
| Live marker + accuracy ring | Updates on each fix |
| Follow user | Auto-pan map to latest fix |
| Accuracy HUD badge | Color-coded (good / warn / bad / NA) |
| Config | minDistance (m), minInterval (s), maxAccuracy (m) |

### 2.3 Sketch / Draw

| Feature | Detail |
|---|---|
| Draw point | Click to place a circle marker |
| Draw line | Click series of vertices, double-click to close |
| Draw polygon | Click series of vertices, double-click to close |
| Edit geometry | Select + drag vertices of existing feature |
| Delete feature | Remove feature from map and storage |

### 2.4 Feature Data Model

Every feature is a GeoJSON `Feature`. Required `properties`:

```
id            string   UUID
name          string   Auto-generated or user-edited
type          string   Preset or free-text
notes         string
created_at    string   ISO 8601
updated_at    string   ISO 8601
source        string   "gps" | "stream" | "track" | "sketch" | "import"
META_SurveyorInit  string
META_Project       string
META_Site          string
```

All features are stored as a single GeoJSON `FeatureCollection` in localStorage.

### 2.5 Styling

| Geometry | Properties |
|---|---|
| Point | fillColor, radius, stroke, strokeColor, opacity, fillOpacity |
| LineString | color, weight, opacity |
| Polygon | color (stroke), weight, fillColor, fillOpacity |

- Point fill color is further overridden per `type` value (random HSL, persisted).
- Each geometry type has an independent **visibility** toggle.
- Each geometry type has an independent **label visibility** toggle.
- Labels show `name`, `type`, `notes` in a permanent tooltip / symbol layer.

### 2.6 Type Presets

5 user-defined preset strings stored in localStorage. Displayed as quick-pick
buttons when capturing GPS points or drawing features.

### 2.7 Survey Metadata

Three free-text fields persisted to localStorage:

- `META_SurveyorInit`
- `META_Project`
- `META_Site`

Stamped onto every feature at creation time.

### 2.8 Import / Export

| Action | Format |
|---|---|
| Export | Download all features as a single GeoJSON `FeatureCollection` |
| Import | Load a GeoJSON file; rendered as a read-only styled overlay |

Imported overlays support per-geometry-type: color, weight/size, label field
(selected from feature property keys), visibility toggle, and removal.

### 2.9 Offline Map Caching

- User selects a zoom depth (0–8 additional levels beyond current view).
- App estimates tile count and storage bytes before confirming.
- Tiles fetched from the active basemap and stored in Cache API under a named
  cache entry.
- Cache metadata (id, name, zoom range, tile count, bytes, geographic bounds)
  persisted to localStorage.
- UI lists existing caches with options to activate, zoom-to-extent, or delete.
- The offline basemap layer (`SelectedOfflineBasemapLayer`) reads tiles from the
  selected cache; renders blank tiles for uncached zoom levels.

### 2.10 PWA / Service Worker

- Precache core app-shell assets on install.
- Version-keyed cache (`fm-v5` in the refactor) with cleanup of prior versions.
- Network-first for navigation; cache-first for same-origin assets; pass-through
  for cross-origin.

### 2.11 Peripheral Controls

| Control | API used |
|---|---|
| Wake lock | Screen Wake Lock API |
| Fullscreen | Fullscreen API |
| Copy coordinates | Clipboard API |
| Locate (one-shot) | Geolocation API |

---

## 3. Proposed Module Structure

```
src/
├── main.ts                  # App entry point, init orchestration
├── types.ts                 # Shared TypeScript interfaces & enums
│
├── map/
│   ├── mapInstance.ts       # MapLibre map init, basemap sources/layers
│   ├── basemaps.ts          # Basemap definitions (URLs, attribution)
│   ├── offlineLayer.ts      # Cache-API tile source (offline basemap)
│   ├── utmGrid.ts           # UTM grid overlay (source + layer management)
│   └── controls.ts          # Custom MapLibre IControl implementations
│
├── gps/
│   ├── gpsManager.ts        # Geolocation watch, fix acceptance logic
│   ├── gpsCapture.ts        # Single fix, point stream, track, custom line
│   └── gpsHud.ts            # Live marker layer, accuracy badge, follow-user
│
├── draw/
│   ├── drawManager.ts       # Mode state machine (idle/draw/edit/select)
│   ├── drawPoint.ts         # Point draw handler
│   ├── drawLine.ts          # Line draw handler
│   ├── drawPolygon.ts       # Polygon draw handler
│   └── editHandler.ts       # Vertex drag editing for existing features
│
├── features/
│   ├── featureStore.ts      # In-memory FeatureCollection + localStorage R/W
│   ├── featureLayer.ts      # MapLibre sources+layers for drawn features
│   ├── featureProperties.ts # ensureProperties, buildName, touchFeature
│   └── featurePopup.ts      # Popup/panel for selecting and editing features
│
├── style/
│   ├── styleStore.ts        # Load/save style config from localStorage
│   ├── styleApplicator.ts   # Map style expressions from config
│   └── typeColors.ts        # Per-type HSL color assignment & persistence
│
├── overlays/
│   ├── overlayStore.ts      # Imported overlay records
│   ├── overlayLayer.ts      # MapLibre source+layer for each overlay
│   └── overlayPanel.ts      # Import UI, per-overlay style controls
│
├── cache/
│   ├── tileCache.ts         # Tile fetch loop, Cache API writes
│   ├── cacheStore.ts        # Cache metadata R/W (localStorage)
│   ├── tileUtils.ts         # lngToTileX, latToTileY, tileRangeForBounds, etc.
│   └── cachePanel.ts        # Cache list UI, build/delete/select actions
│
├── ui/
│   ├── toolsPanel.ts        # Tools side-panel wiring
│   ├── coordinateHud.ts     # Header lat/lon + UTM display
│   ├── surveyMeta.ts        # Surveyor/project/site inputs
│   ├── typePresets.ts       # Preset input wiring
│   ├── wakeLock.ts          # Wake lock toggle
│   ├── fullscreen.ts        # Fullscreen toggle
│   └── clipboard.ts         # Copy-coordinates button
│
├── coord/
│   ├── utm.ts               # latLonToUtm, utmToLatLon (WGS84)
│   └── formatters.ts        # formatBytes, pad2, buildIdentifier
│
└── sw/
    └── service-worker.ts    # Vite PWA service worker (vite-plugin-pwa)
```

---

## 4. Key Type Definitions (`types.ts`)

```typescript
// --- Feature types ---

export type GeometryType = 'Point' | 'LineString' | 'Polygon';
export type FeatureSource = 'gps' | 'stream' | 'track' | 'sketch' | 'import';

export interface FeatureProperties {
  id: string;
  name: string;
  type: string;
  notes: string;
  created_at: string;
  updated_at: string;
  source: FeatureSource;
  META_SurveyorInit: string;
  META_Project: string;
  META_Site: string;
}

export type AppFeature = GeoJSON.Feature<GeoJSON.Geometry, FeatureProperties>;
export type AppFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, FeatureProperties>;

// --- Style types ---

export interface PointStyle {
  fillColor: string;
  radius: number;
  stroke: boolean;
  strokeColor: string;
  opacity: number;
  fillOpacity: number;
}

export interface LineStyle {
  color: string;
  weight: number;
  opacity: number;
}

export interface PolygonStyle {
  color: string;
  weight: number;
  fillColor: string;
  fillOpacity: number;
}

export interface StyleConfig {
  Point: PointStyle;
  LineString: LineStyle;
  Polygon: PolygonStyle;
}

export interface VisibilityConfig {
  Point: boolean;
  LineString: boolean;
  Polygon: boolean;
}

// --- GPS types ---

export interface GpsConfig {
  minDistance: number;   // metres
  minInterval: number;   // seconds
  maxAccuracy: number;   // metres
  followUser: boolean;
}

export type GpsAccuracyStatus = 'good' | 'warn' | 'bad' | 'na';

export interface GpsFix {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

// --- GPS capture modes ---

export type GpsCaptureMode =
  | 'idle'
  | 'single'
  | 'stream'
  | 'track'
  | 'customLine';

// --- Draw modes ---

export type DrawMode =
  | 'idle'
  | 'select'
  | 'drawPoint'
  | 'drawLine'
  | 'drawPolygon'
  | 'edit';

// --- Offline cache types ---

export interface CacheMeta {
  id: string;
  name: string;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bytes: number;
  bounds: [number, number, number, number]; // [west, south, east, north]
  basemapId: string;
  createdAt: string;
}

// --- Basemap types ---

export interface BasemapDefinition {
  id: string;
  label: string;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
}

// --- Imported overlay types ---

export interface OverlayRecord {
  id: string;
  filename: string;
  geojson: GeoJSON.FeatureCollection;
  style: StyleConfig;
  labelField: string | null;
  visibility: VisibilityConfig;
}

// --- Survey metadata ---

export interface SurveyMeta {
  surveyorInit: string;
  project: string;
  site: string;
}

// --- UTM types ---

export interface UtmCoord {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
}
```

---

## 5. State Management

No external state library. Each module owns its slice of state and exposes a
typed getter/setter API. Cross-module communication via a lightweight event bus
or direct function calls.

**Persistence:** All durable state is mirrored to localStorage via the relevant
store module (featureStore, styleStore, cacheStore, etc.). Keys retain the
existing `lfm_*` prefix for backwards compatibility with existing user data.

**In-memory only:** GPS state, draw mode, current map view, active popups.

---

## 6. MapLibre Migration Notes

### 6.1 Basemaps

Leaflet tile layers → MapLibre `raster` sources + `raster` layers.

```typescript
map.addSource('osm', {
  type: 'raster',
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: '© OpenStreetMap contributors'
});
map.addLayer({ id: 'osm-layer', type: 'raster', source: 'osm' });
```

### 6.2 Feature Rendering

Leaflet `L.FeatureGroup` → MapLibre `geojson` source with separate layers for
each geometry type.

```typescript
// One GeoJSON source, three typed layers
map.addSource('features', { type: 'geojson', data: featureCollection });
map.addLayer({ id: 'features-points', type: 'circle', source: 'features', filter: ['==', '$type', 'Point'] });
map.addLayer({ id: 'features-lines',  type: 'line',   source: 'features', filter: ['==', '$type', 'LineString'] });
map.addLayer({ id: 'features-fills',  type: 'fill',   source: 'features', filter: ['==', '$type', 'Polygon'] });
map.addLayer({ id: 'features-stroke', type: 'line',   source: 'features', filter: ['==', '$type', 'Polygon'] });
```

Styling via MapLibre expressions, e.g. per-type point color:

```typescript
'circle-color': ['get', 'computedFillColor']  // pre-resolved into feature property
```

Labels via a separate `symbol` layer using `text-field` expressions.

### 6.3 Drawing

MapLibre has no built-in draw plugin equivalent to Leaflet-Draw. Options:

1. **`@mapbox/maplibre-gl-draw` fork** (`maplibre-gl-draw`) — drop-in equivalent,
   recommended for full feature parity. Provides draw modes, snapping, direct
   select editing.

2. **Custom handlers** — Manual canvas/mouse event handling. More control, more
   work.

**Recommendation:** Use `maplibre-gl-draw` (npm package). It handles draw, edit,
delete with a GeoJSON-based feature store compatible with our data model.

### 6.4 Offline Basemap Layer

`SelectedOfflineBasemapLayer` (extends `L.GridLayer`) →
MapLibre custom `raster` source with a `tiles` array pointing to a local
request handler (e.g. a `fetch` interceptor or a protocol handler):

```typescript
// Register a custom protocol
map.addProtocol('cache', async (params) => {
  const url = params.url.replace('cache://', '');
  const cached = await caches.match(url);
  if (cached) return { data: await cached.arrayBuffer() };
  return { data: new Uint8Array(0) }; // blank tile
});

map.addSource('offline', {
  type: 'raster',
  tiles: ['cache://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256
});
```

### 6.5 UTM Grid

Same algorithm as current implementation. Rendered as two MapLibre `geojson`
sources (h-lines and v-lines) + `line` layers + `symbol` layers for labels.
Recomputed on `moveend`/`zoomend`.

### 6.6 GPS Live Marker

`L.CircleMarker` + `L.Circle` → MapLibre `geojson` source with a `circle`
layer (accuracy ring via radius expression in metres using `circle-radius` +
`circle-pitch-alignment: 'map'`).

---

## 7. Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,webmanifest}'],
        runtimeCaching: [] // app handles tile caching itself
      },
      manifest: {
        name: 'Field Mapper',
        short_name: 'FieldMapper',
        description: 'Offline-friendly field mapping app.',
        theme_color: '#1f2d3a',
        background_color: '#f2f5fb',
        display: 'standalone',
        icons: [/* ... */]
      }
    })
  ]
});
```

---

## 8. npm Dependencies

| Package | Purpose |
|---|---|
| `maplibre-gl` | Map rendering |
| `maplibre-gl-draw` | Draw / edit tools |
| `@turf/distance` | GPS distance calculations |
| `@turf/area` | Polygon area display |
| `vite` | Build tool |
| `vite-plugin-pwa` | Service worker + manifest |
| `typescript` | Type checking |
| `lucide` (or `lucide-static`) | Icons |

---

## 9. Backwards Compatibility

- **localStorage keys:** Retain `lfm_*` prefix. Migrate schema if needed with
  a versioned migration function run at startup.
- **GeoJSON export format:** No changes — same `FeatureCollection` with same
  property names.
- **Service worker cache name:** Bump version suffix (`fm-v5`) to force clean
  install after refactor deployment.

---

## 10. Out of Scope

The following are explicitly **not** changed in this refactor:

- Visual design (colours, layout, typography) — CSS is ported as-is
- Feature data model property names
- localStorage key names (except version bumps)
- PWA manifest metadata
- Coordinate precision or UTM algorithm
- Tile URL templates for basemaps

---

## 11. Implementation Order (Suggested)

1. Scaffold Vite + TypeScript project, install dependencies
2. Port `types.ts` and `coord/utm.ts` (pure functions, easy to test)
3. Initialise MapLibre map, port basemap definitions
4. Port `featureStore` + `styleStore` (localStorage R/W)
5. Render features via MapLibre geojson source/layers
6. Port draw tools via `maplibre-gl-draw`
7. Port GPS manager and capture modes
8. Port UTM grid overlay
9. Port offline cache layer + cache management UI
10. Port imported overlays
11. Port all UI panels (tools panel, HUD, controls)
12. Wire service worker via `vite-plugin-pwa`
13. End-to-end testing against existing feature set
