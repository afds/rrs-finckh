# RRS Situations Review

Static review app for Racing Rules of Sailing situations. It loads the existing JSON data and MP4 animations, renders question/answer Markdown in three languages, and lets you filter by difficulty and category to verify content.

## Running locally
- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Data & media
- Source data is under `public/data/` (`situations_*.json`, `categories.json`, `media-manifest.json`).
- Animations live under `public/media/` as `<id>_question.mp4` and `<id>_answer.mp4`.
- Generate/update the media manifest with `npm run gen:media` (CI runs this too) to flag missing files.

## GitHub Pages
- `vite.config.ts` sets `base` to `/rrs-finckh/` for GitHub Pages.
- The included workflow `.github/workflows/deploy.yml` builds on pushes to `main` (and on manual dispatch), then deploys `dist/` to GitHub Pages using the official Pages action.
- The app uses `HashRouter`, so no custom 404 handling is needed on Pages.

## Local static preview notes
- `npm run preview` will serve with the configured base path; open `/rrs-finckh/` on the preview server.
- If you want to `npx serve dist` directly, build with a root base: `npm run build:local` (sets `BASE_PATH=/`), then run `npx serve dist` and open the root URL. The default build assumes it will be served from `/rrs-finckh/`.
