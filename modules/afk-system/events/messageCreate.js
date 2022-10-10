const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function(client, message) {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!client.botReadyAt) return;
    if (message.guild.id !== client.guildID) return;
    if (message.content.startsWith(client.config.prefix)) return;
    const userAFK = await client.models['afk-system']['AFKUser'].findOne({
        where: {
            userID: message.author.id,
            autoEnd: true
        }
    });
    if (userAFK) {
        if (userAFK.nickname) await message.member.setNickname(userAFK.nickname, '[afk-system] ' + localize('afk-system', 'afk-nickname-change-audit-log')).catch(e => {message.client.logger.warn(localize('afk-system', 'can-not-edit-nickname', {e, u: message.author.tag}));});
        else await message.member.setNickname(null, '[afk-system] ' + localize('afk-system', 'afk-nickname-change-audit-log')).catch(e => {message.client.logger.warn(localize('afk-system', 'can-not-edit-nickname', {e, u: message.author.tag}));});
        await userAFK.destroy();
        await message.reply(embedType(client.configurations['afk-system']['config']['autoEndMessage'], {'%user%': message.author.toString()}, {allowedMentions: {parse: []}}));
    }
    for (const member of message.mentions.members.values()) {
        if (member.id === message.author.id) continue;
        const afkUser = await client.models['afk-system']['AFKUser'].findOne({
            where: {
                userID: member.id
            }
        });
        if (!afkUser) continue;
        if (afkUser.afkMessage) message.reply(embedType(client.configurations['afk-system']['config']['afkUserWithReason'], {'%reason%': afkUser.afkMessage, '%user%': member.toString()}, {allowedMentions: {parse: []}}));
        else message.reply(embedType(client.configurations['afk-system']['config']['afkUserWithoutReason'], {'%user%': member.toString()}, {allowedMentions: {parse: []}}));
    }
};