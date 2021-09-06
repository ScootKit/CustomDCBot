/**
 * Functions to make your live easier
 * @module Helpers
 */

const {MessageEmbed} = require('discord.js');
const centra = require('centra');

/**
 * Will loop asynchrony through every object in the array
 * @param  {Array} array Array of objects
 * @param  {function(object, number, array)} callback Function that gets executed on every array (object, index in the array, array)
 * @return {Promise}
 */
module.exports.asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

/**
 *
 * @param inputArray Array of user or role IDs
 * @param type [ApplicationCommandPermissionType](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissionType)
 * @param array Base-Array
 * @returns {array} [ApplicationCommandPermissionType](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissions)
 */
module.exports.arrayToApplicationCommandPermissions = function (inputArray, type, array = []) {
    inputArray.forEach((id) => {
        array.push({
            type: type,
            permission: true,
            id
        });
    });
    return array;
};

/**
 * Replaces every argument with a string
 * @param {Object<String>} args Arguments to replace
 * @param {String} input Input
 * @returns {String}
 * @private
 */
function inputReplacer(args, input) {
    if (typeof args !== 'object') return input;
    for (const arg in args) {
        input = input.split(arg).join(args[arg]);
    }
    return input;
}

/**
 * Will turn an object or string into embeds
 * @param  {string|array} input Input in the configuration file
 * @param  {Object} args Object of variables to replace
 * @param  {Object} optionsToKeep [BaseMessageOptions](https://discord.js.org/#/docs/main/stable/typedef/BaseMessageOptions) to keep
 * @author Simon Csaba <mail@scderox.de>
 * @return {object} Returns [MessageOptions](https://discord.js.org/#/docs/main/stable/typedef/MessageOptions)
 */
module.exports.embedType = function (input, args = {}, optionsToKeep = {}) {
    if (typeof input === 'string') {
        optionsToKeep.content = inputReplacer(args, input);
        return optionsToKeep;
    }
    const {client} = require('../../main');
    const emb = new MessageEmbed();
    emb.setTitle(inputReplacer(args, input['title']));
    if (input['description']) emb.setDescription(inputReplacer(args, input['description']));
    if (input['color']) emb.setColor(input['color']);
    if (input['url']) emb.setURL(input['url']);
    if (input['image']) emb.setImage(inputReplacer(args, input['image']));
    if (input['thumbnail']) emb.setThumbnail(inputReplacer(args, input['thumbnail']));
    if (input['author'] && typeof input['author'] === 'object') emb.setAuthor(inputReplacer(args, input['author']['name']), inputReplacer(args, input['author']['img']));
    if (typeof input['fields'] === 'object') {
        input.fields.forEach(f => {
            emb.addField(inputReplacer(args, f['name']), inputReplacer(args, f['value']), f['inline']);
        });
    }
    emb.setTimestamp();
    emb.setFooter(input.footer ? inputReplacer(args, input.footer) : client.strings.footer);
    optionsToKeep.content = inputReplacer(args, input['message']);
    optionsToKeep.embeds = [emb];
    return optionsToKeep;
};

/**
 * Makes a Date humanly readable
 * @param  {Date} date Date to format
 * @return {string} Returns humanly readable string
 * @author Simon Csaba <mail@scderox.de>
 */
function formatDate(date) {
    const yyyy = date.getFullYear().toString(), mm = (date.getMonth() + 1).toString(), dd = date.getDate().toString(),
        hh = date.getHours().toString(), min = date.getMinutes().toString();
    return `${(dd[1] ? dd : '0' + dd[0])}.${(mm[1] ? mm : '0' + mm[0])}.${yyyy} at ${(hh[1] ? hh : '0' + hh[0])}:${(min[1] ? min : '0' + min[0])}`;
}

module.exports.formatDate = formatDate;

/**
 * Truncates a string to a specific length
 * @param  {string} string String to truncate
 * @param  {number} length Length to truncate to
 * @return {string} Truncated string
 */
function truncate(string, length) {
    return (string.length > length) ? string.substr(0, length - 3) + '...' : string;
}

module.exports.truncate = truncate;

/**
 * Puffers (add empty spaces to center text) a string to a specific size
 * @param  {string} string String to puffer
 * @param  {number} size Length to puffer to
 * @return {string}
 * @author Simon Csaba <mail@scderox.de>
 */
function pufferStringToSize(string, size) {
    if (typeof string !== 'string') string = string.toString();
    const pufferNeeded = size - string.length;
    for (let i = 0; i < pufferNeeded; i++) {
        if (i % 2 === 0) string = '\xa0' + string;
        else string = string + '\xa0';
    }
    return string;
}

module.exports.pufferStringToSize = pufferStringToSize;

/**
 * Sends a multiple-site-embed-message
 * @param  {Object} channel Channel in which to send the message
 * @param  {Array<object>} sites Array of MessageEmbeds (https://discord.js.org/#/docs/main/stable/class/MessageEmbed)
 * @param  {Array<string>} allowedUserIDs Array of User-IDs of users allowed to use the pagination
 * @param {Object} messageOrInteraction Message or [CommandInteraction](https://discord.js.org/#/docs/main/stable/class/CommandInteraction) to respond to
 * @return {string}
 * @author Simon Csaba <mail@scderox.de>
 */
async function sendMultipleSiteButtonMessage(channel, sites = [], allowedUserIDs = [], messageOrInteraction = null) {
    if (sites.length === 1) {
        if (messageOrInteraction) return messageOrInteraction.reply({embeds: [sites[0]]});
        return await channel.send({embeds: [sites[0]]});
    }
    let m;
    if (messageOrInteraction) m = await messageOrInteraction.reply({
        components: [{type: 'ACTION_ROW', components: getButtons(1)}],
        embeds: [sites[0]],
        fetchReply: true
    });
    else m = await channel.send({components: [{type: 'ACTION_ROW', components: getButtons(1)}], embeds: [sites[0]]});
    const c = m.createMessageComponentCollector({componentType: 'BUTTON', time: 20000});
    let currentSite = 1;
    c.on('collect', async (interaction) => {
        if (!allowedUserIDs.includes(interaction.user.id)) return interaction.reply({
            ephemeral: true,
            content: `:warning: You did not run this command. If you want to use the buttons, try running the command yourself.`
        });
        let nextSite = currentSite + 1;
        if (interaction.customId === 'back') nextSite = currentSite - 1;
        currentSite = nextSite;
        await interaction.update({
            components: [{type: 'ACTION_ROW', components: getButtons(nextSite)}],
            embeds: [sites[nextSite - 1]]
        });
    });
    c.on('end', () => {
        m.edit({
            components: [{type: 'ACTION_ROW', components: getButtons(currentSite, true)}],
            embeds: [sites[currentSite - 1]]
        });
    });

    /**
     * Generate the buttons for a specified site
     * @param {Number} site Site-Number
     * @param {Boolean} disabled If the buttons should be disabled
     * @returns {Array}
     * @private
     */
    function getButtons(site, disabled = false) {
        const btns = [];
        if (site !== 1) btns.push({type: 'BUTTON', label: '◀ Back', customId: 'back', style: 'PRIMARY', disabled});
        if (site !== sites.length) btns.push({
            type: 'BUTTON',
            label: 'Next ▶',
            customId: 'next',
            style: 'PRIMARY',
            disabled
        });
        return btns;
    }
}

module.exports.sendMultipleSiteButtonMessage = sendMultipleSiteButtonMessage;

/**
 * Compares two arrays
 * @param {Array} array1 First array
 * @param {Array} array2 Second array
 * @returns {boolean} Wherever the arrays are the same
 */
function compareArrays(array1, array2) {
    if (array1.length !== array2.length) return false;

    for (let i = 0, l = array1.length; i < l; i++) {
        if (array1[i] instanceof Object) {
            for (const key in array1[i]) {
                if (array2[key] !== array1[key]) return false;
            }
            continue;
        }
        if (!array2.includes(array1[i])) return false;
    }
    return true;
}

module.exports.compareArrays = compareArrays;

/**
 * Check if a new version of CustomDCBot is available in the main branch on github
 * @param client The Client
 * @returns {Promise<void>}
 */
async function checkForUpdates(client) {
    const res = await centra('https://raw.githubusercontent.com/SCNetwork/CustomDCBot/main/package.json', 'GET').send();
    if (res.statusCode !== 200) {
        if (client.logChannel) client.channel.send(`🔴 Error ${res.statusCode} when trying to fetch for new updates.`);
        return client.logger.error('Could not check for updates');
    }

    try {
        const remoteVersion = JSON.parse(res.body.toString()).version.split(',');
        const localVersion = require('./../../package.json').version.split(',');

        let newVersionType = null;

        if (remoteVersion[2] > localVersion[2]) newVersionType = 'patch';
        if (remoteVersion[1] > localVersion[1]) newVersionType = 'minor';
        if (remoteVersion[0] > localVersion[0]) newVersionType = 'major';

        if (remoteVersion[0] < localVersion[0]) newVersionType = null;
        if (remoteVersion[1] < localVersion[1]) newVersionType = null;

        if (newVersionType) {
            if (client.logChannel) client.channel.send(`⚠️ A new ${newVersionType} version of CustomDCBot is available on GitHub (<https://github.com/SCNetwork/CustomDCBot>). Install it by executing \`git pull\` in the folder with the bot code.\n\nUpdating is highly recommendet as a new version may contain bug-fixes, new features and security-relevant fixes. However in some cases (if you changed code or added your module) the update could introduce breaking changes. Please always check the compaibity of the new version with your code-base before updating.`);
            client.logger.warn(`⚠️ A new ${newVersionType} version of CustomDCBot is available on GitHub (<https://github.com/SCNetwork/CustomDCBot>). Install it by executing \`git pull\` in the folder with the bot code.\n\nUpdating is highly recommendet as a new version may contain bug-fixes, new features and security-relevant fixes. However in some cases (if you changed code or added your module) the update could introduce breaking changes. Please always check the compaibity of the new version with your code-base before updating.`);
        } else client.logger.info('Your bot is up-to-date 🎉');
    } catch (e) {
        if (client.logChannel) client.channel.send(`🔴 Error ${e} when trying to fetch for new updates.`);
        return client.logger.error('Could not check for updates');
    }
}

module.exports.checkForUpdates = checkForUpdates;