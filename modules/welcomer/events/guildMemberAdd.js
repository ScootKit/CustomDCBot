const {confDir} = require('../../../main');
exports.run = async (client, member) => {
    const moduleConfig = require(`${confDir}/welcomer/config.json`);
    if (!member.guild.channels.cache.get(moduleConfig['welcome-message-channel'])) return console.error('Could not found welcome channel')
    if (moduleConfig['not-send-messages-if-member-is-bot'] && member.user.bot) return;
    await member.guild.channels.cache.get(moduleConfig['welcome-message-channel']).send(
        moduleConfig['welcome-text'].split('%mention%').join(`<@${member.id}>`)
            .split('%servername%').join(member.guild.name)
            .split('%tag%').join(member.user.tag)
            .split('%createdAt%').join(`${member.user.createdAt.getDate()}.${member.user.createdAt.getMonth()}.${member.user.createdAt.getFullYear()}`)
    )
    for (const roleID of moduleConfig['give-roles-on-join']) {
        await member.roles.add(await member.guild.roles.fetch(roleID))
    }
}