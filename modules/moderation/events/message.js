const {moderationAction} = require('../moderationActions');
const {confDir} = require('../../../main');
exports.run = async (client, msg) => {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    if (msg.author.bot) return;
    if (moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.id) || moduleConfig['whitelisted_channels_for_invite_blocking'].includes(msg.channel.parentID)) return;
    if (msg.member.roles.cache.find(r => moduleConfig['moderator-roles_level2'].includes(r.id))) return;
    if (moduleConfig['block_invites']) {
        if (msg.content.includes('discord.gg/' || ' discordapp.com/invite/' || 'discord.invite/')) {
            msg.delete();
            moderationAction(client, 'mute', client, msg.member, `Sending invite in <#${msg.channel.id}>`);
        }
    }
};