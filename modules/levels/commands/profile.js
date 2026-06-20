const {
    embedType,
    formatDate,
    formatNumber,
    parseEmbedColor,
    safeSetFooter,
    formatVoiceDuration,
    todayInServerTZ
} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../../src/functions/localize');
const {
    getMemberRoleFactor,
    calculateLevelXP,
    displayLevel,
    isMaxLevel
} = require('../events/messageCreate');
const {client} = require('../../../main');

module.exports.run = async function (interaction) {
    const moduleStrings = interaction.client.configurations['levels']['strings'];
    const moduleConfig = interaction.client.configurations['levels']['config'];

    let member = interaction.member;
    if (interaction.options.getUser('user')) member = await interaction.guild.members.fetch(interaction.options.getUser('user').id);

    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return interaction.reply(embedType(moduleStrings['user_not_found'], {}, {ephemeral: true}));

    const nextLevelXp = calculateLevelXP(interaction.client, user.level + 1);

    const embed = new MessageEmbed()
        .setColor(parseEmbedColor(moduleStrings.embed.color || 'GREEN'))
        .setThumbnail(member.user.avatarURL({forceStatic: false}))
        .setTitle(moduleStrings.embed.title.replaceAll('%username%', member.user.username))
        .setDescription(moduleStrings.embed.description.replaceAll('%username%', member.user.username))
        .addField(moduleStrings.embed.messages, formatNumber(user.messages), true)
        .addField(moduleStrings.embed.xp, `${formatNumber(isMaxLevel(user.level, interaction.client) ? calculateLevelXP(interaction.client, interaction.client.configurations['levels']['config'].maximumLevel) : user.xp)}/${isMaxLevel(user.level, interaction.client) ? '∞' : formatNumber(nextLevelXp)}`, true)
        .addField(moduleStrings.embed.level, displayLevel(user.level, interaction.client), true);

    const today = todayInServerTZ();
    const dailyMessages = user.dailyResetDate === today ? user.dailyMessages : 0;
    const dailyVoiceSeconds = user.dailyResetDate === today ? user.dailyVoiceSeconds : 0;
    embed.addField(moduleStrings.embed.messagesToday, formatNumber(dailyMessages), true);
    embed.addField(moduleStrings.embed.voiceTimeToday, formatVoiceDuration(dailyVoiceSeconds), true);
    
    safeSetFooter(embed, interaction.client);

    const roleFactor = getMemberRoleFactor(member);
    if (roleFactor !== 1) {
        let roleString = '';
        for (const role of member.roles.cache.filter(f => moduleConfig['multiplication_roles'][f.id]).values()) {
            roleString = roleString + `\n* <@&${role.id}>: ${moduleConfig['multiplication_roles'][role.id]}x`;
        }
        embed.addField(moduleStrings.embed.roleFactor, `${roleString}\n${localize('levels', 'role-factors-total', {f: formatNumber(roleFactor, {maximumFractionDigits: 2})})}`, true);
    }
    embed.addField(moduleStrings.embed.joinedAt, formatDate(member.joinedAt), true);
    interaction.reply({
        ephemeral: true,
        embeds: [embed]
    });
};

module.exports.config = {
    name: 'profile',
    description: localize('levels', 'profile-command-description'),
    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('levels', 'profile-user-description'),
            required: false
        }
    ]
};