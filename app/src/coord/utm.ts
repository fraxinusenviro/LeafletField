import type { UtmCoord } from '../types.js';

// WGS84 ellipsoid parameters
const a = 6378137.0;
const f = 1 / 298.257223563;
const k0 = 0.9996;
const e2 = f * (2 - f);
const ep2 = e2 / (1 - e2);
const DEG = Math.PI / 180;


export function latLonToUtm(lat: number, lon: number): UtmCoord {
  const zone = Math.floor((lon + 180) / 6) + 1;
  return latLonToUtmInZone(lat, lon, zone);
}

export function latLonToUtmInZone(lat: number, lon: number, zone: number): UtmCoord {
  const lambda0 = (((zone - 1) * 6) - 180 + 3) * DEG;
  const phi = lat * DEG;
  const lambda = lon * DEG;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * (lambda - lambda0);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );

  const easting = k0 * N * (
    A
    + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120
  ) + 500000;

  let northing = k0 * (
    M + N * tanPhi * (
      (A * A) / 2
      + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720
    )
  );

  const hemisphere = lat >= 0 ? 'N' : 'S';
  if (lat < 0) northing += 10000000;
  return { zone, hemisphere, easting, northing };
}

export function utmToLatLon(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S'
): { lat: number; lon: number } {
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = easting - 500000;
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;

  const lambda0 = (((zone - 1) * 6) - 180 + 3) * DEG;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const R1 = a * (1 - e2) / (1 - e2 * sinPhi1 * sinPhi1) ** 1.5;
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi1 / R1) * (
    (D * D) / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720
  );

  const lon = lambda0 + (
    D
    - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120
  ) / cosPhi1;

  return { lat: lat / DEG, lon: lon / DEG };
}
