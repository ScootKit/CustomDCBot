const {localize} = require('../../../src/functions/localize');
const {
    MessageEmbed,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField
} = require('discord.js');
const {
    lockChannel,
    messageLogToStringToPaste,
    embedType,
    formatDiscordUserName,
    parseEmbedColor,
    safeSetFooter
} = require('../../../src/functions/helpers');

/**
 * Close the ticket for the given channel - the exact flow the "close-ticket" button runs,
 * factored out so the button and the "Close Ticket" context command share it. Defers ephemerally.
 * @param {Client} client Discord client
 * @param {Interaction} interaction Interaction to acknowledge/answer
 * @param {object} ticket Open Ticket model instance for interaction.channel
 * @param {object} element Ticket-type configuration element for the ticket
 * @returns {Promise<void>}
 */
async function closeTicket(client, interaction, ticket, element) {

    // Acknowledge immediately: locking + sending can exceed Discord's 3s window and expire the token.
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

/**
 * Create a ticket of the given type for the interaction's user - the exact flow the
 * "create-ticket-<index>" button runs, shared with the "Create Ticket About Message" context
 * command. Defers ephemerally. Optional `reference` is used as the channel topic to link back
 * to the source message.
 * @param {Client} client Discord client
 * @param {Interaction} interaction Interaction to acknowledge/answer
 * @param {object} element Ticket-type configuration element
 * @param {number} typeIndex Index of the ticket type in the module config
 * @param {?string} reference Optional reference text appended to the ticket topic
 * @returns {Promise<void>}
 */
async function createTicket(client, interaction, element, typeIndex, reference = null) {

    // Acknowledge immediately: channel creation + send + pin can exceed Discord's 3s window.
    await interaction.deferReply({ephemeral: true});
    const existingTicket = await client.models['tickets']['Ticket'].findOne({
        where: {
            userID: interaction.user.id,
            type: typeIndex,
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
    const category = element.inheritCategoryPermissions === true
        ? await interaction.guild.channels.fetch(element['ticket-create-category'])
        : null;
    const overwrites = category?.permissionOverwrites?.cache
        ? Array.from(category.permissionOverwrites.cache.values(), overwrite => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield
        }))
        : [];

    /**
     * Merges ticket access into an existing overwrite (or creates one) instead of replacing it, so
     * inherited category permissions survive.
     * @param {String} id Role or member id
     * @param {Number} type OverwriteType
     */
    function grantTicketAccess(id, type) {
        const index = overwrites.findIndex(overwrite => overwrite.id === id);
        const overwrite = index === -1 ? {
            id,
            type,
            allow: 0n,
            deny: 0n
        } : overwrites[index];
        const allow = new PermissionsBitField(overwrite.allow).add(
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
        );
        const deny = new PermissionsBitField(overwrite.deny).remove(
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
        );
        const merged = {
            ...overwrite,
            type,
            allow: allow.bitfield,
            deny: deny.bitfield
        };
        if (index === -1) overwrites.push(merged);
        else overwrites[index] = merged;
    }

    /**
     * Hides the ticket from a role. Only ViewChannel is denied; every other inherited category
     * permission is kept intact, which is the point of the opt-in inherit mode.
     * @param {String} id Role id
     */
    function denyEveryoneAccess(id) {
        const index = overwrites.findIndex(overwrite => overwrite.id === id);
        const overwrite = index === -1 ? {
            id,
            type: OverwriteType.Role,
            allow: 0n,
            deny: 0n
        } : overwrites[index];
        const allow = new PermissionsBitField(overwrite.allow).remove(PermissionFlagsBits.ViewChannel);
        const deny = new PermissionsBitField(overwrite.deny).add(PermissionFlagsBits.ViewChannel);
        const merged = {
            ...overwrite,
            type: OverwriteType.Role,
            allow: allow.bitfield,
            deny: deny.bitfield
        };
        if (index === -1) overwrites.push(merged);
        else overwrites[index] = merged;
    }

    denyEveryoneAccess(interaction.guild.id); // Discord guarantees @everyone's role id is the guild id
    grantTicketAccess(interaction.member.id, OverwriteType.Member);
    element.ticketRoles.forEach(rID => {
        grantTicketAccess(rID, OverwriteType.Role);
    });
    let topic = `Ticket created by ${interaction.user.toString()} by clicking on a message in ${interaction.channel.toString()}`;
    if (reference) topic = reference;
    const channel = await interaction.guild.channels.create({
        name: formatDiscordUserName(interaction.user).split('#').join('-'),
        parent: element['ticket-create-category'],
        topic: topic,
        reason: localize('tickets', 'ticket-created-audit-log', {u: formatDiscordUserName(interaction.user)}),
        permissionOverwrites: overwrites
    });
    const ticket = await client.models['tickets']['Ticket'].create({
        open: true,
        userID: interaction.user.id,
        channelID: channel.id,
        addedUsers: [interaction.user.id],
        type: typeIndex
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
            customId: `close-ticket` + typeIndex
        }]
    }]));
    await msg.pin();
    if (reference) await channel.send({
        content: reference,
        allowedMentions: {parse: []}
    });
    await interaction.editReply({
        content: '✅ ' + localize('tickets', 'ticket-created', {c: channel.toString()})
    });
    return channel;
}

module.exports.closeTicket = closeTicket;
module.exports.createTicket = createTicket;

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
            await closeTicket(client, interaction, ticket, element);
        }
        if (interaction.customId.startsWith('create-ticket-') && parseFloat(interaction.customId.replaceAll('create-ticket-', '')) === moduleConfig.indexOf(element)) {
            await createTicket(client, interaction, element, moduleConfig.indexOf(element));
        }
    }
};