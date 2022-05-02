const {editBalance} = require('../economy-system');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['economy-system']['config'];

    if (config['messageDrops'] === 0) return;
    if (config['msgDropsIgnoredChannels'].includes(message.channel.id)) return;
    if (Math.floor(Math.random() * config['messageDrops']) !== 1) return;
    const toAdd = Math.floor(Math.random() * (config['messageDropsMax'] - config['messageDropsMin'])) + config['messageDropsMin'];
    await editBalance(client, message.author.id, 'add', toAdd);
    const sendMsg = await client.models['economy-system']['dropMsg'].findOne({
        where: {
            id: message.author.id
        }
    });
    if (!sendMsg) {
        const msg = await message.reply({content: localize('economy-system', 'message-drop', {m: toAdd, c: config['currencySymbol']})});
        setTimeout(() => {
            msg.delete();
        }, 5000);
    }
    client.logger.info(`[economy-system] ` + localize('economy-system', 'message-drop-earned-money', {
        m: toAdd,
        u: message.author.tag,
        c: config['currencySymbol']
    }));
    if (client.logChannel) client.logChannel.send(`[economy-system] ` + localize('economy-system', 'message-drop-earned-money', {
        m: toAdd,
        u: message.author.tag,
        c: config['currencySymbol']
    }));
};