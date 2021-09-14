const {embedType, formatDate} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (interaction) {
    const moduleStrings = interaction.client.configurations['levels']['strings'];

    let member = interaction.member;
    if (interaction.options.getUser('user')) member = await interaction.guild.members.fetch(interaction.options.getUser('user').id);

    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return interaction.reply(embedType(moduleStrings['user_not_found'], {}, {ephemeral: true}));

    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);

    const embed = new MessageEmbed()
        .setFooter(interaction.client.strings.footer, interaction.client.strings.footerImgUrl)
        .setColor(moduleStrings.embed.color || 'GREEN')
        .setThumbnail(member.user.avatarURL({dynamic: true}))
        .setTitle(moduleStrings.embed.title.replaceAll('%username%', member.user.username))
        .setDescription(moduleStrings.embed.description.replaceAll('%username%', member.user.username))
        .addField(moduleStrings.embed.messages, user.messages.toString(), true)
        .addField(moduleStrings.embed.xp, `${user.xp}/${nextLevelXp}`, true)
        .addField(moduleStrings.embed.level, user.level.toString(), true)
        .addField(moduleStrings.embed.joinedAt, formatDate(member.joinedAt), true);

    interaction.reply({ephemeral: true, embeds: [embed]});
};

module.exports.config = {
    name: 'profile',
    description: 'Shows the profile of you or an an user',
    options: [
        {
            type: 'USER',
            name: 'user',
            description: 'User to see the profile from (default: you)',
            required: false
        }
    ]
};