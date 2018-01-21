/*
 *  Radio.net plugin for Movian Media Center
 *
 *  Copyright (C) 2012-2018 Henrik Andersson, lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var popup = require('native/popup');
var string = require('native/string');
var misc = require('native/misc');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

var BASE_URL = "http://rad.io/info/";
var UA = 'radio.de 1.9.1 rv:37 (iPhone; iPhone OS 5.0; de_DE)';

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

var store = require('movian/store').create('favorites');
if (!store.list) 
    store.list = "[]";

function trim(s) {
    if (!s) return '';
    return s.replace(/^\s+|\s+$/g, '').replace("mms://","http://");
}

service.create(plugin.title, plugin.id + ":start", 'music', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createAction("cleanFavorites", "Clean My Favorites", function() {
    store.list = "[]";
    popup.notify('Favorites has been cleaned successfully', 2);
});

var cp1252 = 'ÀÁÂÃÄÅ¨ÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕ×ÖØÙÜÚÛÝÞßàáâãäå¸æçèéêëìíîïðñòóôõ÷öøùüúûýþÿ³²ºª¿¯´¥';
var cp1251 = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЧЦШЩЬЪЫЭЮЯабвгдеёжзийклмнопрстуфхчцшщьъыэюяіІєЄїЇґҐ';
function fixMB(s) {
    var fixed = '';
    for (var i = 0; i < s.length - 2; i++)
        if (cp1252.indexOf(s[i]) > - 1 && cp1252.indexOf(s[i+1]) > -1 && cp1252.indexOf(s[i+2]) > -1) {
            for (var i = 0; i < s.length; i++)
	        cp1252.indexOf(s[i]) != -1 ? fixed += cp1251[cp1252.indexOf(s[i])] : fixed += s[i];
            print("Before: " + s + " After: " + fixed);
            return fixed;
        }
    return s;
};

function cacheGet(stash, key) {
    var v = misc.cacheGet('plugin/' + Plugin.id + '/' + stash, key);
    return v ? JSON.parse(v) : null;
};

function cachePut(stash, key, obj, maxage) {
    misc.cachePut('plugin/' + Plugin.id + '/' + stash, key, JSON.stringify(obj), maxage);
}

function addToMyFavorites(item) {
    item.addOptAction("Add '" + item.station + "' to My Favorites", function() {
        var entry = JSON.stringify({
            url: item.url,
            icon: item.icon,
            album_art: item.icon,
            station: item.station,
            title: item.station,
            description: item.description,
            bitrate: item.bitrate,
            format: item.format
        });
        store.list = JSON.stringify([entry].concat(eval(store.list)));
        popup.notify("'" + item.station + "' has been added to My Favorites.", 2);
    });
}

function appendStation(page, station) {
    var bce = {};
    try {
        bce = cacheGet('streamurl', station.id);
	if (!bce) {
            bce = getJSON('broadcast/getbroadcastembedded?broadcast=' + station.id);
            cachePut('streamurl', station.id, bce, 84600);
	}
    } catch(e) {}
    var iconUrl = null;
    if (station.picture1Name)
	iconUrl = station.pictureBaseURL + station.picture1Name;
    var item = page.appendItem("icecast:" + trim(bce.streamURL), "station", {
        station: station.name,
        description: station.genresAndTopics,
        icon: iconUrl,
        album_art: iconUrl,
        title: station.name,
        onair: fixMB(station.currentTrack),
        bitrate: station.bitrate,
        format: station.streamContentFormat
    });
    item.url = "icecast:" + trim(bce.streamURL);
    item.station = station.name;
    item.description = station.genresAndTopics;
    item.icon = iconUrl;
    item.album_art = iconUrl;
    item.bitrate = station.bitrate;
    item.format = station.streamContentFormat;
    addToMyFavorites(item);
}

function removeItemFromMyFavorites(item, pos) {
    item.addOptAction("Remove '" + item.station + "' from My Favorites", function() {
        var list = eval(store.list);
        popup.notify("'" + item.station + "' has been removed from My Favorites.", 2);
        list.splice(pos, 1);
        store.list = JSON.stringify(list);
        page.flush();
        page.redirect(plugin.id + ':favorites');
    });
};

new page.Route(plugin.id + ":favorites", function(page) {
    setPageHeader(page, plugin.title + " - My Favorites");
    var list = eval(store.list);
    if (!list || !list.toString()) {
        page.error("My Favorites list is empty");
        return;
    }
    var pos = 0;
    for (var i in list) {
        var itemmd = JSON.parse(list[i]);
        var item = page.appendItem(itemmd.url, "station", {
            station: itemmd.station,
            icon: itemmd.icon,
            album_art: itemmd.icon,
            title: itemmd.title,
            description: itemmd.description,
            bitrate: itemmd.bitrate,
            format: itemmd.format,
            listeners: itemmd.listeners
        });
        removeItemFromMyFavorites(item, pos);
        pos++;
    }
});

function getJSON(url) {
    return JSON.parse(http.request(BASE_URL + url, {
        headers: {
            'User-Agent': UA
        }
    }));
}

new page.Route(plugin.id + ":list:(.*):(.*)", function(page, title, url) {
    setPageHeader(page, plugin.title + ' - ' + unescape(title));
    page.model.contents = 'grid';
    page.loading = true;
    var json = getJSON(url);
    for (var i in json)
        appendStation(page, json[i]);
    page.loading = false;
});

new page.Route(plugin.id + ":getByCategory:(.*):(.*)", function(page, category, value) {
    setPageHeader(page, plugin.title + ' - ' + unescape(value));
    page.model.contents = 'grid';
    page.loading = true;
    var json = getJSON('menu/broadcastsofcategory?category=_' + unescape(category) + '&value=' + encodeURIComponent(unescape(value)));
    for (var i in json)
        appendStation(page, json[i]);
    page.loading = false;
});

new page.Route(plugin.id + ":category:(.*)", function(page, category) {
    setPageHeader(page, 'Stations by (' + category + ')');
    page.loading = true;
    var json = getJSON('menu/valuesofcategory?category=_' + category);
    for (var i in json) {
        page.appendItem(plugin.id + ":getByCategory:" + escape(category) + ":" + escape(json[i]), "directory", {
            title: json[i]
        });
    };
    page.loading = false;
});

function constructMultiopt(multiOpt, storageVariable) {
    if (!storageVariable)
        multiOpt[0][2] = true;
    else
        for (var i = 0; i < multiOpt.length; i++) {
            if (multiOpt[i][0] == storageVariable) {
                multiOpt[i][2] = true;
                break;
            }
        }
    return multiOpt;
}

var country = require('movian/store').create('country');
if (!country.default) 
    country.default = 'Ukraine';

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.title);
    page.loading = true;
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search at ' + plugin.title
    });
    //page.appendItem(plugin.id + ":favorites", "directory", {
    //    title: "My Favorites"
    //});
    var isMultioptReady = false;
    var options = [];
    var data = getJSON('menu/valuesofcategory?category=_country');
    for (var i in data)	
        if (country.default == data[i]) 
            options.push([data[i], data[i], true]);
        else
            options.push([data[i], data[i]]);

    page.options.createMultiOpt('country', "Country for the nearest stations", options, function(v) {
        if (isMultioptReady) {
            country.default = v;
            page.flush();
            page.redirect(plugin.id + ':start');
        }
    });
    isMultioptReady = true;

    page.appendItem(plugin.id + ":getByCategory:country:" + country.default, "directory", {
	title: "Nearest stations (" + country.default + ')' 
    });
    page.appendItem("", "separator", {});
    page.appendItem(plugin.id + ':list:Highlights:broadcast/gethighlights', "directory", {
        title: 'Highlights'
    });
    page.appendItem(plugin.id + ':list:Recommendations:broadcast/editorialreccomendationsembedded', "directory", {
        title: 'Recommendations'
    });
    page.appendItem(plugin.id + ':list:Top 100:menu/broadcastsofcategory?category=_top', "directory", {
        title: 'Top 100'
    });
    page.appendItem("", "separator", {
        title: "Stations by"
    });
    page.appendItem(plugin.id + ":category:genre", "directory", {
        title: "Genre"
    });
    page.appendItem(plugin.id + ":category:topic", "directory", {
        title: "Topic"
    });
    page.appendItem(plugin.id + ":category:country", "directory", {
        title: "Country"
    });
    page.appendItem(plugin.id + ":category:city", "directory", {
        title: "City"
    });
    page.appendItem(plugin.id + ":category:language", "directory", {
        title: "Language"
    });
    page.loading = false;
});

function search(page, query) {
    page.model.contents = 'grid';
    var fromPage = 0, tryToSearch = true;
    page.entries = 0;

    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var json = getJSON('index/searchembeddedbroadcast?q=' +
            encodeURI(query) + '&start=' + fromPage + '&rows=30');
        for (var i in json) {
            appendStation(page, json[i]);
            page.entries++;
        }
        page.loading = false;
        if (!json || json == '') return tryToSearch = false;
        fromPage += 30;
        return true;
    };
    loader();
    page.paginator = loader;
}

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.title + ' - ' + query);
    search(page, query);
});

page.Searcher(plugin.id, logo, function(page, query) {
    setPageHeader(page, plugin.title + ' - ' + query);
    search(page, query);
});
