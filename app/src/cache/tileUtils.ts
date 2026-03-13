export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * (2 ** zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * (2 ** zoom));
}

export interface TileRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function tileRangeForBounds(
  west: number, south: number, east: number, north: number,
  zoom: number
): TileRange {
  const maxIndex = (2 ** zoom) - 1;
  const clamp = (v: number) => Math.max(0, Math.min(maxIndex, v));
  let xMin = clamp(lngToTileX(west, zoom));
  let xMax = clamp(lngToTileX(east, zoom));
  let yMin = clamp(latToTileY(north, zoom));
  let yMax = clamp(latToTileY(south, zoom));
  if (xMax < xMin) { const t = xMin; xMin = xMax; xMax = t; }
  if (yMax < yMin) { const t = yMin; yMin = yMax; yMax = t; }
  return { xMin, xMax, yMin, yMax };
}

export function tileCountForExtent(
  west: number, south: number, east: number, north: number,
  minZoom: number, maxZoom: number
): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRangeForBounds(west, south, east, north, z);
    total += (r.xMax - r.xMin + 1) * (r.yMax - r.yMin + 1);
  }
  return total;
}
