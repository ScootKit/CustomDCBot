const {embedType, formatDate, formatNumber} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {getUser} = require('@scnetwork/api');
const {localize} = require('../../../src/functions/localize');

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

    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);

    let scnUser = moduleConfig.disableSCNetworkProfile ? null : await getUser(member.user.id).catch(() => {
    });

    const embed = new MessageEmbed()
        .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
        .setColor(moduleStrings.embed.color || 'GREEN')
        .setThumbnail(member.user.avatarURL({dynamic: true}))
        .setTitle(moduleStrings.embed.title.replaceAll('%username%', member.user.username))
        .setDescription(moduleStrings.embed.description.replaceAll('%username%', member.user.username))
        .addField(moduleStrings.embed.messages, formatNumber(user.messages), true)
        .addField(moduleStrings.embed.xp, `${formatNumber(user.xp)}/${formatNumber(nextLevelXp)}`, true)
        .addField(moduleStrings.embed.level, user.level.toString(), true)
        .addField(moduleStrings.embed.joinedAt, formatDate(member.joinedAt), true);

    interaction.reply({ephemeral: true, embeds: [embed]});
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