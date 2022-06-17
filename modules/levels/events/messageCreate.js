const {embedType, randomIntFromInterval, randomElementFromArray} = require('../../../src/functions/helpers');
const {registerNeededEdit} = require('../leaderboardChannel');
const {localize} = require('../../../src/functions/localize');
const cooldown = new Set();

exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.author.bot) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (cooldown.has(msg.author.id)) return;

    const moduleConfig = client.configurations['levels']['config'];
    const moduleStrings = client.configurations['levels']['strings'];

    if (msg.content.includes(client.config.prefix)) return;
    if (moduleConfig.blacklisted_channels.includes(msg.channel.id)) return;
    const xp = randomIntFromInterval(moduleConfig['min-xp'], moduleConfig['max-xp']);
    let user = await client.models['levels']['User'].findOne({
        where: {
            userID: msg.author.id
        }
    });
    if (!user) {
        user = await client.models['levels']['User'].create({
            userID: msg.author.id,
            messages: 0,
            xp: 0
        });
    }
    user.messages = user.messages + 1;
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    user.xp = user.xp + xp;

    if (nextLevelXp <= user.xp) {
        user.level = user.level + 1;
        const channel = client.channels.cache.find(c => c.id === moduleConfig.level_up_channel_id);

        const specialMessage = client.configurations['levels']['special-levelup-messages'].find(m => m.level === user.level);
        const isRewardMessage = !!moduleConfig.reward_roles[user.level.toString()];
        const randomMessages = client.configurations['levels']['random-levelup-messages'].filter(m => m.type === (isRewardMessage ? 'with-reward' : 'normal'));

        let messageToSend = moduleStrings.level_up_message;
        if (isRewardMessage) messageToSend = moduleStrings.level_up_message_with_reward;

        if (moduleConfig.randomMessages) {
            if (moduleConfig.randomMessages.length === 0) client.warn('[levels] ' + localize('levels', 'random-messages-enabled-but-non-configured'));
            else if (randomMessages.length !== 0) messageToSend = randomElementFromArray(randomMessages).message;
        }

        if (isRewardMessage) {
            if (moduleConfig.onlyTopLevelRole) {
                for (const role of Object.values(moduleConfig.reward_roles)) {
                    if (msg.member.roles.cache.has(role)) await msg.member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
                }
            }
            await msg.member.roles.add(moduleConfig.reward_roles[user.level.toString()], '[levels]' + localize('levels', 'granted-rewards-audit-log')).catch();
        }
        if (specialMessage) messageToSend = specialMessage.message;

        await sendLevelUpMessage(embedType(messageToSend, {
            '%mention%': `<@${msg.author.id}>`,
            '%newLevel%': user.level,
            '%role%': isRewardMessage ? `<@&${moduleConfig.reward_roles[user.level.toString()]}>` : localize('levels', 'no-role'),
            '%tag%': msg.author.tag
        }, {allowedMentions: {parse: ['users']}}));

        /**
         * Sends the level up messages
         * @private
         * @param {Object} content Content of the message
         */
        async function sendLevelUpMessage(content) {
            if (channel) await channel.send(content);
            else await msg.reply(content);
        }
    }

    cooldown.add(msg.author.id);
    registerNeededEdit();
    setTimeout(() => {
        cooldown.delete(msg.author.id);
    }, moduleConfig.cooldown);
    await user.save();
};