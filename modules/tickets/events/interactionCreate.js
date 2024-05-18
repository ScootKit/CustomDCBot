const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const {
    lockChannel,
    messageLogToStringToPaste,
    embedType,
    formatDiscordUserName
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
            await interaction.channel.send({
                content: localize('tickets', 'closing-ticket', {u: interaction.user.toString()}),
                allowedMentions: {parse: []}
            });
            await lockChannel(interaction.channel, [], localize('tickets', 'ticket-closed-audit-log', {u: formatDiscordUserName(interaction.user)}));

            interaction.reply({
                ephemeral: true,
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
                await logChannel.send({
                    embeds: [
                        new MessageEmbed()
                            .setColor('DARK_GREEN')
                            .setTitle(localize('tickets', 'ticket-log-embed-title', {i: ticket.id}))
                            .setFooter({
                                text: client.strings.footer,
                                iconURL: client.strings.footerImgUrl
                            })
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
                            .addField(localize('tickets', 'closed-by'), interaction.user.toString(), true)
                    ]
                });
            }
            setTimeout(() => {
                interaction.channel.delete(localize('tickets', 'ticket-closed-audit-log', {u: formatDiscordUserName(interaction.user)}));
            }, 20000);
        }
        if (interaction.customId.startsWith('create-ticket-') && parseFloat(interaction.customId.replaceAll('create-ticket-', '')) === moduleConfig.indexOf(element)) {
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
                if (ticketChannel) return interaction.reply({
                    ephemeral: true,
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
            const channel = await interaction.guild.channels.create(formatDiscordUserName(interaction.user).split('#').join('-'), {
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
            interaction.reply({
                ephemeral: true,
                content: '✅ ' + localize('tickets', 'ticket-created', {c: channel.toString()})
            });
        }
    }
};