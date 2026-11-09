/*
 * Lampa PRO — Watch Statistics
 * Version: 1.0.0
 * Target: Lampa 7.7.9+, Android TV / Android WebView
 *
 * Stores viewing statistics locally in Lampa.Storage.
 * Does not store stream URLs, torrent hashes, or personal identifiers.
 */
(function () {
    'use strict';

    var FLAG = 'lampa_pro_watch_statistics_loaded';
    var STORE = 'lampa_pro_watch_statistics_data';
    var ENABLED = 'lampa_pro_watch_statistics_enabled';
    var COMPONENT = 'lpro_watch_statistics_screen';
    var SETTINGS = 'lpro_watch_statistics_settings';
    var MAX_ITEMS = 500;
    var SAVE_EVERY = 60;
    var active = null;
    var saveCounter = 0;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function log(message, error) {
        if (window.console && console.log) {
            console.log('[Lampa PRO Watch Statistics] ' + message, error || '');
        }
    }

    function storageGet() {
        var value = Lampa.Storage.get(STORE, {});
        if (!value || typeof value !== 'object') value = {};
        if (!Array.isArray(value.items)) value.items = [];
        return value;
    }

    function storageSet(data) {
        try {
            Lampa.Storage.set(STORE, data);
        } catch (e) {
            log('Storage write failed', e);
        }
    }

    function enabled() {
        return Lampa.Storage.get(ENABLED, true) !== false;
    }

    function number(value) {
        var n = Number(value);
        return isFinite(n) && n > 0 ? n : 0;
    }

    function clean(value, max) {
        return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().substring(0, max || 180);
    }

    function getTitle(movie, fallback) {
        movie = movie || {};
        return clean(movie.title || movie.name || movie.original_title || movie.original_name || fallback || 'Без названия', 180);
    }

    function getType(movie) {
        movie = movie || {};
        return movie.media_type === 'tv' || movie.name || movie.first_air_date ? 'Сериал' : 'Фильм';
    }

    function getYear(movie) {
        movie = movie || {};
        var date = String(movie.release_date || movie.first_air_date || '');
        var match = date.match(/(19|20)\d{2}/);
        return match ? match[0] : '';
    }

    function getGenres(movie) {
        var genres = movie && movie.genres;
        var result = [];
        if (Array.isArray(genres)) {
            genres.forEach(function (genre) {
                var name = typeof genre === 'string' ? genre : (genre && genre.name);
                name = clean(name, 50);
                if (name && result.indexOf(name) === -1) result.push(name);
            });
        }
        return result.slice(0, 8);
    }

    function getCardId(movie, title) {
        movie = movie || {};
        var id = movie.id || movie.imdb_id || movie.kinopoisk_id || '';
        return clean((movie.source || '') + ':' + id + ':' + title.toLowerCase(), 220);
    }

    function begin(data) {
        if (!enabled()) return;
        var movie = data && data.movie ? data.movie : {};
        var title = getTitle(movie, data && data.title);
        var id = getCardId(movie, title);

        active = {
            id: id,
            title: title,
            type: getType(movie),
            year: getYear(movie),
            genres: getGenres(movie),
            startedAt: Date.now(),
            lastPosition: 0,
            duration: 0,
            watched: 0,
            lastSaved: 0,
            ended: false,
            movieId: clean(movie.id || '', 50)
        };
        saveCounter = 0;
    }

    function persist(finalize) {
        if (!active || !enabled()) return;
        var data = storageGet();
        var item = null;
        var i;

        for (i = 0; i < data.items.length; i++) {
            if (data.items[i].id === active.id && !data.items[i].completed) {
                item = data.items[i];
                break;
            }
        }

        if (!item) {
            item = {
                id: active.id,
                title: active.title,
                type: active.type,
                year: active.year,
                genres: active.genres,
                watched: 0,
                sessions: 0,
                completed: false,
                firstWatched: active.startedAt,
                lastWatched: active.startedAt
            };
            data.items.unshift(item);
        }

        if (!active.lastSaved) {
            item.sessions = number(item.sessions) + 1;
            active.lastSaved = 1;
        }

        item.watched = number(item.watched) + Math.max(0, active.watched - (active.persistedWatched || 0));
        active.persistedWatched = active.watched;
        item.lastWatched = Date.now();

        if (active.year && !item.year) item.year = active.year;
        if (active.genres && active.genres.length && (!item.genres || !item.genres.length)) item.genres = active.genres;

        if (finalize || (active.duration > 0 && active.watched / active.duration >= 0.90)) {
            item.completed = true;
            item.completedAt = Date.now();
        }

        data.items = data.items.slice(0, MAX_ITEMS);
        storageSet(data);
    }

    function onTimeUpdate(event) {
        if (!active || !enabled() || !event) return;
        var current = number(event.current);
        var duration = number(event.duration);
        if (duration) active.duration = duration;

        if (active.lastPosition > 0 && current >= active.lastPosition) {
            var delta = current - active.lastPosition;
            // Ignore seeks, jumps and long background gaps; count actual playback only.
            if (delta > 0 && delta <= 15) active.watched += delta;
        }
        active.lastPosition = current;
        saveCounter += 1;

        if (saveCounter >= SAVE_EVERY) {
            saveCounter = 0;
            persist(false);
        }
    }

    function onEnded() {
        if (!active) return;
        active.ended = true;
        persist(true);
        active = null;
    }

    function onDestroy() {
        if (active) persist(false);
        active = null;
    }

    function formatTime(seconds) {
        seconds = Math.floor(number(seconds));
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        if (hours) return hours + ' ч ' + minutes + ' мин';
        return minutes + ' мин';
    }

    function formatDate(timestamp) {
        if (!timestamp) return '—';
        var date = new Date(timestamp);
        var d = ('0' + date.getDate()).slice(-2);
        var m = ('0' + (date.getMonth() + 1)).slice(-2);
        return d + '.' + m + '.' + date.getFullYear();
    }

    function aggregate(data) {
        var result = {
            totalTime: 0,
            totalSessions: 0,
            completed: 0,
            movies: 0,
            series: 0,
            genres: {},
            months: {},
            recent: data.items.slice(0, 8),
            top: []
        };
        data.items.forEach(function (item) {
            var watched = number(item.watched);
            result.totalTime += watched;
            result.totalSessions += number(item.sessions);
            if (item.completed) result.completed += 1;
            if (item.type === 'Сериал') result.series += 1;
            else result.movies += 1;

            (item.genres || []).forEach(function (genre) {
                result.genres[genre] = (result.genres[genre] || 0) + watched;
            });

            var date = new Date(item.lastWatched || item.firstWatched || Date.now());
            var month = date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2);
            result.months[month] = (result.months[month] || 0) + watched;
        });

        result.top = data.items.slice().sort(function (a, b) {
            return number(b.watched) - number(a.watched);
        }).slice(0, 5);

        return result;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }

    function statCard(label, value) {
        return '<div class="lpro-ws-card"><div class="lpro-ws-label">' + escapeHtml(label) +
            '</div><div class="lpro-ws-value">' + escapeHtml(value) + '</div></div>';
    }

    function StatisticsScreen() {
        var root = $('<div class="lpro-ws-screen"></div>');

        this.create = function () {
            render();
            return root;
        };

        this.start = function () {
            render();
            var first = root.find('.selector').first();
            if (first.length) first.addClass('focus');
        };

        this.stop = function () {};

        this.destroy = function () {
            root.remove();
        };

        this.render = function () {
            return root;
        };

        function render() {
            var data = storageGet();
            var stats = aggregate(data);
            var genreList = Object.keys(stats.genres).sort(function (a, b) {
                return stats.genres[b] - stats.genres[a];
            }).slice(0, 6);
            var monthList = Object.keys(stats.months).sort().slice(-6);
            var html = '<div class="lpro-ws-wrap">' +
                '<div class="lpro-ws-heading">Статистика просмотров</div>' +
                '<div class="lpro-ws-subtitle">Данные сохраняются только на этом устройстве</div>' +
                '<div class="lpro-ws-grid">' +
                statCard('Время просмотра', formatTime(stats.totalTime)) +
                statCard('Сеансов', stats.totalSessions) +
                statCard('Фильмов', stats.movies) +
                statCard('Сериалов', stats.series) +
                statCard('Завершено', stats.completed) +
                statCard('Записей', data.items.length) +
                '</div>';

            if (stats.top.length) {
                html += '<div class="lpro-ws-section-title">Чаще всего смотрели</div><div class="lpro-ws-list">';
                stats.top.forEach(function (item) {
                    html += '<div class="lpro-ws-row"><div class="lpro-ws-name">' + escapeHtml(item.title) +
                        '</div><div class="lpro-ws-meta">' + escapeHtml(item.type) + ' · ' +
                        escapeHtml(formatTime(item.watched)) + '</div></div>';
                });
                html += '</div>';
            }

            if (genreList.length) {
                html += '<div class="lpro-ws-section-title">Жанры по времени просмотра</div><div class="lpro-ws-tags">';
                genreList.forEach(function (genre) {
                    html += '<div class="lpro-ws-tag">' + escapeHtml(genre) + ' · ' +
                        escapeHtml(formatTime(stats.genres[genre])) + '</div>';
                });
                html += '</div>';
            }

            if (monthList.length) {
                html += '<div class="lpro-ws-section-title">По месяцам</div><div class="lpro-ws-list">';
                monthList.forEach(function (month) {
                    html += '<div class="lpro-ws-row"><div class="lpro-ws-name">' + escapeHtml(month) +
                        '</div><div class="lpro-ws-meta">' + escapeHtml(formatTime(stats.months[month])) + '</div></div>';
                });
                html += '</div>';
            }

            if (stats.recent.length) {
                html += '<div class="lpro-ws-section-title">Недавно смотрели</div><div class="lpro-ws-list">';
                stats.recent.forEach(function (item) {
                    html += '<div class="lpro-ws-row"><div class="lpro-ws-name">' + escapeHtml(item.title) +
                        '</div><div class="lpro-ws-meta">' + escapeHtml(item.type) + ' · ' +
                        escapeHtml(formatDate(item.lastWatched)) + '</div></div>';
                });
                html += '</div>';
            } else {
                html += '<div class="lpro-ws-empty">Пока нет данных. Запусти фильм или серию — статистика появится автоматически.</div>';
            }

            html += '<div class="lpro-ws-foot">Учитывается реальное время воспроизведения. Перемотка не добавляет время просмотра.</div></div>';
            root.html(html);
        }
    }

    function addStyles() {
        if ($('#lpro-ws-style').length) return;
        $('head').append('<style id="lpro-ws-style">' +
            '.lpro-ws-screen{width:100%;height:100%;overflow-y:auto;box-sizing:border-box}' +
            '.lpro-ws-wrap{padding:2.2em 3em 3em;max-width:1100px;margin:0 auto}' +
            '.lpro-ws-heading{font-size:2.1em;font-weight:700;margin-bottom:.25em}' +
            '.lpro-ws-subtitle{font-size:1em;opacity:.65;margin-bottom:1.5em}' +
            '.lpro-ws-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8em;margin-bottom:1.8em}' +
            '.lpro-ws-card{background:rgba(255,255,255,.08);border-radius:.55em;padding:1.1em;min-height:5em}' +
            '.lpro-ws-label{font-size:.9em;opacity:.68;margin-bottom:.55em}' +
            '.lpro-ws-value{font-size:1.55em;font-weight:700}' +
            '.lpro-ws-section-title{font-size:1.25em;font-weight:700;margin:1.5em 0 .7em}' +
            '.lpro-ws-list{display:flex;flex-direction:column;gap:.45em}' +
            '.lpro-ws-row{display:flex;justify-content:space-between;align-items:center;gap:1em;padding:.8em 1em;background:rgba(255,255,255,.055);border-radius:.4em}' +
            '.lpro-ws-name{font-size:1em;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.lpro-ws-meta{font-size:.9em;opacity:.7;white-space:nowrap}' +
            '.lpro-ws-tags{display:flex;flex-wrap:wrap;gap:.5em}' +
            '.lpro-ws-tag{background:rgba(255,255,255,.08);padding:.65em .9em;border-radius:.4em}' +
            '.lpro-ws-empty{padding:2em;background:rgba(255,255,255,.06);border-radius:.5em;opacity:.8}' +
            '.lpro-ws-foot{font-size:.85em;opacity:.55;margin-top:2em}' +
            '@media(max-width:800px){.lpro-ws-wrap{padding:1.2em}.lpro-ws-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lpro-ws-row{align-items:flex-start;flex-direction:column}}' +
            '</style>');
    }

    function openScreen() {
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, StatisticsScreen);
        Lampa.Activity.push({
            url: '',
            title: 'Lampa PRO — Статистика',
            component: COMPONENT,
            page: 1
        });
    }

    function addMenuItem() {
        var menu = $('.menu .menu__list').eq(0);
        if (!menu.length || menu.find('.lpro-ws-menu').length) return;

        var button = $('<li class="menu__item selector lpro-ws-menu">' +
            '<div class="menu__ico"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="5" y="5" width="34" height="34" rx="7" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M13 29V23M21 29V15M29 29V19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
            '</svg></div><div class="menu__text">Статистика просмотров</div></li>');
        button.on('hover:enter', openScreen);
        menu.append(button);
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent) return;
        Lampa.SettingsApi.addComponent({
            component: SETTINGS,
            name: 'Lampa PRO — Статистика',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 19V12M10 19V5M16 19V9M22 19V2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            after: 'plugins'
        });
        Lampa.SettingsApi.addParam({
            component: SETTINGS,
            param: { name: ENABLED, type: 'trigger', default: true },
            field: {
                name: 'Собирать статистику',
                description: 'Сохранять время просмотра и историю на этом устройстве'
            }
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Player || !Lampa.PlayerVideo) {
            log('Required Lampa player APIs are unavailable. Plugin was not started.');
            return;
        }

        addStyles();
        registerSettings();

        Lampa.Player.listener.follow('start', begin);
        Lampa.PlayerVideo.listener.follow('timeupdate', onTimeUpdate);
        Lampa.PlayerVideo.listener.follow('ended', onEnded);
        Lampa.Player.listener.follow('destroy', onDestroy);

        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, StatisticsScreen);
        addMenuItem();
        Lampa.Listener.follow('activity', function (event) {
            if (event && event.type === 'start') addMenuItem();
        });

        log('Loaded. Statistics are stored locally.');
    }

    if (window.appready) init();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });
    } else {
        log('Lampa API is not available.');
    }
})();