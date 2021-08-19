const {reloadConfig} = require('../functions/configuration');

module.exports.run = async function (client, msg) {
    const m = await msg.reply('Reloading your configuration... This could take a while...');
    if (client.logChannel) client.logChannel.send(`🔄 ${msg.author.tag} is reloading the configuration...`);
    await reloadConfig(client).catch((async reason => {
        if (client.logChannel) client.logChannel.send(`⚠️ Configuration reloaded failed. Bot shutting down`);
        await m.edit(`**FAILED**\n\`\`\`${reason}\`\`\`\n**Please read your log to fnd more information**\nThe bot will kill itself now, bye :wave:`);
        process.exit(1);
    })).then(() => {
        if (client.logChannel) client.logChannel.send(`✅ Configuration reloaded successfully.`);
        m.edit('Done :+1:');
    });
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