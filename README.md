# Clarity

A lightweight VALORANT tracker built with Tauri, React, TypeScript, and Vite.

## Run

```sh
npm install
npm run tauri dev
```

Create a production build with `npm run tauri build`.

## Project layout

- `src/pages` contains route-level screens.
- `src/components/core` contains app state, navigation, shared types, and catalog helpers.
- `src/components/ui` contains reusable controls and surfaces.
- `src/components/home`, `src/components/currentmatch`, and `src/components/matches` contain feature UI.
- `tauri/src/valorant` contains account, match, profile, and stats code.
