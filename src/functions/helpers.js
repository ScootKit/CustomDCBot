const {MessageEmbed} = require('discord.js');

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

module.exports.embedType = function (input, args = {}) {
    if (typeof input === 'string') return [inputReplacer(args, input)];
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
    emb.setFooter(client.strings.footer);
    return [inputReplacer(args, input['message']), emb];
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