import type { StyleConfig, VisibilityConfig } from './types.js';

export const STORAGE_KEYS = {
  mapView: 'lfm_map_view',
  basemap: 'lfm_basemap',
  features: 'lfm_features',
  styles: 'lfm_styles',
  visibility: 'lfm_visibility',
  labelVisibility: 'lfm_label_visibility',
  pointTypeColors: 'lfm_point_type_colors',
  typePresets: 'lfm_type_presets',
  surveyMeta: 'lfm_survey_meta',
  mapCaches: 'lfm_map_caches',
  selectedMapCacheId: 'lfm_selected_map_cache_id'
} as const;

export const DEFAULTS = {
  center: [45.0, -63.0] as [number, number], // [lat, lng]
  zoom: 7,
  visibility: { Point: true, LineString: true, Polygon: true } satisfies VisibilityConfig,
  labelVisibility: { Point: false, LineString: false, Polygon: false } satisfies VisibilityConfig,
  typePresets: ['', '', '', '', ''] as string[],
  styles: {
    Point: { color: '#e63946', radius: 7 },
    LineString: { color: '#1d3557', weight: 3 },
    Polygon: { color: '#457b9d', weight: 2, fillColor: '#a8dadc', fillOpacity: 0.4 }
  } satisfies StyleConfig
};

export const BLANK_TILE_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

export const GRID_STEPS = [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000] as const;

export const IMPORTED_DEFAULT_STYLE = {
  Point: { visible: true, color: '#ffffff', size: 3, stroke: '#000000', strokeWidth: 1 },
  LineString: { visible: true, color: '#000000', size: 2 },
  Polygon: { visible: true, color: '#000000', size: 2 }
} as const;
