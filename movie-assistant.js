/*
 * Lampa PRO — Movie Assistant
 * Version: 1.0.0
 * Target: Lampa 7.7.9+, Android TV / Android WebView
 *
 * Uses the user's own TMDB v3 API key. The key is stored in Lampa Storage.
 * Plot discovery is based on TMDB keyword metadata, not AI interpretation.
 */
(function () {
    'use strict';

    var FLAG = 'lampa_pro_movie_assistant_loaded';
    var SETTINGS = 'lpro_movie_assistant_settings';
    var KEY = 'lpro_movie_assistant_tmdb_key';
    var COMPONENT = 'lpro_movie_assistant_screen';
    var API = 'https://api.themoviedb.org/3';
    var IMAGE = 'https://image.tmdb.org/t/p/w342';
    var activeRequest = null;

    if (window[FLAG]) return;
    window[FLAG] = true;

    function log(message, error) {
        if (window.console && console.log) console.log('[Lampa PRO Movie Assistant] ' + message, error || '');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }

    function apiKey() {
        return String(Lampa.Storage.get(KEY, '') || '').replace(/^\s+|\s+$/g, '');
    }

    function request(path, params, success, failure) {
        var key = apiKey();
        if (!key) {
            failure('Добавьте ключ TMDB в настройках Movie Assistant.');
            return;
        }

        var query = [];
        params = params || {};
        params.api_key = key;
        params.language = 'ru-RU';
        Object.keys(params).forEach(function (name) {
            query.push(encodeURIComponent(name) + '=' + encodeURIComponent(params[name]));
        });

        var xhr = new XMLHttpRequest();
        activeRequest = xhr;
        xhr.open('GET', API + path + '?' + query.join('&'), true);
        xhr.timeout = 18000;
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (activeRequest === xhr) activeRequest = null;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    success(JSON.parse(xhr.responseText));
                } catch (e) {
                    failure('Не удалось обработать ответ TMDB.');
                }
            } else {
                var message = 'Ошибка TMDB (' + xhr.status + ').';
                try {
                    var body = JSON.parse(xhr.responseText);
                    if (body.status_message) message = body.status_message;
                } catch (ignore) {}
                failure(message);
            }
        };
        xhr.ontimeout = function () {
            if (activeRequest === xhr) activeRequest = null;
            failure('Превышено время ожидания TMDB.');
        };
        xhr.onerror = function () {
            if (activeRequest === xhr) activeRequest = null;
            failure('Не удалось подключиться к TMDB. Проверьте интернет.');
        };
        xhr.send();
    }

    function splitTerms(value) {
        var words = String(value || '').toLowerCase().replace(/ё/g, 'е')
            .replace(/[^a-zа-я0-9\s-]/g, ' ').split(/\s+/);
        var stop = {'это':1,'как':1,'про':1,'для':1,'или':1,'the':1,'and':1,'with':1,'from':1,'about':1};
        var result = [];
        words.forEach(function (word) {
            if (word.length < 3 || stop[word] || result.indexOf(word) !== -1) return;
            result.push(word);
        });
        return result.slice(0, 5);
    }

    function discoverByPlot(description, done, fail) {
        var terms = splitTerms(description);
        if (!terms.length) {
            fail('Введите несколько ключевых слов или краткое описание сюжета.');
            return;
        }

        var found = [];
        var index = 0;
        function next() {
            if (index >= terms.length || found.length >= 4) {
                if (!found.length) {
                    fail('По этим словам TMDB не нашёл подходящих ключевых слов. Попробуйте другие формулировки.');
                    return;
                }
                request('/discover/movie', {
                    with_keywords: found.join('|'),
                    sort_by: 'popularity.desc',
                    include_adult: 'false',
                    page: 1
                }, function (data) {
                    done(data.results || []);
                }, fail);
                return;
            }

            var term = terms[index++];
            request('/search/keyword', {query: term, page: 1}, function (data) {
                var list = data.results || [];
                if (list.length && found.indexOf(String(list[0].id)) === -1) {
                    found.push(String(list[0].id));
                }
                next();
            }, function () {
                next();
            });
        }
        next();
    }

    function searchSimilarByTitle(title, done, fail) {
        request('/search/movie', {query: title, page: 1, include_adult: 'false'}, function (data) {
            var list = data.results || [];
            if (!list.length) {
                fail('Фильм не найден. Проверьте название.');
                return;
            }
            similar(list[0], done, fail);
        }, fail);
    }

    function similar(movie, done, fail) {
        request('/movie/' + encodeURIComponent(movie.id) + '/similar', {page: 1}, function (data) {
            done(data.results || [], movie.title || movie.name || 'Выбранный фильм');
        }, fail);
    }

    function year(item) {
        var date = String(item.release_date || item.first_air_date || '');
        return date.length >= 4 ? date.substring(0, 4) : '';
    }

    function renderResults(root, items, heading) {
        var html = '<div class="lpro-ma-results-title">' + escapeHtml(heading) + '</div>';
        if (!items.length) {
            html += '<div class="lpro-ma-message">Подходящих фильмов не найдено. Измените запрос.</div>';
        }
        items.slice(0, 20).forEach(function (item) {
            var title = item.title || item.name || 'Без названия';
            var poster = item.poster_path ? IMAGE + item.poster_path : '';
            html += '<div class="lpro-ma-result">' +
                (poster ? '<img class="lpro-ma-poster" src="' + escapeHtml(poster) + '" />' : '<div class="lpro-ma-poster lpro-ma-no-poster">Нет постера</div>') +
                '<div class="lpro-ma-info"><div class="lpro-ma-title">' + escapeHtml(title) +
                (year(item) ? ' (' + escapeHtml(year(item)) + ')' : '') + '</div>' +
                '<div class="lpro-ma-rating">TMDB: ' + (Number(item.vote_average) ? Number(item.vote_average).toFixed(1) : '—') + '</div>' +
                '<div class="lpro-ma-overview">' + escapeHtml(item.overview || 'Описание отсутствует.') + '</div>' +
                '<button class="selector lpro-ma-similar" data-id="' + escapeHtml(item.id) +
                '" data-title="' + escapeHtml(title) + '">Похожие фильмы</button></div></div>';
        });
        root.find('.lpro-ma-results').html(html);
        root.find('.lpro-ma-similar').off('hover:enter').on('hover:enter', function () {
            var id = $(this).attr('data-id');
            var title = $(this).attr('data-title');
            similar({id:id, title:title}, function (results, sourceTitle) {
                renderResults(root, results, 'Похожие на «' + sourceTitle + '»');
            }, function (message) {
                root.find('.lpro-ma-status').text(message);
            });
        });
        root.find('.lpro-ma-similar').off('click').on('click', function () {
            $(this).trigger('hover:enter');
        });
    }

    function AssistantScreen() {
        var root = $('<div class="lpro-ma-screen"></div>');

        this.create = function () {
            root.html(
                '<div class="lpro-ma-wrap">' +
                '<div class="lpro-ma-heading">Movie Assistant</div>' +
                '<div class="lpro-ma-subtitle">Поиск по ключевым словам сюжета и подбор похожих фильмов</div>' +
                '<div class="lpro-ma-controls">' +
                '<input class="lpro-ma-input" type="text" placeholder="Например: космос, экспедиция, выживание" />' +
                '<button class="selector lpro-ma-search">Поиск по сюжету</button>' +
                '<button class="selector lpro-ma-title-search">Найти похожие по названию</button>' +
                '</div>' +
                '<div class="lpro-ma-status" aria-live="polite"></div>' +
                '<div class="lpro-ma-results"></div>' +
                '<div class="lpro-ma-note">Поиск по сюжету использует ключевые слова, присвоенные фильмам в TMDB. Результат зависит от полноты каталога.</div>' +
                '</div>'
            );
            bind();
            return root;
        };

        this.start = function () {
            var input = root.find('.lpro-ma-input');
            if (input.length) input.focus();
        };

        this.stop = function () {
            if (activeRequest) {
                activeRequest.abort();
                activeRequest = null;
            }
        };

        this.destroy = function () {
            if (activeRequest) {
                activeRequest.abort();
                activeRequest = null;
            }
            root.remove();
        };

        this.render = function () { return root; };

        function bind() {
            root.find('.lpro-ma-search').on('hover:enter click', function () {
                var query = root.find('.lpro-ma-input').val();
                root.find('.lpro-ma-status').text('Ищем фильмы по ключевым словам…');
                discoverByPlot(query, function (items) {
                    root.find('.lpro-ma-status').text('Найдено: ' + items.length);
                    renderResults(root, items, 'Результаты поиска по сюжету');
                }, function (message) {
                    root.find('.lpro-ma-status').text(message);
                });
            });
            root.find('.lpro-ma-title-search').on('hover:enter click', function () {
                var query = root.find('.lpro-ma-input').val();
                if (!String(query || '').replace(/\s/g, '')) {
                    root.find('.lpro-ma-status').text('Введите название фильма.');
                    return;
                }
                root.find('.lpro-ma-status').text('Ищем фильм…');
                searchSimilarByTitle(query, function (items, title) {
                    root.find('.lpro-ma-status').text('Найдено: ' + items.length);
                    renderResults(root, items, 'Похожие фильмы на основе «' + title + '»');
                }, function (message) {
                    root.find('.lpro-ma-status').text(message);
                });
            });
            root.find('.lpro-ma-input').on('keydown', function (event) {
                if (event.keyCode === 13) {
                    event.preventDefault();
                    root.find('.lpro-ma-search').trigger('hover:enter');
                }
            });
        }
    }

    function addStyles() {
        if ($('#lpro-ma-style').length) return;
        $('head').append('<style id="lpro-ma-style">' +
            '.lpro-ma-screen{width:100%;height:100%;overflow-y:auto;box-sizing:border-box}' +
            '.lpro-ma-wrap{padding:2em 3em 3em;max-width:1200px;margin:0 auto}' +
            '.lpro-ma-heading{font-size:2em;font-weight:700;margin-bottom:.25em}' +
            '.lpro-ma-subtitle,.lpro-ma-note{opacity:.65;margin-bottom:1.2em}' +
            '.lpro-ma-controls{display:flex;gap:.7em;flex-wrap:wrap;align-items:center}' +
            '.lpro-ma-input{flex:1;min-width:18em;padding:.85em 1em;border:2px solid rgba(255,255,255,.25);border-radius:.4em;background:rgba(255,255,255,.08);color:inherit;font-size:1.05em}' +
            '.lpro-ma-controls button,.lpro-ma-similar{padding:.85em 1em;border:0;border-radius:.4em;background:rgba(255,255,255,.13);color:inherit;font-size:.95em}' +
            '.lpro-ma-controls button.focus,.lpro-ma-similar.focus{outline:3px solid #fff;outline-offset:3px}' +
            '.lpro-ma-status{min-height:1.5em;margin:1em 0;opacity:.8}' +
            '.lpro-ma-results-title{font-size:1.35em;font-weight:700;margin:1em 0}' +
            '.lpro-ma-result{display:flex;gap:1.1em;padding:1em;margin:.7em 0;background:rgba(255,255,255,.06);border-radius:.5em;min-height:9em}' +
            '.lpro-ma-poster{width:6.2em;min-width:6.2em;object-fit:cover;border-radius:.3em;background:rgba(255,255,255,.08)}' +
            '.lpro-ma-no-poster{display:flex;align-items:center;justify-content:center;text-align:center;font-size:.8em;opacity:.6}' +
            '.lpro-ma-info{min-width:0;flex:1}.lpro-ma-title{font-size:1.15em;font-weight:700}.lpro-ma-rating{opacity:.7;font-size:.9em;margin:.3em 0}' +
            '.lpro-ma-overview{opacity:.85;line-height:1.4;margin:.45em 0 .8em}.lpro-ma-similar{margin-top:.3em}' +
            '.lpro-ma-message{padding:1em;background:rgba(255,255,255,.06);border-radius:.4em}.lpro-ma-note{font-size:.85em;margin-top:1.5em}' +
            '@media(max-width:800px){.lpro-ma-wrap{padding:1.2em}.lpro-ma-controls{flex-direction:column;align-items:stretch}.lpro-ma-input{box-sizing:border-box;min-width:0;width:100%}.lpro-ma-result{gap:.7em}.lpro-ma-poster{width:4.8em;min-width:4.8em}}' +
            '</style>');
    }

    function addMenuItem() {
        var menu = $('.menu .menu__list').eq(0);
        if (!menu.length || menu.find('.lpro-ma-menu').length) return;
        var button = $('<li class="menu__item selector lpro-ma-menu"><div class="menu__ico"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="19" cy="19" r="11" stroke="currentColor" stroke-width="2.4"/><path d="M27 27l9 9M14 19h10M19 14v10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></div><div class="menu__text">Movie Assistant</div></li>');
        button.on('hover:enter click', openScreen);
        menu.append(button);
    }

    function openScreen() {
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, AssistantScreen);
        Lampa.Activity.push({url:'', title:'Lampa PRO — Movie Assistant', component:COMPONENT, page:1});
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function' ||
            typeof Lampa.SettingsApi.addParam !== 'function') return;
        Lampa.SettingsApi.addComponent({
            component: SETTINGS,
            name: 'Lampa PRO — Movie Assistant',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M16 16l5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
            after: 'plugins'
        });
        Lampa.SettingsApi.addParam({
            component: SETTINGS,
            param: {name:KEY, type:'input', default:'', placeholder:'Личный ключ TMDB v3'},
            field: {
                name: 'Ключ TMDB API',
                description: 'Создайте личный API key в настройках аккаунта themoviedb.org. Ключ хранится локально в Lampa.'
            }
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Storage || !Lampa.Activity || !Lampa.Component) {
            log('Required Lampa APIs are unavailable; plugin stopped.');
            return;
        }
        addStyles();
        registerSettings();
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, AssistantScreen);
        addMenuItem();
        Lampa.Listener.follow('activity', addMenuItem);
        log('Loaded. Configure a personal TMDB API key in Settings.');
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