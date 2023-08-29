const {localize} = require('../../../src/functions/localize');
const {embedType, messageLogToStringToPaste} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (interaction) {
    const user = interaction.options.getMember('user');
    if (!user) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('moderation', 'report-user-not-found-on-guild', {s: interaction.guild.name})
    });
    if (user.id === interaction.client.user.id) return interaction.reply({
        ephemeral: true,
        content: '[I\'m sorry, Dave, I\'m afraid I can\'t do that.](https://youtu.be/7qnd-hdmgfk)'
    });
    if (user.roles.cache.find(r => [...interaction.client.configurations['moderation']['config']['moderator-roles_level2'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level1'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level3'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level4']].includes(r.id))) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('moderation', 'can-not-report-mod')
    });
    const logUrl = await messageLogToStringToPaste(interaction.channel);
    let logChannel = interaction.client.configurations['moderation']['config']['report-channel-id'] ? interaction.client.channels.cache.get(interaction.client.configurations['moderation']['config']['report-channel-id']) : null;
    if (!logChannel) logChannel = interaction.client.configurations['moderation']['config']['logchannel-id'] ? interaction.client.channels.cache.get(interaction.client.configurations['moderation']['config']['logchannel-id']) : null;
    if (!logChannel) logChannel = interaction.client.logChannel;
    let pingContent = '';
    interaction.client.configurations['moderation']['config']['roles-to-ping-on-report'].forEach(rid => {
        pingContent = pingContent + ` <@&${rid}>`;
    });
    if (pingContent === '') pingContent = localize('moderation', 'no-report-pings');
    const fields = [];
    const proof = interaction.options.getAttachment('proof');
    if (proof) fields.push({
        name: localize('moderation', 'proof'),
        value: `[${localize('moderation', 'file')}](${proof.proxyURL || proof.url})`,
        inline: true
    });
    logChannel.send({
        embeds: [
            new MessageEmbed()
                .setTitle(localize('moderation', 'report-embed-title'))
                .setDescription(localize('moderation', 'report-embed-description'))
                .addField(localize('moderation', 'reported-user'), interaction.options.getUser('user').toString() + ` \`${interaction.options.getUser('user').id}\``, true)
                .addField(localize('moderation', 'message-log'), localize('moderation', 'message-log-description', {u: logUrl}), true)
                .addField(localize('moderation', 'channel'), interaction.channel.toString(), true)
                .addField(localize('moderation', 'report-reason'), interaction.options.getString('reason'))
                .addField(localize('moderation', 'report-user'), interaction.user.toString() + ` \`${interaction.user.id}\``)
                .addFields(fields)
                .setColor('RED')
                .setImage(proof ? (proof.proxyURL || proof.url) : null)
                .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
                .setAuthor({name: interaction.client.user.username, iconURL: interaction.client.user.avatarURL()})
                .setTimestamp()
        ],
        content: pingContent
    });
    interaction.reply(embedType(interaction.client.configurations['moderation']['strings']['submitted-report-message'], {'%mURL%': logUrl, '%user%': interaction.options.getUser('user').toString()}, {ephemeral: true}));
};

module.exports.config = {
    name: 'report',
    description: localize('moderation', 'report-command-description'),
    options: [
        {
            type: 'USER',
            name: 'user',
            required: true,
            description: localize('moderation', 'report-user-description')
        },
        {
            type: 'STRING',
            name: 'reason',
            required: true,
            description: localize('moderation', 'report-reason-description')
        },
        {
            type: 'ATTACHMENT',
            name: 'proof',
            description: localize('moderation', 'report-proof-description')
        }
    ]
};