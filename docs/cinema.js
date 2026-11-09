/*
 * Lampa PRO — Cinema UI
 * Version: 1.0.0
 * Target: Lampa 7.7.9+, Android TV / Android WebView
 *
 * Optional visual refinements for TV navigation.
 * Does not replace Lampa screens or alter playback.
 */
(function () {
    'use strict';

    var FLAG = 'lampa_pro_cinema_ui_loaded';
    var SETTINGS = 'lpro_cinema_ui_settings';
    var FOCUS = 'lpro_cinema_ui_focus';
    var CARDS = 'lpro_cinema_ui_cards';
    var STYLE_ID = 'lpro-cinema-ui-style';

    if (window[FLAG]) return;
    window[FLAG] = true;

    function log(message, error) {
        if (window.console && console.log) {
            console.log('[Lampa PRO Cinema UI] ' + message, error || '');
        }
    }

    function enabled(key, fallback) {
        var value = Lampa.Storage.get(key, fallback);
        return value === true;
    }

    function addStyles() {
        if (document.getElementById(STYLE_ID)) return;

        var css = [
            /* TV focus: clear, high-contrast focus ring without changing layout */
            'body.lpro-cinema-focus .selector.focus,',
            'body.lpro-cinema-focus .selector.hover,',
            'body.lpro-cinema-focus .menu__item.focus {',
            '  outline: 3px solid rgba(255,255,255,.92) !important;',
            '  outline-offset: 3px !important;',
            '  box-shadow: 0 0 0 5px rgba(255,255,255,.16), 0 8px 28px rgba(0,0,0,.28) !important;',
            '  border-radius: 7px;',
            '}',
            'body.lpro-cinema-focus .selector.focus .card__title,',
            'body.lpro-cinema-focus .selector.focus .menu__text {',
            '  color: #fff !important;',
            '}',
            /* Subtle card treatment */
            'body.lpro-cinema-cards .card__view {',
            '  border-radius: 9px;',
            '  overflow: hidden;',
            '  transition: transform .16s ease, box-shadow .16s ease;',
            '}',
            'body.lpro-cinema-cards .card.focus .card__view,',
            'body.lpro-cinema-cards .card.hover .card__view {',
            '  box-shadow: 0 9px 24px rgba(0,0,0,.38);',
            '}',
            'body.lpro-cinema-cards .card__title {',
            '  text-shadow: 0 1px 3px rgba(0,0,0,.55);',
            '}',
            '@media (prefers-reduced-motion: reduce) {',
            '  body.lpro-cinema-cards .card__view { transition: none; }',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        (document.head || document.documentElement).appendChild(style);
    }

    function apply() {
        if (!document.body || !window.Lampa || !Lampa.Storage) return;

        var focus = enabled(FOCUS, true);
        var cards = enabled(CARDS, true);

        document.body.classList.toggle('lpro-cinema-focus', focus);
        document.body.classList.toggle('lpro-cinema-cards', cards);
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function' ||
            typeof Lampa.SettingsApi.addParam !== 'function') {
            log('SettingsApi unavailable; visual defaults remain disabled.');
            return;
        }

        Lampa.SettingsApi.addComponent({
            component: SETTINGS,
            name: 'Lampa PRO — Cinema UI',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7 4v4m5-4v4m5-4v4M7 20v-4m5 4v-4m5 4v-4" stroke="currentColor" stroke-width="1.6"/></svg>',
            after: 'plugins'
        });

        Lampa.SettingsApi.addParam({
            component: SETTINGS,
            param: { name: FOCUS, type: 'trigger', default: true },
            field: {
                name: 'Улучшенное выделение фокуса',
                description: 'Более заметная рамка выбранного элемента при управлении пультом'
            }
        });

        Lampa.SettingsApi.addParam({
            component: SETTINGS,
            param: { name: CARDS, type: 'trigger', default: true },
            field: {
                name: 'Оформление карточек',
                description: 'Скругление углов и мягкая тень у карточек контента'
            }
        });
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Storage) {
            log('Required Lampa APIs are unavailable; plugin stopped.');
            return;
        }

        addStyles();
        registerSettings();
        apply();

        Lampa.Listener.follow('activity', function () {
            apply();
        });

        Lampa.Listener.follow('full', function () {
            apply();
        });

        log('Loaded. Configure it in Settings → Lampa PRO — Cinema UI.');
    }

    if (window.appready) {
        init();
    } else if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });
    } else {
        log('Waiting for Lampa API.');
    }
})();
