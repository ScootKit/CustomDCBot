/**
 * This module can fetch, update and get translations of strings
 * @module Locales
 */
const {client} = require('../../main');
const jsonfile = require('jsonfile');

const locals = jsonfile.readFileSync(`${__dirname}/../../default-locales.json`);

/**
 * Gets the translation for a string
 * @param {String} file File-Name
 * @param {String} string Localization-String-Name
 * @param {Object} replace Object of parameters to replace
 * @return {String} Translation in the user's language
 */
function localize(file, string, replace = {}) {
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