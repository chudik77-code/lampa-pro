/*
 * Lampa PRO — Series Tracker
 * Version: 1.0.0
 * Target: Lampa 7.7.9+, Android TV / Android WebView
 *
 * Local series list and episode progress. Metadata and release dates come from TMDB.
 * Uses the TMDB key saved by Movie Assistant; no background/push notifications.
 */
(function () {
    'use strict';

    var FLAG = 'lampa_pro_series_tracker_loaded';
    var STORE = 'lpro_series_tracker_data';
    var KEY = 'lpro_movie_assistant_tmdb_key';
    var COMPONENT = 'lpro_series_tracker_screen';
    var API = 'https://api.themoviedb.org/3';
    var IMAGE = 'https://image.tmdb.org/t/p/w342';
    var requestToken = 0;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function log(message, error) {
        if (window.console && console.log) console.log('[Lampa PRO Series Tracker] ' + message, error || '');
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }

    function key() {
        return String(Lampa.Storage.get(KEY, '') || '').replace(/^\s+|\s+$/g, '');
    }

    function read() {
        var data = Lampa.Storage.get(STORE, {items:[]});
        if (!data || Object.prototype.toString.call(data.items) !== '[object Array]') data = {items:[]};
        return data;
    }

    function write(data) {
        Lampa.Storage.set(STORE, data);
    }

    function api(path, params, success, failure) {
        var apiKey = key();
        if (!apiKey) {
            failure('Сначала добавьте ключ TMDB в настройках Movie Assistant.');
            return;
        }
        params = params || {};
        params.api_key = apiKey;
        params.language = 'ru-RU';
        var query = [];
        Object.keys(params).forEach(function (name) {
            query.push(encodeURIComponent(name) + '=' + encodeURIComponent(params[name]));
        });
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API + path + '?' + query.join('&'), true);
        xhr.timeout = 18000;
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try { success(JSON.parse(xhr.responseText)); }
                catch (e) { failure('Не удалось обработать ответ TMDB.'); }
            } else {
                var message = 'Ошибка TMDB (' + xhr.status + ').';
                try {
                    var body = JSON.parse(xhr.responseText);
                    if (body.status_message) message = body.status_message;
                } catch (ignore) {}
                failure(message);
            }
        };
        xhr.ontimeout = function () { failure('Превышено время ожидания TMDB.'); };
        xhr.onerror = function () { failure('Нет соединения с TMDB.'); };
        xhr.send();
    }

    function dateText(value) {
        if (!value) return 'Дата не объявлена';
        var parts = String(value).split('-');
        if (parts.length !== 3) return value;
        return parts[2] + '.' + parts[1] + '.' + parts[0];
    }

    function findSeries(data, id) {
        for (var i = 0; i < data.items.length; i++) {
            if (String(data.items[i].id) === String(id)) return data.items[i];
        }
        return null;
    }

    function getSeasonProgress(series, seasonNumber) {
        var watched = series.watched || {};
        var count = 0;
        Object.keys(watched).forEach(function (episodeKey) {
            if (episodeKey.indexOf(seasonNumber + ':') === 0 && watched[episodeKey]) count++;
        });
        return count;
    }

    function SeriesScreen() {
        var root = $('<div class="lpro-st-screen"></div>');
        var selectedId = null;
        var selectedSeason = 1;
        var seasonCache = {};
        var busy = false;

        this.create = function () {
            render();
            return root;
        };

        this.start = function () {
            render();
            var first = root.find('.selector').first();
            if (first.length) first.addClass('focus');
        };

        this.stop = function () {
            requestToken++;
        };

        this.destroy = function () {
            requestToken++;
            root.remove();
        };

        this.render = function () { return root; };

        function render() {
            var data = read();
            var html = '<div class="lpro-st-wrap">' +
                '<div class="lpro-st-heading">Series Tracker</div>' +
                '<div class="lpro-st-subtitle">Список сериалов, прогресс серий и даты выхода из TMDB</div>' +
                '<div class="lpro-st-search"><input class="lpro-st-input" type="text" placeholder="Название сериала" />' +
                '<button class="selector lpro-st-search-btn">Найти сериал</button></div>' +
                '<div class="lpro-st-status" aria-live="polite"></div>' +
                '<div class="lpro-st-search-results"></div>' +
                '<div class="lpro-st-section">Мои сериалы (' + data.items.length + ')</div>';

            if (!data.items.length) {
                html += '<div class="lpro-st-empty">Список пуст. Найдите сериал и добавьте его в трекер.</div>';
            } else {
                data.items.forEach(function (series) {
                    var next = series.nextEpisode;
                    var total = 0;
                    Object.keys(series.watched || {}).forEach(function (k) { if (series.watched[k]) total++; });
                    html += '<div class="lpro-st-card" data-series="' + esc(series.id) + '">' +
                        (series.poster ? '<img class="lpro-st-poster" src="' + esc(IMAGE + series.poster) + '" />' : '<div class="lpro-st-poster lpro-st-no-poster">Нет постера</div>') +
                        '<div class="lpro-st-info"><div class="lpro-st-title">' + esc(series.name) +
                        (series.year ? ' (' + esc(series.year) + ')' : '') + '</div>' +
                        '<div class="lpro-st-meta">' + esc(series.status || 'Статус неизвестен') + ' · Просмотрено серий: ' + total + '</div>' +
                        '<div class="lpro-st-meta">Следующая серия: ' + (next ? esc(next.name || ('S' + next.season_number + 'E' + next.episode_number)) + ' — ' + esc(dateText(next.air_date)) : 'Дата не объявлена') + '</div>' +
                        '<div class="lpro-st-actions"><button class="selector lpro-st-open" data-id="' + esc(series.id) + '">Сезоны и серии</button>' +
                        '<button class="selector lpro-st-refresh" data-id="' + esc(series.id) + '">Обновить</button>' +
                        '<button class="selector lpro-st-remove" data-id="' + esc(series.id) + '">Удалить</button></div></div></div>';
                });
            }
            html += '<div class="lpro-st-foot">Прогресс хранится локально на устройстве. Проверка новых серий выполняется при открытии трекера или вручную, не в фоновом режиме.</div></div>';
            root.html(html);
            bindBase();
        }

        function bindBase() {
            root.find('.lpro-st-search-btn').off('hover:enter click').on('hover:enter click', function () {
                search(root.find('.lpro-st-input').val());
            });
            root.find('.lpro-st-input').off('keydown').on('keydown', function (event) {
                if (event.keyCode === 13) {
                    event.preventDefault();
                    root.find('.lpro-st-search-btn').trigger('hover:enter');
                }
            });
            root.find('.lpro-st-open').off('hover:enter click').on('hover:enter click', function () {
                openSeries($(this).attr('data-id'));
            });
            root.find('.lpro-st-refresh').off('hover:enter click').on('hover:enter click', function () {
                refreshSeries($(this).attr('data-id'));
            });
            root.find('.lpro-st-remove').off('hover:enter click').on('hover:enter click', function () {
                removeSeries($(this).attr('data-id'));
            });
        }

        function search(query) {
            query = String(query || '').replace(/^\s+|\s+$/g, '');
            if (!query) {
                root.find('.lpro-st-status').text('Введите название сериала.');
                return;
            }
            root.find('.lpro-st-status').text('Поиск в TMDB…');
            api('/search/tv', {query:query, page:1, include_adult:'false'}, function (data) {
                var list = data.results || [];
                var html = '';
                list.slice(0, 10).forEach(function (item) {
                    var year = item.first_air_date ? item.first_air_date.substring(0, 4) : '';
                    html += '<div class="lpro-st-result">' +
                        (item.poster_path ? '<img class="lpro-st-small-poster" src="' + esc(IMAGE + item.poster_path) + '" />' : '') +
                        '<div class="lpro-st-result-info"><div class="lpro-st-title">' + esc(item.name) + (year ? ' (' + year + ')' : '') + '</div>' +
                        '<div class="lpro-st-meta">' + esc(item.overview || 'Описание отсутствует') + '</div>' +
                        '<button class="selector lpro-st-add" data-id="' + esc(item.id) + '">Добавить в мои сериалы</button></div></div>';
                });
                root.find('.lpro-st-search-results').html(html || '<div class="lpro-st-empty">Ничего не найдено.</div>');
                root.find('.lpro-st-status').text('Найдено: ' + list.length);
                root.find('.lpro-st-add').off('hover:enter click').on('hover:enter click', function () {
                    addSeries($(this).attr('data-id'));
                });
            }, function (message) {
                root.find('.lpro-st-status').text(message);
            });
        }

        function addSeries(id) {
            api('/tv/' + encodeURIComponent(id), {}, function (item) {
                var data = read();
                if (findSeries(data, item.id)) {
                    root.find('.lpro-st-status').text('Этот сериал уже есть в списке.');
                    return;
                }
                data.items.unshift({
                    id:item.id,
                    name:item.name,
                    poster:item.poster_path || '',
                    year:item.first_air_date ? item.first_air_date.substring(0,4) : '',
                    status:item.status || '',
                    overview:item.overview || '',
                    seasons:item.seasons || [],
                    nextEpisode:item.next_episode_to_air || null,
                    lastEpisode:item.last_episode_to_air || null,
                    watched:{},
                    addedAt:Date.now()
                });
                write(data);
                root.find('.lpro-st-status').text('Сериал добавлен.');
                render();
            }, function (message) {
                root.find('.lpro-st-status').text(message);
            });
        }

        function removeSeries(id) {
            var data = read();
            data.items = data.items.filter(function (item) { return String(item.id) !== String(id); });
            write(data);
            if (String(selectedId) === String(id)) selectedId = null;
            render();
        }

        function refreshSeries(id) {
            root.find('.lpro-st-status').text('Обновление данных…');
            api('/tv/' + encodeURIComponent(id), {}, function (item) {
                var data = read();
                var saved = findSeries(data, id);
                if (!saved) return;
                saved.name = item.name || saved.name;
                saved.poster = item.poster_path || saved.poster;
                saved.status = item.status || saved.status;
                saved.seasons = item.seasons || saved.seasons;
                saved.nextEpisode = item.next_episode_to_air || null;
                saved.lastEpisode = item.last_episode_to_air || null;
                write(data);
                root.find('.lpro-st-status').text('Данные обновлены.');
                render();
            }, function (message) {
                root.find('.lpro-st-status').text(message);
            });
        }

        function openSeries(id) {
            var data = read();
            var series = findSeries(data, id);
            if (!series) return;
            selectedId = String(id);
            selectedSeason = 1;
            seasonCache = {};
            var seasons = (series.seasons || []).filter(function (s) { return Number(s.season_number) > 0; });
            if (seasons.length) selectedSeason = Number(seasons[0].season_number);
            renderSeason();
        }

        function renderSeason() {
            var data = read();
            var series = findSeries(data, selectedId);
            if (!series) return;
            var seasons = (series.seasons || []).filter(function (s) { return Number(s.season_number) > 0; });
            var html = '<div class="lpro-st-detail"><button class="selector lpro-st-back">← К списку сериалов</button>' +
                '<div class="lpro-st-section">' + esc(series.name) + '</div><div class="lpro-st-season-select">';
            seasons.forEach(function (s) {
                html += '<button class="selector lpro-st-season ' + (Number(s.season_number) === selectedSeason ? 'is-active' : '') +
                    '" data-season="' + esc(s.season_number) + '">Сезон ' + esc(s.season_number) + '</button>';
            });
            html += '</div><div class="lpro-st-episodes">Загрузка серий…</div></div>';
            root.find('.lpro-st-search-results').html('');
            root.find('.lpro-st-section').last().after(html);
            root.find('.lpro-st-back').on('hover:enter click', function () {
                root.find('.lpro-st-detail').remove();
                render();
            });
            root.find('.lpro-st-season').on('hover:enter click', function () {
                selectedSeason = Number($(this).attr('data-season'));
                renderSeason();
            });
            loadSeason(series, selectedSeason);
        }

        function loadSeason(series, seasonNumber) {
            var cacheKey = series.id + ':' + seasonNumber;
            if (seasonCache[cacheKey]) {
                renderEpisodes(series, seasonCache[cacheKey]);
                return;
            }
            var token = ++requestToken;
            api('/tv/' + encodeURIComponent(series.id) + '/season/' + encodeURIComponent(seasonNumber), {}, function (data) {
                if (token !== requestToken || String(selectedId) !== String(series.id)) return;
                seasonCache[cacheKey] = data;
                renderEpisodes(series, data);
            }, function (message) {
                if (token !== requestToken) return;
                root.find('.lpro-st-episodes').text(message);
            });
        }

        function renderEpisodes(series, season) {
            var data = read();
            var saved = findSeries(data, series.id);
            if (!saved) return;
            var episodes = season.episodes || [];
            var watchedCount = getSeasonProgress(saved, season.season_number);
            var html = '<div class="lpro-st-season-summary">Просмотрено: ' + watchedCount + ' из ' + episodes.length + '</div>';
            if (!episodes.length) html += '<div class="lpro-st-empty">Серии пока не опубликованы в TMDB.</div>';
            episodes.forEach(function (episode) {
                var episodeKey = season.season_number + ':' + episode.episode_number;
                var isWatched = !!(saved.watched && saved.watched[episodeKey]);
                html += '<div class="lpro-st-episode ' + (isWatched ? 'watched' : '') + '">' +
                    '<div class="lpro-st-episode-info"><div class="lpro-st-episode-title">S' +
                    ('0' + season.season_number).slice(-2) + 'E' + ('0' + episode.episode_number).slice(-2) +
                    ' — ' + esc(episode.name || 'Без названия') + '</div><div class="lpro-st-meta">' +
                    esc(dateText(episode.air_date)) + (episode.runtime ? ' · ' + esc(episode.runtime) + ' мин' : '') +
                    '</div><div class="lpro-st-meta">' + esc(episode.overview || '') + '</div></div>' +
                    '<button class="selector lpro-st-toggle" data-episode="' + esc(episodeKey) + '" data-season="' +
                    esc(season.season_number) + '" data-number="' + esc(episode.episode_number) + '">' +
                    (isWatched ? 'Просмотрено ✓' : 'Отметить просмотренной') + '</button></div>';
            });
            root.find('.lpro-st-episodes').html(html);
            root.find('.lpro-st-toggle').on('hover:enter click', function () {
                var episodeKey = $(this).attr('data-episode');
                var current = read();
                var item = findSeries(current, series.id);
                if (!item) return;
                if (!item.watched) item.watched = {};
                item.watched[episodeKey] = !item.watched[episodeKey];
                write(current);
                renderEpisodes(item, season);
            });
        }
    }

    function addStyles() {
        if ($('#lpro-st-style').length) return;
        $('head').append('<style id="lpro-st-style">' +
            '.lpro-st-screen{width:100%;height:100%;overflow-y:auto;box-sizing:border-box}' +
            '.lpro-st-wrap{padding:2em 3em 3em;max-width:1200px;margin:0 auto}' +
            '.lpro-st-heading{font-size:2em;font-weight:700;margin-bottom:.25em}' +
            '.lpro-st-subtitle,.lpro-st-foot{opacity:.65;margin-bottom:1.2em}' +
            '.lpro-st-search{display:flex;gap:.7em;align-items:center;margin:1em 0}' +
            '.lpro-st-input{flex:1;min-width:15em;padding:.85em 1em;border:2px solid rgba(255,255,255,.25);border-radius:.4em;background:rgba(255,255,255,.08);color:inherit;font-size:1.05em}' +
            '.lpro-st-search button,.lpro-st-actions button,.lpro-st-add,.lpro-st-toggle,.lpro-st-back,.lpro-st-season{padding:.7em .9em;border:0;border-radius:.4em;background:rgba(255,255,255,.13);color:inherit;font-size:.9em;margin:.2em}' +
            '.lpro-st-search button.focus,.lpro-st-actions button.focus,.lpro-st-add.focus,.lpro-st-toggle.focus,.lpro-st-back.focus,.lpro-st-season.focus{outline:3px solid #fff;outline-offset:2px}' +
            '.lpro-st-status{min-height:1.4em;opacity:.8;margin:.6em 0}' +
            '.lpro-st-section{font-size:1.35em;font-weight:700;margin:1.4em 0 .7em}' +
            '.lpro-st-card,.lpro-st-result,.lpro-st-episode{display:flex;gap:1em;padding:1em;margin:.65em 0;background:rgba(255,255,255,.06);border-radius:.5em;align-items:flex-start}' +
            '.lpro-st-poster{width:5.8em;min-width:5.8em;min-height:8em;object-fit:cover;border-radius:.3em;background:rgba(255,255,255,.08)}' +
            '.lpro-st-no-poster{display:flex;align-items:center;justify-content:center;text-align:center;font-size:.8em;opacity:.6}' +
            '.lpro-st-info,.lpro-st-result-info,.lpro-st-episode-info{min-width:0;flex:1}' +
            '.lpro-st-title{font-size:1.12em;font-weight:700;margin-bottom:.35em}' +
            '.lpro-st-meta{font-size:.9em;opacity:.72;margin:.3em 0;line-height:1.35}' +
            '.lpro-st-actions{display:flex;flex-wrap:wrap;margin-top:.6em}' +
            '.lpro-st-small-poster{width:4em;min-width:4em;max-height:6em;object-fit:cover;border-radius:.25em}' +
            '.lpro-st-empty{padding:1.2em;background:rgba(255,255,255,.06);border-radius:.5em;opacity:.8}' +
            '.lpro-st-detail{margin-top:1.5em;padding-top:1em;border-top:1px solid rgba(255,255,255,.18)}' +
            '.lpro-st-season-select{display:flex;flex-wrap:wrap;gap:.3em;margin:.7em 0}' +
            '.lpro-st-season.is-active{background:rgba(255,255,255,.3)}' +
            '.lpro-st-season-summary{opacity:.75;margin:.8em 0}' +
            '.lpro-st-episode{align-items:center;justify-content:space-between}' +
            '.lpro-st-episode.watched{background:rgba(70,150,90,.16)}' +
            '.lpro-st-episode-title{font-weight:700}' +
            '.lpro-st-foot{font-size:.85em;margin-top:1.8em}' +
            '@media(max-width:800px){.lpro-st-wrap{padding:1.2em}.lpro-st-search{flex-direction:column;align-items:stretch}.lpro-st-input{box-sizing:border-box;width:100%;min-width:0}.lpro-st-card,.lpro-st-result{gap:.7em}.lpro-st-poster{width:4.5em;min-width:4.5em}.lpro-st-episode{align-items:flex-start;flex-direction:column}}' +
            '</style>');
    }

    function addMenuItem() {
        var menu = $('.menu .menu__list').eq(0);
        if (!menu.length || menu.find('.lpro-st-menu').length) return;
        var button = $('<li class="menu__item selector lpro-st-menu"><div class="menu__ico"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="5" width="30" height="34" rx="3" stroke="currentColor" stroke-width="2"/><path d="M14 14h16M14 21h16M14 28h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><div class="menu__text">Series Tracker</div></li>');
        button.on('hover:enter click', openScreen);
        menu.append(button);
    }

    function openScreen() {
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, SeriesScreen);
        Lampa.Activity.push({url:'', title:'Lampa PRO — Series Tracker', component:COMPONENT, page:1});
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Storage || !Lampa.Activity || !Lampa.Component) {
            log('Required Lampa APIs are unavailable; plugin stopped.');
            return;
        }
        addStyles();
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, SeriesScreen);
        addMenuItem();
        Lampa.Listener.follow('activity', function (event) {
            if (event && event.type === 'start') addMenuItem();
        });
        log('Loaded. Uses the TMDB key configured in Movie Assistant.');
    }

    if (window.appready) init();
    else if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });
    } else {
        log('Lampa API is not available.');
    }
})();