const {editBalance} = require('../economy-system');
const {localize} = require('../../../src/functions/localize');
const {
    formatDiscordUserName,
    embedType,
    randomElementFromArray,
    randomIntFromInterval
} = require('../../../src/functions/helpers');

module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['economy-system']['config'];

    if (config['messageDrops'] === 0) return;
    if (config['msgDropsIgnoredChannels'].includes(message.channel.id)) return;
    if (randomIntFromInterval(1, config['messageDrops']) !== 1) return;
    const toAdd = randomIntFromInterval(parseInt(config['messageDropsMin']), parseInt(config['messageDropsMax']));
    await editBalance(client, message.author.id, 'add', toAdd);
    const sendMsg = await client.models['economy-system']['dropMsg'].findOne({
        where: {
            id: message.author.id
        }
    });
    if (!sendMsg) {
        const dropMessage = randomElementFromArray(client.configurations['economy-system']['strings']['msgDropMsg'] || []);
        const msg = await message.reply(dropMessage
            ? embedType(dropMessage, {'%earned%': `${toAdd} ${config['currencySymbol']}`})
            : {content: localize('economy-system', 'message-drop', {m: toAdd, c: config['currencySymbol']})});
        setTimeout(() => {
            msg.delete();
        }, 5000);
    }
    client.logger.info(`[economy-system] ` + localize('economy-system', 'message-drop-earned-money', {
        m: toAdd,
        u: formatDiscordUserName(message.author),
        c: config['currencySymbol']
    }));
    if (client.logChannel) client.logChannel.send(`[economy-system] ` + localize('economy-system', 'message-drop-earned-money', {
        m: toAdd,
        u: formatDiscordUserName(message.author),
        c: config['currencySymbol']
    }));
};