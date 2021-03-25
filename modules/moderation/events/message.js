const {moderationAction} = require('../moderationActions');
const {confDir} = require('../../../main');
exports.run = async (client, msg) => {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    if (msg.author.bot) return;
    if (!msg.member) return;
    if (msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id))) return;
    let containsBlacklistedWord = false;
    moduleConfig['blacklisted_words'].forEach(word => {
        if (msg.content.toLowerCase().includes(word.toLowerCase())) containsBlacklistedWord = true;
    });
    if (containsBlacklistedWord) {
        if (moduleConfig['action_on_posting_blacklisted_word'] !== 'none') {
            await msg.delete();
            await moderationAction(client, moduleConfig['action_on_posting_blacklisted_word'], client, msg.member, `Posted blacklisted word in <#${msg.channel.id}>`);
        }
    }
    if (moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.id) || moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.parentID)) return;
    if (msg.member.roles.cache.find(r => moduleConfig['whitelisted_roles_for_invite_blocking'].includes(r.id))) return;
    if (moduleConfig['action_on_invite'] !== 'none') {
        if (msg.content.includes('discord.gg/' || ' discordapp.com/invite/' || 'discord.invite/')) {
            await msg.delete();
            await moderationAction(client, moduleConfig['action_on_invite'], client, msg.member, `Sending invite in <#${msg.channel.id}>`);
        }
    }
};