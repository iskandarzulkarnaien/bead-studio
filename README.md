# Bead Studio

A React + TypeScript static app for converting artwork to MARD bead patterns. Images are processed locally in browser workers and are not uploaded. There are no accounts, backend processing, or analytics.

## Use

Choose an image, configure Artistic settings or Batch presets, generate and compare styles, then prepare and download labeled or unlabeled PNGs. Finals default to 40 pixels per bead with a 32px option; labeled exports use white grids. The palette contains 221 MARD colors.

Sources above 16 megapixels are rejected. Batches above 1,000 styles require confirmation, and an estimated 64 MiB retained-results budget bounds their size. Exports are limited to 20 megapixels. Keep the tab open and download results before closing it.

## Development

Use Node 24 and npm. Run `npm ci`, then `npm start`; open http://127.0.0.1:4174. Run `npm run build` to produce the static website in `site-dist/`.

Validation: `npm run typecheck`, `npm test`, and `npm run test:web`. Native-reference tests require Python with Pillow and NumPy. Browser tests require `npx playwright install chromium` (or BROWSER_EXE pointing to an installed Chromium browser). GitHub Actions installs these dependencies automatically and tests a repository subpath before deployment.

## Deployment

GitHub Pages publishes the built assets after checks pass on main. Pull requests run the checks without deploying. All asset paths are relative; HTTPS hosting requires no routing rewrites. End users need no Node or Python installation. The bundled font license is included in the deployment.

## Reference sources

Legacy Electron and Python source is retained for numerical regression comparison and is excluded from the browser runtime. This public snapshot omits private reference artwork, screenshots, generated output, and local Git history. Scripts ending in reference or used for Tarot benchmarking require those local-only artifacts. The self-contained CI suite uses synthetic fixtures included here.

Actual-device mobile validation remains ongoing. There is no PWA installation or background completion after closing the tab.
