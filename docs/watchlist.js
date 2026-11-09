/*
 * Lampa PRO — Smart Watchlist
 * Version: 1.0.0
 * Target: Lampa 7.7.9+, Android TV / Android WebView
 *
 * Local personal watchlist for movies and TV series.
 * Metadata/search via the user's TMDB v3 key shared with Movie Assistant.
 */
(function () {
    'use strict';

    var FLAG = 'lampa_pro_smart_watchlist_loaded';
    var STORE = 'lpro_smart_watchlist_data';
    var KEY = 'lpro_movie_assistant_tmdb_key';
    var COMPONENT = 'lpro_smart_watchlist_screen';
    var API = 'https://api.themoviedb.org/3';
    var IMAGE = 'https://image.tmdb.org/t/p/w342';
    var STATUSES = ['Хочу посмотреть', 'Смотрю', 'Просмотрено', 'Брошено'];

    if (window[FLAG]) return;
    window[FLAG] = true;

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }

    function apiKey() {
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

    function request(path, params, success, failure) {
        var key = apiKey();
        if (!key) {
            failure('Добавьте TMDB v3 API-ключ в настройках Movie Assistant.');
            return;
        }
        params = params || {};
        params.api_key = key;
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

    function itemKey(type, id) {
        return type + ':' + id;
    }

    function findItem(data, type, id) {
        var wanted = itemKey(type, id);
        for (var i = 0; i < data.items.length; i++) {
            if (itemKey(data.items[i].type, data.items[i].id) === wanted) return data.items[i];
        }
        return null;
    }

    function titleOf(item) {
        return item.type === 'tv' ? (item.name || item.title || '') : (item.title || item.name || '');
    }

    function dateOf(item) {
        return item.type === 'tv' ? (item.first_air_date || '') : (item.release_date || '');
    }

    function yearOf(item) {
        var date = dateOf(item);
        return date ? date.substring(0, 4) : '';
    }

    function WatchlistScreen() {
        var root = $('<div class="lpro-wl-screen"></div>');
        var filter = 'Все';
        var busy = false;

        this.create = function () { render(); return root; };
        this.start = function () {
            render();
            var first = root.find('.selector').first();
            if (first.length) first.addClass('focus');
        };
        this.stop = function () {};
        this.destroy = function () { root.remove(); };
        this.render = function () { return root; };

        function render() {
            var data = read();
            var html = '<div class="lpro-wl-wrap">' +
                '<div class="lpro-wl-heading">Smart Watchlist</div>' +
                '<div class="lpro-wl-subtitle">Единый список фильмов и сериалов. Данные и статусы хранятся локально в Lampa.</div>' +
                '<div class="lpro-wl-search"><input class="lpro-wl-input" type="text" placeholder="Найти фильм или сериал" />' +
                '<button class="selector lpro-wl-search-btn">Найти</button></div>' +
                '<div class="lpro-wl-status" aria-live="polite"></div><div class="lpro-wl-results"></div>' +
                '<div class="lpro-wl-section">Моя коллекция (' + data.items.length + ')</div>' +
                '<div class="lpro-wl-filters">';
            ['Все'].concat(STATUSES).forEach(function (name) {
                html += '<button class="selector lpro-wl-filter' + (filter === name ? ' is-active' : '') + '" data-filter="' + esc(name) + '">' + esc(name) + '</button>';
            });
            html += '</div>';
            var visible = data.items.filter(function (item) { return filter === 'Все' || item.status === filter; });
            visible.sort(function (a, b) { return (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0); });
            if (!visible.length) {
                html += '<div class="lpro-wl-empty">' + (data.items.length ? 'В этой категории пока нет записей.' : 'Список пуст. Найдите фильм или сериал и добавьте его.') + '</div>';
            } else {
                visible.forEach(function (item) {
                    var year = item.year ? ' (' + esc(item.year) + ')' : '';
                    html += '<div class="lpro-wl-card">' +
                        (item.poster ? '<img class="lpro-wl-poster" src="' + esc(IMAGE + item.poster) + '" />' : '<div class="lpro-wl-poster lpro-wl-no-poster">Нет постера</div>') +
                        '<div class="lpro-wl-info"><div class="lpro-wl-title">' + esc(item.title) + year + '</div>' +
                        '<div class="lpro-wl-meta">' + (item.type === 'tv' ? 'Сериал' : 'Фильм') + (item.rating ? ' · TMDB ' + esc(Number(item.rating).toFixed(1)) : '') + '</div>' +
                        '<div class="lpro-wl-meta">' + esc(item.status) + '</div>' +
                        '<div class="lpro-wl-actions"><button class="selector lpro-wl-status-btn" data-type="' + esc(item.type) + '" data-id="' + esc(item.id) + '">Изменить статус</button>' +
                        '<button class="selector lpro-wl-remove" data-type="' + esc(item.type) + '" data-id="' + esc(item.id) + '">Удалить</button></div></div></div>';
                });
            }
            html += '<div class="lpro-wl-foot">Поиск и карточки используют TMDB. Для поиска требуется тот же API-ключ, что в Movie Assistant. Список хранится отдельно на каждом устройстве.</div></div>';
            root.html(html);
            bind();
        }

        function bind() {
            root.find('.lpro-wl-search-btn').off('hover:enter click').on('hover:enter click', function () {
                search(root.find('.lpro-wl-input').val());
            });
            root.find('.lpro-wl-input').off('keydown').on('keydown', function (event) {
                if (event.keyCode === 13) {
                    event.preventDefault();
                    root.find('.lpro-wl-search-btn').trigger('hover:enter');
                }
            });
            root.find('.lpro-wl-filter').off('hover:enter click').on('hover:enter click', function () {
                filter = $(this).attr('data-filter');
                render();
            });
            root.find('.lpro-wl-status-btn').off('hover:enter click').on('hover:enter click', function () {
                changeStatus($(this).attr('data-type'), $(this).attr('data-id'));
            });
            root.find('.lpro-wl-remove').off('hover:enter click').on('hover:enter click', function () {
                removeItem($(this).attr('data-type'), $(this).attr('data-id'));
            });
        }

        function search(query) {
            query = String(query || '').replace(/^\s+|\s+$/g, '');
            if (!query) {
                root.find('.lpro-wl-status').text('Введите название фильма или сериала.');
                return;
            }
            root.find('.lpro-wl-status').text('Поиск в TMDB…');
            root.find('.lpro-wl-results').empty();
            request('/search/multi', {query:query, page:1, include_adult:'false'}, function (data) {
                var list = (data.results || []).filter(function (item) { return item.media_type === 'movie' || item.media_type === 'tv'; }).slice(0, 12);
                var html = '';
                list.forEach(function (item) {
                    var type = item.media_type;
                    var title = type === 'tv' ? item.name : item.title;
                    var year = yearOf({type:type, first_air_date:item.first_air_date, release_date:item.release_date});
                    html += '<div class="lpro-wl-result">' +
                        (item.poster_path ? '<img class="lpro-wl-small-poster" src="' + esc(IMAGE + item.poster_path) + '" />' : '') +
                        '<div class="lpro-wl-result-info"><div class="lpro-wl-title">' + esc(title) + (year ? ' (' + esc(year) + ')' : '') + '</div>' +
                        '<div class="lpro-wl-meta">' + (type === 'tv' ? 'Сериал' : 'Фильм') + (item.vote_average ? ' · TMDB ' + Number(item.vote_average).toFixed(1) : '') + '</div>' +
                        '<div class="lpro-wl-meta">' + esc(item.overview || 'Описание отсутствует') + '</div>' +
                        '<button class="selector lpro-wl-add" data-type="' + esc(type) + '" data-id="' + esc(item.id) + '">Добавить в список</button></div></div>';
                });
                root.find('.lpro-wl-results').html(html || '<div class="lpro-wl-empty">Ничего не найдено.</div>');
                root.find('.lpro-wl-status').text('Найдено: ' + list.length);
                root.find('.lpro-wl-add').off('hover:enter click').on('hover:enter click', function () {
                    addItem($(this).attr('data-type'), $(this).attr('data-id'));
                });
            }, function (message) {
                root.find('.lpro-wl-status').text(message);
            });
        }

        function addItem(type, id) {
            var data = read();
            if (findItem(data, type, id)) {
                root.find('.lpro-wl-status').text('Эта запись уже есть в списке.');
                return;
            }
            var path = type === 'tv' ? '/tv/' : '/movie/';
            request(path + encodeURIComponent(id), {}, function (item) {
                var title = type === 'tv' ? item.name : item.title;
                data = read();
                if (findItem(data, type, id)) {
                    root.find('.lpro-wl-status').text('Эта запись уже есть в списке.');
                    return;
                }
                data.items.unshift({
                    id:item.id, type:type, title:title || 'Без названия',
                    poster:item.poster_path || '', year:yearOf({type:type, first_air_date:item.first_air_date, release_date:item.release_date}),
                    rating:item.vote_average || 0, status:STATUSES[0], addedAt:Date.now(), updatedAt:Date.now()
                });
                write(data);
                root.find('.lpro-wl-status').text('Добавлено в Smart Watchlist.');
                render();
            }, function (message) { root.find('.lpro-wl-status').text(message); });
        }

        function changeStatus(type, id) {
            var data = read();
            var item = findItem(data, type, id);
            if (!item) return;
            var index = STATUSES.indexOf(item.status);
            item.status = STATUSES[(index + 1 + STATUSES.length) % STATUSES.length];
            item.updatedAt = Date.now();
            write(data);
            render();
        }

        function removeItem(type, id) {
            var data = read();
            data.items = data.items.filter(function (item) { return itemKey(item.type, item.id) !== itemKey(type, id); });
            write(data);
            render();
        }
    }

    function addStyles() {
        if ($('#lpro-wl-style').length) return;
        $('head').append('<style id="lpro-wl-style">' +
            '.lpro-wl-screen{width:100%;height:100%;overflow-y:auto;box-sizing:border-box}' +
            '.lpro-wl-wrap{padding:2em 3em 3em;max-width:1200px;margin:0 auto}' +
            '.lpro-wl-heading{font-size:2em;font-weight:700;margin-bottom:.25em}' +
            '.lpro-wl-subtitle,.lpro-wl-foot{opacity:.65;margin-bottom:1.2em}' +
            '.lpro-wl-search{display:flex;gap:.7em;align-items:center;margin:1em 0}' +
            '.lpro-wl-input{flex:1;min-width:15em;padding:.85em 1em;border:2px solid rgba(255,255,255,.25);border-radius:.4em;background:rgba(255,255,255,.08);color:inherit;font-size:1.05em}' +
            '.lpro-wl-search button,.lpro-wl-actions button,.lpro-wl-add,.lpro-wl-filter{padding:.7em .9em;border:0;border-radius:.4em;background:rgba(255,255,255,.13);color:inherit;font-size:.9em;margin:.2em}' +
            '.lpro-wl-search button.focus,.lpro-wl-actions button.focus,.lpro-wl-add.focus,.lpro-wl-filter.focus{outline:3px solid #fff;outline-offset:2px}' +
            '.lpro-wl-status{min-height:1.4em;opacity:.8;margin:.6em 0}' +
            '.lpro-wl-section{font-size:1.35em;font-weight:700;margin:1.4em 0 .7em}' +
            '.lpro-wl-filters,.lpro-wl-actions{display:flex;flex-wrap:wrap;margin:.5em 0}' +
            '.lpro-wl-filter.is-active{background:rgba(255,255,255,.32)}' +
            '.lpro-wl-card,.lpro-wl-result{display:flex;gap:1em;padding:1em;margin:.65em 0;background:rgba(255,255,255,.06);border-radius:.5em;align-items:flex-start}' +
            '.lpro-wl-poster{width:5.8em;min-width:5.8em;min-height:8em;object-fit:cover;border-radius:.3em;background:rgba(255,255,255,.08)}' +
            '.lpro-wl-no-poster{display:flex;align-items:center;justify-content:center;text-align:center;font-size:.8em;opacity:.6}' +
            '.lpro-wl-info,.lpro-wl-result-info{min-width:0;flex:1}' +
            '.lpro-wl-title{font-size:1.12em;font-weight:700;margin-bottom:.35em}' +
            '.lpro-wl-meta{font-size:.9em;opacity:.72;margin:.3em 0;line-height:1.35}' +
            '.lpro-wl-small-poster{width:4em;min-width:4em;max-height:6em;object-fit:cover;border-radius:.25em}' +
            '.lpro-wl-empty{padding:1.2em;background:rgba(255,255,255,.06);border-radius:.5em;opacity:.8}' +
            '.lpro-wl-foot{font-size:.85em;margin-top:1.8em}' +
            '@media(max-width:800px){.lpro-wl-wrap{padding:1.2em}.lpro-wl-search{flex-direction:column;align-items:stretch}.lpro-wl-input{box-sizing:border-box;width:100%;min-width:0}.lpro-wl-card,.lpro-wl-result{gap:.7em}.lpro-wl-poster{width:4.5em;min-width:4.5em}}' +
            '</style>');
    }

    function addMenuItem() {
        var menu = $('.menu .menu__list').eq(0);
        if (!menu.length || menu.find('.lpro-wl-menu').length) return;
        var button = $('<li class="menu__item selector lpro-wl-menu"><div class="menu__ico"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 8h24a3 3 0 0 1 3 3v27l-15-8-15 8V11a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15 16h14M15 22h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><div class="menu__text">Smart Watchlist</div></li>');
        button.on('hover:enter click', openScreen);
        menu.append(button);
    }

    function openScreen() {
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, WatchlistScreen);
        Lampa.Activity.push({url:'', title:'Lampa PRO — Smart Watchlist', component:COMPONENT, page:1});
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Storage || !Lampa.Activity || !Lampa.Component) return;
        addStyles();
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, WatchlistScreen);
        addMenuItem();
        Lampa.Listener.follow('activity', function (event) {
            if (event && event.type === 'start') addMenuItem();
        });
    }

    if (window.appready) init();
    else if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });
    }
})();
