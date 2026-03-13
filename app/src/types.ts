import type { Feature, FeatureCollection, Geometry } from 'geojson';

// ─── Feature types ────────────────────────────────────────────────────────────

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
  // Computed style properties (prefixed with _)
  _fillColor: string;
  _strokeColor: string;
  _radius: number;
  _weight: number;
  _fillOpacity: number;
  _visible: boolean;
  _labelVisible: boolean;
  _labelText: string;
}

export type AppFeature = Feature<Geometry, FeatureProperties>;
export type AppFeatureCollection = FeatureCollection<Geometry, FeatureProperties>;

// ─── Style types ──────────────────────────────────────────────────────────────

export interface PointStyle {
  color: string;
  radius: number;
}

export interface LineStyle {
  color: string;
  weight: number;
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

// ─── GPS types ────────────────────────────────────────────────────────────────

export interface GpsConfig {
  minDistance: number;   // metres
  minIntervalMs: number; // milliseconds
  maxAccuracy: number;   // metres
}

export type GpsAccuracyStatus = 'good' | 'warn' | 'bad' | 'na';

export interface GpsFix {
  lng: number;
  lat: number;
  accuracy: number;
  timestamp: number;
}

export type GpsCaptureMode = 'idle' | 'gps' | 'sketch';

export interface GpsState {
  watchId: number | null;
  enabled: boolean;
  pointStream: boolean;
  trackRec: boolean;
  customLineRec: boolean;
  trackPoints: [number, number][];
  customLinePoints: [number, number][];
  customLineAttrs: { type: string; notes: string } | null;
  lastFix: GpsFix | null;
  lastAccepted: { lng: number; lat: number } | null;
  lastAcceptedTs: number;
  acceptedCount: number;
  captureMode: GpsCaptureMode;
  followUser: boolean;
}

// ─── Draw types ───────────────────────────────────────────────────────────────

export type DrawMode =
  | 'idle'
  | 'select'
  | 'drawPoint'
  | 'drawLine'
  | 'drawPolygon';

// ─── Basemap types ────────────────────────────────────────────────────────────

export interface BasemapDefinition {
  id: string;
  label: string;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  tileSize: number;
}

// ─── Cache types ──────────────────────────────────────────────────────────────

export interface CacheMeta {
  id: string;
  displayName: string;
  cacheName: string;
  basemapName: string;
  urlTemplate: string;
  subdomain: string;
  createdAt: string;
  zoomStart: number;
  zoomEnd: number;
  depth: number;
  tileCount: number;
  bytes: number;
  avgTileBytes: number;
  bounds: [[number, number], [number, number]] | null; // [[south, west], [north, east]]
}

// ─── Overlay types ────────────────────────────────────────────────────────────

export interface OverlayGeomStyle {
  visible: boolean;
  color: string;
  size: number;
}

export interface OverlayStyle {
  Point: OverlayGeomStyle & { stroke: string; strokeWidth: number };
  LineString: OverlayGeomStyle;
  Polygon: OverlayGeomStyle;
}

export interface OverlayRecord {
  id: string;
  name: string;
  fields: string[];
  labelField: string;
  geometryTypes: { Point: boolean; LineString: boolean; Polygon: boolean };
  geojson: FeatureCollection;
  style: OverlayStyle;
}

// ─── UTM types ────────────────────────────────────────────────────────────────

export interface UtmCoord {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
}

// ─── Survey metadata ──────────────────────────────────────────────────────────

export interface SurveyMeta {
  META_SurveyorInit: string;
  META_Project: string;
  META_Site: string;
}
