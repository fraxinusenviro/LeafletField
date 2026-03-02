# Leaflet Field Mapper

Leaflet Field Mapper is a static Leaflet web app for field data collection with sketch tools, GPS capture, basemap switching, import/export, and persistent local state.

## Local usage

1. Serve this folder with a static server (recommended so geolocation behaves correctly):
   - `python3 -m http.server 8080`
2. Open `http://localhost:8080`.
3. Use the top-left 🛠 Tools button to open/close the tool panels.

## Features included

- Default map centered on Nova Scotia with Esri World Imagery.
- Basemap selector (OSM, Esri Imagery, Esri Topo, Carto Positron).
- Sketching and editing with Leaflet.draw for points, lines, and polygons.
- Attribute editing (`name`, `type`, `notes`) and timestamps.
- GPS watch mode with live indicator and accuracy circle.
- GPS add-point, stream-points, line recording, polygon recording workflows.
- Layer visibility toggles and global style controls by geometry type.
- GeoJSON import (`replace` or `merge`) and GeoJSON export.
- Measurements on selected lines/polygons.
- Persistence to localStorage for view/basemap/features/styles/visibility.

## GitHub Pages deployment

1. Push this repository to GitHub.
2. In GitHub, go to **Settings → Pages**.
3. Set source to deploy from your default branch root (`/`).
4. Save and wait for Pages to publish.

Because this is a static app (HTML/CSS/JS + CDN assets), no build step is required.

## Known limitations

- GPS behavior depends on device, browser, and permission settings.
- GPS accuracy can vary significantly in dense urban areas, indoors, tree cover, and poor sky visibility.
- Geolocation typically requires HTTPS in production; HTTP is usually only allowed on localhost.
- Basic geometry validity checks are implemented, but advanced topology validation is out of scope.
