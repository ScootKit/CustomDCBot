/**
 * This module can fetch, update and get translations of strings
 * @module Locales
 */
const {client} = require('../../main');
const jsonfile = require('jsonfile');
const fs = require('fs');

const locals = {};
loadLocale('en');

/**
 * Loads a locale file
 * @private
 * @param {String} locale Locale to load
 */
function loadLocale(locale) {
    if (locals[locale]) return;
    if (!fs.existsSync(`${__dirname}/../../locales/${locale}.json`)) locale = 'en';
    locals[locale] = jsonfile.readFileSync(`${__dirname}/../../locales/${locale}.json`);
}

/**
 * Gets the translation for a string
 * @param {String} file File-Name
 * @param {String} string Localization-String-Name
 * @param {Object} replace Object of parameters to replace
 * @return {String} Translation in the user's language
 */
function localize(file, string, replace = {}) {
    loadLocale(client.locale);
    if (!locals[client.locale]) client.locale = 'en';
    if (!locals[client.locale][file]) locals[client.locale][file] = [];
    let rs = locals[client.locale][file][string];
    if (!rs) rs = locals['en'][file][string];
    if (!rs) throw new Error(`String ${file}/${string} not found`);
    for (const key in replace) {
        rs = rs.replaceAll(`%${key}`, replace[key]);
    }
    return rs;
}

module.exports.localize = localize;