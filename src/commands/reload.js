const {reloadConfig} = require('../functions/configuration');

module.exports.run = async function (client, msg) {
    const m = await msg.reply('Reloading your configuration... This could take a while...')
    await reloadConfig(client).catch((async reason => {
        await m.edit(`**FAILED**\n\`\`\`${reason}\`\`\`\n**Please read your log to fnd more information**\nThe bot will kill itself now, bye :wave:`)
        process.exit(1);
    })).then(() => {m.edit('Done :+1:')})
};

module.exports.help = {
    'name': 'reload',
    'description': 'Reloads configuration files',
    'module': 'none',
    'aliases': ['reload', 'r']
};
module.exports.config = {
    'restricted': false
};