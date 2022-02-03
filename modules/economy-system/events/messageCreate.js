const {balance} = require('../economy-system');
const {localize} = require('../../../src/functions/localize');
const {embedType, randomElementFromArray, randomIntFromInterval} = require('../../../src/functions/helpers');

module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== client.config.guildID) return;

    const config = client.configurations['economy-system']['config'];

    if (config['messageDrops'] === 0) return;
    if (config['msgDropsIgnoredChannels'].includes(message.channel.id)) return;
    if (Math.floor(Math.random() * parseInt(config['messageDrops'])) !== 1) return;
    const toAdd = randomIntFromInterval(parseInt(config['messageDropsMin']), parseInt(config['messageDropsMax']));
    await balance(client, message.author.id, 'add', toAdd);
    const model = await client.models['economy-system']['dropMsg'].findOne({
        where: {
            id: message.author.id
        }
    });
    if (!model) {
        const msg = await message.reply(embedType(randomElementFromArray(client.configurations['economy-system']['strings']['msgDro0pMsg']), {'%erned%': `${toAdd} ${config['currencySymbol']}`}));
        setTimeout(async function () {
            msg.delete();
        }, 8000);
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