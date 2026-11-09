/*
 * Lampa PRO — Smart Rating
 * Version: 1.0.0
 *
 * Displays KinoPoisk and IMDb ratings on Lampa title detail pages.
 * Requires a personal API key from https://kinopoiskapiunofficial.tech/
 * The key is stored only in this Lampa installation's local settings.
 * No key is embedded in this file and no third-party key is shared.
 */
(function () {
    'use strict';

    var PLUGIN_FLAG = 'lampa_pro_smart_rating_loaded';
    var SETTINGS_ID = 'lampa_pro_smart_rating';
    var KEY_NAME = 'lampa_pro_smart_rating_api_key';
    var CACHE_NAME = 'lampa_pro_smart_rating_cache';
    var CACHE_TTL = 24 * 60 * 60 * 1000;
    var API_BASE = 'https://kinopoiskapiunofficial.tech/api';

    if (window[PLUGIN_FLAG]) return;
    window[PLUGIN_FLAG] = true;

    function log(message, error) {
        if (window.console && console.log) {
            console.log('[Lampa PRO Smart Rating] ' + message, error || '');
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[ch];
        });
    }

    function normalizeTitle(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\u2010-\u2015-]/g, ' ')
            .replace(/[^a-z0-9а-я]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getYear(card) {
        var value = card.release_date || card.first_air_date || card.last_air_date || card.year || '';
        var match = String(value).match(/(19|20)\d{2}/);
        return match ? parseInt(match[0], 10) : 0;
    }

    function getCandidateYear(item) {
        var value = item.year || item.start_date || item.release_date || '';
        var match = String(value).match(/(19|20)\d{2}/);
        return match ? parseInt(match[0], 10) : 0;
    }

    function candidateTitles(item) {
        return [
            item.nameRu, item.nameEn, item.nameOriginal,
            item.title, item.en_title, item.orig_title, item.ru_title
        ].filter(function (value) { return typeof value === 'string' && value.trim(); });
    }

    function scoreCandidate(item, titles, year) {
        var names = candidateTitles(item).map(normalizeTitle);
        var score = 0;
        titles.forEach(function (title) {
            var wanted = normalizeTitle(title);
            if (!wanted) return;
            names.forEach(function (name) {
                if (name === wanted) score = Math.max(score, 100);
                else if (name.indexOf(wanted) !== -1 || wanted.indexOf(name) !== -1) score = Math.max(score, 65);
            });
        });
        var itemYear = getCandidateYear(item);
        if (year && itemYear) {
            if (year === itemYear) score += 25;
            else if (Math.abs(year - itemYear) === 1) score += 8;
            else score -= 20;
        }
        return score;
    }

    function toItems(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.items)) return data.items;
        if (data && Array.isArray(data.films)) return data.films;
        if (data && typeof data === 'object' && (data.kinopoiskId || data.filmId || data.kinopoisk_id)) return [data];
        return [];
    }

    function getFilmId(item) {
        return item.kinopoiskId || item.kinopoisk_id || item.filmId || item.kp_id || item.id || 0;
    }

    function formatRating(value) {
        var number = Number(value);
        return value === null || value === undefined || value === '' || !isFinite(number) || number <= 0
            ? '—'
            : number.toFixed(1);
    }

    function addStyles() {
        if ($('#lpro-smart-rating-style').length) return;
        $('head').append(
            '<style id="lpro-smart-rating-style">' +
            '.lpro-rating{display:flex;flex-wrap:wrap;align-items:center;gap:.55em;margin:.65em 0 0;font-size:1em}' +
            '.lpro-rating__item{display:inline-flex;align-items:center;gap:.35em;padding:.35em .6em;border-radius:.35em;background:rgba(255,255,255,.08);color:inherit}' +
            '.lpro-rating__label{opacity:.72;font-size:.82em}' +
            '.lpro-rating__value{font-weight:600}' +
            '.lpro-rating__status{opacity:.7;font-size:.82em}' +
            '</style>'
        );
    }

    function ratingMarkup(status) {
        return '<div class="lpro-rating" aria-live="polite">' +
            '<div class="lpro-rating__item"><span class="lpro-rating__label">Кинопоиск</span><span class="lpro-rating__value" data-rating="kp">—</span></div>' +
            '<div class="lpro-rating__item"><span class="lpro-rating__label">IMDb</span><span class="lpro-rating__value" data-rating="imdb">—</span></div>' +
            '<span class="lpro-rating__status" data-rating="status">' + escapeHtml(status || '') + '</span>' +
            '</div>';
    }

    function setStatus(panel, message) {
        panel.find('[data-rating="status"]').text(message || '');
    }

    function setRatings(panel, data) {
        panel.find('[data-rating="kp"]').text(formatRating(data.ratingKinopoisk));
        panel.find('[data-rating="imdb"]').text(formatRating(data.ratingImdb));
        setStatus(panel, '');
    }

    function cacheGet(key) {
        var cache = Lampa.Storage.cache(CACHE_NAME, 300, {});
        var value = cache[key];
        if (!value) return null;
        if (!value.savedAt || (Date.now() - value.savedAt) > CACHE_TTL) {
            delete cache[key];
            Lampa.Storage.set(CACHE_NAME, cache);
            return null;
        }
        return value.data || null;
    }

    function cacheSet(key, data) {
        var cache = Lampa.Storage.cache(CACHE_NAME, 300, {});
        cache[key] = { savedAt: Date.now(), data: data };
        Lampa.Storage.set(CACHE_NAME, cache);
    }

    function apiRequest(url, apiKey, onSuccess, onError) {
        var network = new Lampa.Reguest();
        network.timeout(15000);
        network.silent(url, function (data) {
            onSuccess(data);
        }, function (xhr, error) {
            onError(network.errorDecode ? network.errorDecode(xhr, error) : 'Ошибка запроса');
        }, false, {
            headers: {
                'X-API-KEY': apiKey,
                'Accept': 'application/json'
            }
        });
        return network;
    }

    function findFilm(card, apiKey, onSuccess, onError) {
        var titles = [card.title, card.original_title, card.original_name].filter(Boolean);
        var year = getYear(card);
        var imdb = card.imdb_id || card.imdbId || '';
        var searchUrl;

        if (imdb) {
            searchUrl = API_BASE + '/v2.2/films?imdbId=' + encodeURIComponent(imdb);
            apiRequest(searchUrl, apiKey, function (data) {
                var items = toItems(data);
                if (items.length) return onSuccess(items[0]);
                searchByTitle();
            }, function () {
                searchByTitle();
            });
        } else {
            searchByTitle();
        }

        function searchByTitle() {
            if (!titles.length) return onError('Нет названия для поиска');
            searchUrl = API_BASE + '/v2.1/films/search-by-keyword?keyword=' + encodeURIComponent(titles[0]);
            apiRequest(searchUrl, apiKey, function (data) {
                var items = toItems(data);
                if (!items.length) return onError('Фильм не найден');
                items.sort(function (a, b) {
                    return scoreCandidate(b, titles, year) - scoreCandidate(a, titles, year);
                });
                var best = items[0];
                if (scoreCandidate(best, titles, year) < 65) return onError('Не удалось точно сопоставить фильм');
                onSuccess(best);
            }, onError);
        }
    }

    function loadRatings(card, apiKey, callback) {
        var cacheKey = card.imdb_id || card.id || normalizeTitle(card.title || card.original_title);
        var cached = cacheGet(String(cacheKey));
        if (cached) return callback(null, cached);

        findFilm(card, apiKey, function (item) {
            var id = getFilmId(item);
            if (!id) return callback('API не вернул ID фильма');
            apiRequest(API_BASE + '/v2.2/films/' + encodeURIComponent(id), apiKey, function (data) {
                var result = {
                    ratingKinopoisk: data.ratingKinopoisk,
                    ratingImdb: data.ratingImdb
                };
                cacheSet(String(cacheKey), result);
                callback(null, result);
            }, function (error) {
                callback(error || 'Не удалось получить рейтинги');
            });
        }, function (error) {
            callback(error);
        });
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function') {
            log('SettingsApi is unavailable in this Lampa build.');
            return;
        }
        if (Lampa.Lang && typeof Lampa.Lang.add === 'function') {
            Lampa.Lang.add({
                lpro_rating_settings: { ru: 'Lampa PRO — рейтинги', en: 'Lampa PRO — Ratings' },
                lpro_rating_key: { ru: 'Ключ Kinopoisk API', en: 'Kinopoisk API key' },
                lpro_rating_key_desc: { ru: 'Получите личный ключ на kinopoiskapiunofficial.tech. Ключ хранится в настройках этой установки Lampa.', en: 'Get your personal key at kinopoiskapiunofficial.tech. The key is stored in this Lampa installation.' }
            });
        }
        Lampa.SettingsApi.addComponent({
            component: SETTINGS_ID,
            name: Lampa.Lang && Lampa.Lang.translate ? Lampa.Lang.translate('lpro_rating_settings') : 'Lampa PRO — рейтинги',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.4l6.3-.9L12 2.8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
            after: 'plugins'
        });
        Lampa.SettingsApi.addParam({
            component: SETTINGS_ID,
            param: { name: KEY_NAME, type: 'input', default: '', placeholder: 'Вставьте личный API-ключ' },
            field: {
                name: Lampa.Lang && Lampa.Lang.translate ? Lampa.Lang.translate('lpro_rating_key') : 'Ключ Kinopoisk API',
                description: Lampa.Lang && Lampa.Lang.translate ? Lampa.Lang.translate('lpro_rating_key_desc') : 'Получите личный ключ на kinopoiskapiunofficial.tech'
            }
        });
    }

    function onFull(event) {
        if (!event || event.type !== 'complite' || !event.data || !event.data.movie || !event.object) return;
        var card = event.data.movie;
        var render = event.object.activity && event.object.activity.render ? event.object.activity.render() : null;
        if (!render) return;

        var root = $(render);
        var existing = root.find('.lpro-rating');
        if (existing.length) existing.remove();

        var anchor = root.find('.info__rate').first();
        if (!anchor.length) return;

        var apiKey = String(Lampa.Storage.get(KEY_NAME, '') || '').trim();
        var panel = $(ratingMarkup(apiKey ? 'Загрузка рейтингов…' : 'Добавьте API-ключ в настройках Lampa PRO'));
        anchor.after(panel);

        if (!apiKey) return;
        loadRatings(card, apiKey, function (error, data) {
            // The detail page may have been closed while the request was running.
            if (!panel.closest('body').length) return;
            if (error) {
                setStatus(panel, error === 'Ошибка запроса' ? 'Ошибка API' : error);
                return;
            }
            setRatings(panel, data);
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || typeof Lampa.Listener.follow !== 'function') {
            log('Lampa API is unavailable; plugin stopped.');
            return;
        }
        addStyles();
        registerSettings();
        Lampa.Listener.follow('full', onFull);
        log('Loaded. Add your personal API key in Settings → Lampa PRO — Ratings.');
    }

    if (window.appready) init();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });
    } else {
        log('Lampa Listener is not available.');
    }
})();
