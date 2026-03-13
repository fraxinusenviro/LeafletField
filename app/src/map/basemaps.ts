import type { BasemapDefinition } from '../types.js';

export const OFFLINE_BASEMAP_ID = 'offline-cache';

export const BASEMAPS: BasemapDefinition[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap Standard',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    tileSize: 256
  },
  {
    id: 'esri-imagery',
    label: 'Esri World Imagery',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    tileSize: 256
  },
  {
    id: 'esri-topo',
    label: 'Esri World Topo',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    tileSize: 256
  },
  {
    id: 'carto',
    label: 'Carto Positron',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    tileSize: 256
  }
];

export const DEFAULT_BASEMAP_ID = 'esri-imagery';

/** Build a concrete tile URL from an XYZ template, expanding {s} with the given subdomain. */
export function buildTileUrl(template: string, z: number, x: number, y: number, subdomain = 'a'): string {
  return template
    .replace('{s}', subdomain)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '');
}

/** Convert a template from xyz to MapLibre's {z}/{x}/{y} notation (they use the same format). */
export function toMaplibreTileUrl(template: string, subdomains = ['a', 'b', 'c']): string[] {
  // If subdomain placeholder present, expand into one URL per subdomain
  if (template.includes('{s}')) {
    return subdomains.map((s) => template.replace('{s}', s).replace('{r}', ''));
  }
  return [template.replace('{r}', '')];
}
