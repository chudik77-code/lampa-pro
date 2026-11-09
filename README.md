# Lampa PRO

Custom plugins for Lampa TV.

## Plugins

### Smart Rating
Displays Kinopoisk and IMDb ratings on movie detail pages.
- File: [smart-rating.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/smart-rating.js)
- Requires a personal Kinopoisk API key, stored in Lampa settings.

### Watch Statistics
Tracks viewing time, sessions, completed titles, movies and series, genres, monthly totals and recent viewing.
- File: [watch-statistics.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/watch-statistics.js)
- Statistics are stored locally in Lampa Storage.
- Does not store stream URLs or torrent hashes.

### Cinema UI
Adds optional TV-friendly focus highlighting and subtle card styling.
- File: [cinema-ui.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/cinema-ui.js)
- Settings: focus highlighting and card styling can be toggled independently.

### Movie Assistant
Searches TMDB keyword metadata from a plot description and finds similar films from a title or selected result.
- File: [movie-assistant.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/movie-assistant.js)
- Requires the user's own TMDB v3 API key, stored locally in Lampa.
- Plot search depends on TMDB keyword metadata; it is not semantic AI search.

## Installation

1. Open Lampa → Settings → Plugins.
2. Add the required raw plugin URL.
3. Restart Lampa if the plugin does not appear immediately.

## Target environment

Developed with Android TV / Android WebView compatibility in mind. Actual compatibility should be verified on the target Lampa build and device.
