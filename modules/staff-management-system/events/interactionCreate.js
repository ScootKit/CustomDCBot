const {
    getConfig,
    checkStaffPermissions,
    applyFooter,
    generateReviewHistoryResponse,
    generatePromotionHistoryResponse,
    generateInfractionHistoryResponse,
    generateUserPanel,
    generatePanelInfractions,
    generatePanelPromotions,
    generatePanelReviews,
    generatePanelStatus,
    generatePanelActivity,
    generatePanelShifts,
    generatePanelDeletion,
    executeDataDeletion,
    generatePanelSubpage
} = require('../staff-management');
const {
    handleStatusEnd,
    scheduleStatusExpiry,
    handleStatusEndSubmit,
    handleStatusExtend,
    handleStatusExtendSubmit,
    handleStatusHistPage,
    sendStatusDm,
    logStatusChange
} = require('../commands/staff-status.js');
const { localize } = require('../../../src/functions/localize');
const dutyHandlers = require('../commands/duty.js').buttonHandlers;
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports.run = async (client, interaction) => {
    if (!client.botReadyAt) return;
    if (!interaction.guild || interaction.guild.id !== client.guildID) return;
    if (!interaction.customId || (!interaction.customId.startsWith('staff-mgmt_') && !interaction.customId.startsWith('duty-mgmt_'))) return;

    try {
        const parts = interaction.customId.split('_');
        const action = parts[1];

        // ----- Duty manage handlers -----
        if (interaction.customId.startsWith('duty-mgmt_')) {
            const dutyAction = parts[1];

            if (interaction.isStringSelectMenu() && dutyAction === 'dropdown') {
                await interaction.deferUpdate();
                return await dutyHandlers.handleDutyDropdown(client, interaction, parts[2], interaction.values[0]);
            }

            if (['start', 'break', 'end', 'hist', 'lb', 'admin-forceend', 'admin-voidactive'].includes(dutyAction)) {
                 await interaction.deferUpdate();
            }

            if (dutyAction === 'start')                return await dutyHandlers.handleDutyStartButton(client, interaction);
            if (dutyAction === 'break')                return await dutyHandlers.handleDutyBreakButton(client, interaction);
            if (dutyAction === 'end')                  return await dutyHandlers.handleDutyEndButton(client, interaction);
            if (dutyAction === 'hist')                 return await dutyHandlers.handleDutyHistPageButton(client, interaction);
            if (dutyAction === 'lb')                   return await dutyHandlers.handleDutyLbPageButton(client, interaction);
            if (dutyAction === 'admin-forceend')       return await dutyHandlers.handleDutyAdminForceEnd(client, interaction);
            if (dutyAction === 'admin-voidactive')     return await dutyHandlers.handleDutyAdminVoidActive(client, interaction);
            if (dutyAction === 'admin-voidall')        return await dutyHandlers.handleDutyAdminVoidAll(client, interaction);
            if (dutyAction === 'admin-voidall-submit') return await dutyHandlers.handleDutyAdminVoidAllSubmit(client, interaction);
            if (dutyAction === 'admin-addtime')        return await dutyHandlers.handleDutyAdminAddTimeButton(client, interaction);
            if (dutyAction === 'admin-addtime-submit') return await dutyHandlers.handleDutyAdminAddTimeSubmit(client, interaction);
            return;
        }

        // ----- Review history pagination -----
        if (action === 'rev-page') {
            await interaction.deferUpdate();
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.followUp({
                content: localize('staff-management-system', 'err-gen-no-user'),
                flags: MessageFlags.Ephemeral
            });

            const payload = await generateReviewHistoryResponse(client, targetUser, parseInt(parts[3], 10));
            if (payload.content) return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
            return interaction.editReply(payload);
        }

        // ----- LOA/RA handlers -----
        const loaActions = ['loa-end', 'loa-end-submit', 'loa-extend', 'loa-extend-submit', 'loa-hist'];
        const raActions  = ['ra-end',  'ra-end-submit',  'ra-extend',  'ra-extend-submit',  'ra-hist'];

        if (loaActions.includes(action) || raActions.includes(action)) {
            const type = action.startsWith('loa-') ? 'LOA' : 'RA';
            const base = action.replace(/^(loa|ra)-/, '');

            if (base === 'end')           return handleStatusEnd(interaction, type);
            if (base === 'end-submit')    return handleStatusEndSubmit(client, interaction, type);
            if (base === 'extend')        return handleStatusExtend(interaction, type);
            if (base === 'extend-submit') return handleStatusExtendSubmit(client, interaction, type);
            if (base === 'hist')          return handleStatusHistPage(client, interaction, type);
        }

        // ----- Promotion history pagination -----
        if (action === 'prom-hist') {
            await interaction.deferUpdate();
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.followUp({
                content: localize('staff-management-system', 'err-gen-no-user'),
                flags: MessageFlags.Ephemeral
            });

            const payload = await generatePromotionHistoryResponse(client, targetUser, parseInt(parts[3], 10));
            if (payload.content) return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
            return interaction.editReply(payload);
        }

        // ----- Infraction history pagination -----
        if (action === 'inf-hist') {
            await interaction.deferUpdate();
            const targetUser = await client.users.fetch(parts[2]).catch(() => null);
            if (!targetUser) return interaction.followUp({
                content: localize('staff-management-system', 'err-gen-no-user'),
                flags: MessageFlags.Ephemeral
            });

            const payload = await generateInfractionHistoryResponse(client, targetUser, parseInt(parts[3], 10));
            if (payload.content) return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
            return interaction.editReply(payload);
        }

        // ----- User panel dropdown -----
        if (interaction.customId.startsWith('staff-mgmt_panel-menu_')) {
            const targetId = interaction.customId.split('_')[2];
            await interaction.deferUpdate();
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (!targetUser) return interaction.followUp({
                content: localize('staff-management-system', 'err-gen-no-user'),
                flags: MessageFlags.Ephemeral
            });

            const selection = interaction.values[0];
            let payload;
            if (selection === 'overview') payload = await generateUserPanel(client, targetUser);
            else if (selection === 'infractions') payload = await generatePanelInfractions(client, targetUser, 1);
            else if (selection === 'promotions') payload = await generatePanelPromotions(client, targetUser, 1);
            else if (selection === 'reviews') payload = await generatePanelReviews(client, targetUser, 1);
            else if (selection === 'status') payload = await generatePanelStatus(client, targetUser, 1);
            else if (selection === 'activity') payload = await generatePanelActivity(client, targetUser, 1);
            else if (selection === 'shifts') payload = await generatePanelShifts(client, targetUser);
            else if (selection === 'deletion') payload = await generatePanelDeletion(client, targetUser);

            return interaction.editReply(payload);
        }

        // ----- User panel deletion dropdown -----
        if (interaction.customId.startsWith('staff-mgmt_delete-menu_')) {
            const targetId = interaction.customId.split('_')[2];
            const selection = interaction.values[0];

            if (selection === 'back') {
                const targetUser = await client.users.fetch(targetId).catch(() => null);
                if (!targetUser) return interaction.reply({
                    content: localize('staff-management-system', 'err-gen-no-user'),
                    flags: MessageFlags.Ephemeral
                });

                const payload = await generateUserPanel(client, targetUser);
                return interaction.update(payload);
            }

            const confirmPhrase = localize('staff-management-system', 'del-conf-phrase');
            const modal = new ModalBuilder()
                .setCustomId(`staff-mgmt_del-confirm_${targetId}_${selection}`)
                .setTitle(localize('staff-management-system', 'mod-del-title'));
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('confirm')
                        .setLabel(localize('staff-management-system', 'mod-del-lbl'))
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder(confirmPhrase)
                        .setRequired(true)
                )
            );
            return interaction.showModal(modal);
        }

        // ----- Data deletion modal submission -----
        if (interaction.isModalSubmit() && interaction.customId.startsWith('staff-mgmt_del-confirm_')) {
            await interaction.deferReply({flags: MessageFlags.Ephemeral});
            const configuration = getConfig(client, 'configuration');

            if (!checkStaffPermissions(interaction.member, configuration, 'management')) {
                return interaction.editReply({
                    content: localize('staff-management-system', 'del-no-perm')
                });
            }

            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const selection = parts.slice(3).join('_');

            const confirmPhrase = localize('staff-management-system', 'del-conf-phrase');

            if (interaction.fields.getTextInputValue('confirm').trim() !== confirmPhrase) {
                return interaction.editReply({
                    content: localize('staff-management-system', 'err-conf-fail')
                });
            }

            if (selection === 'del_all') {
                const embed = applyFooter(client, new EmbedBuilder()
                    .setTitle(localize('staff-management-system', 'del-all-title'))
                    .setDescription(localize('staff-management-system', 'del-all-desc'))
                    .setColor('DarkRed')
                );

                const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setCustomId(`staff-mgmt_del-all-confirm_${targetId}`)
                    .setLabel(localize('staff-management-system', 'btn-conf-del'))
                    .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                    .setCustomId(`staff-mgmt_del-all-cancel_${targetId}`)
                    .setLabel(localize('staff-management-system', 'btn-cancel'))
                    .setStyle(ButtonStyle.Secondary)
                );

                await interaction.editReply({
                    embeds: [embed.toJSON()],
                    components: [row.toJSON()]
                });

                const reply = await interaction.fetchReply();
                const collector = reply.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 30000,
                    max: 1,
                    filter: (btnInt) => btnInt.user.id === interaction.user.id
                });

                collector.on('collect', async (btnInt) => {
                    if (!checkStaffPermissions(btnInt.member, configuration, 'management')) {
                        return btnInt.reply({
                            content: localize('staff-management-system', 'del-no-perm'),
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (btnInt.customId.includes('cancel')) {
                        await btnInt.update({
                            content: localize('staff-management-system', 'succ-del-canc'),
                            embeds: [],
                            components: []
                        });
                        return;
                    }

                    if (btnInt.customId.includes('confirm')) {
                        await executeDataDeletion(client, targetId, 'del_all');

                        client.logger.info(localize('staff-management-system', 'log-del-all', {
                            target: targetId,
                            admin: btnInt.user.id
                        }));

                        const targetUser = await client.users.fetch(targetId).catch(() => null);
                        if (targetUser) {
                            const payload = await generateUserPanel(client, targetUser);
                            await interaction.message.edit(payload).catch(()=>{});
                        }

                        await btnInt.update({
                            content: localize('staff-management-system', 'succ-del-all'),
                            embeds: [],
                            components: []
                        });
                    }
                });

                collector.on('end', async (_collected, reason) => {
                    if (reason === 'time') {
                        await interaction.editReply({
                            content: localize('staff-management-system', 'err-del-time'),
                            embeds: [],
                            components: []
                        }).catch(()=>{});
                    }
                });
                return;
            }

            await executeDataDeletion(client, targetId, selection);
            client.logger.info(localize('staff-management-system', 'log-del-type', {
                type: selection,
                target: targetId,
                admin: interaction.user.id
            }));
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (targetUser) {
                const payload = await generateUserPanel(client, targetUser);
                await interaction.message.edit(payload).catch(()=>{});
            }

            return interaction.editReply({
                content: localize('staff-management-system', 'succ-del-tgt')
            });
        }

        // ----- User panel buttons -----
        if (interaction.customId.startsWith('staff-mgmt_panel-')) {
            const parts = interaction.customId.split('_');
            const targetId = parts[2];
            const page = parseInt(parts[3], 10);

            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (!targetUser) return interaction.reply({
                content: localize('staff-management-system', 'err-gen-no-user'),
                flags: MessageFlags.Ephemeral
            });

            const typeMap = {
                'inf': 'infractions',
                'prom': 'promotions',
                'rev': 'reviews',
                'stat': 'status',
                'act': 'activity'
            };
            const fullType = typeMap[parts[1].split('-')[1]];

            if (fullType) {
                const payload = await generatePanelSubpage(client, targetUser, fullType, page);
                if (payload) return interaction.update(payload);
            }
        }

        // ----- Status buttons -----
        const LoARequest = client.models['staff-management-system']['LoaRequest'];
        const StaffProfile = client.models['staff-management-system']['StaffProfile'];
        const config = client.configurations['staff-management-system']['configuration'];
        const statusConfig = client.configurations['staff-management-system']['status'];

        if (action === 'approve' || action === 'deny') {
            const isSupervisor = interaction.member.roles.cache.some(r => config.supervisorRoles.includes(r.id)) ||
                                 interaction.member.roles.cache.some(r => config.managementRoles.includes(r.id)) ||
                                 interaction.member.permissions.has('Administrator');

            if (!isSupervisor) return interaction.reply({
                content: localize('staff-management-system', 'err-gen-no-perm'),
                flags: MessageFlags.Ephemeral
            });

            const request = await LoARequest.findByPk(parts[2]);
            if (!request) return interaction.reply({
                content: localize('staff-management-system', 'err-no-req'),
                flags: MessageFlags.Ephemeral
            });
            if (request.status !== 'PENDING') return interaction.reply({
                content: localize('staff-management-system', 'err-req-hndl', {status: request.status}),
                flags: MessageFlags.Ephemeral
            });

            if (action === 'deny') {
                const modal = new ModalBuilder()
                .setCustomId(`staff-mgmt_loa-deny_${parts[2]}`)
                .setTitle(localize('staff-management-system', 'mod-deny-req'));
                modal.addComponents(
                    new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel(localize('staff-management-system', 'general-rsn'))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                    )
                );
                return interaction.showModal(modal);
            }

            if (action === 'approve') {
                await interaction.deferUpdate();
                await request.update({
                    status: 'APPROVED',
                    approverId: interaction.user.id
                });
                await StaffProfile.upsert({
                    userId: request.userId,
                    activityStatus: request.type
                });
                scheduleStatusExpiry(client, request);

                const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
                if (member) {
                    const roleId = request.type === 'LOA'
                        ? statusConfig.loaRole
                    : statusConfig.raRole;
                    if (roleId) await member.roles.add(roleId).catch(() => {});
                    await sendStatusDm(member.user, request.type, 'approved', {
                        approver: interaction.user.tag,
                        endDate: request.endDate
                    });
                }

                await logStatusChange(client, request.type, 'start', {
                    userId: request.userId,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    reason: request.reason,
                    approverId: interaction.user.id
                });

                const embed = EmbedBuilder
                .from(interaction.message.embeds[0])
                .setColor('Green')
                    .addFields({
                        name: localize('staff-management-system', 'general-stat'),
                        value: localize('staff-management-system', 'req-appr-by', {
                            user: interaction.user.tag
                        })
                });
                return interaction.editReply({
                    embeds: [embed.toJSON()],
                    components: []
                });
            }
        }

        // ----- Deny modal submission -----
        if (interaction.isModalSubmit() && action === 'loa-deny') {
            const configuration = getConfig(client, 'configuration');

            if (!checkStaffPermissions(interaction.member, configuration, 'supervisor')) {
                return interaction.reply({
                    content: localize('staff-management-system', 'err-gen-no-perm'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const reason = interaction.fields.getTextInputValue('reason');
            const request = await LoARequest.findByPk(parts[2]);
            if (!request) {
                return interaction.reply({
                    content: localize('staff-management-system', 'err-no-req'),
                    flags: MessageFlags.Ephemeral
                });
            }
            if (request.status !== 'PENDING') {
                return interaction.reply({
                    content: localize('staff-management-system', 'err-req-hndl', {status: request.status}),
                    flags: MessageFlags.Ephemeral
                });
            }

            await request.update({
                status: 'DENIED',
                approverId: interaction.user.id,
                rejectionReason: reason
            });

            const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
            if (member) {
                await sendStatusDm(member.user, request.type, 'denied', {
                    denier: interaction.user.tag,
                    reason
                });
            }

            const embed = EmbedBuilder
                .from(interaction.message.embeds[0])
                .setColor('Red')
                .addFields(
                    {
                        name: localize('staff-management-system', 'general-stat'),
                        value: localize('staff-management-system', 'req-deny-by', {
                            user: interaction.user.tag
                        })
                    },
                    {
                        name: localize('staff-management-system', 'general-rsn'),
                        value: reason
                    }
                );

            await interaction.message.edit({
                embeds: [embed.toJSON()],
                components: []
            }).catch(() => {});

            return interaction.reply({
                content: localize('staff-management-system', 'req-deny-by', {
                    user: interaction.user.tag
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        // ----- Profile edit submission -----
        if (interaction.isModalSubmit() && action === 'profile-edit') {
            const nickname = interaction.fields.getTextInputValue('nickname');
            const intro = interaction.fields.getTextInputValue('intro');

            const Profile = client.models['staff-management-system']['StaffProfile'];
            await Profile.upsert({
                userId: interaction.user.id,
                customNickname: nickname || null,
                customIntro: intro || null
            });
            return interaction.reply({
                content: localize('staff-management-system', 'succ-prof-upd'),
                flags: MessageFlags.Ephemeral
            });
        }

        // ----- Activity checks button -----
        if (action === 'ac-respond') {
            const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];
            const ActivityCheckResponse = client.models['staff-management-system']['ActivityCheckResponse'];

            const activeCheck = await ActivityCheck.findOne({
                where: {
                    status: 'ACTIVE',
                    messageId: interaction.message.id
                }
            });

            if (!activeCheck) return interaction.reply({
                content: localize('staff-management-system', 'err-ac-alr-end'),
                flags: MessageFlags.Ephemeral
            });

            const targetRoles = JSON.parse(activeCheck.targetRoles || '[]');
            const hasRole = targetRoles.length === 0 || interaction.member.roles.cache.some(r => targetRoles.includes(r.id));
            if (!hasRole) return interaction.reply({
                content: localize('staff-management-system', 'err-ac-not-req'),
                flags: MessageFlags.Ephemeral
            });

            const existingResponse = await ActivityCheckResponse.findOne({
                where: {
                    activityCheckId: activeCheck.id,
                    userId: interaction.user.id
                }
            });

            if (existingResponse) return interaction.reply({
                content: localize('staff-management-system', 'info-ac-alr-conf'),
                flags: MessageFlags.Ephemeral
            });

            try {
                await ActivityCheckResponse.create({
                    activityCheckId: activeCheck.id,
                    userId: interaction.user.id
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    return interaction.reply({
                        content: localize('staff-management-system', 'info-ac-alr-conf'),
                        flags: MessageFlags.Ephemeral
                    });
                }
                throw e;
            }

            return interaction.reply({
                content: localize('staff-management-system', 'succ-ac-log'),
                flags: MessageFlags.Ephemeral
            });
        }

    } catch (e) {
        client.logger.error(localize('staff-management-system', 'log-int-error', { error: e.stack }));
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: localize('staff-management-system', 'err-internal'),
                    flags: MessageFlags.Ephemeral
            }); } catch (err) {}
        } else {
            try {
                await interaction.followUp({
                    content: localize('staff-management-system', 'err-internal'),
                    flags: MessageFlags.Ephemeral
            }); } catch (err) {}
        }
    }
};