/**
 * Functions to make your live easier
 * @module Helpers
 */

const {MessageEmbed} = require('discord.js');
const {localize} = require('./localize');

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
 * @param {Array} inputArray Array of user or role IDs
 * @param {String} type [ApplicationCommandPermissionType](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissionType)
 * @param {Array} array Base-Array
 * @param {Boolean} skipOwnerAdding If enabled, the bot won't add the guild owner as allowed user
 * @returns {array} [ApplicationCommandPermissionType](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissions)
 */
module.exports.arrayToApplicationCommandPermissions = function (inputArray, type, array = [], skipOwnerAdding = false) {
    inputArray.forEach((id) => {
        array.push({
            type: type,
            permission: true,
            id
        });
    });
    if (!skipOwnerAdding) array.push({
        type: 'USER',
        permission: true,
        id: client.guild.ownerId
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
        input = input.replaceAll(arg, args[arg]);
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
    if (!input.skipEmbed) {
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
        emb.setFooter(input.footer ? inputReplacer(args, input.footer) : client.strings.footer, (input.footerImgUrl || client.strings.footerImgUrl));
        optionsToKeep.embeds = [emb];
    }
    if (input['message']) optionsToKeep.content = inputReplacer(args, input['message']);
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
    return localize('helpers', 'timestamp', {
        dd: dd[1] ? dd : '0' + dd[0],
        mm: mm[1] ? mm : '0' + mm[0],
        yyyy,
        hh: hh[1] ? hh : '0' + hh[0],
        min: min[1] ? min : '0' + min[0]
    });
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
            content: '⚠ ' + localize('helpers', 'you-did-not-run-this-command')
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
        if (site !== 1) btns.push({type: 'BUTTON', label: '◀ ' + localize('helpers', 'back'), customId: 'back', style: 'PRIMARY', disabled});
        if (site !== sites.length) btns.push({
            type: 'BUTTON',
            label: localize('helpers', 'next') + ' ▶',
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
 * @returns {Promise<void>}
 */
async function checkForUpdates() {
}

module.exports.checkForUpdates = checkForUpdates;

/**
 * Randomly selects a number between min and max
 * @param {Number} min
 * @param {Number} max
 * @returns {number} Random integer
 */
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

module.exports.randomIntFromInterval = randomIntFromInterval;

/**
 * Returns a random element from an array
 * @param {Array} array Array of values
 * @returns {*}
 */
function randomElementFromArray(array) {
    if (array.length === 0) return null;
    if (array.length === 1) return array[0];
    return array[Math.floor(Math.random() * array.length)];
}

module.exports.randomElementFromArray = randomElementFromArray;

/**
 * Returns a string (progressbar) to visualize a progress in percentage
 * @param {Number} percentage Percentage of progress
 * @param {Number} length Length of the whole progressbar
 * @return {string} Progressbar
 */
function renderProgressbar(percentage, length = 20) {
    let s = '';
    for (let i = 1; i <= length; i++) {
        if (percentage >= 5 * i) s = s + '█';
        else s = s + '░';
    }
    return s;
}
module.exports.renderProgressbar = renderProgressbar;

/**
 * Formats a Date to a discord timestamp
 * @param {Date} date Date to convert
 * @param {String} timeStampStyle [Timestamp Style](https://discord.com/developers/docs/reference#message-formatting-timestamp-styles) in which this timeStamp should be
 * @return {string} Discord-Timestamp
 */
function dateToDiscordTimestamp(date, timeStampStyle = null) {
    return `<t:${(date.getTime() / 1000).toFixed(0)}${timeStampStyle ? ':' + timeStampStyle : ''}>`;
}
module.exports.dateToDiscordTimestamp = dateToDiscordTimestamp;

/**
 * Locks a Guild-Channel for everyone except roles specified in allowedRoles
 * @param {GuildChannel} channel Channel to lock
 * @param {Array<Role>} allowedRoles Array of roles who can talk in the channel
 * @param {String} reason Reason for the channel lock
 * @return {Promise<void>}
 */
async function lockChannel(channel, allowedRoles = [], reason = localize('main', 'channel-lock')) {
    const dup = await channel.client.models['ChannelLock'].findOne({where: {id: channel.id}});
    if (dup) await dup.destroy();
    await channel.client.models['ChannelLock'].create({
        id: channel.id,
        lockReason: reason,
        permissions: Array.from(channel.permissionOverwrites.cache.values())
    });

    for (const overwrite of channel.permissionOverwrites.cache.filter(e => e.allow.has('SEND_MESSAGES')).values()) {
        await overwrite.edit({
            SEND_MESSAGES: false,
            SEND_MESSAGES_IN_THREADS: false
        }, reason);
    }
    await channel.permissionOverwrites.create(await channel.guild.roles.cache.find(r => r.name === '@everyone'), {
        SEND_MESSAGES: false,
        SEND_MESSAGES_IN_THREADS: false
    }, {reason});
    for (const roleID of allowedRoles) {
        await channel.permissionOverwrites.create(roleID, {
            SEND_MESSAGES: true
        }, {reason});
    }
}

/**
 * Unlocks a previously locked channel
 * @param {GuildChannel} channel Channel to unlock
 * @param {String} reason Reason for this unlock
 * @return {Promise<void>}
 */
async function unlockChannel(channel, reason = localize('main', 'channel-unlock')) {
    const item = await channel.client.models['ChannelLock'].findOne({where: {id: channel.id}});
    if (item && (item || {}).permissions) await channel.permissionOverwrites.set(item.permissions, reason);
    else channel.client.logger.error(localize('main', 'channel-unlock-data-not-found', {c: channel.id}));
}

module.exports.lockChannel = lockChannel;
module.exports.unlockChannel = unlockChannel;

/**
 * Function to migrate Database models
 * @param {string} module Name of the Module
 * @param {string} oldModel Name of the old Model
 * @param {string} newModel Name of the new Model
 * @param {Client} client Client
 * @returns {Promise<void>}
 * @author jateute
 */
async function migrate(module, oldModel, newModel, client) {
    const old = await client.models[module][oldModel].findAll();
    if (old.length === 0) return;
    client.logger.info(localize('main', 'migrate-start', {o: oldModel, m: newModel}));
    await old.forEach(async (model) => {
        delete model.dataValues.updatedAt;
        delete model.dataValues.createdAt;
        await client.models[module][newModel].create(model.dataValues);
        await model.destroy();
    });
    client.logger.info(localize('main', 'migrate-success', {o: oldModel, m: newModel}));
}

module.exports.migrate = migrate;