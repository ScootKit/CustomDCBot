const {MessageEmbed} = require('discord.js');

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
 * @param  {object} args Object of variables to replace
 * @return {object} Returns MessageOptions (https://discord.js.org/#/docs/main/stable/typedef/MessageOptions)
 */
module.exports.embedType = function (input, args = {}) {
    if (typeof input === 'string') return {content: inputReplacer(args, input)};
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
    return {content: inputReplacer(args, input['message']), embeds: [emb]};
};

function formatDate(date) {
    const yyyy = date.getFullYear().toString(), mm = (date.getMonth() + 1).toString(), dd = date.getDate().toString(),
        hh = date.getHours().toString(), min = date.getMinutes().toString();
    return `${(dd[1] ? dd : '0' + dd[0])}.${(mm[1] ? mm : '0' + mm[0])}.${yyyy} at ${(hh[1] ? hh : '0' + hh[0])}:${(min[1] ? min : '0' + min[0])}`;
}

module.exports.formatDate = formatDate;

function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 3) + '...' : str;
}

module.exports.truncate = truncate;

function pufferStringToSize(str, size) {
    if (typeof str !== 'string') str = str.toString();
    const pufferNeeded = size - str.length;
    for (let i = 0; i < pufferNeeded; i++) {
        if (i % 2 === 0) str = '\xa0' + str;
        else str = str + '\xa0';
    }
    return str;
}

module.exports.pufferStringToSize = pufferStringToSize;

async function sendMultipleSiteButtonMessage(channel, sites = [], allowedUserIDs = [], message = null) {
    if (sites.length === 0) return await channel.send({embeds: [sites[0]]});
    const m = await channel.send({components: [{type: 'ACTION_ROW', components: getButtons(1)}], embeds: [sites[0]]});
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
        console.log(currentSite);
        m.edit({
            components: [{type: 'ACTION_ROW', components: getButtons(currentSite, true)}],
            embeds: [sites[currentSite - 1]]
        });
    });

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