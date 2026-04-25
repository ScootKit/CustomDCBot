const {
    MessageFlags,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Op } = require('sequelize');
const schedule = require('node-schedule');
const { formatDate } = require('../../../src/functions/helpers');
const { localize } = require('../../../src/functions/localize');
const {
    getConfig,
    getSafeChannelId,
    parseDurationToDays,
    buildPaginationRow,
    applyFooter,
    checkStaffPermissions
} = require('../staff-management');

// ---------- Status DM's and logging ----------
async function sendStatusDm(user, type, dmType, data = {}) {
    const label = type === 'LOA'
        ? 'LoA'
    : 'RA';
    const viewCmd = type === 'LOA'
        ? '`/staff-status loa view`'
        : '`/staff-status ra view`';
    const endFmt = data.endDate
        ? `<t:${Math.floor(new Date(data.endDate).getTime() / 1000)}:F>`
    : '';

    // These messages use the locales key to be easily used later
    const messages = {
        approved: {
            title: 'dm-appr-title',
            color: 'Green',
            desc: 'dm-appr-desc',
            params: {label, approver: data.approver, endFmt, viewCmd}
        },
        denied: {
            title: 'dm-deny-title',
            color: 'Red',
            desc: 'dm-deny-desc',
            params: {label, denier: data.denier, reason: data.reason}
        },
        extended: {
            title: 'dm-ext-title',
            color: 'Yellow',
            desc: 'dm-ext-desc',
            params: {label, extender: data.extender, days: data.days, endFmt, reason: data.reason, viewCmd}
        },
        ended_early: {
            title: 'dm-early-title',
            color: 'Red',
            desc: 'dm-early-desc',
            params: {label, ender: data.ender, reason: data.reason}
        },
        ended: {
            title: 'dm-end-title',
            color: 'Black',
            desc: 'dm-end-desc',
            params: {label}
        }
    };

    const msg = messages[dmType];
    if (!msg) return;

    const embed = new EmbedBuilder()
        .setTitle(localize('staff-management-system', msg.title, msg.params))
        .setDescription(localize('staff-management-system', msg.desc, msg.params))
        .setColor(msg.color);
    applyFooter(user.client, embed);

    try {
        await user.send({
            embeds: [embed.toJSON()]
        });
    } catch (e) {
        user.client.logger.error(
        localize('staff-management-system', 'log-stat-dm-error', {
            e: e.message,
            u: user.tag
        })
    );
    }
}

function isStatusTypeEnabled(config, type) {
    if (!config?.enableStatusSystem) return false;
    return type === 'LOA'
        ? !!config.enableLoa
        : !!config.enableRa;
}

async function logStatusChange(client, type, action, data) {
    const statusConfig = getConfig(client, 'status');
    if (!statusConfig?.logStatusChanges) return;

    const channelId = getSafeChannelId(statusConfig.statusChangeLogChannel) || getSafeChannelId(getConfig(client, 'configuration')?.generalLogChannel);
    if (!channelId) return;

    const guild = client.guilds.cache.get(client.guildID);
    if (!guild) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const label = type === 'LOA'
        ? 'LoA'
    : 'RA';
    const targetUserObj = data.targetUser || await client.users.fetch(data.userId).catch(() => null);
    const mention = targetUserObj
        ? targetUserObj.toString()
    : `<@${data.userId}>`;
    const username = targetUserObj
        ? targetUserObj.username
    : data.userId;

    const embed = new EmbedBuilder()
    .setThumbnail(targetUserObj
    ?.displayAvatarURL({ dynamic: true }) || null);

    if (action === 'start') {
        embed.setTitle(localize('staff-management-system', 'log-start-title', { label, username }))
             .setColor('Green')
            .setDescription(localize('staff-management-system', 'log-start-desc',
                {
                    label, mention, apprText: data.approverId
                        ? ` ${localize('staff-management-system', 'label-appr-by')}: <@${data.approverId}>.`
                        : ''
             }))
            .addFields({
                name: localize('staff-management-system', 'log-info-hdr', {label}),
                value: `**${localize('staff-management-system', 'general-start')}:** <t:${Math.floor(new Date(data.startDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-end')}:** <t:${Math.floor(new Date(data.endDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-rsn')}:** ${data.reason || localize('staff-management-system', 'none-provided')}`
             });

    } else if (action === 'end') {
        embed.setTitle(localize('staff-management-system', 'log-end-title', { label, username }))
             .setColor('Red')
             .setDescription(localize('staff-management-system', 'log-end-desc', { label, mention }))
            .addFields({
                name: localize('staff-management-system', 'log-info-hdr', {label}),
                value: `**${localize('staff-management-system', 'general-started')}:** <t:${Math.floor(new Date(data.startDate).getTime() / 1000)}:F>\n**${localize('staff-management-system', 'general-ended')}:** <t:${Math.floor(Date.now() / 1000)}:F>\n**${localize('staff-management-system', 'general-req-reason')}:** ${data.reqReason}\n**${localize('staff-management-system', 'general-rsn')}:** ${data.reason || localize('staff-management-system', 'none-provided')}`
             });

    } else if (action === 'adjusted') {
        embed.setTitle(localize('staff-management-system', 'log-adj-title', { label, username }))
             .setColor('Yellow')
             .setDescription(localize('staff-management-system', 'log-adj-desc', { label, mention, executor: data.executorId }))
            .addFields({
                name: localize('staff-management-system', 'log-changes'),
                value: data.changesText
             });
    }

    applyFooter(client, embed);
    try {
        await channel.send({
            embeds: [embed.toJSON()]
        });
    } catch (e) {
        client.logger.error(
            localize('staff-management-system', 'log-status-adj-error', {
                e: e.message
            })
        );
    }
}

// ----- Status -----
const getStatusMeta = (type) => ({
    isLoa: type === 'LOA',
    label: type === 'LOA'
        ? 'LoA'
        : 'RA',
    enableKey: type === 'LOA'
        ? 'enableLoa'
    : 'enableRa',
    roleKey: type === 'LOA'
        ? 'loaRole'
        : 'raRole',
    maxDaysKey: type === 'LOA'
        ? 'loaMaxDays'
        : 'raMaxDays',
    color: type === 'LOA'
        ? 'Green'
    : 'Orange',
    activeText: localize('staff-management-system', type === 'LOA'
        ? 'status-active-loa'
        : 'status-active-ra'
    ),
    histTitle: localize('staff-management-system', type === 'LOA'
        ? 'status-hist-loa'
        : 'status-hist-ra'
    ),
    actionPrefix: type === 'LOA'
        ? 'loa'
    : 'ra'
});

async function handleStatusRequest(client, interaction, type, durationInput, reason) {
    const config = getConfig(client, 'status');
    const isLoa = type === 'LOA';
    if (!isStatusTypeEnabled(config, type))
        return interaction.editReply({
            content: localize('staff-management-system', 'err-status-disabled', {type})
        }
    );

    const days = parseDurationToDays(durationInput?.trim());
    if (!days || isNaN(days) || days <= 0) return interaction.editReply({
        content: localize('staff-management-system', 'err-invalid-duration')
    });

    const maxDays = (isLoa ? config.loaMaxDays : config.raMaxDays) || (isLoa ? 60 : 30);
    if (days > maxDays) return interaction.editReply({
        content: localize('staff-management-system', 'err-duration-max', {max: maxDays})
    });

    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    if (await LoaRequest.findOne({
        where: {
            userId: interaction.user.id, type, status: {[Op.in]: ['PENDING', 'APPROVED']},
            endDate: {[Op.gt]: new Date()}
        }
    })) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-status-exists', {type})
        });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
    const needsApproval = isLoa
        ? config.requireLoaApproval !== false
    : config.requireRaApproval !== false;

    const req = await LoaRequest.create({
        userId: interaction.user.id,
        type,
        reason,
        startDate,
        endDate,
        status: needsApproval
            ? 'PENDING'
            : 'APPROVED'
    });

    const logChannelId = getSafeChannelId(config.statusLogChannel);
    if (logChannelId && needsApproval) {
        const channel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (channel) {
            const embed = new EmbedBuilder()
                .setTitle(localize('staff-management-system', 'status-request-title', { type }))
                .setColor('Blue')
                .setAuthor({ name: `Request ID: ${req.id}`})
                .addFields(
                    {
                        name: localize('staff-management-system', 'status-req-user'),
                        value: interaction.user.toString(),
                        inline: true
                    },
                    {
                        name: localize('staff-management-system', 'status-req-duration'),
                        value: `${days} ${localize('staff-management-system', 'label-days')}`,
                        inline: true
                    },
                    {
                        name: localize('staff-management-system', 'general-rsn'),
                        value: reason
                    }
                );

            applyFooter(client, embed);
            const row = new ActionRowBuilder()
            .addComponents(new ButtonBuilder()
            .setCustomId(`staff-mgmt_approve_${req.id}`)
            .setLabel(localize('staff-management-system', 'btn-approve'))
                    .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
            .setCustomId(`staff-mgmt_deny_${req.id}`)
            .setLabel(localize('staff-management-system', 'btn-deny'))
            .setStyle(ButtonStyle.Danger));
            channel.send({ embeds: [embed.toJSON()], components: [row.toJSON()] }).catch(()=>{});
        }
    }

    if (!needsApproval) {
        const roleId = config[isLoa ? 'loaRole' : 'raRole'];
        if (roleId) interaction.member.roles.add(roleId).catch(()=>{});
        await logStatusChange(client, type, 'start', {
            targetUser: interaction.user,
            startDate,
            endDate,
            reason,
            approverId: null
        });
    }

    await interaction.editReply({
        content: localize('staff-management-system', 'success-status-request', {
            type, state: needsApproval
                ? localize('staff-management-system', 'state-pending')
                : localize('staff-management-system', 'state-auto')
        })
    });
}

async function handleStatusView(client, interaction, type, targetUser) {
    const user = targetUser || interaction.user;
    const request = await client.models['staff-management-system']['LoaRequest'].findOne({
        where: {
            userId: user.id, type, status: {[Op.in]: ['APPROVED', 'PENDING']},
            endDate: {[Op.gt]: new Date()}
        },
        order: [['createdAt', 'DESC']]
    });

    if (!request) return interaction.editReply({
        content: localize('staff-management-system', 'no-active-status', {
            user: user.username,
            type
        })
    });

    const embed = new EmbedBuilder()
    .setTitle(`${type} Status: ${user.username}`)
        .setColor(request.status === 'APPROVED'
            ? 'Green'
        : 'Yellow'
    )
    .addFields(
        {
        name: localize('staff-management-system', 'label-stat'),
            value: request.status,
            inline: true
        },
        {
            name: localize('staff-management-system', 'label-end'),
            value: formatDate(request.endDate),
            inline: true
        },
        {
            name: localize('staff-management-system', 'general-rsn'),
            value: request.reason || localize('staff-management-system', 'info-none')
    })
    .setThumbnail(user.displayAvatarURL({ dynamic: true }));
    applyFooter(client, embed);
    await interaction.editReply({ embeds: [embed.toJSON()] });
}

async function handleStatusList(client, interaction, type, filter) {
    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    let whereClause = { type };
    let title = `${type} List`;

    if (filter === 'active') {
        whereClause.status = 'APPROVED';
        whereClause.endDate = {[Op.gt]: now};
        title += localize('staff-management-system', 'filter-active');
    } else if (filter === 'expired') {
        whereClause.status = {[Op.in]: ['APPROVED', 'ENDED']};
        whereClause.endDate = {[Op.between]: [cutoff, now]};
        title += localize('staff-management-system', 'filter-expired');
    } else {
        whereClause.status = {[Op.in]: ['APPROVED', 'ENDED']};
        whereClause.endDate = {[Op.between]: [cutoff, now]};
        title += localize('staff-management-system', 'filter-history');
    }

    const rows = await LoaRequest.findAll({
        where: whereClause,
        order: [['endDate', 'DESC']],
        limit: 25
    });
    if (rows.length === 0) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-no-recs')
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('Blue')
        .setDescription(
            rows.map(r =>
                `**<@${r.userId}>** ${r.status === 'APPROVED' ? '✅' : '⏹️'}\n` +
                `${localize('staff-management-system', 'label-end')}: ${formatDate(r.endDate)}\n` +
                `${localize('staff-management-system', 'general-rsn')}: ${r.reason || localize('staff-management-system', 'info-none')}`
            ).join('\n\n')
        );

    applyFooter(client, embed);
    await interaction.editReply({ embeds: [embed.toJSON()] });
}

async function handleStatusManage(client, interaction, targetMember, type) {
    const config = getConfig(client, 'status');
    const meta = getStatusMeta(type);
    if (!isStatusTypeEnabled(config, type))
        return interaction.editReply({
            content: localize('staff-management-system', 'err-status-disabled', {type})
    });

    const generalConfig = getConfig(client, 'configuration');
    if (!checkStaffPermissions(interaction.member, generalConfig, 'supervisor')) {
    return interaction.editReply({
        content: localize('staff-management-system', 'err-gen-no-perm')
    })};

    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    const activeRequest = await LoaRequest.findOne({
        where: {
            userId: targetMember.user.id,
            type,
            status: {[Op.in]: ['APPROVED', 'PENDING']},
            endDate: {[Op.gt]: new Date()}
        },
        order: [['createdAt', 'DESC']]
        }
    );
    const totalCount = await LoaRequest.count({
        where: {userId: targetMember.user.id, type}
    });

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'manage-status-title', {
            label: meta.label,
            username: targetMember.user.username
        }))
        .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
        .setColor(activeRequest
            ? meta.color
            : 'Grey'
        )
        .setDescription(localize('staff-management-system', 'manage-stat-desc', {
            status: activeRequest
                ? meta.activeText
                : localize('staff-management-system', 'no-act-stat', {
                    label: meta.label
                }),
            label: meta.label,
            count: Math.max(0, totalCount - (activeRequest ? 1 : 0))
        }))
    );

    embed.addFields({
        name: localize('staff-management-system', 'manage-active-details', {label: meta.label}),
        value: activeRequest ? `**${localize('staff-management-system', 'general-start')}:** ${formatDate(activeRequest.startDate)}\n**${localize('staff-management-system', 'general-end')}:** ${formatDate(activeRequest.endDate)}\n**${localize('staff-management-system', 'label-stat')}:** ${activeRequest.status}\n**${localize('staff-management-system', 'label-appr-by')}:** ${activeRequest.approverId ? `<@${activeRequest.approverId}>` : localize('staff-management-system', 'label-auto')}\n**${localize('staff-management-system', 'general-rsn')}:** ${activeRequest.reason || localize('staff-management-system', 'info-none')}` : localize('staff-management-system', 'manage-no-active-user', {label: meta.label})
    });

    const p = meta.actionPrefix;
    const rid = activeRequest?.id ?? 'none';
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-end_${rid}`)
        .setLabel(localize('staff-management-system', 'btn-end-early', { label: meta.label }))
        .setEmoji('🚫').setStyle(ButtonStyle.Danger)
        .setDisabled(!activeRequest),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-extend_${rid}`)
        .setLabel(localize('staff-management-system', 'btn-extend', { label: meta.label }))
        .setEmoji('⏳')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!activeRequest),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-hist_${targetMember.user.id}_1`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(totalCount === 0)
    );
    await interaction.editReply({
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    });
}

async function handleStatusEnd(interaction, type) {
    const meta = getStatusMeta(type);
    const requestId = interaction.customId.split('_')[2];
    if (requestId === 'none') return interaction.reply({
        content: localize('staff-management-system', 'err-no-active-end', {label: meta.label}),
        flags: MessageFlags.Ephemeral
    });

    const modal = new ModalBuilder()
    .setCustomId(`staff-mgmt_${meta.actionPrefix}-end-submit_${requestId}`)
    .setTitle(localize('staff-management-system', 'modal-end-early-title', { label: meta.label }));
    modal.addComponents(new ActionRowBuilder()
    .addComponents(
        new TextInputBuilder()
        .setCustomId('end_reason')
        .setLabel(localize('staff-management-system', 'modal-end-early-reason'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ));
    return interaction.showModal(modal);
}

async function handleStatusEndSubmit(client, interaction, type) {
    const generalConfig = getConfig(client, 'configuration');
    if (!checkStaffPermissions(interaction.member, generalConfig, 'supervisor')) {
        return interaction.reply({
            content: localize('staff-management-system', 'err-gen-no-perm'),
            flags: MessageFlags.Ephemeral
        });
    }

    const meta = getStatusMeta(type);
    const request = await client.models['staff-management-system']['LoaRequest'].findByPk(interaction.customId.split('_')[2]);
    if (!request || request.status === 'ENDED' || request.status === 'DENIED') return interaction.reply({
        content: localize('staff-management-system', 'err-stat-inact', {label: meta.label}),
        flags: MessageFlags.Ephemeral
    });

    const reason = interaction.fields.getTextInputValue('end_reason');
    const member = await interaction.guild.members.fetch(request.userId).catch(() => null);

    if (member && getConfig(client, 'status')[meta.roleKey]) await member.roles.remove(getConfig(client, 'status')[meta.roleKey]).catch(() => {});

    await request.update({ status: 'ENDED', endDate: new Date() });
    await client.models['staff-management-system']['StaffProfile'].update({activityStatus: 'ACTIVE'}, {
        where: {userId: request.userId}
    });

    if (member) await sendStatusDm(member.user, type, 'ended_early', {
        ender: interaction.user.tag,
        reason
    });
    await logStatusChange(client, type, 'end', {
        userId: request.userId,
        startDate: request.startDate,
        reason: reason,
        reqReason: request.reason
    });

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor('Grey')
        .setDescription(localize('staff-management-system', 'status-ended-embed-desc', {
            label: meta.label, user: interaction.user.tag, reason
    }))
        .spliceFields(0, 1, {
            name: localize('staff-management-system', 'manage-active-details', {label: meta.label}),
            value: localize('staff-management-system', 'manage-no-active-user', {label: meta.label})
    });

    const p = meta.actionPrefix;
    const disabledRow = new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
        .setCustomId(`${p}-end-done`)
        .setLabel(localize('staff-management-system', 'btn-end-early', { label: meta.label }))
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(`${p}-extend-done`)
        .setLabel(localize('staff-management-system', 'btn-extend', { label: meta.label }))
        .setEmoji('⏳')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(`staff-mgmt_${p}-hist_${request.userId}_1`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
        embeds: [updatedEmbed.toJSON()],
        components: [disabledRow.toJSON()],
        flags: MessageFlags.Ephemeral
    });
}

async function handleStatusExtend(interaction, type) {
    const meta = getStatusMeta(type);
    const requestId = interaction.customId.split('_')[2];
    if (requestId === 'none') return interaction.reply({
        content: localize('staff-management-system', 'err-no-active-extend', {label: meta.label}),
        flags: MessageFlags.Ephemeral
    });

    const modal = new ModalBuilder()
    .setCustomId(`staff-mgmt_${meta.actionPrefix}-extend-submit_${requestId}`)
        .setTitle(localize('staff-management-system', 'modal-extend-title', {
            label: meta.label
    }));
    modal.addComponents(
        new ActionRowBuilder()
        .addComponents(
        new TextInputBuilder()
        .setCustomId('extend_days')
        .setLabel(localize('staff-management-system', 'modal-extend-days'))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("7")
        .setRequired(true)
        ),
        new ActionRowBuilder()
        .addComponents(
        new TextInputBuilder()
        .setCustomId('extend_reason')
        .setLabel(localize('staff-management-system', 'modal-extend-reason'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        )
    );
    return interaction.showModal(modal);
}

function scheduleStatusExpiry(client, request) {
    const jobName = `staff-mgmt-status-expiry-${request.id}`;
    const existingJob = schedule.scheduledJobs[jobName];
    if (existingJob) existingJob.cancel();

    schedule.scheduleJob(jobName, new Date(request.endDate), async () => {
        try {
            const req = await client.models['staff-management-system']['LoaRequest'].findByPk(request.id);
            if (!req || req.status !== 'APPROVED' || new Date(req.endDate) > new Date()) return;

            await req.update({ status: 'ENDED' });
            await client.models['staff-management-system']['StaffProfile'].update(
                { activityStatus: 'ACTIVE' },
                { where: { userId: req.userId } }
            );

            const member = await client.guilds.cache.get(client.guildID)?.members.fetch(req.userId).catch(() => null);
            if (member) {
                const roleKey = req.type === 'LOA' ? 'loaRole' : 'raRole';
                const roleId = getConfig(client, 'status')[roleKey];
                if (roleId) await member.roles.remove(roleId).catch(() => {});
                await sendStatusDm(member.user, req.type, 'ended');
            }

            await logStatusChange(client, req.type, 'end', {
                userId: req.userId,
                startDate: req.startDate,
                reason: localize('staff-management-system', 'status-expired-auto'),
                reqReason: req.reason
            });
        } catch (e) {
            client.logger.error(localize('staff-management-system', 'log-status-expiry-fail', {
                error: e.message
            }));
        }
    });
}

async function handleStatusExtendSubmit(client, interaction, type) {
    const generalConfig = getConfig(client, 'configuration');
    if (!checkStaffPermissions(interaction.member, generalConfig, 'supervisor')) {
        return interaction.reply({
            content: localize('staff-management-system', 'err-gen-no-perm'),
            flags: MessageFlags.Ephemeral
        });
    }

    const meta = getStatusMeta(type);
    const request = await client.models['staff-management-system']['LoaRequest'].findByPk(interaction.customId.split('_')[2]);
    if (!request || request.status === 'ENDED' || request.status === 'DENIED') {
        return interaction.reply({
            content: localize('staff-management-system', 'err-stat-inact', {
                label: meta.label
            }),
            flags: MessageFlags.Ephemeral
        });
    }

    const days = parseInt(interaction.fields.getTextInputValue('extend_days'), 10);
    const reason = interaction.fields.getTextInputValue('extend_reason');
    if (isNaN(days) || days <= 0 || days > 180) return interaction.reply({
        content: localize('staff-management-system', 'err-inv-dur'),
        flags: MessageFlags.Ephemeral
    });

    const oldEndDate = new Date(request.endDate);
    const newEndDate = new Date(oldEndDate.getTime() + days * 24 * 60 * 60 * 1000);
    await request.update({ endDate: newEndDate });
    request.endDate = newEndDate;
    scheduleStatusExpiry(client, request);

    const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
    if (member) await sendStatusDm(member.user, type, 'extended', {
        extender: interaction.user.tag,
        days,
        endDate: newEndDate,
        reason
    });
    await logStatusChange(client, type, 'adjusted', {
        userId: request.userId,
        executorId: interaction.user.id,
        changesText: localize('staff-management-system', 'status-adjusted-log', {
            label: meta.label,
            newEnd: `<t:${Math.floor(newEndDate.getTime() / 1000)}:F>`,
            oldEnd: `<t:${Math.floor(oldEndDate.getTime() / 1000)}:F>`,
            reason
        })
    });

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .spliceFields(0, 1, {
            name: localize('staff-management-system', 'manage-active-details', {label: meta.label}),
            value: localize('staff-management-system', 'mod-stat-ext', {
                s: formatDate(request.startDate),
                e: formatDate(newEndDate),
                d: days,
                t: request.status,
                a: request.approverId
                    ? `<@${request.approverId}>`
                    : localize('staff-management-system', 'label-auto'),
                r: request.reason || localize('staff-management-system', 'info-none')
            })
    });
    return interaction.reply({
        embeds: [updatedEmbed.toJSON()],
        components: interaction.message.components.map(c => c.toJSON()),
        flags: MessageFlags.Ephemeral
    });
}

async function generateStatusHistoryResponse(client, targetUser, page = 1, type) {
    const meta = getStatusMeta(type);
    const limit = 5;
    const offset = (page - 1) * limit;

    const {count, rows} = await client.models['staff-management-system']['LoaRequest'].findAndCountAll({
        where: {userId: targetUser.id, type},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });
    if (count === 0) return {
        content: localize('staff-management-system', 'info-no-status-history', {label: meta.label}),
        flags: MessageFlags.Ephemeral
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(`${meta.histTitle} - ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor(meta.color)
        .setDescription(localize('staff-management-system', 'status-history-desc', {
            count: rows.length,
            total: count,
            label: meta.label
            }
        ))
    );

    const statusIcons = {
        APPROVED: '✅',
        DENIED: '❌',
        ENDED: '⏹️',
        PENDING: '🕐'
    };
    rows.forEach((req, index) => embed.addFields({
        name: `${statusIcons[req.status] ?? '❓'} ${meta.label} #${offset + index + 1} - ${req.status}`,
        value: `**${localize('staff-management-system', 'general-start')}:** ${formatDate(req.startDate)}\n**${localize('staff-management-system', 'general-end')}:** ${formatDate(req.endDate)}\n**${localize('staff-management-system', 'label-appr-by')}:** ${req.approverId ? `<@${req.approverId}>` : localize('staff-management-system', 'label-auto')}\n**${localize('staff-management-system', 'general-rsn')}:** ${req.reason || localize('staff-management-system', 'info-none')}` }));
    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', {page, total: totalPages})
    });

    const row = buildPaginationRow(
        `staff-mgmt_${meta.actionPrefix}-hist_${targetUser.id}_${page - 1}`,
        `${meta.actionPrefix}_hist_page_count`,
        `staff-mgmt_${meta.actionPrefix}-hist_${targetUser.id}_${page + 1}`,
        page,
        totalPages
    );
    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

async function handleStatusHistPage(client, interaction, type) {
    const parts = interaction.customId.split('_');
    const targetUser = await client.users.fetch(parts[2]).catch(() => null);
    if (!targetUser) return interaction.reply({
        content: localize('staff-management-system', 'err-gen-no-user'),
        flags: MessageFlags.Ephemeral
    });

    const payload = await generateStatusHistoryResponse(client, targetUser, parseInt(parts[3], 10), type);
    if (payload.content) return interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral
    });
    return interaction.message?.embeds?.[0]?.title?.startsWith(getStatusMeta(type).histTitle)
        ? interaction.update(payload)
    : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

module.exports.beforeSubcommand = async function (interaction) {
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });
    }
};

module.exports.subcommands = {
    'loa': {
        'request': async function (interaction) {
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            await handleStatusRequest(interaction.client, interaction, 'LOA', duration, reason);
        },
        'view': async function (interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            await handleStatusView(interaction.client, interaction, 'LOA', user);
        },
        'list': async function (interaction) {
            const filter = interaction.options.getString('filter');
            await handleStatusList(interaction.client, interaction, 'LOA', filter);
        },
        'admin': async function (interaction) {
            const user = interaction.options.getMember('user');
            if (!user) return interaction.editReply({
                content: localize('staff-management-system', 'err-no-mem')
            });
            await handleStatusManage(interaction.client, interaction, user, 'LOA');
        }
    },
    'ra': {
        'request': async function (interaction) {
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason');
            await handleStatusRequest(interaction.client, interaction, 'RA', duration, reason);
        },
        'view': async function (interaction) {
            const user = interaction.options.getUser('user') || interaction.user;
            await handleStatusView(interaction.client, interaction, 'RA', user);
        },
        'list': async function (interaction) {
            const filter = interaction.options.getString('filter');
            await handleStatusList(interaction.client, interaction, 'RA', filter);
        },
        'admin': async function (interaction) {
            const user = interaction.options.getMember('user');
            if (!user) return interaction.editReply({
                content: localize('staff-management-system', 'err-no-mem')
            });
            await handleStatusManage(interaction.client, interaction, user, 'RA');
        }
    }
};

module.exports.config = {
    name: 'staff-status',
    description: localize('staff-management-system', 'cmd-desc-status'),
    usage: '/staff-status',
    type: 'slash',
    defaultPermission: false,
    disabled: function (client) {
        return !client.configurations['staff-management-system']['status']?.enableStatusSystem;
    },

    options: function (client) {
        const config = getConfig(client, 'status');
        const array = [];

        if (!config?.enableStatusSystem) return array;

        if (config.enableLoa) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'loa',
                description: localize('staff-management-system', 'cmd-desc-loa'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'request',
                        description: localize('staff-management-system', 'cmd-desc-loa-request'),
                    options: [
                        {
                            type: 'STRING',
                            name: 'duration',
                            description: localize('staff-management-system', 'cmd-desc-loar-duration'),
                            required: true
                        },
                        {
                            type: 'STRING',
                            name: 'reason',
                            description: localize('staff-management-system', 'cmd-desc-loar-reason'),
                            required: true
                        }
                    ]
                },
                    {
                        type: 'SUB_COMMAND',
                        name: 'view',
                        description: localize('staff-management-system', 'cmd-desc-loa-view'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            description: localize('staff-management-system', 'cmd-desc-loav-user'),
                            required: false
                        }
                    ]
                },
                    {
                        type: 'SUB_COMMAND',
                        name: 'list',
                        description: localize('staff-management-system', 'cmd-desc-loa-list'),
                        options: [{
                            type: 'STRING',
                            name: 'filter',
                            description: localize('staff-management-system', 'cmd-desc-loal-filter'),
                            required: true,
                        choices: [
                        {
                            name: 'Active',
                            value: 'active'
                        },
                        {
                            name: 'Expired',
                            value: 'expired'
                        },
                        {
                            name: 'All',
                            value: 'all'
                        }]
                        }]
                },
                    {
                        type: 'SUB_COMMAND',
                        name: 'admin',
                        description: localize('staff-management-system', 'cmd-desc-loa-admin'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            description: localize('staff-management-system', 'cmd-desc-loaa-user'),
                            required: true
                        }
                    ]
                }
                ]
            });
        }

        if (config.enableRa) {
            array.push({
            type: 'SUB_COMMAND_GROUP',
            name: 'ra',
            description: localize('staff-management-system', 'cmd-desc-ra'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'request',
                    description: localize('staff-management-system', 'cmd-desc-ra-request'),
                    options: [
                        {
                            type: 'STRING',
                            name: 'duration',
                            description: localize('staff-management-system', 'cmd-desc-rar-duration'),
                            required: true
                        },
                        {
                            type: 'STRING',
                            name: 'reason',
                            description: localize('staff-management-system', 'cmd-desc-rar-reason'),
                            required: true
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'view',
                    description: localize('staff-management-system', 'cmd-desc-ra-view'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                        description: localize('staff-management-system', 'cmd-desc-rav-user'),
                            required: false
                        }]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'list',
                    description: localize('staff-management-system', 'cmd-desc-ra-list'),
                    options: [
                        {
                            type: 'STRING',
                            name: 'filter',
                            description: localize('staff-management-system', 'cmd-desc-ral-filter'),
                            required: true,
                        choices: [
                            {
                                name: 'Active',
                                value: 'active'
                            },
                            {
                                name: 'Expired',
                                value: 'expired'
                            },
                            {
                                name: 'All',
                                value: 'all'
                            }
                        ]
                        }]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'admin',
                    description: localize('staff-management-system', 'cmd-desc-ra-admin'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            description: localize('staff-management-system', 'cmd-desc-raa-user'),
                            required: true
                        }
                    ]
                }
            ]
            });
        }

        return array;
    }
};

module.exports.sendStatusDm = sendStatusDm;
module.exports.logStatusChange = logStatusChange;
module.exports.handleStatusRequest = handleStatusRequest;
module.exports.handleStatusView = handleStatusView;
module.exports.handleStatusList = handleStatusList;
module.exports.handleStatusManage = handleStatusManage;
module.exports.handleStatusEnd = handleStatusEnd;
module.exports.handleStatusEndSubmit = handleStatusEndSubmit;
module.exports.handleStatusExtend = handleStatusExtend;
module.exports.handleStatusExtendSubmit = handleStatusExtendSubmit;
module.exports.handleStatusHistPage = handleStatusHistPage;
module.exports.scheduleStatusExpiry = scheduleStatusExpiry;