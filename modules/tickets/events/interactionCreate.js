const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const {
    lockChannel,
    messageLogToStringToPaste,
    embedType,
    formatDiscordUserName,
    parseEmbedColor,
    safeSetFooter
} = require('../../../src/functions/helpers');

module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    if (interaction.guild.id !== client.config.guildID) return;
    if (!interaction.isButton()) return;
    const moduleConfig = client.configurations['tickets']['config'];
    for (const element of moduleConfig) {
        if (interaction.customId === 'close-ticket' + moduleConfig.indexOf(element)) {
            const ticket = await client.models['tickets']['Ticket'].findOne({
                where: {
                    channelID: interaction.channel.id,
                    type: moduleConfig.indexOf(element),
                    open: true
                }
            });
            if (!ticket) return;

            /*
             * Acknowledge immediately: locking the channel and sending messages can take
             * longer than Discord's 3s interaction window, which would otherwise expire the
             * token and produce an "Unknown interaction" error when we reply below.
             */
            await interaction.deferReply({ephemeral: true});
            await interaction.channel.send({
                content: localize('tickets', 'closing-ticket', {u: interaction.user.toString()}),
                allowedMentions: {parse: []}
            });
            await lockChannel(interaction.channel, [], localize('tickets', 'ticket-closed-audit-log', {u: formatDiscordUserName(interaction.user)}));

            await interaction.editReply({
                content: localize('tickets', 'ticket-closed-successfully')
            });
            ticket.open = false;
            await ticket.save();

            const msgLog = await messageLogToStringToPaste(interaction.channel, ticket.msgCount, '1year');
            if (element.sendUserDMAfterTicketClose) {
                const user = await client.users.fetch(ticket.userID);
                user.send(embedType(element.userDM, {
                    '%transcriptURL%': msgLog,
                    '%type%': element.name
                })).catch(e => client.logger.warn('[tickets] ' + localize('tickets', 'could-not-dm', {
                    e,
                    u: ticket.userID
                })));
            }
            const logChannel = element.logChannel ? interaction.guild.channels.cache.get(element.logChannel) : client.logChannel;
            if (!logChannel) client.logger.error('[tickets] ' + localize('tickets', 'no-log-channel'));
            else {
                const ticketEmbed = new MessageEmbed()
                    .setColor(parseEmbedColor('DARK_GREEN'))
                    .setTitle(localize('tickets', 'ticket-log-embed-title', {i: ticket.id}))
                    .setAuthor({
                        name: client.user.username,
                        iconURL: client.user.avatarURL()
                    })
                    .addField(localize('tickets', 'ticket-with-user'), `<@${ticket.userID}>`, true)
                    .addField(localize('tickets', 'ticket-type'), element.name, true)
                    .addField(localize('tickets', 'ticket-log'), localize('tickets', 'ticket-log-value', {
                        u: msgLog,
                        n: ticket.msgCount
                    }), true)
                    .addField(localize('tickets', 'closed-by'), interaction.user.toString(), true);
                safeSetFooter(ticketEmbed, client);
                await logChannel.send({
                    embeds: [ticketEmbed]
                });
            }
            setTimeout(() => {
                interaction.channel.delete(localize('tickets', 'ticket-closed-audit-log', {u: formatDiscordUserName(interaction.user)}));
            }, 20000);
        }
        if (interaction.customId.startsWith('create-ticket-') && parseFloat(interaction.customId.replaceAll('create-ticket-', '')) === moduleConfig.indexOf(element)) {

            /*
             * Acknowledge immediately: creating the channel, sending the creation message and
             * pinning it routinely take longer than Discord's 3s interaction window. Replying
             * only after that work expired the token and surfaced as "Unknown interaction".
             */
            await interaction.deferReply({ephemeral: true});
            const existingTicket = await client.models['tickets']['Ticket'].findOne({
                where: {
                    userID: interaction.user.id,
                    type: moduleConfig.indexOf(element),
                    open: true
                }
            });
            if (existingTicket) {
                const ticketChannel = await interaction.guild.channels.fetch(existingTicket.channelID).catch(() => {
                });
                if (ticketChannel) return await interaction.editReply({
                    content: localize('tickets', 'existing-ticket', {c: `<#${existingTicket.channelID}>`})
                });
                existingTicket.open = false;
                await existingTicket.save();
            }
            const overwrites = [];
            element.ticketRoles.forEach(rID => {
                overwrites.push(
                    {
                        id: rID,
                        type: 'ROLE',
                        allow: ['SEND_MESSAGES', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
                    }
                );
            });
            const channel = await interaction.guild.channels.create({
                name: formatDiscordUserName(interaction.user).split('#').join('-'),
                parent: element['ticket-create-category'],
                topic: `Ticket created by ${interaction.user.toString()} by clicking on a message in ${interaction.channel.toString()}`,
                reason: localize('tickets', 'ticket-created-audit-log', {u: formatDiscordUserName(interaction.user)}),
                permissionOverwrites: [{
                    id: interaction.guild.roles.cache.find(r => r.name === '@everyone'),
                    deny: ['SEND_MESSAGES', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
                },
                    {
                        id: interaction.member,
                        allow: ['SEND_MESSAGES', 'VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
                    }, ...overwrites]
            });
            const ticket = await client.models['tickets']['Ticket'].create({
                open: true,
                userID: interaction.user.id,
                channelID: channel.id,
                addedUsers: [interaction.user.id],
                type: moduleConfig.indexOf(element)
            });
            let pingMsg = '';
            element.ticketRoles.forEach(rID => pingMsg = pingMsg + `<@&${rID}> `);
            if (pingMsg === '') pingMsg = localize('tickets', 'no-admin-pings');
            const msg = await channel.send(embedType(element['creation-message'], {
                '%id%': ticket.id,
                '%userMention%': interaction.user.toString(),
                '%ticketTopic%': element.name,
                '%rolePings%': pingMsg,
                '%userTag%': formatDiscordUserName(interaction.user)
            }, {}, [{
                type: 'ACTION_ROW',
                components: [{
                    type: 'BUTTON',
                    label: element['ticket-close-button'],
                    style: 'PRIMARY',
                    customId: `close-ticket` + moduleConfig.indexOf(element)
                }]
            }]));
            await msg.pin();
            await interaction.editReply({
                content: '✅ ' + localize('tickets', 'ticket-created', {c: channel.toString()})
            });
        }
    }
};