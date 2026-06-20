const {
    generateHistoryResponse,
    generateActionsResponse,
    generateUserPanel,
    generatePanelHistory,
    generatePanelActions,
    generatePanelDeletion,
    executeDataDeletion,
    getDeletionCooldown,
    setDeletionCooldown,
    getDeletionTypeLocaleKey
} = require('../ping-protection');
const {localize} = require('../../../src/functions/localize');
const {
    safeSetFooter,
    dateToDiscordTimestamp
} = require('../../../src/functions/helpers.js');
const {
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder
} = require('discord.js');

// Interaction handler
module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    const isAdmin = interaction.member?.permissions?.has('Administrator');

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ping-protection_panel-menu_')) {
        if (!isAdmin) {
            return interaction.reply({
                content: localize('ping-protection', 'no-permission'),
                flags: MessageFlags.Ephemeral
            });
        }

        const targetId = interaction.customId.split('_')[2];
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return interaction.reply({
                content: localize('ping-protection', 'no-data-found'),
                flags: MessageFlags.Ephemeral
            });
        }

        const selection = interaction.values[0];

        let payload;
        if (selection === 'overview') payload = await generateUserPanel(client, targetUser);
        else if (selection === 'history') payload = await generatePanelHistory(client, targetUser, 1);
        else if (selection === 'actions') payload = await generatePanelActions(client, targetUser, 1);
        else if (selection === 'deletion') payload = await generatePanelDeletion(client, targetUser);

        if (payload) return interaction.update(payload);
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ping-protection_delete-menu_')) {
        if (!isAdmin) {
            return interaction.reply({
                content: localize('ping-protection', 'no-permission'),
                flags: MessageFlags.Ephemeral
            });
        }

        const targetId = interaction.customId.split('_')[2];
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return interaction.reply({
                content: localize('ping-protection', 'no-data-found'),
                flags: MessageFlags.Ephemeral
            });
        }

        const selection = interaction.values[0];

        if (selection === 'back') {
            const payload = await generateUserPanel(client, targetUser);
            return interaction.update(payload);
        }

        const cooldown = await getDeletionCooldown(client, targetId);
        if (cooldown) {
            return interaction.reply({
                content: localize('ping-protection', 'err-del-cooldown', {
                    time: localize('ping-protection', getDeletionTypeLocaleKey(cooldown.lastDeletionType)),
                    until: dateToDiscordTimestamp(new Date(cooldown.blockedUntil), 'F')
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (selection === 'del_all' && !isAdmin) {
            return interaction.reply({
                content: localize('ping-protection', 'del-all-admin-only'),
                flags: MessageFlags.Ephemeral
            });
        }

        // Checks to ensure modal content fits Discord limits
        let modalTitle = localize('ping-protection', 'modal-title');
        if (modalTitle.length > 45) {
            modalTitle = localize('ping-protection', 'fallback-modal-title');
        }

        let modalLabel = localize('ping-protection', 'modal-label');
        if (modalLabel.length > 45) {
            modalLabel = localize('ping-protection', 'fallback-modal-label');
        }

        let confirmationPhrase = localize('ping-protection', 'modal-phrase');
        if (confirmationPhrase.length > 100) {
            confirmationPhrase = localize('ping-protection', 'fallback-modal-phrase');
        }

        const modal = new ModalBuilder()
            .setCustomId(`ping-protection_del-confirm_${targetId}_${selection}`)
            .setTitle(modalTitle);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('confirm')
                    .setLabel(modalLabel)
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder(confirmationPhrase)
                    .setRequired(true)
            )
        );

        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping-protection_del-confirm_')) {
        if (!isAdmin) {
            return interaction.reply({
                content: localize('ping-protection', 'no-permission'),
                flags: MessageFlags.Ephemeral
            });
        }

        const parts = interaction.customId.split('_');
        const targetId = parts[2];
        const selection = parts.slice(3).join('_');

        let confirmPhrase = localize('ping-protection', 'modal-phrase');
        if (confirmPhrase.length > 100) {
            confirmPhrase = localize('ping-protection', 'fallback-modal-phrase');
        }

        if (interaction.fields.getTextInputValue('confirm').trim() !== confirmPhrase) {
            return interaction.reply({
                content: localize('ping-protection', 'modal-failed'),
                flags: MessageFlags.Ephemeral
            });
        }

        const cooldown = await getDeletionCooldown(client, targetId);
        if (cooldown) {
            return interaction.reply({
                content: localize('ping-protection', 'err-del-cooldown', {
                    time: localize('ping-protection', getDeletionTypeLocaleKey(cooldown.lastDeletionType)),
                    until: dateToDiscordTimestamp(new Date(cooldown.blockedUntil), 'F')
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (selection === 'del_all') {
            if (!isAdmin) {
                return interaction.reply({
                    content: localize('ping-protection', 'del-all-admin-only'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(localize('ping-protection', 'del-all-title'))
                .setDescription(localize('ping-protection', 'del-all-desc'))
                .setColor('DarkRed');

            safeSetFooter(embed, client);
            if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ping-protection_del-all-confirm_${targetId}`)
                    .setLabel(localize('ping-protection', 'btn-conf-del'))
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`ping-protection_del-all-cancel_${targetId}`)
                    .setLabel(localize('ping-protection', 'btn-cancel'))
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                embeds: [embed.toJSON()],
                components: [row.toJSON()],
                flags: MessageFlags.Ephemeral
            });

            const reply = await interaction.fetchReply();
            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 30000,
                max: 1,
                filter: (btnInt) => btnInt.user.id === interaction.user.id
            });

            collector.on('collect', async (btnInt) => {
                if (!btnInt.member?.permissions?.has('Administrator')) {
                    return btnInt.reply({
                        content: localize('ping-protection', 'del-all-admin-only'),
                        flags: MessageFlags.Ephemeral
                    });
                }

                const liveCooldown = await getDeletionCooldown(client, targetId);
                if (liveCooldown) {
                    return btnInt.reply({
                        content: localize('ping-protection', 'err-del-cooldown', {
                            time: localize('ping-protection', getDeletionTypeLocaleKey(liveCooldown.lastDeletionType)),
                            until: dateToDiscordTimestamp(new Date(liveCooldown.blockedUntil), 'F')
                        }),
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (btnInt.customId.includes('cancel')) {
                    await btnInt.update({
                        content: localize('ping-protection', 'succ-del-canc'),
                        embeds: [],
                        components: []
                    });
                    return;
                }

                if (btnInt.customId.includes('confirm')) {
                    await executeDataDeletion(client, targetId, 'del_all');
                    const blockedUntil = await setDeletionCooldown(client, targetId, 'del_all', btnInt.user.id);

                    client.logger.info(localize('ping-protection', 'log-del-all', {
                        target: targetId,
                        admin: btnInt.user.id
                    }));

                    const targetUser = await client.users.fetch(targetId).catch(() => null);
                    if (targetUser && interaction.message) {
                        const payload = await generateUserPanel(client, targetUser);
                        await interaction.message.edit(payload).catch(() => {
                        });
                    }

                    await btnInt.update({
                        content: localize('ping-protection', 'succ-del-all', {
                            until: dateToDiscordTimestamp(new Date(blockedUntil), 'F')
                        }),
                        embeds: [],
                        components: []
                    });
                }
            });

            collector.on('end', async (_collected, reason) => {
                if (reason === 'time') {
                    await interaction.editReply({
                        content: localize('ping-protection', 'err-del-time'),
                        embeds: [],
                        components: []
                    }).catch(() => {
                    });
                }
            });

            return;
        }

        await executeDataDeletion(client, targetId, selection);
        const blockedUntil = await setDeletionCooldown(client, targetId, selection, interaction.user.id);

        client.logger.info(localize('ping-protection', 'log-del-type', {
            type: selection,
            target: targetId,
            admin: interaction.user.id
        }));

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (targetUser && interaction.message) {
            const payload = await generateUserPanel(client, targetUser);
            await interaction.message.edit(payload).catch(() => {
            });
        }

        return interaction.reply({
            content: localize('ping-protection', 'succ-del-tgt', {
                type: localize('ping-protection', getDeletionTypeLocaleKey(selection)),
                until: dateToDiscordTimestamp(new Date(blockedUntil), 'F')
            }),
            flags: MessageFlags.Ephemeral
        });
    }

    // User panel dropdown and pages handler
    if (interaction.isButton() && interaction.customId.startsWith('ping-protection_')) {

        if (interaction.customId.startsWith('ping-protection_hist-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3], 10);

            const replyOptions = await generateHistoryResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return;
        }

        if (interaction.customId.startsWith('ping-protection_mod-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3], 10);
            const replyOptions = await generateActionsResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return;
        }

        if (interaction.customId.startsWith('ping-protection_panel-hist_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3], 10);

            const targetUser = await client.users.fetch(userId).catch(() => null);
            if (!targetUser) {
                return interaction.reply({
                    content: localize('ping-protection', 'no-data-found'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const payload = await generatePanelHistory(client, targetUser, targetPage);
            return interaction.update(payload);
        }

        if (interaction.customId.startsWith('ping-protection_panel-actions_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3], 10);

            const targetUser = await client.users.fetch(userId).catch(() => null);
            if (!targetUser) {
                return interaction.reply({
                    content: localize('ping-protection', 'no-data-found'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const payload = await generatePanelActions(client, targetUser, targetPage);
            return interaction.update(payload);
        }
    }
};