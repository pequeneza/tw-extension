/*
 * Script Name: Fake Script Generator
 * Version: v3.2.2
 * Last Updated: 2025-08-15
 * Author: RedAlert
 * Author URL: https://twscripts.dev/
 * Author Contact: redalert_tw (Discord)
 * Approved: N/A
 * Approved Date: 2021-07-19
 * Mod: JawJaw
 */

/* Copyright (c) RedAlert
By uploading a user-generated mod (script) for use with Tribal Wars, you grant InnoGames a perpetual, irrevocable, worldwide, royalty-free, non-exclusive license to use, reproduce, distribute, publicly display, modify, and create derivative works of the mod. This license permits InnoGames to incorporate the mod into any aspect of the game and its related services, including promotional and commercial endeavors, without any requirement for compensation or attribution to you. InnoGames is entitled but not obligated to name you when exercising its rights. You represent and warrant that you have the legal right to grant this license and that the mod does not infringe upon any third-party rights. You are - with the exception of claims of infringement by third parties â€“ not liable for any usage of the mod by InnoGames. German law applies.
*/

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;

// Script Config
var scriptConfig = {
    scriptData: {
        prefix: 'fakeScriptGenerator',
        name: 'Fake Script Generator',
        version: 'v3.2.1',
        author: 'RedAlert',
        authorUrl: 'https://twscripts.dev/',
        helpLink:
            'https://forum.tribalwars.net/index.php?threads/fake-script-generator.287521/',
    },
    translations: {
        en_DK: {
            'Fake Script Generator': 'Fake Script Generator',
            Help: 'Help',
            'How to send fakes?': 'How to send fakes?',
            Randomly: 'Randomly',
            Sequential: 'Sequential',
            'Selective Random': 'Selective Random',
            Coordinates: 'Coordinates',
            'Choose units and amounts to send':
                'Choose units and amounts to send',
            'Generate Script': 'Generate Script',
            'Coordinates field is required!': 'Coordinates field is required!',
            'You must choose at least one unit to send!':
                'You must choose at least one unit to send!',
            'Add this script to your Quick-bar':
                'Add this script to your Quick-bar',
            'Add new Link': 'Add new Link',
            'How to fill coordinates?': 'How to fill coordinates?',
            Manually: 'Manually',
            Automatically: 'Automatically',
            'Player (separate players using comma)':
                'Player (separate players using comma)',
            'Tribe (separate tribes using comma)':
                'Tribe (separate tribes using comma)',
            'Start typing and suggestions will show ...':
                'Start typing and suggestions will show ...',
            'You must select at least one player or one tribe!':
                'You must select at least one player or one tribe!',
            Continents: 'Continents',
            'Min Coord': 'Min Coord',
            'Max Coord': 'Max Coord',
            'Dist from center': 'Dist from center',
            Center: 'Center',
            'Script could not be generated since nothing could fit into specified criteria!':
                'Script could not be generated since nothing could fit into specified criteria!',
            'Minimum coordinates and maximum coordinates filter should work together!':
                'Minimum coordinates and maximum coordinates filter should work together!',
            'Invalid user input!': 'Invalid user input!',
            'Radius filtering needs both fields filled!':
                'Radius filtering needs both fields filled!',
            'What to send?': 'What to send?',
            Custom: 'Custom',
            'Send all': 'Send all',
            'Selective Send all': 'Selective Send all',
            'Ram first then Catapult': 'Ram first then Catapult',
            'Catapult first then Ram': 'Catapult first then Ram',
            'Fake Limit': 'Fake Limit',
            'Excluded Players': 'Excluded Players',
            'Select units to send and what unit amounts to keep':
                'Select units to send and what unit amounts to keep',
            'Configuration imported successfully!':
                'Configuration imported successfully!',
            'Nothing to import!': 'Nothing to import!',
            '20:1 No-Attack': '20:1 No-Attack',
            'Filter players 20 times bigger then yourself':
                'Filter players 20 times bigger then yourself',
            'Minimum Points Village': 'Minimum Points Village',
            'Maximum Points Village': 'Maximum Points Village',
            'Selective Random Configuration': 'Selective Random Configuration',
            'This will target Player3 1000% more times then normal distribution, Player2 will be targetted 200% more and Player1 will be targetted 500% more.':
                'This will target Player3 1000% more times then normal distribution, Player2 will be targetted 200% more and Player1 will be targetted 500% more.',
        },
    },
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    isDebug: DEBUG,
    enableCountApi: true,
};

window.twSDK = {
    // variables
    scriptData: {},
    translations: {},
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    enableCountApi: true,
    isDebug: false,
    isMobile: jQuery('#mobileHeader').length > 0,
    delayBetweenRequests: 200,
    // helper variables
    market: game_data.market,
    units: game_data.units,
    village: game_data.village,
    buildings: game_data.village.buildings,
    sitterId: game_data.player.sitter > 0 ? `&t=${game_data.player.id}` : '',
    coordsRegex: /\d{1,3}\|\d{1,3}/g,
    dateTimeMatch:
        /(?:[A-Z][a-z]{2}\s+\d{1,2},\s*\d{0,4}\s+|today\s+at\s+|tomorrow\s+at\s+)\d{1,2}:\d{2}:\d{2}:?\.?\d{0,3}/,
    worldInfoInterface: '/interface.php?func=get_config',
    unitInfoInterface: '/interface.php?func=get_unit_info',
    buildingInfoInterface: '/interface.php?func=get_building_info',
    worldDataVillages: '/map/village.txt',
    worldDataPlayers: '/map/player.txt',
    worldDataTribes: '/map/ally.txt',
    worldDataConquests: '/map/conquer_extended.txt',
    // game constants
    buildingsList: [
        'main',
        'barracks',
        'stable',
        'garage',
        'church',
        'church_f',
        'watchtower',
        'snob',
        'smith',
        'place',
        'statue',
        'market',
        'wood',
        'stone',
        'iron',
        'farm',
        'storage',
        'hide',
        'wall',
    ],
    // https://help.tribalwars.net/wiki/Points
    buildingPoints: {
        main: [
            10, 2, 2, 3, 4, 4, 5, 6, 7, 9, 10, 12, 15, 18, 21, 26, 31, 37, 44,
            53, 64, 77, 92, 110, 133, 159, 191, 229, 274, 330,
        ],
        barracks: [
            16, 3, 4, 5, 5, 7, 8, 9, 12, 14, 16, 20, 24, 28, 34, 42, 49, 59, 71,
            85, 102, 123, 147, 177, 212,
        ],
        stable: [
            20, 4, 5, 6, 6, 9, 10, 12, 14, 17, 21, 25, 29, 36, 43, 51, 62, 74,
            88, 107,
        ],
        garage: [24, 5, 6, 6, 9, 10, 12, 14, 17, 21, 25, 29, 36, 43, 51],
        chuch: [10, 2, 2],
        church_f: [10],
        watchtower: [
            42, 8, 10, 13, 14, 18, 20, 25, 31, 36, 43, 52, 62, 75, 90, 108, 130,
            155, 186, 224,
        ],
        snob: [512],
        smith: [
            19, 4, 4, 6, 6, 8, 10, 11, 14, 16, 20, 23, 28, 34, 41, 49, 58, 71,
            84, 101,
        ],
        place: [0],
        statue: [24],
        market: [
            10, 2, 2, 3, 4, 4, 5, 6, 7, 9, 10, 12, 15, 18, 21, 26, 31, 37, 44,
            53, 64, 77, 92, 110, 133,
        ],
        wood: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        stone: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        iron: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        farm: [
            5, 1, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27,
            32, 38, 46, 55, 66, 80, 95, 115, 137, 165,
        ],
        storage: [
            6, 1, 2, 1, 2, 3, 3, 3, 5, 5, 6, 8, 8, 11, 13, 15, 19, 22, 27, 32,
            38, 46, 55, 66, 80, 95, 115, 137, 165, 198,
        ],
        hide: [5, 1, 1, 2, 1, 2, 3, 3, 3, 5],
        wall: [
            8, 2, 2, 2, 3, 3, 4, 5, 5, 7, 9, 9, 12, 15, 17, 20, 25, 29, 36, 43,
        ],
    },
    unitsFarmSpace: {
        spear: 1,
        sword: 1,
        axe: 1,
        archer: 1,
        spy: 2,
        light: 4,
        marcher: 5,
        heavy: 6,
        ram: 5,
        catapult: 8,
        knight: 10,
        snob: 100,
    },
    // https://help.tribalwars.net/wiki/Timber_camp
    // https://help.tribalwars.net/wiki/Clay_pit
    // https://help.tribalwars.net/wiki/Iron_mine
    resPerHour: {
        0: 2,
        1: 30,
        2: 35,
        3: 41,
        4: 47,
        5: 55,
        6: 64,
        7: 74,
        8: 86,
        9: 100,
        10: 117,
        11: 136,
        12: 158,
        13: 184,
        14: 214,
        15: 249,
        16: 289,
        17: 337,
        18: 391,
        19: 455,
        20: 530,
        21: 616,
        22: 717,
        23: 833,
        24: 969,
        25: 1127,
        26: 1311,
        27: 1525,
        28: 1774,
        29: 2063,
        30: 2400,
    },
    watchtowerLevels: [
        1.1, 1.3, 1.5, 1.7, 2, 2.3, 2.6, 3, 3.4, 3.9, 4.4, 5.1, 5.8, 6.7, 7.6,
        8.7, 10, 11.5, 13.1, 15,
    ],

    // internal methods
    _initDebug: function () {
        const scriptInfo = this.scriptInfo();
        console.debug(`${scriptInfo} It works ðŸš€!`);
        console.debug(`${scriptInfo} HELP:`, this.scriptData.helpLink);
        if (this.isDebug) {
            console.debug(`${scriptInfo} Market:`, game_data.market);
            console.debug(`${scriptInfo} World:`, game_data.world);
            console.debug(`${scriptInfo} Screen:`, game_data.screen);
            console.debug(
                `${scriptInfo} Game Version:`,
                game_data.majorVersion
            );
            console.debug(`${scriptInfo} Game Build:`, game_data.version);
            console.debug(`${scriptInfo} Locale:`, game_data.locale);
            console.debug(
                `${scriptInfo} PA:`,
                game_data.features.Premium.active
            );
            console.debug(
                `${scriptInfo} LA:`,
                game_data.features.FarmAssistent.active
            );
            console.debug(
                `${scriptInfo} AM:`,
                game_data.features.AccountManager.active
            );
        }
    },

    // public methods
    addGlobalStyle: function () {
        return `
            /* Table Styling */
            .ra-table-container { overflow-y: auto; overflow-x: hidden; height: auto; max-height: 400px; }
            .ra-table th { font-size: 14px; }
            .ra-table th label { margin: 0; padding: 0; }
            .ra-table th,
            .ra-table td { padding: 5px; text-align: center; }
            .ra-table td a { word-break: break-all; }
            .ra-table a:focus { color: blue; }
            .ra-table a.btn:focus { color: #fff; }
            .ra-table tr:nth-of-type(2n) td { background-color: #f0e2be }
            .ra-table tr:nth-of-type(2n+1) td { background-color: #fff5da; }

            .ra-table-v2 th,
            .ra-table-v2 td { text-align: left; }

            .ra-table-v3 { border: 2px solid #bd9c5a; }
            .ra-table-v3 th,
            .ra-table-v3 td { border-collapse: separate; border: 1px solid #bd9c5a; text-align: left; }

            /* Inputs */
            .ra-textarea { width: 100%; height: 80px; resize: none; }

            /* Popup */
            .ra-popup-content { width: 360px; }
            .ra-popup-content * { box-sizing: border-box; }
            .ra-popup-content input[type="text"] { padding: 3px; width: 100%; }
            .ra-popup-content .btn-confirm-yes { padding: 3px !important; }
            .ra-popup-content label { display: block; margin-bottom: 5px; font-weight: 600; }
            .ra-popup-content > div { margin-bottom: 15px; }
            .ra-popup-content > div:last-child { margin-bottom: 0 !important; }
            .ra-popup-content textarea { width: 100%; height: 100px; resize: none; }

            /* Elements */
            .ra-details { display: block; margin-bottom: 8px; border: 1px solid #603000; padding: 8px; border-radius: 4px; }
            .ra-details summary { font-weight: 600; cursor: pointer; }
            .ra-details p { margin: 10px 0 0 0; padding: 0; }

            /* Helpers */
            .ra-pa5 { padding: 5px !important; }
            .ra-mt15 { margin-top: 15px !important; }
            .ra-mb10 { margin-bottom: 10px !important; }
            .ra-mb15 { margin-bottom: 15px !important; }
            .ra-tal { text-align: left !important; }
            .ra-tac { text-align: center !important; }
            .ra-tar { text-align: right !important; }

            /* RESPONSIVE */
            @media (max-width: 480px) {
                .ra-fixed-widget {
                    position: relative !important;
                    top: 0;
                    left: 0;
                    display: block;
                    width: auto;
                    height: auto;
                    z-index: 1;
                }

                .ra-box-widget {
                    position: relative;
                    display: block;
                    box-sizing: border-box;
                    width: 97%;
                    height: auto;
                    margin: 10px auto;
                }

                .ra-table {
                    border-collapse: collapse !important;
                }

                .custom-close-button { display: none; }
                .ra-fixed-widget h3 { margin-bottom: 15px; }
                .ra-popup-content { width: 100%; }
            }
        `;
    },
    addScriptToQuickbar: function (name, script, callback) {
        let scriptData = `hotkey=&name=${name}&href=${encodeURI(script)}`;
        let action =
            '/game.php?screen=settings&mode=quickbar_edit&action=quickbar_edit&';

        jQuery.ajax({
            url: action,
            type: 'POST',
            data: scriptData + `&h=${csrf_token}`,
            success: function () {
                if (typeof callback === 'function') {
                    callback();
                }
            },
        });
    },
    arraysIntersection: function () {
        var result = [];
        var lists;

        if (arguments.length === 1) {
            lists = arguments[0];
        } else {
            lists = arguments;
        }

        for (var i = 0; i < lists.length; i++) {
            var currentList = lists[i];
            for (var y = 0; y < currentList.length; y++) {
                var currentValue = currentList[y];
                if (result.indexOf(currentValue) === -1) {
                    var existsInAll = true;
                    for (var x = 0; x < lists.length; x++) {
                        if (lists[x].indexOf(currentValue) === -1) {
                            existsInAll = false;
                            break;
                        }
                    }
                    if (existsInAll) {
                        result.push(currentValue);
                    }
                }
            }
        }
        return result;
    },
    buildUnitsPicker: function (
        selectedUnits = [],
        unitsToIgnore,
        type = 'checkbox'
    ) {
        let unitsTable = ``;

        let thUnits = ``;
        let tableRow = ``;

        game_data.units.forEach((unit) => {
            if (!unitsToIgnore.includes(unit)) {
                let checked = '';
                if (selectedUnits.includes(unit)) {
                    checked = `checked`;
                }

                thUnits += `
                    <th class="ra-tac">
                        <label for="unit_${unit}">
                            <img src="/graphic/unit/unit_${unit}.png">
                        </label>
                    </th>
                `;

                tableRow += `
                    <td class="ra-tac">
                        <input name="ra_chosen_units" type="${type}" ${checked} id="unit_${unit}" class="ra-unit-selector" value="${unit}" />
                    </td>
                `;
            }
        });

        unitsTable = `
            <table class="ra-table ra-table-v2" width="100%" id="raUnitSelector">
                <thead>
                    <tr>
                        ${thUnits}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${tableRow}
                    </tr>
                </tbody>
            </table>
        `;

        return unitsTable;
    },
    calculateCoinsNeededForNthNoble: function (noble) {
        return (noble * noble + noble) / 2;
    },
    calculateDistanceFromCurrentVillage: function (coord) {
        const x1 = game_data.village.x;
        const y1 = game_data.village.y;
        const [x2, y2] = coord.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },
    calculateDistance: function (from, to) {
        const [x1, y1] = from.split('|');
        const [x2, y2] = to.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },
    calculatePercentages: function (amount, total) {
        if (amount === undefined) amount = 0;
        return parseFloat((amount / total) * 100).toFixed(2);
    },
    calculateTimesByDistance: async function (distance) {
        const _self = this;

        const times = [];
        const travelTimes = [];

        const unitInfo = await _self.getWorldUnitInfo();
        const worldConfig = await _self.getWorldConfig();

        for (let [key, value] of Object.entries(unitInfo.config)) {
            times.push(value.speed);
        }

        const { speed, unit_speed } = worldConfig.config;

        times.forEach((time) => {
            let travelTime = Math.round(
                (distance * time * 60) / speed / unit_speed
            );
            travelTime = _self.secondsToHms(travelTime);
            travelTimes.push(travelTime);
        });

        return travelTimes;
    },
    checkValidLocation: function (type) {
        switch (type) {
            case 'screen':
                return this.allowedScreens.includes(
                    this.getParameterByName('screen')
                );
            case 'mode':
                return this.allowedModes.includes(
                    this.getParameterByName('mode')
                );
            default:
                return false;
        }
    },
    checkValidMarket: function () {
        if (this.market === 'yy') return true;
        return this.allowedMarkets.includes(this.market);
    },
    cleanString: function (string) {
        try {
            return decodeURIComponent(string).replace(/\+/g, ' ');
        } catch (error) {
            console.error(error, string);
            return string;
        }
    },
    copyToClipboard: function (string) {
        navigator.clipboard.writeText(string);
    },
    createUUID: function () {
        return crypto.randomUUID();
    },
    csvToArray: function (strData, strDelimiter = ',') {
        var objPattern = new RegExp(
            '(\\' +
                strDelimiter +
                '|\\r?\\n|\\r|^)' +
                '(?:"([^"]*(?:""[^"]*)*)"|' +
                '([^"\\' +
                strDelimiter +
                '\\r\\n]*))',
            'gi'
        );
        var arrData = [[]];
        var arrMatches = null;
        while ((arrMatches = objPattern.exec(strData))) {
            var strMatchedDelimiter = arrMatches[1];
            if (
                strMatchedDelimiter.length &&
                strMatchedDelimiter !== strDelimiter
            ) {
                arrData.push([]);
            }
            var strMatchedValue;

            if (arrMatches[2]) {
                strMatchedValue = arrMatches[2].replace(
                    new RegExp('""', 'g'),
                    '"'
                );
            } else {
                strMatchedValue = arrMatches[3];
            }
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        return arrData;
    },
    decryptAccountManangerTemplate: function (exportedTemplate) {
        const buildings = [];

        const binaryString = atob(exportedTemplate);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const payloadLength = bytes[0] + bytes[1] * 256;
        if (payloadLength <= bytes.length - 2) {
            const payload = bytes.slice(2, 2 + payloadLength);
            for (let i = 0; i < payload.length; i += 2) {
                const buildingId = payload[i];
                const buildingLevel = payload[i + 1];
                if (this.buildingsList[buildingId]) {
                    buildings.push({
                        id: this.buildingsList[buildingId],
                        upgrade: `+${buildingLevel}`,
                    });
                }
            }

            return buildings;
        }
    },
    filterVillagesByPlayerIds: function (playerIds, villages) {
        const playerVillages = [];
        villages.forEach((village) => {
            if (playerIds.includes(parseInt(village[4]))) {
                const coordinate = village[2] + '|' + village[3];
                playerVillages.push(coordinate);
            }
        });
        return playerVillages;
    },
    formatAsNumber: function (number) {
        return parseInt(number).toLocaleString('de');
    },
    formatDateTime: function (dateTime) {
        dateTime = new Date(dateTime);
        return (
            this.zeroPad(dateTime.getDate(), 2) +
            '/' +
            this.zeroPad(dateTime.getMonth() + 1, 2) +
            '/' +
            dateTime.getFullYear() +
            ' ' +
            this.zeroPad(dateTime.getHours(), 2) +
            ':' +
            this.zeroPad(dateTime.getMinutes(), 2) +
            ':' +
            this.zeroPad(dateTime.getSeconds(), 2)
        );
    },
    frequencyCounter: function (array) {
        return array.reduce(function (acc, curr) {
            if (typeof acc[curr] == 'undefined') {
                acc[curr] = 1;
            } else {
                acc[curr] += 1;
            }
            return acc;
        }, {});
    },
    generateRandomCoordinates: function () {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 1000);
        return `${x}|${y}`;
    },
    getAll: function (
        urls, // array of URLs
        onLoad, // called when any URL is loaded, params (index, data)
        onDone, // called when all URLs successfully loaded, no params
        onError // called when a URL load fails or if onLoad throws an exception, params (error)
    ) {
        var numDone = 0;
        var lastRequestTime = 0;
        var minWaitTime = this.delayBetweenRequests; // ms between requests
        loadNext();
        function loadNext() {
            if (numDone == urls.length) {
                onDone();
                return;
            }

            let now = Date.now();
            let timeElapsed = now - lastRequestTime;
            if (timeElapsed < minWaitTime) {
                let timeRemaining = minWaitTime - timeElapsed;
                setTimeout(loadNext, timeRemaining);
                return;
            }
            lastRequestTime = now;
            jQuery
                .get(urls[numDone])
                .done((data) => {
                    try {
                        onLoad(numDone, data);
                        ++numDone;
                        loadNext();
                    } catch (e) {
                        onError(e);
                    }
                })
                .fail((xhr) => {
                    onError(xhr);
                });
        }
    },
    getBuildingsInfo: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 365; // fetch config only once since they don't change
        const LAST_UPDATED_TIME =
            localStorage.getItem('buildings_info_last_updated') ?? 0;
        let buildingsInfo = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.buildingInfoInterface,
                });
                buildingsInfo = this.xml2json(jQuery(response));
                localStorage.setItem(
                    'buildings_info',
                    JSON.stringify(buildingsInfo)
                );
                localStorage.setItem(
                    'buildings_info_last_updated',
                    Date.parse(new Date())
                );
            } else {
                buildingsInfo = JSON.parse(
                    localStorage.getItem('buildings_info')
                );
            }
        } else {
            const response = await jQuery.ajax({
                url: this.buildingInfoInterface,
            });
            buildingsInfo = this.xml2json(jQuery(response));
            localStorage.setItem('buildings_info', JSON.stringify(unitInfo));
            localStorage.setItem(
                'buildings_info_last_updated',
                Date.parse(new Date())
            );
        }

        return buildingsInfo;
    },
    getContinentByCoord: function (coord) {
        let [x, y] = Array.from(coord.split('|')).map((e) => parseInt(e));
        for (let i = 0; i < 1000; i += 100) {
            //x axes
            for (let j = 0; j < 1000; j += 100) {
                //y axes
                if (i >= x && x < i + 100 && j >= y && y < j + 100) {
                    let nr_continent =
                        parseInt(y / 100) + '' + parseInt(x / 100);
                    return nr_continent;
                }
            }
        }
    },
    getContinentsFromCoordinates: function (coordinates) {
        let continents = [];

        coordinates.forEach((coord) => {
            const continent = twSDK.getContinentByCoord(coord);
            continents.push(continent);
        });

        return [...new Set(continents)];
    },
    getCoordFromString: function (string) {
        if (!string) return [];
        return string.match(this.coordsRegex)[0];
    },
    getContinentSectorField: function (coordinate) {
        const continent = this.getContinentByCoord(coordinate);
        let [coordX, coordY] = coordinate.split('|');

        let tempX = Number(coordX);
        let tempY = Number(coordY);

        //==== sector ====
        if (tempX >= 100) tempX = Number(String(coordX).substring(1));
        if (tempY >= 100) tempY = Number(String(coordY).substring(1));

        let xPos = Math.floor(tempX / 5);
        let yPos = Math.floor(tempY / 5);
        let sector = yPos * 20 + xPos;

        //==== field ====
        if (tempX >= 10) tempX = Number(String(tempX).substring(1));
        if (tempY >= 10) tempY = Number(String(tempY).substring(1));

        if (tempX >= 5) tempX = tempX - 5;
        if (tempY >= 5) tempY = tempY - 5;
        let field = tempY * 5 + tempX;

        let name = continent + ':' + sector + ':' + field;

        return name;
    },
    getDestinationCoordinates: function (config, tribes, players, villages) {
        const {
            playersInput,
            tribesInput,
            continents,
            minCoord,
            maxCoord,
            distCenter,
            center,
            excludedPlayers,
            enable20To1Limit,
            minPoints,
            maxPoints,
            selectiveRandomConfig,
        } = config;

        // get target coordinates
        const chosenPlayers = playersInput.split(',');
        const chosenTribes = tribesInput.split(',');

        const chosenPlayerIds = twSDK.getEntityIdsByArrayIndex(
            chosenPlayers,
            players,
            1
        );
        const chosenTribeIds = twSDK.getEntityIdsByArrayIndex(
            chosenTribes,
            tribes,
            2
        );

        const tribePlayers = twSDK.getTribeMembersById(chosenTribeIds, players);

        const mergedPlayersList = [...tribePlayers, ...chosenPlayerIds];
        let uniquePlayersList = [...new Set(mergedPlayersList)];

        const chosenExcludedPlayers = excludedPlayers.split(',');
        if (chosenExcludedPlayers.length > 0) {
            const excludedPlayersIds = twSDK.getEntityIdsByArrayIndex(
                chosenExcludedPlayers,
                players,
                1
            );
            excludedPlayersIds.forEach((item) => {
                uniquePlayersList = uniquePlayersList.filter(
                    (player) => player !== item
                );
            });
        }

        // filter by 20:1 rule
        if (enable20To1Limit) {
            let uniquePlayersListArray = [];
            uniquePlayersList.forEach((playerId) => {
                players.forEach((player) => {
                    if (parseInt(player[0]) === playerId) {
                        uniquePlayersListArray.push(player);
                    }
                });
            });

            const playersNotBiggerThen20Times = uniquePlayersListArray.filter(
                (player) => {
                    return (
                        parseInt(player[4]) <=
                        parseInt(game_data.player.points) * 20
                    );
                }
            );

            uniquePlayersList = playersNotBiggerThen20Times.map((player) =>
                parseInt(player[0])
            );
        }

        let coordinatesArray = twSDK.filterVillagesByPlayerIds(
            uniquePlayersList,
            villages
        );

        // filter by min and max village points
        if (minPoints || maxPoints) {
            let filteredCoordinatesArray = [];

            coordinatesArray.forEach((coordinate) => {
                villages.forEach((village) => {
                    const villageCoordinate = village[2] + '|' + village[3];
                    if (villageCoordinate === coordinate) {
                        filteredCoordinatesArray.push(village);
                    }
                });
            });

            filteredCoordinatesArray = filteredCoordinatesArray.filter(
                (village) => {
                    const villagePoints = parseInt(village[5]);
                    const minPointsNumber = parseInt(minPoints) || 26;
                    const maxPointsNumber = parseInt(maxPoints) || 12124;
                    if (
                        villagePoints > minPointsNumber &&
                        villagePoints < maxPointsNumber
                    ) {
                        return village;
                    }
                }
            );

            coordinatesArray = filteredCoordinatesArray.map(
                (village) => village[2] + '|' + village[3]
            );
        }

        // filter coordinates by continent
        if (continents.length) {
            let chosenContinentsArray = continents.split(',');
            chosenContinentsArray = chosenContinentsArray.map((item) =>
                item.trim()
            );

            const availableContinents =
                twSDK.getContinentsFromCoordinates(coordinatesArray);
            const filteredVillagesByContinent =
                twSDK.getFilteredVillagesByContinent(
                    coordinatesArray,
                    availableContinents
                );

            const isUserInputValid = chosenContinentsArray.every((item) =>
                availableContinents.includes(item)
            );

            if (isUserInputValid) {
                coordinatesArray = chosenContinentsArray
                    .map((continent) => {
                        if (continent.length && $.isNumeric(continent)) {
                            return [...filteredVillagesByContinent[continent]];
                        } else {
                            return;
                        }
                    })
                    .flat();
            } else {
                return [];
            }
        }

        // filter coordinates by a bounding box of coordinates
        if (minCoord.length && maxCoord.length) {
            const raMinCoordCheck = minCoord.match(twSDK.coordsRegex);
            const raMaxCoordCheck = maxCoord.match(twSDK.coordsRegex);

            if (raMinCoordCheck !== null && raMaxCoordCheck !== null) {
                const [minX, minY] = raMinCoordCheck[0].split('|');
                const [maxX, maxY] = raMaxCoordCheck[0].split('|');

                coordinatesArray = [...coordinatesArray].filter(
                    (coordinate) => {
                        const [x, y] = coordinate.split('|');
                        if (minX <= x && x <= maxX && minY <= y && y <= maxY) {
                            return coordinate;
                        }
                    }
                );
            } else {
                return [];
            }
        }

        // filter by radius
        if (distCenter.length && center.length) {
            if (!$.isNumeric(distCenter)) distCenter = 0;
            const raCenterCheck = center.match(twSDK.coordsRegex);

            if (distCenter !== 0 && raCenterCheck !== null) {
                let coordinatesArrayWithDistance = [];
                coordinatesArray.forEach((coordinate) => {
                    const distance = twSDK.calculateDistance(
                        raCenterCheck[0],
                        coordinate
                    );
                    coordinatesArrayWithDistance.push({
                        coord: coordinate,
                        distance: distance,
                    });
                });

                coordinatesArrayWithDistance =
                    coordinatesArrayWithDistance.filter((item) => {
                        return (
                            parseFloat(item.distance) <= parseFloat(distCenter)
                        );
                    });

                coordinatesArray = coordinatesArrayWithDistance.map(
                    (item) => item.coord
                );
            } else {
                return [];
            }
        }

        // apply multiplier
        if (selectiveRandomConfig) {
            const selectiveRandomizer = selectiveRandomConfig.split(';');

            const makeRepeated = (arr, repeats) =>
                Array.from({ length: repeats }, () => arr).flat();
            const multipliedCoordinatesArray = [];

            selectiveRandomizer.forEach((item) => {
                const [playerName, distribution] = item.split(':');
                if (distribution > 1) {
                    players.forEach((player) => {
                        if (
                            twSDK.cleanString(player[1]) ===
                            twSDK.cleanString(playerName)
                        ) {
                            let playerVillages =
                                twSDK.filterVillagesByPlayerIds(
                                    [parseInt(player[0])],
                                    villages
                                );
                            const flattenedPlayerVillagesArray = makeRepeated(
                                playerVillages,
                                distribution
                            );
                            multipliedCoordinatesArray.push(
                                flattenedPlayerVillagesArray
                            );
                        }
                    });
                }
            });

            coordinatesArray.push(...multipliedCoordinatesArray.flat());
        }

        return coordinatesArray;
    },
    getEntityIdsByArrayIndex: function (chosenItems, items, index) {
        const itemIds = [];
        chosenItems.forEach((chosenItem) => {
            items.forEach((item) => {
                if (
                    twSDK.cleanString(item[index]) ===
                    twSDK.cleanString(chosenItem)
                ) {
                    return itemIds.push(parseInt(item[0]));
                }
            });
        });
        return itemIds;
    },
    getFilteredVillagesByContinent: function (
        playerVillagesCoords,
        continents
    ) {
        let coords = [...playerVillagesCoords];
        let filteredVillagesByContinent = [];

        coords.forEach((coord) => {
            continents.forEach((continent) => {
                let currentVillageContinent = twSDK.getContinentByCoord(coord);
                if (currentVillageContinent === continent) {
                    filteredVillagesByContinent.push({
                        continent: continent,
                        coords: coord,
                    });
                }
            });
        });

        return twSDK.groupArrayByProperty(
            filteredVillagesByContinent,
            'continent',
            'coords'
        );
    },
    getGameFeatures: function () {
        const { Premium, FarmAssistent, AccountManager } = game_data.features;
        const isPA = Premium.active;
        const isLA = FarmAssistent.active;
        const isAM = AccountManager.active;
        return { isPA, isLA, isAM };
    },
    getKeyByValue: function (object, value) {
        return Object.keys(object).find((key) => object[key] === value);
    },
    getLandingTimeFromArrivesIn: function (arrivesIn) {
        const currentServerTime = twSDK.getServerDateTimeObject();
        const [hours, minutes, seconds] = arrivesIn.split(':');
        const totalSeconds = +hours * 3600 + +minutes * 60 + +seconds;
        const arrivalDateTime = new Date(
            currentServerTime.getTime() + totalSeconds * 1000
        );
        return arrivalDateTime;
    },
    getLastCoordFromString: function (string) {
        if (!string) return [];
        const regex = this.coordsRegex;
        let match;
        let lastMatch;
        while ((match = regex.exec(string)) !== null) {
            lastMatch = match;
        }
        return lastMatch ? lastMatch[0] : [];
    },
    getPagesToFetch: function () {
        let list_pages = [];

        const currentPage = twSDK.getParameterByName('page');
        if (currentPage == '-1') return [];

        if (
            document
                .getElementsByClassName('vis')[1]
                .getElementsByTagName('select').length > 0
        ) {
            Array.from(
                document
                    .getElementsByClassName('vis')[1]
                    .getElementsByTagName('select')[0]
            ).forEach(function (item) {
                list_pages.push(item.value);
            });
            list_pages.pop();
        } else if (
            document.getElementsByClassName('paged-nav-item').length > 0
        ) {
            let nr = 0;
            Array.from(
                document.getElementsByClassName('paged-nav-item')
            ).forEach(function (item) {
                let current = item.href;
                current = current.split('page=')[0] + 'page=' + nr;
                nr++;
                list_pages.push(current);
            });
        } else {
            let current_link = window.location.href;
            list_pages.push(current_link);
        }
        list_pages.shift();

        return list_pages;
    },
    getParameterByName: function (name, url = window.location.href) {
        return new URL(url).searchParams.get(name);
    },
    getRelativeImagePath: function (url) {
        const urlParts = url.split('/');
        return `/${urlParts[5]}/${urlParts[6]}/${urlParts[7]}`;
    },
    getServerDateTimeObject: function () {
        const formattedTime = this.getServerDateTime();
        return new Date(formattedTime);
    },
    getServerDateTime: function () {
        const serverTime = jQuery('#serverTime').text();
        const serverDate = jQuery('#serverDate').text();
        const [day, month, year] = serverDate.split('/');
        const serverTimeFormatted =
            year + '-' + month + '-' + day + ' ' + serverTime;
        return serverTimeFormatted;
    },
    getTimeFromString: function (timeLand) {
        let dateLand = '';
        let serverDate = document
            .getElementById('serverDate')
            .innerText.split('/');

        let TIME_PATTERNS = {
            today: 'today at %s',
            tomorrow: 'tomorrow at %s',
            later: 'on %1 at %2',
        };

        if (window.lang) {
            TIME_PATTERNS = {
                today: window.lang['aea2b0aa9ae1534226518faaefffdaad'],
                tomorrow: window.lang['57d28d1b211fddbb7a499ead5bf23079'],
                later: window.lang['0cb274c906d622fa8ce524bcfbb7552d'],
            };
        }

        let todayPattern = new RegExp(
            TIME_PATTERNS.today.replace('%s', '([\\d+|:]+)')
        ).exec(timeLand);
        let tomorrowPattern = new RegExp(
            TIME_PATTERNS.tomorrow.replace('%s', '([\\d+|:]+)')
        ).exec(timeLand);
        let laterDatePattern = new RegExp(
            TIME_PATTERNS.later
                .replace('%1', '([\\d+|\\.]+)')
                .replace('%2', '([\\d+|:]+)')
        ).exec(timeLand);

        if (todayPattern !== null) {
            // today
            dateLand =
                serverDate[0] +
                '/' +
                serverDate[1] +
                '/' +
                serverDate[2] +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        } else if (tomorrowPattern !== null) {
            // tomorrow
            let tomorrowDate = new Date(
                serverDate[1] + '/' + serverDate[0] + '/' + serverDate[2]
            );
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            dateLand =
                ('0' + tomorrowDate.getDate()).slice(-2) +
                '/' +
                ('0' + (tomorrowDate.getMonth() + 1)).slice(-2) +
                '/' +
                tomorrowDate.getFullYear() +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        } else {
            // on
            let on = timeLand.match(/\d+.\d+/)[0].split('.');
            dateLand =
                on[0] +
                '/' +
                on[1] +
                '/' +
                serverDate[2] +
                ' ' +
                timeLand.match(/\d+:\d+:\d+:\d+/)[0];
        }

        return dateLand;
    },
    getTravelTimeInSecond: function (distance, unitSpeed) {
        let travelTime = distance * unitSpeed * 60;
        if (travelTime % 1 > 0.5) {
            return (travelTime += 1);
        } else {
            return travelTime;
        }
    },
    getTribeMembersById: function (tribeIds, players) {
        const tribeMemberIds = [];
        players.forEach((player) => {
            if (tribeIds.includes(parseInt(player[2]))) {
                tribeMemberIds.push(parseInt(player[0]));
            }
        });
        return tribeMemberIds;
    },
    getTroop: function (unit) {
        return parseInt(
            document.units[unit].parentNode
                .getElementsByTagName('a')[1]
                .innerHTML.match(/\d+/),
            10
        );
    },
    getVillageBuildings: function () {
        const buildings = game_data.village.buildings;
        const villageBuildings = [];

        for (let [key, value] of Object.entries(buildings)) {
            if (value > 0) {
                villageBuildings.push({
                    building: key,
                    level: value,
                });
            }
        }

        return villageBuildings;
    },
    getWorldConfig: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 7;
        const LAST_UPDATED_TIME =
            localStorage.getItem('world_config_last_updated') ?? 0;
        let worldConfig = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.worldInfoInterface,
                });
                worldConfig = this.xml2json(jQuery(response));
                localStorage.setItem(
                    'world_config',
                    JSON.stringify(worldConfig)
                );
                localStorage.setItem(
                    'world_config_last_updated',
                    Date.parse(new Date())
                );
            } else {
                worldConfig = JSON.parse(localStorage.getItem('world_config'));
            }
        } else {
            const response = await jQuery.ajax({
                url: this.worldInfoInterface,
            });
            worldConfig = this.xml2json(jQuery(response));
            localStorage.setItem('world_config', JSON.stringify(unitInfo));
            localStorage.setItem(
                'world_config_last_updated',
                Date.parse(new Date())
            );
        }

        return worldConfig;
    },
    getWorldUnitInfo: async function () {
        const TIME_INTERVAL = 60 * 60 * 1000 * 24 * 7;
        const LAST_UPDATED_TIME =
            localStorage.getItem('units_info_last_updated') ?? 0;
        let unitInfo = [];

        if (LAST_UPDATED_TIME !== null) {
            if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
                const response = await jQuery.ajax({
                    url: this.unitInfoInterface,
                });
                unitInfo = this.xml2json(jQuery(response));
                localStorage.setItem('units_info', JSON.stringify(unitInfo));
                localStorage.setItem(
                    'units_info_last_updated',
                    Date.parse(new Date())
                );
            } else {
                unitInfo = JSON.parse(localStorage.getItem('units_info'));
            }
        } else {
            const response = await jQuery.ajax({
                url: this.unitInfoInterface,
            });
            unitInfo = this.xml2json(jQuery(response));
            localStorage.setItem('units_info', JSON.stringify(unitInfo));
            localStorage.setItem(
                'units_info_last_updated',
                Date.parse(new Date())
            );
        }

        return unitInfo;
    },
    groupArrayByProperty: function (array, property, filter) {
        return array.reduce(function (accumulator, object) {
            // get the value of our object(age in our case) to use for group    the array as the array key
            const key = object[property];
            // if the current value is similar to the key(age) don't accumulate the transformed array and leave it empty
            if (!accumulator[key]) {
                accumulator[key] = [];
            }
            // add the value to the array
            accumulator[key].push(object[filter]);
            // return the transformed array
            return accumulator;
            // Also we also set the initial value of reduce() to an empty object
        }, {});
    },
    isArcherWorld: function () {
        return this.units.includes('archer');
    },
    isChurchWorld: function () {
        return 'church' in this.village.buildings;
    },
    isPaladinWorld: function () {
        return this.units.includes('knight');
    },
    isWatchTowerWorld: function () {
        return 'watchtower' in this.village.buildings;
    },
    loadJS: function (url, callback) {
        let scriptTag = document.createElement('script');
        scriptTag.src = url;
        scriptTag.onload = callback;
        scriptTag.onreadystatechange = callback;
        document.body.appendChild(scriptTag);
    },
    redirectTo: function (location) {
        window.location.assign(game_data.link_base_pure + location);
    },
    removeDuplicateObjectsFromArray: function (array, prop) {
        return array.filter((obj, pos, arr) => {
            return arr.map((mapObj) => mapObj[prop]).indexOf(obj[prop]) === pos;
        });
    },
    renderBoxWidget: function (body, id, mainClass, customStyle) {
        const globalStyle = this.addGlobalStyle();

        const content = `
            <div class="${mainClass} ra-box-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(this.scriptData.name)}</h3>
                </div>
                <div class="${mainClass}-body">
                    ${body}
                </div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>
                            ${this.tt(this.scriptData.name)} ${
            this.scriptData.version
        }
                        </strong> -
                        <a href="${
                            this.scriptData.authorUrl
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.scriptData.author}
                        </a> -
                        <a href="${
                            this.scriptData.helpLink
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.tt('Help')}
                        </a>
                    </small>
                </div>
            </div>
            <style>
                .${mainClass} { position: relative; display: block; width: 100%; height: auto; clear: both; margin: 10px 0 15px; border: 1px solid #603000; box-sizing: border-box; background: #f4e4bc; }
                .${mainClass} * { box-sizing: border-box; }
                .${mainClass} > div { padding: 10px; }
                .${mainClass} .btn-confirm-yes { padding: 3px; }
                .${mainClass}-header { display: flex; align-items: center; justify-content: space-between; background-color: #c1a264 !important; background-image: url(/graphic/screen/tableheader_bg3.png); background-repeat: repeat-x; }
                .${mainClass}-header h3 { margin: 0; padding: 0; line-height: 1; }
                .${mainClass}-body p { font-size: 14px; }
                .${mainClass}-body label { display: block; font-weight: 600; margin-bottom: 6px; }
                
                ${globalStyle}

                /* Custom Style */
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            jQuery('#contentContainer').prepend(content);
            jQuery('#mobileContent').prepend(content);
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },
    renderFixedWidget: function (
        body,
        id,
        mainClass,
        customStyle,
        width,
        customName = this.scriptData.name
    ) {
        const globalStyle = this.addGlobalStyle();

        const content = `
            <div class="${mainClass} ra-fixed-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(customName)}</h3>
                </div>
                <div class="${mainClass}-body">
                    ${body}
                </div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>
                            ${this.tt(customName)} ${this.scriptData.version}
                        </strong> -
                        <a href="${
                            this.scriptData.authorUrl
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.scriptData.author}
                        </a> -
                        <a href="${
                            this.scriptData.helpLink
                        }" target="_blank" rel="noreferrer noopener">
                            ${this.tt('Help')}
                        </a>
                    </small>
                </div>
                <a class="popup_box_close custom-close-button" href="#">&nbsp;</a>
            </div>
            <style>
                .${mainClass} { position: fixed; top: 10vw; right: 10vw; z-index: 99999; border: 2px solid #7d510f; border-radius: 10px; padding: 10px; width: ${
            width ?? '360px'
        }; overflow-y: auto; padding: 10px; background: #e3d5b3 url('/graphic/index/main_bg.jpg') scroll right top repeat; }
                .${mainClass} * { box-sizing: border-box; }

                ${globalStyle}

                /* Custom Style */
                .custom-close-button { right: 0; top: 0; }
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            if (mobiledevice) {
                jQuery('#content_value').prepend(content);
            } else {
                jQuery('#contentContainer').prepend(content);
                jQuery(`#${id}`).draggable({
                    cancel: '.ra-table, input, textarea, button, select, option',
                });

                jQuery(`#${id} .custom-close-button`).on('click', function (e) {
                    e.preventDefault();
                    jQuery(`#${id}`).remove();
                });
            }
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },
    scriptInfo: function (scriptData = this.scriptData) {
        return `[${scriptData.name} ${scriptData.version}]`;
    },
    secondsToHms: function (timestamp) {
        const hours = Math.floor(timestamp / 60 / 60);
        const minutes = Math.floor(timestamp / 60) - hours * 60;
        const seconds = timestamp % 60;
        return (
            hours.toString().padStart(2, '0') +
            ':' +
            minutes.toString().padStart(2, '0') +
            ':' +
            seconds.toString().padStart(2, '0')
        );
    },
    setUpdateProgress: function (elementToUpdate, valueToSet) {
        jQuery(elementToUpdate).text(valueToSet);
    },
    sortArrayOfObjectsByKey: function (array, key) {
        return array.sort((a, b) => b[key] - a[key]);
    },
    startProgressBar: function (total) {
        const width = jQuery('#content_value')[0].clientWidth;
        const preloaderContent = `
            <div id="progressbar" class="progress-bar" style="margin-bottom:12px;">
                <span class="count label">0/${total}</span>
                <div id="progress">
                    <span class="count label" style="width: ${width}px;">
                        0/${total}
                    </span>
                </div>
            </div>
        `;

        if (this.isMobile) {
            jQuery('#content_value').eq(0).prepend(preloaderContent);
        } else {
            jQuery('#contentContainer').eq(0).prepend(preloaderContent);
        }
    },
    sumOfArrayItemValues: function (array) {
        return array.reduce((a, b) => a + b, 0);
    },
    randomItemPickerString: function (items, splitter = ' ') {
        const itemsArray = items.split(splitter);
        const chosenIndex = Math.floor(Math.random() * itemsArray.length);
        return itemsArray[chosenIndex];
    },
    randomItemPickerArray: function (items) {
        const chosenIndex = Math.floor(Math.random() * items.length);
        return items[chosenIndex];
    },
    timeAgo: function (seconds) {
        var interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + ' Y';

        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + ' M';

        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + ' D';

        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + ' H';

        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + ' m';

        return Math.floor(seconds) + ' s';
    },
    tt: function (string) {
        if (this.translations[game_data.locale] !== undefined) {
            return this.translations[game_data.locale][string];
        } else {
            return this.translations['en_DK'][string];
        }
    },
    toggleUploadButtonStatus: function (elementToToggle) {
        jQuery(elementToToggle).attr('disabled', (i, v) => !v);
    },
    updateProgress: function (elementToUpate, itemsLength, index) {
        jQuery(elementToUpate).text(`${index}/${itemsLength}`);
    },
    updateProgressBar: function (index, total) {
        jQuery('#progress').css('width', `${((index + 1) / total) * 100}%`);
        jQuery('.count').text(`${index + 1}/${total}`);
        if (index + 1 == total) {
            jQuery('#progressbar').fadeOut(1000);
        }
    },
    xml2json: function ($xml) {
        let data = {};
        const _self = this;
        $.each($xml.children(), function (i) {
            let $this = $(this);
            if ($this.children().length > 0) {
                data[$this.prop('tagName')] = _self.xml2json($this);
            } else {
                data[$this.prop('tagName')] = $.trim($this.text());
            }
        });
        return data;
    },
    worldDataAPI: async function (entity) {
        const TIME_INTERVAL = 60 * 60 * 1000; // fetch data every hour
        const LAST_UPDATED_TIME = localStorage.getItem(
            `${entity}_last_updated`
        );

        // check if entity is allowed and can be fetched
        const allowedEntities = ['village', 'player', 'ally', 'conquer'];
        if (!allowedEntities.includes(entity)) {
            throw new Error(`Entity ${entity} does not exist!`);
        }

        // initial world data
        const worldData = {};

        const dbConfig = {
            village: {
                dbName: 'villagesDb',
                dbTable: 'villages',
                key: 'villageId',
                url: twSDK.worldDataVillages,
            },
            player: {
                dbName: 'playersDb',
                dbTable: 'players',
                key: 'playerId',
                url: twSDK.worldDataPlayers,
            },
            ally: {
                dbName: 'tribesDb',
                dbTable: 'tribes',
                key: 'tribeId',
                url: twSDK.worldDataTribes,
            },
            conquer: {
                dbName: 'conquerDb',
                dbTable: 'conquer',
                key: '',
                url: twSDK.worldDataConquests,
            },
        };

        // Helpers: Fetch entity data and save to localStorage
        const fetchDataAndSave = async () => {
            const DATA_URL = dbConfig[entity].url;

            try {
                // fetch data
                const response = await jQuery.ajax(DATA_URL);
                const data = twSDK.csvToArray(response);
                let responseData = [];

                // prepare data to be saved in db
                switch (entity) {
                    case 'village':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    villageId: parseInt(item[0]),
                                    villageName: twSDK.cleanString(item[1]),
                                    villageX: item[2],
                                    villageY: item[3],
                                    playerId: parseInt(item[4]),
                                    villagePoints: parseInt(item[5]),
                                    villageType: parseInt(item[6]),
                                };
                            });
                        break;
                    case 'player':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    playerId: parseInt(item[0]),
                                    playerName: twSDK.cleanString(item[1]),
                                    tribeId: parseInt(item[2]),
                                    villages: parseInt(item[3]),
                                    points: parseInt(item[4]),
                                    rank: parseInt(item[5]),
                                };
                            });
                        break;
                    case 'ally':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    tribeId: parseInt(item[0]),
                                    tribeName: twSDK.cleanString(item[1]),
                                    tribeTag: twSDK.cleanString(item[2]),
                                    players: parseInt(item[3]),
                                    villages: parseInt(item[4]),
                                    points: parseInt(item[5]),
                                    allPoints: parseInt(item[6]),
                                    rank: parseInt(item[7]),
                                };
                            });
                        break;
                    case 'conquer':
                        responseData = data
                            .filter((item) => {
                                if (item[0] != '') {
                                    return item;
                                }
                            })
                            .map((item) => {
                                return {
                                    villageId: parseInt(item[0]),
                                    unixTimestamp: parseInt(item[1]),
                                    newPlayerId: parseInt(item[2]),
                                    newPlayerId: parseInt(item[3]),
                                    oldTribeId: parseInt(item[4]),
                                    newTribeId: parseInt(item[5]),
                                    villagePoints: parseInt(item[6]),
                                };
                            });
                        break;
                    default:
                        return [];
                }

                // save data in db
                saveToIndexedDbStorage(
                    dbConfig[entity].dbName,
                    dbConfig[entity].dbTable,
                    dbConfig[entity].key,
                    responseData
                );

                // update last updated localStorage item
                localStorage.setItem(
                    `${entity}_last_updated`,
                    Date.parse(new Date())
                );

                return responseData;
            } catch (error) {
                throw Error(`Error fetching ${DATA_URL}`);
            }
        };

        // Helpers: Save to IndexedDb storage
        async function saveToIndexedDbStorage(dbName, table, keyId, data) {
            const dbConnect = indexedDB.open(dbName);

            dbConnect.onupgradeneeded = function () {
                const db = dbConnect.result;
                if (keyId.length) {
                    db.createObjectStore(table, {
                        keyPath: keyId,
                    });
                } else {
                    db.createObjectStore(table, {
                        autoIncrement: true,
                    });
                }
            };

            dbConnect.onsuccess = function () {
                const db = dbConnect.result;
                const transaction = db.transaction(table, 'readwrite');
                const store = transaction.objectStore(table);
                store.clear(); // clean store from items before adding new ones

                data.forEach((item) => {
                    store.put(item);
                });

                UI.SuccessMessage('Database updated!');
            };
        }

        // Helpers: Read all villages from indexedDB
        function getAllData(dbName, table) {
            return new Promise((resolve, reject) => {
                const dbConnect = indexedDB.open(dbName);

                dbConnect.onsuccess = () => {
                    const db = dbConnect.result;

                    const dbQuery = db
                        .transaction(table, 'readwrite')
                        .objectStore(table)
                        .getAll();

                    dbQuery.onsuccess = (event) => {
                        resolve(event.target.result);
                    };

                    dbQuery.onerror = (event) => {
                        reject(event.target.error);
                    };
                };

                dbConnect.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        // Helpers: Transform an array of objects into an array of arrays
        function objectToArray(arrayOfObjects, entity) {
            switch (entity) {
                case 'village':
                    return arrayOfObjects.map((item) => [
                        item.villageId,
                        item.villageName,
                        item.villageX,
                        item.villageY,
                        item.playerId,
                        item.villagePoints,
                        item.villageType,
                    ]);
                case 'player':
                    return arrayOfObjects.map((item) => [
                        item.playerId,
                        item.playerName,
                        item.tribeId,
                        item.villages,
                        item.points,
                        item.rank,
                    ]);
                case 'ally':
                    return arrayOfObjects.map((item) => [
                        item.tribeId,
                        item.tribeName,
                        item.tribeTag,
                        item.players,
                        item.villages,
                        item.points,
                        item.allPoints,
                        item.rank,
                    ]);
                case 'conquer':
                    return arrayOfObjects.map((item) => [
                        item.villageId,
                        item.unixTimestamp,
                        item.newPlayerId,
                        item.newPlayerId,
                        item.oldTribeId,
                        item.newTribeId,
                        item.villagePoints,
                    ]);
                default:
                    return [];
            }
        }

        // decide what to do based on current time and last updated entity time
        if (LAST_UPDATED_TIME !== null) {
            if (
                Date.parse(new Date()) >=
                parseInt(LAST_UPDATED_TIME) + TIME_INTERVAL
            ) {
                worldData[entity] = await fetchDataAndSave();
            } else {
                worldData[entity] = await getAllData(
                    dbConfig[entity].dbName,
                    dbConfig[entity].dbTable
                );
            }
        } else {
            worldData[entity] = await fetchDataAndSave();
        }

        // transform the data so at the end an array of array is returned
        worldData[entity] = objectToArray(worldData[entity], entity);

        return worldData[entity];
    },
    zeroPad: function (num, count) {
        var numZeropad = num + '';
        while (numZeropad.length < count) {
            numZeropad = '0' + numZeropad;
        }
        return numZeropad;
    },

    // initialize library
    init: async function (scriptConfig) {
        const {
            scriptData,
            translations,
            allowedMarkets,
            allowedScreens,
            allowedModes,
            isDebug,
            enableCountApi,
        } = scriptConfig;

        this.scriptData = scriptData;
        this.translations = translations;
        this.allowedMarkets = allowedMarkets;
        this.allowedScreens = allowedScreens;
        this.allowedModes = allowedModes;
        this.enableCountApi = enableCountApi;
        this.isDebug = isDebug;

        twSDK._initDebug();
    },
};

(async function () {
    // Initialize Library
    await twSDK.init(scriptConfig);
    const scriptInfo = twSDK.scriptInfo();

    // Entry point
    (async () => {
        // fetch world data
        const { villages, players, tribes } = await fetchWorldData();

        // build user interface
        buildUI({ villages, players, tribes });

        // register user action handlers
        onClickGenerateFakeScriptBtn(villages, players, tribes);
        onClickSetUnitAmounts();

        // register event handlers
        onUserInputEventHandlers();
    })();

    // Render: Build the user interface
    function buildUI(worldData) {
        const contentBody = prepareContent(worldData);

        const customStyle = `
                .ra-grid { display: grid; grid-template-columns: 1fr 1fr; grid-gap: 15px; }
                .ra-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
                .ra-grid-5 { grid-template-columns: 1fr 1fr 1fr 1fr 1fr; }

                .ra-fieldset { border-color: #c1a264; border-width: 1px; }
                .ra-fieldset legend { font-weight: 600; padding: 0 10px; font-size: 13px; margin-bottom: 5px; }
                .ra-fieldset select { width: 100%; padding: 2px 5px; font-size: 14px; line-height: 1; }
                .ra-fieldset input[type="text"] { width: 60px; margin: 0 auto; padding: 1px 5px; font-size: 14px; line-height: 1; text-align: center; }
                .ra-input { width: 100% !important; padding: 2px 5px; font-size: 14px; line-height: 1; text-align: left !important; }
                
                .ra-dflex { display: flex; }

                .ra-unit-type { display: block; cursor: pointer; }

                .ra-btn-set-units { min-height: 60px; align-items: flex-start; justify-content: flex-start; width: auto; }
                .ra-btn-set-units span { width: auto; margin: 6px 15px; line-height: 1; display: flex; justify-content: center; align-items: center; }
                .ra-btn-set-units span img { margin-left: 5px; }

                .ra-table { border-spacing: 2px !important; border-collapse: separate !important; }
                .ra-table th { padding: 4px 5px; }

                .ra-label { font-weight: normal; display: inline-block; margin-bottom: 8px; }

                .ra-info { display: block; margin-top: 5px; }
            `;

        twSDK.renderBoxWidget(
            contentBody,
            'raFakeScriptGenerator',
            'ra-fake-script-generator',
            customStyle
        );
    }

    // Action Handler: Handle click on generate fake script button
    function onClickGenerateFakeScriptBtn(villages, players, tribes) {
        jQuery('#raGenerateFakeScriptBtn').on('click', function (e) {
            e.preventDefault();

            // get user input
            const {
                sendMode,
                unitsAndAmounts,
                coordinates,
                coordinatesFillMode,
                playersInput,
                tribesInput,
                continents,
                minCoord,
                maxCoord,
                distCenter,
                center,
                whatSend,
                excludedPlayers,
                enable20To1Limit,
                minPoints,
                maxPoints,
                selectiveRandomConfig,
            } = collectUserInput();

            if (whatSend === 'custom') {
                if (unitsAndAmounts.length === 0) {
                    UI.ErrorMessage(
                        twSDK.tt('You must choose at least one unit to send!')
                    );
                    return;
                }
            }

            if (coordinatesFillMode === 'manual') {
                if (coordinates.length === 0) {
                    UI.ErrorMessage(twSDK.tt('Coordinates field is required!'));
                    return;
                }

                const fakeScriptConfig = {
                    unitAmounts: unitsAndAmounts,
                    coords: coordinates,
                    sendMode: sendMode,
                    whatSend: whatSend,
                };

                const script = generateScript(
                    sendMode,
                    unitsAndAmounts,
                    coordinates,
                    whatSend
                );

                jQuery(this).addClass('btn-confirm-yes');

                const popupContent = `
                        <div class="ra-popup-content">
                            <div class="ra-mb15">
                                <label for="rafakeScript">${twSDK.tt(
                                    'Add this script to your Quick-bar'
                                )}</label>
                                <textarea class="ra-textarea" id="rafakeScript">${script
                                    .replace(/^\/|\/$/g, '')
                                    .trim()}</textarea>
                                <a href="/game.php?screen=settings&mode=quickbar_edit" class="btn" target="_blank" rel="noopener noreferrer">
                                    ${twSDK.tt('Add new Link')}
                                </a>
                            </div>
                        </div>
                    `;

                Dialog.show('content', popupContent);
            } else if (coordinatesFillMode === 'automatic') {
                if (playersInput.length === 0 && tribesInput.length === 0) {
                    UI.ErrorMessage(
                        twSDK.tt(
                            'You must select at least one player or one tribe!'
                        )
                    );
                    return;
                }

                if (minCoord.length === 0 && maxCoord.length !== 0) {
                    UI.ErrorMessage(
                        twSDK.tt(
                            'Minimum coordinates and maximum coordinates filter should work together!'
                        )
                    );
                    return;
                }

                if (minCoord.length !== 0 && maxCoord.length === 0) {
                    UI.ErrorMessage(
                        twSDK.tt(
                            'Minimum coordinates and maximum coordinates filter should work together!'
                        )
                    );
                    return;
                }

                if (distCenter.length !== 0 && center.length === 0) {
                    UI.ErrorMessage(
                        twSDK.tt('Radius filtering needs both fields filled!')
                    );
                    return;
                }

                if (distCenter.length === 0 && center.length !== 0) {
                    UI.ErrorMessage(
                        twSDK.tt('Radius filtering needs both fields filled!')
                    );
                    return;
                }

                const config = {
                    sendMode,
                    unitsAndAmounts,
                    playersInput,
                    tribesInput,
                    continents,
                    minCoord,
                    maxCoord,
                    distCenter,
                    center,
                    whatSend,
                    excludedPlayers,
                    enable20To1Limit,
                    minPoints,
                    maxPoints,
                    selectiveRandomConfig,
                };

                const coordinatesArray = twSDK.getDestinationCoordinates(
                    config,
                    tribes,
                    players,
                    villages
                );

                if (coordinatesArray.length) {
                    const coordinatesText = coordinatesArray.join(' ');

                    const scriptNew = `javascript:var config=${JSON.stringify(
                        config
                    )};$.ajax({type: 'GET',url: 'https://twscripts.dev/scripts/fakeScriptClient.js',dataType: 'script',cache: true});`;

                    jQuery(this).addClass('btn-confirm-yes');

                    const popupContent = `
                            <div class="ra-popup-content">
                                <div>
                                    <label for="rafakeScriptNew">${twSDK.tt(
                                        'Add this script to your Quick-bar'
                                    )}</label>
                                    <textarea class="ra-textarea" id="rafakeScriptNew">${scriptNew
                                        .replace(/^\/|\/$/g, '')
                                        .trim()}</textarea>
                                    <a href="/game.php?screen=settings&mode=quickbar_edit" class="btn" target="_blank" rel="noopener noreferrer">
                                        ${twSDK.tt('Add new Link')}
                                    </a>
                                </div>
                                <div>
                                    <label for="rafakeCoordinates">${twSDK.tt(
                                        'Coordinates'
                                    )} ${coordinatesArray.length}</label>
                                    <textarea class="ra-textarea" id="rafakeCoordinates">${coordinatesText}</textarea>
                                </div>
                            </div>
                        `;

                    Dialog.show('content', popupContent);
                } else {
                    UI.ErrorMessage(
                        twSDK.tt(
                            'Script could not be generated since nothing could fit into specified criteria!'
                        )
                    );
                }
            } else {
                UI.ErrorMessage(twSDK.tt('Invalid user input!'));
            }
        });
    }

    // Action Handler: Handle click on set unit amounts button
    function onClickSetUnitAmounts() {
        jQuery('.ra-btn-set-units').on('click', function (e) {
            e.preventDefault();

            const currentChosenUnits = JSON.parse(
                jQuery(this).attr('data-units-amounts')
            );

            jQuery('input[name="ra_unit_amounts"]').val(0);

            for (let unit in currentChosenUnits) {
                jQuery(`#unit_${unit}`).val(currentChosenUnits[unit]);
            }

            jQuery('.ra-btn-set-units').removeClass('btn-confirm-yes');
            jQuery(this).addClass('btn-confirm-yes');
        });
    }

    // Action Handler: Handle click on set unit amounts button
    function onUserInputEventHandlers() {
        jQuery('.ra-btn-set-units').on('click', function (e) {
            e.preventDefault();

            const currentChosenUnits = JSON.parse(
                jQuery(this).attr('data-units-amounts')
            );

            jQuery('input[name="ra_unit_amounts"]').val(0);

            for (let unit in currentChosenUnits) {
                jQuery(`#unit_${unit}`).val(currentChosenUnits[unit]);
            }

            jQuery('.ra-btn-set-units').removeClass('btn-confirm-yes');
            jQuery(this).addClass('btn-confirm-yes');
        });

        jQuery('#raCoordinatesField').change(function () {
            if (this.value === 'automatic') {
                jQuery('#raSelectPlayerTribe').show();
                jQuery('#raCoordinatesBox').hide();
                jQuery('#raAdvancedFilters').show();
            } else {
                jQuery('#raSelectPlayerTribe').hide();
                jQuery('#raCoordinatesBox').show();
                jQuery('#raAdvancedFilters').hide();
            }
        });

        jQuery('#raSendFakesType').change(function () {
            if (this.value === 'selective_random') {
                jQuery('#raSelectiveRandomSelectors').show();
            } else {
                jQuery('#raSelectiveRandomSelectors').hide();
            }
        });

        jQuery('#raWhatSend').change(function () {
            if (this.value === 'custom') {
                jQuery('#raUnitAmountsConfigurator').show();
                jQuery('#raUnitAmountsSelectiveSendAllConfigurator').hide();
            } else if (this.value === 'selective_send_all') {
                jQuery('#raUnitAmountsConfigurator').hide();
                jQuery('#raUnitAmountsSelectiveSendAllConfigurator').show();
            } else {
                jQuery('#raUnitAmountsConfigurator').hide();
                jQuery('#raUnitAmountsSelectiveSendAllConfigurator').hide();
            }
        });

        jQuery('.ra-unit-amount, .ra-unit-amount-to-keep').blur(function () {
            // handle cases when field is filled incorrectly (example user input is non numeric)
            if (!$.isNumeric(this.value)) this.value = 0;
        });

        jQuery('#raCoordinates').blur(function () {
            const coordinates = this.value.match(twSDK.coordsRegex);
            if (coordinates) {
                this.value = coordinates.join(' ');
                jQuery('#coordsAmount').text(coordinates.length);
            } else {
                this.value = '';
                jQuery('#coordsAmount').text(0);
            }
        });

        jQuery('.ra-toggle-unit-checked').on('change', function (e) {
            const isChecked = jQuery(this).is(':checked');
            if (isChecked) {
                jQuery(this)
                    .parent()
                    .find('.ra-unit-amount-to-keep')
                    .removeAttr('disabled');
            } else {
                jQuery(this)
                    .parent()
                    .find('.ra-unit-amount-to-keep')
                    .attr('disabled', true);
            }
        });
    }

    // Helper: Generate content for user interface
    function prepareContent(worldData) {
        const { villages, players, tribes } = worldData;

        const sortedPlayersByRanking = players.sort((a, b) => a[5] - b[5]);
        const sortedTribesByRanking = tribes.sort((a, b) => a[7] - b[7]);

        const playersDropdown = buildDropDown(
            sortedPlayersByRanking,
            'Players'
        );
        const tribesDropdown = buildDropDown(sortedTribesByRanking, 'Tribes');
        const excludedPlayersDropdown = buildDropDown(
            sortedPlayersByRanking,
            'ExcludedPlayers'
        );
        const unitsTableChoser = buildUnitsChoserTable();
        const selectiveSendAllHtml = buildSelectiveSendAll();

        return `
                <div class="ra-mb15">
                    <div class="ra-grid ra-grid-3">
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt(
                                'How to fill coordinates?'
                            )}</legend>
                            <select id="raCoordinatesField">
                                <option value="manual">${twSDK.tt(
                                    'Manually'
                                )}</option>
                                <option value="automatic" selected>${twSDK.tt(
                                    'Automatically'
                                )}</option>
                            </select>
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('How to send fakes?')}</legend>
                            <select id="raSendFakesType">
                                <option value="random" selected>${twSDK.tt(
                                    'Randomly'
                                )}</option>
                                <option value="sequential">${twSDK.tt(
                                    'Sequential'
                                )}</option>
                                <option value="selective_random">${twSDK.tt(
                                    'Selective Random'
                                )}</option>
                            </select>
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('What to send?')}</legend>
                            <select id="raWhatSend">
                                <option value="custom" selected>${twSDK.tt(
                                    'Custom'
                                )}</option>
                                <option value="send_all">${twSDK.tt(
                                    'Send all'
                                )}</option>
                                <option value="selective_send_all">${twSDK.tt(
                                    'Selective Send all'
                                )}</option>
                                <option value="ram_then_catapult">${twSDK.tt(
                                    'Ram first then Catapult'
                                )}</option>
                                <option value="catapult_then_ram">${twSDK.tt(
                                    'Catapult first then Ram'
                                )}</option>
                                <option value="fake_limit">${twSDK.tt(
                                    'Fake Limit'
                                )}</option>
                            </select>
                        </fieldset>
                    </div>
                </div>
                <div class="ra-mb15" id="raUnitAmountsConfigurator">
                    <fieldset class="ra-fieldset">
                        <legend>${twSDK.tt(
                            'Choose units and amounts to send'
                        )}</legend>
                        <div class="ra-mb10 ra-dflex">
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"ram": 1, "spy": 1}'>
                                <span>1 <img src="/graphic/unit/unit_ram.webp"></span>
                                <span>1 <img src="/graphic/unit/unit_spy.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"catapult": 1, "spy": 1}'>
                                <span>1 <img src="/graphic/unit/unit_catapult.webp"></span>
                                <span>1 <img src="/graphic/unit/unit_spy.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 10}'>
                                <span>10 <img src="/graphic/unit/unit_spy.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 5, "catapult": 50}'>
                                <span>5 <img src="/graphic/unit/unit_spy.webp"></span>
                                <span>50 <img src="/graphic/unit/unit_catapult.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 2, "light": 996, "ram": 1}'>
                                <span>2 <img src="/graphic/unit/unit_spy.webp"></span>
                                <span>996 <img src="/graphic/unit/unit_light.webp"></span>
                                <span>1 <img src="/graphic/unit/unit_ram.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 2, "heavy": 996, "ram": 1}'>
                                <span>2 <img src="/graphic/unit/unit_spy.webp"></span>
                                <span>996 <img src="/graphic/unit/unit_heavy.webp"></span>
                                <span>1 <img src="/graphic/unit/unit_ram.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 2, "light": 767, "ram": 220, "catapult": 10}'>
                                <span>2 <img src="/graphic/unit/unit_spy.webp"></span>
                                <span>767 <img src="/graphic/unit/unit_light.webp"></span>
                                <span>220 <img src="/graphic/unit/unit_ram.webp"></span>
                                <span>10 <img src="/graphic/unit/unit_catapult.webp"></span>
                            </a>
                            <a href="javascript:void(0);" class="btn ra-btn-set-units" data-units-amounts='{"spy": 2, "heavy": 767, "ram": 220, "catapult": 10}'>
                                <span>2 <img src="/graphic/unit/unit_spy.webp"></span>
                                <span>767 <img src="/graphic/unit/unit_heavy.webp"></span>
                                <span>220 <img src="/graphic/unit/unit_ram.webp"></span>
                                <span>10 <img src="/graphic/unit/unit_catapult.webp"></span>
                            </a>
                        </div>
                        ${unitsTableChoser}
                    </fieldset>
                </div>
                <div class="ra-mb15" id="raUnitAmountsSelectiveSendAllConfigurator" style="display: none;">
                    ${selectiveSendAllHtml}
                </div>
                <div id="raSelectPlayerTribe">
                    <div class="ra-grid ra-mb15 ra-grid-3">
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt(
                                'Player (separate players using comma)'
                            )}</legend>
                            ${playersDropdown}
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt(
                                'Tribe (separate tribes using comma)'
                            )}</legend>
                            ${tribesDropdown}
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Excluded Players')}</legend>
                            ${excludedPlayersDropdown}
                        </fieldset>
                    </div>
                    <div class="ra-grid ra-grid-5 ra-mb15">
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Continents')}</legend>
                            <input class="ra-input" type="text" id="raContinents" placeholder="45, 54">
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Min Coord')}</legend>
                            <input class="ra-input" type="text" id="raMinCoord" placeholder="470|470">
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Max Coord')}</legend>
                            <input class="ra-input" type="text" id="raMaxCoord" placeholder="450|450">
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Dist from center')}</legend>
                            <input class="ra-input" type="text" id="raDistCenter" placeholder="10">
                        </fieldset>
                        <fieldset class="ra-fieldset">
                            <legend>${twSDK.tt('Center')}</legend>
                            <input class="ra-input" type="text" id="raCenter" placeholder="${
                                game_data.village.coord
                            }">
                        </fieldset>
                    </div>
                </div>
                <div class="ra-mb15 ra-grid ra-grid-3" id="raAdvancedFilters">
                    <fieldset class="ra-fieldset">
                        <legend>${twSDK.tt('20:1 No-Attack')}</legend>
                        <label for="raEnable20To1Limit" class="ra-label">
                            <input type="checkbox" id="raEnable20To1Limit">
                            ${twSDK.tt(
                                'Filter players 20 times bigger then yourself'
                            )}
                        </label>
                    </fieldset>
                    <fieldset class="ra-fieldset">
                        <legend>${twSDK.tt('Minimum Points Village')}</legend>
                        <input type="text" id="raMinPoints" value="" class="ra-input">
                    </fieldset>
                    <fieldset class="ra-fieldset">
                        <legend>${twSDK.tt('Maximum Points Village')}</legend>
                        <input type="text" id="raMaxPoints" value="" class="ra-input">
                    </fieldset>
                </div>
                <div class="ra-mb15" id="raCoordinatesBox" style="display:none;">
                    <label for="raCoordinates">${twSDK.tt(
                        'Coordinates'
                    )} <span id="coordsAmount">0</span></label>
                    <textarea id="raCoordinates" class="ra-textarea"></textarea>
                </div>
                <div class="ra-mb15" id="raSelectiveRandomSelectors" style="display:none;">
                    <fieldset class="ra-fieldset">
                        <legend>${twSDK.tt(
                            'Selective Random Configuration'
                        )}</legend>
                        <input type="text" id="raSelectivePlayers" value="" placeholder="Player1:5;Player2:2;Player3:10;" class="ra-input">
                        <em class="ra-info">${twSDK.tt(
                            'This will target Player3 1000% more times then normal distribution, Player2 will be targetted 200% more and Player1 will be targetted 500% more.'
                        )}</em>
                    </fieldset>
                </div>
                <div>
                    <a class="btn" href="javascript:void(0);" id="raGenerateFakeScriptBtn">
                        ${twSDK.tt('Generate Script')}
                    </a>
                </div>
            `;
    }

    // Helper: Build the selective send all element
    function buildSelectiveSendAll() {
        let thead = ``;
        let unitsToKeep = ``;

        game_data.units.forEach((unit) => {
            if (unit !== 'militia') {
                thead += `
                        <th>
                            <img src="/graphic/unit/unit_${unit}.webp"></span>
                        </th>
                    `;

                unitsToKeep += `
                        <td>
                            <input type="checkbox" class="ra-toggle-unit-checked" data-unit-type-checked="${unit}" />
                            <input type="text" disabled class="ra-unit-amount-to-keep" data-unit="${unit}" value="0" />
                        </td>
                    `;
            }
        });

        let selectiveSendAllHtml = `
                <fieldset class="ra-fieldset">
                    <legend>
                        ${twSDK.tt(
                            'Select units to send and what unit amounts to keep'
                        )}
                    </legend>
                    <table class="ra-table" width="100%">
                        <thead>
                            <tr>
                                ${thead}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                ${unitsToKeep}
                            </tr>
                        </tbody>
                    </table>
                </fieldset>
            `;

        return selectiveSendAllHtml;
    }

    // Helper: Build table of units and unit amounts
    function buildUnitsChoserTable() {
        const units = game_data.units;

        let unitsTable = ``;
        let thUnits = ``;
        let tableRow = ``;

        units.forEach((unit) => {
            if (unit !== 'militia' && unit !== 'knight' && unit !== 'snob') {
                thUnits += `
                        <th class="ra-text-center">
                            <label for="unit_${unit}" class="ra-unit-type">
                                <img src="/graphic/unit/unit_${unit}.webp">
                            </label>
                        </th>
                    `;

                tableRow += `
                        <td class="ra-text-center">
                            <input name="ra_unit_amounts" type="text" id="unit_${unit}" data-unit="${unit}" class="ra-unit-amount" value="0" />
                        </td>
                    `;
            }
        });

        unitsTable = `
                <table class="ra-table vis" width="100%" id="raUnitSelector">
                    <thead>
                        <tr>
                            ${thUnits}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            ${tableRow}
                        </tr>
                    </tbody>
                </table>
            `;

        return unitsTable;
    }

    // Helper: Collect all user input
    function collectUserInput() {
        let sendMode = jQuery('#raSendFakesType').val();
        let coordinates = jQuery('#raCoordinates').val().trim();
        let coordinatesFillMode = jQuery('#raCoordinatesField').val();
        let playersInput = jQuery('#raPlayers').val();
        let tribesInput = jQuery('#raTribes').val();
        let unitsAndAmounts = [];
        let continents = jQuery('#raContinents').val();
        let minCoord = jQuery('#raMinCoord').val();
        let maxCoord = jQuery('#raMaxCoord').val();
        let distCenter = jQuery('#raDistCenter').val();
        let center = jQuery('#raCenter').val();
        let whatSend = jQuery('#raWhatSend').val();
        let excludedPlayers = jQuery('#raExcludedPlayers').val();
        let enable20To1Limit = jQuery('#raEnable20To1Limit').is(':checked');
        let minPoints = jQuery('#raMinPoints').val();
        let maxPoints = jQuery('#raMaxPoints').val();
        let selectiveRandomConfig = jQuery('#raSelectivePlayers').val();

        if (whatSend === 'custom') {
            jQuery('.ra-unit-amount').each(function () {
                const currentUnit = jQuery(this).attr('data-unit');
                const currentUnitAmount = parseInt(jQuery(this).val());
                if (currentUnitAmount !== 0) {
                    unitsAndAmounts.push({
                        unit: currentUnit,
                        amount: currentUnitAmount,
                    });
                }
            });
        }

        if (whatSend === 'selective_send_all') {
            jQuery('.ra-unit-amount-to-keep').each(function () {
                if (jQuery(this).attr('disabled') !== 'disabled') {
                    const currentUnit = jQuery(this).attr('data-unit');
                    const currentUnitAmount = parseInt(jQuery(this).val());
                    unitsAndAmounts.push({
                        unit: currentUnit,
                        amount: currentUnitAmount,
                    });
                }
            });
        }

        return {
            sendMode,
            unitsAndAmounts,
            coordinates,
            coordinatesFillMode,
            playersInput,
            tribesInput,
            continents,
            minCoord,
            maxCoord,
            distCenter,
            center,
            whatSend,
            excludedPlayers,
            enable20To1Limit,
            minPoints,
            maxPoints,
            selectiveRandomConfig,
        };
    }

    // Helper: Generate script based on user input
    function generateScript(sendMode, unitsAndAmounts, coordinates, whatSend) {
        // transform units and amounts array into an object
        let transformedUnitAmounts = {};
        unitsAndAmounts.forEach((item) => {
            const { unit, amount } = item;
            transformedUnitAmounts = {
                ...transformedUnitAmounts,
                [unit]: amount,
            };
        });

        const fakeScriptConfig = {
            unitAmounts: transformedUnitAmounts,
            coords: coordinates,
            sendMode: sendMode,
        };

        let whatToSend = ``;
        switch (whatSend) {
            case 'custom':
                whatToSend += `
                        jQuery('input[class=unitsInput]').val(0);
                        var count;
                        for (var unit in unitAmounts) {
                            if (unitAmounts.hasOwnProperty(unit)) {
                                if (unitAmounts[unit] > 0 && typeof document.forms[0][unit] != 'undefined') {
                                    count = parseInt(document.forms[0][unit].nextSibling.nextSibling.innerHTML.match(/\\d+/));
                                    if (count > 0 && unitAmounts[unit] < count) {
                                        document.forms[0][unit].value = Math.min(unitAmounts[unit], count);
                                    }
                                }
                            }
                        }
                    `;
                break;
            case 'send_all':
                whatToSend += 'selectAllUnits(1)';
                break;
            case 'ram_then_catapult':
                whatToSend += `
                        jQuery('input[class=unitsInput]').val(0);
                        var ramsCount = parseInt(jQuery('#unit_input_ram').attr('data-all-count'));
                        var catsCount = parseInt(jQuery('#unit_input_catapult').attr('data-all-count'));
                        if(ramsCount >= 1) {
                            jQuery('#unit_input_ram').val(1);
                        } else {
                            jQuery('#unit_input_catapult').val(1);
                        }
                        jQuery('#unit_input_spy').val(1);
                    `;
                break;
            case 'catapult_then_ram':
                whatToSend += `
                        jQuery('input[class=unitsInput]').val(0);
                        var ramsCount = parseInt(jQuery('#unit_input_ram').attr('data-all-count'));
                        var catsCount = parseInt(jQuery('#unit_input_catapult').attr('data-all-count'));
                        if(catsCount >= 1) {
                            jQuery('#unit_input_catapult').val(1);
                        } else {
                            jQuery('#unit_input_ram').val(1);
                        }
                        jQuery('#unit_input_spy').val(1);
                    `;
                break;
            default:
                whatToSend += ``;
        }

        let sendModeFunction = ``;
        if (sendMode === 'random') {
            sendModeFunction = `
                    function randomFakeScript(unitAmounts, coords) {
                        var coord = coords.split(' ');
                        var coordSplit = coord[Math.floor(Math.random() * coord.length)].split('|');
                        document.forms[0].x.value = coordSplit[0];
                        document.forms[0].y.value = coordSplit[1];
                        ${whatToSend}
                    }
                `;
        } else if (sendMode === 'sequential') {
            sendModeFunction = `
                    function sequentialFakeScript(unitAmounts, coords) {
                        coords = coords.split(' ');
                        index = 0;
                        fakecookie = document.cookie.match('(^|;) ?farm=([^;]*)(;|$)');
                        if (fakecookie != null) index = parseInt(fakecookie[2]);
                        if (index >= coords.length) alert('All villages were extracted, now start from the first!');
                        if (index >= coords.length) index = 0;
                        coords = coords[index];
                        coords = coords.split('|');
                        index = index + 1;
                        cookie_date = new Date(2030, 1, 1);
                        document.cookie = 'farm=' + index + ';expires=' + cookie_date.toGMTString();
                        document.forms[0].x.value = coords[0];
                        document.forms[0].y.value = coords[1];
                        ${whatToSend}
                    }
                `;
        } else {
            sendModeFunction = '';
        }

        let sendModeCallFn = '';
        if (sendMode === 'random') {
            sendModeCallFn = `randomFakeScript(unitAmounts, coords);`;
        } else if (sendMode === 'sequential') {
            sendModeCallFn = `sequentialFakeScript(unitAmounts, coords);`;
        } else {
            sendModeCallFn = ``;
        }

        const fakeScriptCode = `
                javascript:
                var config=${JSON.stringify(fakeScriptConfig)};
                ${sendModeFunction}
                if (game_data.screen === 'place' && game_data.mode === null) {
                    const { unitAmounts, coords } = config;
                    ${sendModeCallFn}
                } else {
                    UI.InfoMessage('Redirecting...');
                    setTimeout(function () {
                        window.location.assign(game_data.link_base_pure + 'place');
                    }, 500);
                }
            `;

        return fakeScriptCode
            .replace(/(\r\n|\n|\r)/gm, '')
            .replace(/\s+/g, ' ');
    }

    // Helper: Build datalist player/tribe selector
    function buildDropDown(array, entity) {
        let dropdown = `<input type="email" class="ra-input" multiple list="raSelect${entity}" placeholder="${twSDK.tt(
            'Start typing and suggestions will show ...'
        )}" id="ra${entity}"><datalist id="raSelect${entity}">`;

        array.forEach((item) => {
            if (item[0].length !== 0) {
                if (entity === 'Tribes') {
                    const [id, _, tag] = item;
                    const cleanTribeTag = twSDK.cleanString(tag);
                    dropdown += `<option value="${cleanTribeTag}">`;
                }
                if (entity === 'Players' || entity === 'ExcludedPlayers') {
                    const [id, name] = item;
                    const cleanPlayerName = twSDK.cleanString(name);
                    dropdown += `<option value="${cleanPlayerName}">`;
                }
            }
        });

        dropdown += '</datalist>';

        return dropdown;
    }

    // Helper: Fetch all required world data
    async function fetchWorldData() {
        try {
            const villages = await twSDK.worldDataAPI('village');
            const players = await twSDK.worldDataAPI('player');
            const tribes = await twSDK.worldDataAPI('ally');
            return { villages, players, tribes };
        } catch (error) {
            UI.ErrorMessage(error);
            console.error(`${scriptInfo} Error:`, error);
        }
    }
})();