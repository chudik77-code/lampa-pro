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

### Series Tracker
Tracks TV series, episode progress, season lists and release dates from TMDB.
- File: [series-tracker.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/series-tracker.js)
- Uses the same personal TMDB v3 API key configured in Movie Assistant.
- Series metadata is refreshed when the tracker opens or manually; availability and dates depend on TMDB data.
- Watched episode marks are stored locally in Lampa Storage.
- No push notifications or background checks while Lampa is closed.


### Smart Watchlist
Manages a local combined watchlist for movies and TV series with four statuses: Want to Watch, Watching, Watched and Dropped.
- File: [smart-watchlist.js](https://raw.githubusercontent.com/chudik77-code/lampa-pro/main/smart-watchlist.js)
- Search and metadata use the personal TMDB v3 API key configured in Movie Assistant.
- List and statuses are stored locally in Lampa Storage; they are not automatically synchronized between devices.

## Installation

1. Open Lampa → Settings → Plugins.
2. Add the required raw plugin URL.
3. Restart Lampa if the plugin does not appear immediately.

## Target environment

Developed with Android TV / Android WebView compatibility in mind. Actual compatibility should be verified on the target Lampa build and device.
