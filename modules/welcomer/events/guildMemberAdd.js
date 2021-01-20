const {embedType} = require('../../../src/functions/helpers');
const {confDir} = require('../../../main');
exports.run = async (client, member) => {
    const moduleConfig = require(`${confDir}/welcomer/config.json`);
    if (!member.guild.channels.cache.get(moduleConfig['welcome-message-channel'])) return console.error('Could not found welcome channel');
    if (moduleConfig['not-send-messages-if-member-is-bot'] && member.user.bot) return;
    await member.guild.channels.cache.get(moduleConfig['welcome-message-channel']).send(
        ...embedType(moduleConfig['welcome-text'],
            {
                '%mention%': `<@${member.id}>`,
                '%servername%': member.guild.name,
                '%tag%': member.user.tag,
                '%createdAt%': `${member.user.createdAt.getDate()}.${member.user.createdAt.getMonth() + 1}.${member.user.createdAt.getFullYear()}`,
                '%joinedAt%': `${member.user.joinedAt.getDate()}.${member.user.joinedAt.getMonth() + 1}.${member.user.joinedAt.getFullYear()}`
            })
    );
    for (const roleID of moduleConfig['give-roles-on-join']) {
        await member.roles.add(await member.guild.roles.fetch(roleID));
    }
};
