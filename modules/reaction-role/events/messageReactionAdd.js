const {confDir} = require('../../../main');
exports.run = async (client, messageReaction, user) => {
    const moduleConfig = require(`${confDir}/reaction-role/reaction-roles.json`);
    const configElement = moduleConfig.find(i => i.messageID === messageReaction.message.id);
    if (!configElement) return;
    if (!messageReaction.message.channel.guild) return;
    const role = configElement['reaction_roles'][messageReaction.emoji.toString().split('<').join('').split('>').join('')];
    if (role) {
        const member = await messageReaction.message.channel.guild.members.fetch(user.id);
        await member.roles.add(role);
        await messageReaction.message.react(messageReaction.emoji.toString().split('<').join('').split('>').join('')).catch(e => {
        });
    }
};
