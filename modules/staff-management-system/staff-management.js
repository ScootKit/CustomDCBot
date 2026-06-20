/**
 * Logic for the Staff Management module
 * @module staff-management
 * @author itskevinnn
 */
const { ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const schedule = require('node-schedule');
const {embedTypeV2, safeSetFooter, dateToDiscordTimestamp} = require('../../src/functions/helpers');
const { localize } = require('../../src/functions/localize');

// --- Local helpers ---
const getConfig = (client, file) => client.configurations['staff-management-system'][file];
const getSafeChannelId = (val) => Array.isArray(val) && val.length > 0 // Helper to get safe channel ID from config
    ? val[0]
    : (typeof val === 'string'
            ? val
    : null
);
const parseDurationToDays = (input) => {
    if (!input) return null;
    const match = input.toString().match(/^(\d+)([dDwWmM])?$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase() || 'd';
    return unit === 'm'
        ? value * 30
        : (unit === 'w'
                ? value * 7
        : value
    );
};

const applyFooter = (client, embed) => {
    safeSetFooter(embed, client);
    if (!(client.strings && client.strings.disableFooterTimestamp)) {
        embed.setTimestamp();
    }
    return embed;
};

const formatRoleMentions = (roles) => {
    const roleIds = Array.isArray(roles)
        ? roles
        : (roles ? [roles] : []);

    return roleIds.map(roleId => `<@&${roleId}>`).join(' ');
};

function checkStaffPermissions(member, config, level = 'staff') {
    if (!member) return false;
    if (member.permissions?.has('Administrator')) return true;

    const roleMap = {
        staff: [
            ...(config?.staffRoles || []),
            ...(config?.supervisorRoles || []),
            ...(config?.managementRoles || [])
        ],
        supervisor: [
            ...(config?.supervisorRoles || []),
            ...(config?.managementRoles || [])
        ],
        management: [
            ...(config?.managementRoles || [])
        ]
    };

    const allowedRoles = roleMap[level] || roleMap.staff;
    return member.roles?.cache?.some(role => allowedRoles.includes(role.id)) || false;
}

const buildPaginationRow = (backId, countId, nextId, page, totalPages) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(backId)
        .setLabel(localize('helpers', 'back'))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 1),
        new ButtonBuilder()
        .setCustomId(countId)
        .setLabel(`${page}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
        new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel(localize('helpers', 'next'))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages)
    );
};

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return localize('staff-management-system', 'time-zero');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${localize('staff-management-system', h !== 1 
        ? 'time-hours' 
        : 'time-hour'
    )}`);
    if (m > 0) parts.push(`${m} ${localize('staff-management-system', m !== 1 
        ? 'time-mins' 
        : 'time-min'
    )}`);
    if (s > 0) parts.push(`${s} ${localize('staff-management-system', s !== 1 
        ? 'time-secs' 
        : 'time-sec'
    )}`);
    return parts.join(', ') || localize('staff-management-system', 'time-zero');
}

// ---------- Infractions ----------
async function issueInfraction(client, interaction, targetMember, type, reason, expiryInput) {
    await interaction.deferReply({ephemeral: true});
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions) return interaction.editReply({
        content: localize('staff-management-system', 'err-feat-disabled', {feature: 'Infractions'})
    });

    const generalConfig = getConfig(client, 'configuration');
    const canInfract = checkStaffPermissions(interaction.member, generalConfig, 'supervisor');
    if (!canInfract) return interaction.editReply({
        content: localize('staff-management-system', 'err-gen-no-perm')
    });

    if (targetMember.id === interaction.user.id) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-self-infract')
        });
    }

    if (type.toLowerCase() === 'suspension') {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-use-susp')
        });
    }

    let expiresAt = null;
    if (expiryInput) {
        const days = parseDurationToDays(expiryInput);
        if (!days) return interaction.editReply({
            content: localize('staff-management-system', 'err-inv-dur')
        });
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const record = await client.models['staff-management-system']['Infraction'].create({
        userId: targetMember.id,
        issuerId: interaction.user.id,
        type, reason, expiresAt,
        active: true
    });

    const placeholders = {
        '%user%': targetMember.user.toString(),
        '%user-avatar%': targetMember.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || '',
        '%issuer-mention%': interaction.user.toString(),
        '%issuer-name%': interaction.user.username,
        '%issuer-avatar%': interaction.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || '',
        '%type%': type,
        '%reason%': reason,
        '%case-id%': record.caseId.toString(),
        '%end-date%': expiresAt
            ? dateToDiscordTimestamp(expiresAt, 'F')
            : localize('staff-management-system', 'label-never')
    };

    const channelId = getSafeChannelId(config.infractionLogChannel);
    if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
            let template = config.infractionMessage;

            if (template && template.embeds && !template._schema) template._schema = 'v3';
            let msgOpts = await embedTypeV2(template, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts?.embeds?.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMsg = await channel.send(msgOpts).catch(()=>{});
            if (sentMsg) await record.update({ messageUrl: sentMsg.url });
        }
    }

    if (config.dmInfractedUser && config.infractionDmMessage) {
        let dmTemplate = config.infractionDmMessage;
        if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
        const dmOpts = await embedTypeV2(dmTemplate, placeholders);
        if (dmOpts?.content?.trim() === '') delete dmOpts.content;

        if (dmOpts) {
            try {
                await targetMember.user.send(dmOpts);
            } catch (e) {
                client.logger.warn(localize('staff-management-system', 'log-infract-dm-fail', {
                    user: targetMember.user.tag,
                    error: e.message
                }));
            }
        }
    }

    await interaction.editReply({
        content: localize('staff-management-system', 'succ-infract', {
            type,
            caseId: record.caseId,
            user: targetMember.user.tag
        })
    });
}

// ---------- Suspensions ----------
async function issueSuspension(client, interaction, targetMember, durationInput, reason) {
    await interaction.deferReply({ephemeral: true});
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions)
        return interaction.editReply({
            content: localize('staff-management-system', 'err-feat-disabled', {
                feature: 'Infractions'
            })
    });

    if (!config?.enableSuspensions)
        return interaction.editReply({
            content: localize('staff-management-system', 'err-feat-disabled', {
                feature: 'Suspensions'
            })
    });

    const generalConfig = getConfig(client, 'configuration');
    const canSuspend = checkStaffPermissions(interaction.member, generalConfig, 'supervisor');
    if (!canSuspend) return interaction.editReply({
        content: localize('staff-management-system', 'err-gen-no-perm')
    });

    if (targetMember.id === interaction.user.id) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-self-infract')
        });
    }

    const durationDays = parseDurationToDays(durationInput);
    if (!durationDays)
        return interaction.editReply({
            content: localize('staff-management-system', 'err-inv-dur')
    });

    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const durationString = `${durationDays} ${localize('staff-management-system', 'label-days')}`;

    let rolesToRemove = [];
    const hierarchyRole = interaction.guild.roles.cache.get(config.suspensionHierarchyRole);
    if (hierarchyRole) {
        rolesToRemove = targetMember.roles.cache
            .filter(r => r.position >= hierarchyRole.position && r.id !== interaction.guild.id && !r.managed)
            .map(r => r.id);

        if (rolesToRemove.length) {
            await targetMember.roles.remove(rolesToRemove).catch(() => {});
        }
    }

    await client.models['staff-management-system']['StaffProfile'].upsert({
        userId: targetMember.id,
        isSuspended: true,
        suspendedRoles: JSON.stringify(rolesToRemove)
    });
    if (config.suspensionRole) await targetMember.roles.add(config.suspensionRole).catch(() => {});

    const record = await client.models['staff-management-system']['Infraction'].create({
        userId: targetMember.id,
        issuerId: interaction.user.id,
        type: 'Suspension',
        reason, durationDays, expiresAt,
        active: true
    });

    const placeholders = {
        '%user%': targetMember.user.toString(),
        '%user-avatar%': targetMember.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || '',
        '%issuer-mention%': interaction.user.toString(),
        '%issuer-name%': interaction.user.username,
        '%issuer-avatar%': interaction.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || '',
        '%duration%': durationString,
        '%reason%': reason,
        '%case-id%': record.caseId.toString(),
        '%end-date%': dateToDiscordTimestamp(expiresAt, 'F')
    };

    const channelId = getSafeChannelId(config.infractionLogChannel);
    if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
            let template = config.suspensionMessage;

            if (template && template.embeds && !template._schema) template._schema = 'v3';
            let msgOpts = await embedTypeV2(template, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts?.embeds?.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMsg = await channel.send(msgOpts).catch(()=>{});
            if (sentMsg) await record.update({ messageUrl: sentMsg.url });
        }
    }

    if (config.dmInfractedUser && config.suspensionDmMessage) {
        let dmTemplate = config.suspensionDmMessage;

        if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
        const dmOpts = await embedTypeV2(dmTemplate, placeholders);
        if (dmOpts?.content?.trim() === '') delete dmOpts.content;

        if (dmOpts) {
            try {
                await targetMember.user.send(dmOpts);
            } catch (e) {
                client.logger.warn(localize('staff-management-system', 'log-susp-dm-fail', {
                    user: targetMember.user.tag,
                    error: e.message
                }));
            }
        }
    }

    await interaction.editReply({
        content: localize('staff-management-system', 'succ-susp', {
            caseId: record.caseId,
            user: targetMember.user.tag,
            duration: durationString
        })
    });
}

async function resolveInfractionReference(client, reference) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const value = reference?.trim();

    if (!value) return null;

    if (/^\d+$/.test(value)) {
        return await Infraction.findByPk(parseInt(value, 10));
    }

    try {
        const parsed = new URL(value);
        const validHosts = ['discord.com', 'canary.discord.com', 'ptb.discord.com'];

        if (!validHosts.includes(parsed.hostname)) return null;

        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length !== 4 || parts[0] !== 'channels') return null;

        return await Infraction.findOne({
            where: {messageUrl: value}
        });
    } catch (e) {
        return null;
    }
}

// ----- Infractions voiding -----
async function voidInfraction(client, interaction, reference) {
    await interaction.deferReply({ephemeral: true});
    const config = getConfig(client, 'infractions');
    if (!config?.enableInfractions) return interaction.editReply({
        content: localize('staff-management-system', 'err-feat-disabled', {
            feature: 'Infractions'
        })
    });

    const canManage = checkStaffPermissions(interaction.member, getConfig(client, 'configuration'), 'supervisor');
    if (!canManage) return interaction.editReply({
        content: localize('staff-management-system', 'err-gen-no-perm')
    });

    const record = await resolveInfractionReference(client, reference);
    if (!record) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-no-case-ref', {reference})
        });
    }
    if (!record.active) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-case-inact', {caseId: record.caseId})
        });
    }

    if (record.type.toLowerCase() === 'suspension') {
        const Profile = client.models['staff-management-system']['StaffProfile'];
        const profile = await Profile.findOne({
            where: {userId: record.userId}
        });
        const member = await interaction.guild.members.fetch(record.userId).catch(() => null);

        if (member && profile && profile.isSuspended) {
            try {
                const rolesToRestore = JSON.parse(profile.suspendedRoles || '[]');
                if (rolesToRestore.length > 0) await member.roles.add(rolesToRestore);
                if (config.suspensionRole) await member.roles.remove(config.suspensionRole);
                await profile.update({ isSuspended: false, suspendedRoles: JSON.stringify([]) });
            } catch (e) {
                return interaction.editReply({
                    content: localize('staff-management-system', 'succ-void-fail', {caseId: record.caseId})
                });
            }
        }
    }
    await record.update({active: false});
    await interaction.editReply({
        content: localize('staff-management-system', 'succ-void', {caseId: record.caseId})
    });
}

// ----- Generates infractions history embed -----
async function generateInfractionHistoryResponse(client, targetUser, page = 1) {
    const limit = 5;
    const offset = (page - 1) * limit;
    const {count, rows} = await client.models['staff-management-system']['Infraction'].findAndCountAll({
        where: {userId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit, offset
    });

    if (count === 0)
        return {
            content: localize('staff-management-system', 'info-clean-rec', {
                username: targetUser.username
            }),
            flags: MessageFlags.Ephemeral
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'rec-title', { username: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Red')
    );

    const desc = rows.map(r => {
        const link = r.messageUrl
            ? ` • [Jump](${r.messageUrl})`
        : '';
        const statusIcon = r.active
            ? '🔴'
        : localize('staff-management-system', 'icon-voided');
        const expiry = r.expiresAt
            ? `\n**${localize('staff-management-system', 'label-exp')}:** ${dateToDiscordTimestamp(r.expiresAt, 'R')}`
        : '';

        return `**${statusIcon} ${localize('staff-management-system', 'label-case')} #${r.caseId} - ${r.type}**\n**${localize('staff-management-system', 'label-date')}:** ${dateToDiscordTimestamp(r.createdAt, 'f')}\n**${localize('staff-management-system', 'label-iss')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${expiry}${link}`;
    }).join('\n\n');

    embed.setDescription(desc);
    embed.addFields({
        name: '\u200b', value: localize('staff-management-system', 'page-count', {
            page,
            total: totalPages
    }) });

    const row = buildPaginationRow(
        `staff-mgmt_inf-hist_${targetUser.id}_${page - 1}`,
        'inf_hist_count',
        `staff-mgmt_inf-hist_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return { embeds: [embed.toJSON()], components: [row.toJSON()] };
}

// ----- Gets infraction history -----
async function getInfractionHistory(client, interaction, targetUser) {
    await interaction.deferReply({ephemeral: true});
    const response = await generateInfractionHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('ℹ️')) return interaction.editReply(response);
    await interaction.editReply({
        ...response
    });
}

// ---------- Promotions ----------
async function promoteUser(client, interaction, targetMember, newRole, reason) {
    await interaction.deferReply({ephemeral: true});
    const config = getConfig(client, 'promotions');
    if (!config?.enablePromotions) return interaction.editReply({
        content: localize('staff-management-system', 'err-feat-disabled', {feature: 'Promotions'})
    });

    const generalConfig = getConfig(client, 'configuration');
    const canPromote = checkStaffPermissions(interaction.member, generalConfig, 'supervisor');
    if (!canPromote) return interaction.editReply({
        content: localize('staff-management-system', 'err-gen-no-perm') 
    });

    if (targetMember.id === interaction.user.id) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-self-promo')
        });
    }

    const finalReason = reason && reason.trim() !== ''
        ? reason
    : localize('staff-management-system', 'none-provided');
    const channelOverride = interaction.options.getChannel('channel');

    if (config.autoAddRole) {
        if (interaction.guild.members.me.roles.highest.position <= newRole.position) {
            return interaction.editReply({
                content: localize('staff-management-system', 'err-role-hier')
            });
        }
        try {
            await targetMember.roles.add(newRole);
        } catch (e) {
            return interaction.editReply({
                content: localize('staff-management-system', 'err-add-role', {e: e.message})
        }); }
    }

    const record = await client.models['staff-management-system']['Promotion'].create({
        userId: targetMember.id,
        issuerId: interaction.user.id,
        newRole: newRole.id,
        reason: finalReason
    });

    const placeholders = {
        '%user-mention%': targetMember.user.toString(),
        '%new-role-name%': newRole.name,
        '%new-role-mention%': newRole.toString(),
        '%promoter-mention%': interaction.user.toString(),
        '%promoter-name%': interaction.user.username,
        '%reason%': finalReason,
        '%user-avatar%': targetMember.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || '',
        '%promoter-avatar%': interaction.user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || ''
    };

    const targetChannelId = channelOverride
        ? channelOverride.id
    : getSafeChannelId(config.promotionsChannel);

    if (targetChannelId) {
        const channel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
        if (channel) {
            let embedTemplate = config.promotionMessage;
            if (typeof embedTemplate === 'string') {
                try {
                    embedTemplate = JSON.parse(embedTemplate);
                } catch (e) {
                }
            } else if (typeof embedTemplate === 'object') {
                embedTemplate = JSON.parse(JSON.stringify(embedTemplate));
            }

            if (embedTemplate && embedTemplate.embeds && !embedTemplate._schema) embedTemplate._schema = 'v3';
            let msgOpts = await embedTypeV2(embedTemplate, placeholders);
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;

            if (msgOpts.embeds && msgOpts.embeds.length > 0) {
                const parsedEmbed = EmbedBuilder.from(msgOpts.embeds[0]);
                applyFooter(client, parsedEmbed);
                msgOpts.embeds[0] = parsedEmbed.toJSON();
            }

            const sentMessage = await channel
            .send(msgOpts)
            .catch(e => {
                client.logger.error(localize('staff-management-system', 'log-promo-msg-error', {
                    e: e.message,
                }));
                return null;
            });

            if (sentMessage) await record.update({messageUrl: sentMessage.url});
        }
    }

    if (config.dmPromotedUser && config.promotionDmMessage) {
        let dmTemplate = config.promotionDmMessage;

        if (dmTemplate && dmTemplate.embeds && !dmTemplate._schema) dmTemplate._schema = 'v3';
        const dmOpts = await embedTypeV2(dmTemplate, placeholders);
        if (dmOpts?.content?.trim() === '') delete dmOpts.content;

        if (dmOpts) {
            try {
                await targetMember.user.send(dmOpts);
            } catch (e) {
                client.logger.warn(localize('staff-management-system', 'log-promo-dm-fail', {
                    user: targetMember.user.tag,
                    error: e.message
                }));
            }
        }
    }

    await interaction.editReply({
        content: localize('staff-management-system', 'succ-promo', {
            user: targetMember.user.tag,
            role: newRole.name
        })
    });
}

// ----- Generates promotion history & embed -----
async function generatePromotionHistoryResponse(client, targetUser, page = 1) {
    const Promotion = client.models['staff-management-system']['Promotion'];
    const limit = 5;
    const offset = (page - 1) * limit;

    const {count, rows} = await Promotion.findAndCountAll({
        where: {
            userId: targetUser.id
        },
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });
    if (count === 0) return {
        content: localize('staff-management-system', 'info-no-promo', {username: targetUser.username}),
        flags: MessageFlags.Ephemeral
    };

    const totalPages = Math.ceil(count / limit) || 1;
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'prom-hist-title', { username: targetUser.username }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Gold')
    );

    const desc = rows.map((r, i) => {
        const link = r.messageUrl ? ` • [Jump](${r.messageUrl})` : '';
        return `**${offset + i + 1}. ${dateToDiscordTimestamp(r.createdAt, 'F')}**\n**${localize('staff-management-system', 'label-role')}:** <@&${r.newRole}>\n**${localize('staff-management-system', 'label-prom-by')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${link}`;
    }).join('\n\n');

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const row = buildPaginationRow(
        `staff-mgmt_prom-hist_${targetUser.id}_${page - 1}`,
        'prom_hist_count',
        `staff-mgmt_prom-hist_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

async function getPromotionHistory(client, interaction, targetUser) {
    await interaction.deferReply({ephemeral: true});
    const response = await generatePromotionHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('ℹ️')) return interaction.editReply(response);

    await interaction.editReply({
        ...response
    });
}

// ---------- User Panel ----------
async function generatePanelSubpage(client, targetUser, type, page) {
    if (type === 'infractions') return await generatePanelInfractions(client, targetUser, page);
    if (type === 'promotions') return await generatePanelPromotions(client, targetUser, page);
    if (type === 'reviews') return await generatePanelReviews(client, targetUser, page);
    if (type === 'status') return await generatePanelStatus(client, targetUser, page);
    if (type === 'activity') return await generatePanelActivity(client, targetUser, page);
    return null;
}

// Overview page
async function generateUserPanel(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'panel-title', {
            username: targetUser.username
        }))
        .setDescription(localize('staff-management-system', 'panel-desc', {
            mention: targetUser.toString(),
            id: targetUser.id
        }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setColor('Blurple')
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`staff-mgmt_panel-menu_${targetUser.id}`)
        .setPlaceholder(localize('staff-management-system', 'panel-ph'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-over'))
            .setValue('overview')
            .setEmoji('🏠'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-act'))
            .setValue('activity')
            .setEmoji('📋'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-inf'))
            .setValue('infractions')
            .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-prom'))
            .setValue('promotions')
            .setEmoji('🎉'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-rev'))
            .setValue('reviews')
            .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-shi'))
            .setValue('shifts')
            .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-sta'))
            .setValue('status')
            .setEmoji('🌙'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'opt-del'))
            .setValue('deletion')
            .setEmoji('🗑️')
        );

    const row = new ActionRowBuilder().addComponents(menu);
    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

// Infractions page
async function generatePanelInfractions(client, targetUser, page = 1) {
    const Infraction = client.models['staff-management-system']['Infraction'];
    const allInfractions = await Infraction.findAll({
        where: {userId: targetUser.id}
    });
    const count = allInfractions.length;

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);

    const limit = page === 1 ? 3 : 5;
    const offset = page === 1 ? 0 : 3 + ((page - 2) * 5);

    const typeCounts = {};
    allInfractions.forEach(inf => { typeCounts[inf.type] = (typeCounts[inf.type] || 0) + 1; });
    const typeStrings = Object.entries(typeCounts).map(([type, qty]) => `${type}: **${qty}**`).join('\n');

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-inf-title', { username: targetUser.username }))
        .setColor('Red')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-inf-desc', {
        count: count, types: typeStrings || localize('staff-management-system', 'info-none')
    });

    const rows = await Infraction.findAll({
        where: {userId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });

    if (rows.length === 0) {
        desc += localize('staff-management-system', 'p-no-hist');
    } else {
        desc += rows.map(r => {
            const statusIcon = r.active ? '🔴' : localize('staff-management-system', 'icon-voided');
            const expiry = r.expiresAt ? `\n**${localize('staff-management-system', 'label-exp')}:** ${dateToDiscordTimestamp(r.expiresAt, 'R')}` : '';
            return `**${statusIcon} ${localize('staff-management-system', 'label-case')} #${r.caseId} - ${r.type}**\n**${localize('staff-management-system', 'label-date')}:** ${dateToDiscordTimestamp(r.createdAt, 'f')}\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}${expiry}`;
        }).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'infractions').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-inf_${targetUser.id}_${page - 1}`,
        'panel_inf_count',
        `staff-mgmt_panel-inf_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), paginationRow.toJSON()]
    };
}

// Promotions page
async function generatePanelPromotions(client, targetUser, page = 1) {
    const Promotion = client.models['staff-management-system']['Promotion'];
    const count = await Promotion.count({
        where: {userId: targetUser.id}
    });

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);

    const limit = page === 1
        ? 3
    : 5;
    const offset = page === 1
        ? 0
        : 3 + ((page - 2) * 5);

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-prom-title', {
            username: targetUser.username
        }))
        .setColor('Gold')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-prom-desc', { count: count });
    const rows = await Promotion.findAll({
        where: {userId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });

    if (rows.length === 0) {
        desc += localize('staff-management-system', 'p-no-hist');
    } else {
        desc += rows.map(r => `**${localize('staff-management-system', 'label-role')}:** <@&${r.newRole}>\n**${localize('staff-management-system', 'label-prom-by')}:** <@${r.issuerId}>\n**${localize('staff-management-system', 'label-date')}:** ${dateToDiscordTimestamp(r.createdAt, 'R')}\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}`).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({ name: '\u200b', value: localize('staff-management-system', 'page-count', { page, total: totalPages }) });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'promotions').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-prom_${targetUser.id}_${page - 1}`,
        'panel_prom_count',
        `staff-mgmt_panel-prom_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), paginationRow.toJSON()]
    };
}

// Reviews page
async function generatePanelReviews(client, targetUser, page = 1) {
    const Review = client.models['staff-management-system']['StaffReview'];
    const allReviews = await Review.findAll({
        where: {targetId: targetUser.id}
    });
    const count = allReviews.length;

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);

    const limit = page === 1 ? 3 : 5;
    const offset = page === 1 ? 0 : 3 + ((page - 2) * 5);

    const avg = count
        ? (allReviews.reduce((a, b) => a + b.stars, 0) / count).toFixed(1)
    : 0;

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-rev-title', {
            username: targetUser.username
        }))
        .setColor('Gold')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-rev-desc', { count: count, avg: avg });

    const rows = await Review.findAll({
        where: {targetId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });
    if (rows.length === 0) desc += localize('staff-management-system', 'p-no-hist');
    else desc += rows.map(r => `**${"⭐".repeat(r.stars)}** ${localize('staff-management-system', 'label-by')} <@${r.authorId}>\n"${r.comment}"`).join('\n\n');

    embed.setDescription(desc);
    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', {
            page, total: totalPages
        })
    });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'reviews').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-rev_${targetUser.id}_${page - 1}`,
        'panel_rev_count',
        `staff-mgmt_panel-rev_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), paginationRow.toJSON()]
    };
}

// Status page
async function generatePanelStatus(client, targetUser, page = 1) {
    const LoaRequest = client.models['staff-management-system']['LoaRequest'];
    const allStatuses = await LoaRequest.findAll({
        where: {userId: targetUser.id}
    });
    const count = allStatuses.length;

    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);
    const limit = page === 1
        ? 3
    : 5;
    const offset = page === 1
        ? 0
        : 3 + ((page - 2) * 5);

    const activeStatus = allStatuses.find(s => ['APPROVED', 'PENDING'].includes(s.status) && new Date(s.endDate) > new Date());
    let activeText = localize('staff-management-system', 'info-none');
    if (activeStatus) {
        activeText = `**${activeStatus.type}** (${activeStatus.status})\n${localize('staff-management-system', 'label-end')}: ${dateToDiscordTimestamp(activeStatus.endDate, 'R')}`;
    }

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-sta-title', {
            username: targetUser.username
        }))
        .setColor('Green')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-sta-desc', {
        count: count, active: activeText
    });

    const rows = await LoaRequest.findAll({
        where: {userId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });
    if (rows.length === 0) desc += localize('staff-management-system', 'p-no-hist');
    else {
        const icons = {
            APPROVED: '✅',
            DENIED: '❌',
            ENDED: '⏹️',
            PENDING: '🕐'
        };
        desc += rows.map(r => `**${icons[r.status] || '❓'} ${r.type} - ${r.status}**\n**${localize('staff-management-system', 'general-start')}:** ${dateToDiscordTimestamp(r.startDate, 'D')}\n**${localize('staff-management-system', 'general-end')}:** ${dateToDiscordTimestamp(r.endDate, 'D')}\n**${localize('staff-management-system', 'general-rsn')}:** ${r.reason}`).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', {
            page,
            total: totalPages
        })
    });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'status').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-stat_${targetUser.id}_${page - 1}`,
        'panel_stat_count',
        `staff-mgmt_panel-stat_${targetUser.id}_${page + 1}`,
        page, totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), paginationRow.toJSON()]
    };
}

// Activity checks page
async function generatePanelActivity(client, targetUser, page = 1) {
    const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];
    const ActivityCheckResponse = client.models['staff-management-system']['ActivityCheckResponse'];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const recentChecks = await ActivityCheck.findAll({
        where: {
            createdAt: { [Op.gte]: cutoff }
        },
        order: [['createdAt', 'DESC']]
    });

    if (recentChecks.length === 0) {
        const embed = applyFooter(client, new EmbedBuilder()
            .setTitle(localize('staff-management-system', 'p-act-title', {
                username: targetUser.username
            }))
            .setColor('Blue')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(localize('staff-management-system', 'p-act-desc', { count: 0 }) + localize('staff-management-system', 'p-no-hist'))
        );

        const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
        menu.components[0].options.find(opt => opt.data.value === 'activity').data.default = true;

        return {
            embeds: [embed.toJSON()],
            components: [menu.toJSON()]
        };
    }

    const checkIds = recentChecks.map(check => check.id);
    const responses = await ActivityCheckResponse.findAll({
        where: {
            activityCheckId: { [Op.in]: checkIds },
            userId: targetUser.id
        },
        attributes: ['activityCheckId']
    });

    const respondedCheckIds = new Set(responses.map(response => response.activityCheckId));
    const historyRows = recentChecks.filter(check => respondedCheckIds.has(check.id));

    const count = historyRows.length;
    let totalPages = 1;
    if (count > 3) totalPages = 1 + Math.ceil((count - 3) / 5);
    const limit = page === 1
        ? 3
    : 5;
    const offset = page === 1
        ? 0
        : 3 + ((page - 2) * 5);
    const paginatedRows = historyRows.slice(offset, offset + limit);

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-act-title', {
            username: targetUser.username
        }))
        .setColor('Blue')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    let desc = localize('staff-management-system', 'p-act-desc', { count });

    if (paginatedRows.length === 0) {
        desc += localize('staff-management-system', 'p-no-hist');
    } else {
        desc += paginatedRows.map(r =>
            `**${localize('staff-management-system', 'label-chk')} ${dateToDiscordTimestamp(r.createdAt, 'D')}**\n` +
            `**${localize('staff-management-system', 'label-end')}:** ${dateToDiscordTimestamp(r.endTime, 'F')}\n` +
            `**${localize('staff-management-system', 'label-chan')}:** <#${r.channelId}>`
        ).join('\n\n');
    }

    embed.setDescription(desc);
    embed.addFields({
        name: '\u200b',
        value: localize('staff-management-system', 'page-count', { page, total: totalPages })
    });

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'activity').data.default = true;

    const paginationRow = buildPaginationRow(
        `staff-mgmt_panel-act_${targetUser.id}_${page - 1}`,
        'panel_act_count',
        `staff-mgmt_panel-act_${targetUser.id}_${page + 1}`,
        page,
        totalPages
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), paginationRow.toJSON()]
    };
}

// Shifts page
async function generatePanelShifts(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'p-shi-title', {
            username: targetUser.username
        }))
        .setColor('Purple')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    try {
        const Shift = client.models['staff-management-system']['StaffShift'];
        const config = getConfig(client, 'shifts') || {};
        const shifts = await Shift.findAll({
            where: {
                userId: targetUser.id,
                endTime: {[Op.not]: null},
                duration: {[Op.not]: null}
            }
        });

        const totalShifts = shifts.length;
        const totalSeconds = shifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);

        const breakdown = {};
        shifts.forEach(log => {
            const t = log.type || 'Staff';
            breakdown[t] = (breakdown[t] || 0) + (parseInt(log.duration) || 0);
        });
        const breakdownStr = Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([type, sec]) => `• ${type}: ${formatDuration(sec)}`).join('\n') || localize('staff-management-system', 'info-none');

        let quotaStr = localize('staff-management-system', 'no-quota-configured');
        const guild = client.guilds.cache.get(client.guildID);
        const member = await guild?.members.fetch(targetUser.id).catch(() => null);

        if (member && config.enableQuotas && config.quotas) {
            let bestQuota = null;
            let highestPosition = -1;
            for (const [roleId, hoursStr] of Object.entries(config.quotas)) {
                const hours = parseFloat(hoursStr);
                const role = guild.roles.cache.get(roleId);
                if (role && member.roles.cache.has(roleId) && role.position > highestPosition) {
                    highestPosition = role.position;
                    bestQuota = { hours };
                }
            }

            if (bestQuota) {
                const timeframe = config.quotaTimeframe || 'Weekly';
                const cutoff = new Date();
                if (timeframe === 'Weekly') cutoff.setDate(cutoff.getDate() - 7);
                else cutoff.setMonth(cutoff.getMonth() - 1);

                const recentShifts = await Shift.findAll({
                    where: {
                        userId: targetUser.id,
                        startTime: {[Op.gt]: cutoff},
                        endTime: {[Op.not]: null},
                        duration: {[Op.not]: null}
                    }
                });
                const recentSeconds = recentShifts.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0);
                const requiredSeconds = bestQuota.hours * 3600;
                const isMet = recentSeconds >= requiredSeconds;

                quotaStr = localize('staff-management-system', 'duty-quota-str', {
                    timeframe,
                    duration: formatDuration(recentSeconds),
                    hours: bestQuota.hours,
                    result: isMet
                        ? localize('staff-management-system', 'duty-quota-met')
                        : localize('staff-management-system', 'duty-quota-failed')
                });
            }
        }

        const allResults = await Shift.findAll({
            attributes: ['userId', [Shift.sequelize.fn('SUM', Shift.sequelize.col('duration')), 'totalDuration']],
            where: { endTime: { [Op.not]: null }, duration: { [Op.not]: null } },
            group: ['userId'],
            order: [[Shift.sequelize.literal('totalDuration'), 'DESC']]
        });

        const lbIndex = allResults.findIndex(p => p.userId === targetUser.id);
        const lbRank = lbIndex !== -1
            ? `${lbIndex + 1} / ${allResults.length}`
        : localize('staff-management-system', 'label-unranked');

        embed.setDescription(localize('staff-management-system', 'panel-shifts-desc', {
            totalShifts,
            totalSeconds: formatDuration(totalSeconds),
            lbRank,
            breakdownStr,
            quotaStr
        }));

    } catch (e) {
        client.logger.error(`[Staff Management] User panel error: ${e.stack}`);
        embed.setDescription(localize('staff-management-system', 'err-shift-data-unavailable', { error: e.message }));
    }

    const menu = ActionRowBuilder.from((await generateUserPanel(client, targetUser)).components[0]);
    menu.components[0].options.find(opt => opt.data.value === 'shifts').data.default = true;

    const historyBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId(`duty-mgmt_hist_${targetUser.id}_1_All`)
        .setLabel(localize('staff-management-system', 'btn-view-history'))
        .setStyle(ButtonStyle.Secondary)
    );

    return {
        embeds: [embed.toJSON()],
        components: [menu.toJSON(), historyBtnRow.toJSON()]
    };
}

// Deletion page
async function generatePanelDeletion(client, targetUser) {
    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'panel-deletion-title', { tag: targetUser.username }))
        .setDescription(localize('staff-management-system', 'panel-deletion-desc', { mention: targetUser.toString() }))
        .setColor('DarkRed')
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`staff-mgmt_delete-menu_${targetUser.id}`)
        .setPlaceholder(localize('staff-management-system', 'panel-deletion-placeholder'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-back'))
            .setValue('back')
            .setEmoji('◀️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-act'))
            .setValue('del_activity')
            .setEmoji('📋'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-inf'))
            .setValue('del_infractions')
            .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-prom'))
            .setValue('del_promotions')
            .setEmoji('🎉'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-rev'))
            .setValue('del_reviews')
            .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-shifts'))
            .setValue('del_shifts')
            .setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-status'))
            .setValue('del_status')
            .setEmoji('🌙'),
            new StringSelectMenuOptionBuilder()
            .setLabel(localize('staff-management-system', 'panel-opt-del-all'))
            .setValue('del_all')
            .setEmoji('💥')
        );

    return {
        embeds: [embed.toJSON()],
        components: [new ActionRowBuilder().addComponents(menu).toJSON()]
    };
}

async function executeDataDeletion(client, targetId, dataType) {
    const models = client.models['staff-management-system'];

    if (['del_infractions', 'del_all'].includes(dataType)) {
        await models.Infraction.destroy({
            where: { userId: targetId }
        });
    }

    if (['del_promotions', 'del_all'].includes(dataType)) {
        await models.Promotion.destroy({
            where: { userId: targetId }
        });
    }

    if (['del_reviews', 'del_all'].includes(dataType)) {
        await models.StaffReview.destroy({
            where: { targetId }
        });
    }

    const profileUpdates = {};
    if (['del_shifts', 'del_all'].includes(dataType)) {
        profileUpdates.onDuty = false;
        profileUpdates.onBreak = false;
        profileUpdates.breakStartTime = null;
        profileUpdates.lastClockIn = null;
    }

    if (['del_status', 'del_all'].includes(dataType)) {
        profileUpdates.activityStatus = null;
    }

    if (dataType === 'del_all') {
        profileUpdates.customNickname = null;
        profileUpdates.customIntro = null;
        profileUpdates.isSuspended = false;
        profileUpdates.suspendedRoles = null;
    }

    if (Object.keys(profileUpdates).length > 0) {
        const profile = await models.StaffProfile.findByPk(targetId);
        if (profile) await profile.update(profileUpdates);
    }

    if (['del_activity', 'del_all'].includes(dataType)) {
        await models.ActivityCheckResponse.destroy({
            where: { userId: targetId }
        });
    }
}

// ---------- Activity Checks ----------
async function startActivityCheck(client, interactionOrChannel, isAutomated = false) {
    const config = getConfig(client, 'activity-checks');
    const ActivityCheck = client.models['staff-management-system']['ActivityCheck'];

    if (await ActivityCheck.findOne({
        where: {status: 'ACTIVE'}
    })) {
        return !isAutomated && interactionOrChannel.editReply
            ? interactionOrChannel.editReply({content: localize('staff-management-system', 'err-ac-act')})
        : null;
    }

    let rolesToCheck = config.targetRoles?.length
        ? config.targetRoles
    : (getConfig(client, 'configuration')?.staffRoles || []);
    if (!rolesToCheck.length) return !isAutomated && interactionOrChannel.editReply
        ? interactionOrChannel.editReply({
            content: localize('staff-management-system', 'err-ac-norole')
        })
    : null;

    const targetChannel = isAutomated
        ? interactionOrChannel
    : (interactionOrChannel.options.getChannel('channel') || interactionOrChannel.guild.channels.cache.get(getSafeChannelId(config.sendingChannel)) || interactionOrChannel.channel);
    if (!targetChannel) return !isAutomated && interactionOrChannel.editReply
        ? interactionOrChannel.editReply({
            content: localize('staff-management-system', 'err-ac-invchan')
        })
    : null;

    const durationHours = config.timeframe || 24;
    const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    const generalConfig = getConfig(client, 'configuration') || {};
    const initiator = isAutomated
        ? localize('staff-management-system', 'label-system')
        : interactionOrChannel.user.toString();

    const responseButtonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('staff-mgmt_ac-respond')
                .setLabel(localize('staff-management-system', 'ac-confirm-btn'))
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        )
        .toJSON();

    let msgOpts = await embedTypeV2(config.checkMessage, {
        '%end-time%': dateToDiscordTimestamp(endTime, 'F'),
        '%duration%': durationHours.toString(),
        '%staff-mention%': formatRoleMentions(generalConfig.staffRoles),
        '%supervisor-mention%': formatRoleMentions(generalConfig.supervisorRoles),
        '%management-mention%': formatRoleMentions(generalConfig.managementRoles),
        '%initiator%': initiator
    }, {
        components: [responseButtonRow]
    });

    if (msgOpts?.content?.trim() === '') delete msgOpts.content;

    try {
        const checkMessage = await targetChannel.send(msgOpts);
        if (!isAutomated && interactionOrChannel.editReply) await interactionOrChannel.editReply({
            content: localize('staff-management-system', 'succ-ac-start', {
                channel: targetChannel.id,
                hours: durationHours
            })
        });

        const record = await ActivityCheck.create({
            messageId: checkMessage.id,
            channelId: targetChannel.id,
            endTime,
            targetRoles: JSON.stringify(rolesToCheck),
            status: 'ACTIVE',
            initiatorId: isAutomated ? null : interactionOrChannel.user.id,
            isAutomated
        });
        schedule.scheduleJob(endTime, async () => {
            const currentCheck = await ActivityCheck.findByPk(record.id);
            if (currentCheck && currentCheck.status === 'ACTIVE') await endActivityCheckProcess(client, currentCheck);
        });
    } catch (e) {
        if (!isAutomated && interactionOrChannel.editReply) interactionOrChannel.editReply({
            content: localize('staff-management-system', 'err-ac-perms', {channel: targetChannel.id})
        });
    }
}

async function endActivityCheckProcess(client, activeCheck) {
    await activeCheck.update({ status: 'ENDED' });
    const guild = client.guilds.cache.get(client.guildID);
    if (!guild) return;

    const config = getConfig(client, 'activity-checks');
    const logChannel = guild.channels.cache.get(getSafeChannelId(config.logChannel) || getSafeChannelId(getConfig(client, 'configuration')?.generalLogChannel));
    if (!logChannel) return;

    const targetRoles = JSON.parse(activeCheck.targetRoles || '[]');
    const ActivityCheckResponse = client.models['staff-management-system']['ActivityCheckResponse'];
    const responses = await ActivityCheckResponse.findAll({
        where: { activityCheckId: activeCheck.id },
        attributes: ['userId']
    });

    const respondedUserIds = new Set(responses.map(response => response.userId));
    const StaffProfile = client.models['staff-management-system']['StaffProfile'];
    const expectedMembers = guild.members.cache.filter(m => !m.user.bot && m.roles.cache.some(r => targetRoles.includes(r.id)));
    const [responded, exceptions, failed] = [[], [], []];
    const expectedIds = [...expectedMembers.keys()];
    const profiles = await StaffProfile.findAll({
        where: {
            userId: {[Op.in]: expectedIds}
        }
    });
    const initiator = (activeCheck.isAutomated || !activeCheck.initiatorId)
        ? localize('staff-management-system', 'label-system')
        : `<@${activeCheck.initiatorId}>`;

    expectedMembers.forEach(member => {
        if (respondedUserIds.has(member.id)) return responded.push(member);

        let isException = false;
        const prof = profiles.find(p => p.userId === member.id);
        const isLoa = prof?.activityStatus === 'LOA';
        const isRa = prof?.activityStatus === 'RA';

        if (config.exceptionsType === 'Only LoA' && isLoa) isException = true;
        else if (config.exceptionsType === 'Only RA' && isRa) isException = true;
        else if (config.exceptionsType === 'LoA and RA' && (isLoa || isRa)) isException = true;
        else if (config.exceptionsType === 'Custom role(s)' && member.roles.cache.some(r => config.customExceptionRoles?.includes(r.id))) isException = true;

        isException
            ? exceptions.push(member)
        : failed.push(member);
    });

    try {
        const msg = await guild.channels.cache.get(activeCheck.channelId)?.messages.fetch(activeCheck.messageId);
        if (msg) {
            const endTemplate = config.endCheckMessage;
            const endedMessage = await embedTypeV2(
                endTemplate,
                {
                    '%end-time%': dateToDiscordTimestamp(new Date(), 'F'),
                    '%duration%': (config.timeframe || 24).toString(),
                    '%staff-mention%': formatRoleMentions(config.staffRoles),
                    '%supervisor-mention%': formatRoleMentions(config.supervisorRoles),
                    '%management-mention%': formatRoleMentions(config.managementRoles),
                    '%initiator%': initiator,
                    '%responded-count%': responded.length.toString()
                },
                {
                    components: []
                }
            );

            if (endedMessage?.content?.trim() === '') {
                delete endedMessage.content;
            }

            await msg.edit(endedMessage);
        }
    } catch (e) {
    }

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'ac-res-title'))
        .setColor('Blurple')
        .addFields(
            {
                name: localize('staff-management-system', 'ac-f-res', {
                    count: responded.length }
                ),
                value: responded.length
                    ? responded.map(m => `<@${m.id}>`).join(', ').substring(0, 1024)
                    : localize('staff-management-system', 'info-none')
            },
            {
                name: localize('staff-management-system', 'ac-f-fail', {
                    count: failed.length
                }),
                value: failed.length
                    ? failed.map(m => `<@${m.id}>`).join(', ').substring(0, 1024)
                    : localize('staff-management-system', 'info-none')
            },
            {
                name: localize('staff-management-system', 'ac-f-exc', {
                    count: exceptions.length
                }),
                value: exceptions.length
                    ? exceptions.map(m => `<@${m.id}>`).join(', ').substring(0, 1024)
                    : localize('staff-management-system', 'info-none')
            }
        )
    );

    const pingText = (config.pingResults && config.pingRoles?.length)
        ? config.pingRoles.map(rId => `<@&${rId}>`).join(' ')
    : null;
    const finalMessage = { embeds: [embed.toJSON()] };
    if (pingText) finalMessage.content = pingText;

    await logChannel.send(finalMessage).catch((e) => {
    client.logger.error(localize('staff-management-system', 'log-ac-send-fail', {
        error: e.message
    }));
});
}

function getIsoWeekNumber(date = new Date()) {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = tmp.getUTCDay() || 7;

    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);

    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}

function initActivityCheckAutomation(client) {
    const config = getConfig(client, 'activity-checks');
    if (!config?.enableActivityChecks || !config?.automatedChecks) return;

    let cronString = config.automatedCheckInterval === 'Cronjob'
        ? config.automatedCheckCronjob
    : null;
    if (!cronString) {
        const dayMap = {
            'Monday': 1,
            'Tuesday': 2,
            'Wednesday': 3,
            'Thursday': 4,
            'Friday': 5,
            'Saturday': 6,
            'Sunday': 7
        }[config.automatedCheckWeekDay] || 1;
        if (['Weekly', 'Biweekly'].includes(config.automatedCheckInterval)) cronString = `0 12 * * ${dayMap}`;
        else if (config.automatedCheckInterval === 'Monthly') {
            const startDay = [1, 8, 15, 22][(config.automatedCheckMonthWeek || 1) - 1];
            cronString = `0 12 ${startDay}-${startDay + 6} * ${dayMap}`;
        }
    }
    if (!cronString) return;

    const jobName = 'automated-activity-check';
    const existingJob = schedule.scheduledJobs[jobName];
    if (existingJob) existingJob.cancel();
    schedule.scheduleJob(jobName, cronString, async () => {
        if (config.automatedCheckInterval === 'Biweekly' && getIsoWeekNumber(new Date()) % 2 !== 0) {
            return;
        }

        const channel = client.guilds.cache.get(client.guildID)?.channels.cache.get(getSafeChannelId(config.sendingChannel));
        if (channel) {
            client.logger.info(`[Activity Checks] Starting automated check.`);
            await startActivityCheck(client, channel, true);
        }
    });
}

// ---------- Reviews ----------
async function submitReview(client, interaction, targetUser, stars, comment) {
    await interaction.deferReply({ephemeral: true});
    const config = getConfig(client, 'reviews');
    if (!config?.enableReviews) return interaction.editReply({
        content: localize('staff-management-system', 'err-feat-disabled', {
            feature: 'Reviews'
        })
    });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return interaction.editReply({
        content: localize('staff-management-system', 'err-not-mem')
    });
    if (!config.allowSelfRating && targetUser.id === interaction.user.id) return interaction.editReply({
        content: localize('staff-management-system', 'err-self-rate')
    });

    if (config.onlyAllowStaffReview !== false) {
        const generalConfig = getConfig(client, 'configuration') || {};
        const staffRoles = Array.isArray(generalConfig.staffRoles)
            ? generalConfig.staffRoles
            : (generalConfig.staffRoles ? [generalConfig.staffRoles] : []);

        const hasStaffRole = staffRoles.length > 0 && targetMember.roles.cache.some(role =>
            staffRoles.includes(role.id)
        );

        if (!hasStaffRole) {
            return interaction.editReply({
                content: localize('staff-management-system', 'err-staff-rate')
            });
        }
    }

    const review = await client.models['staff-management-system']['StaffReview'].create({
        targetId: targetUser.id,
        authorId: interaction.user.id,
        stars,
        comment
    });
    const channelId = getSafeChannelId(config.reviewLogChannel);

    if (channelId) {
        const channel = interaction.guild.channels.cache.get(channelId);
        if (channel) {
            let msgOpts = await embedTypeV2(config.ratingMessage, {
                '%staff-mention%': targetUser.toString(),
                '%reviewer-mention%': interaction.user.toString(),
                '%stars%': '⭐'.repeat(stars),
                '%rating%': stars.toString(),
                '%comment%': comment,
                '%staff-avatar%': targetUser.displayAvatarURL({dynamic: true}),
                '%reviewer-avatar%': interaction.user.displayAvatarURL({dynamic: true})
            });
            if (msgOpts?.content?.trim() === '') delete msgOpts.content;
            const sentMessage = await channel.send(msgOpts).catch(()=>{});
            if (sentMessage) await review.update({ messageUrl: sentMessage.url });
        }
    }
    await interaction.editReply({
        content: localize('staff-management-system', 'succ-review', {
            tag: targetUser.tag,
            stars
        })
    });
}

async function generateReviewHistoryResponse(client, targetUser, page = 1) {
    if (!getConfig(client, 'reviews')?.enableReviews) return {
        content: localize('staff-management-system', 'err-feat-disabled', {
            feature: 'Reviews'
        }),
        flags: MessageFlags.Ephemeral
    };

    const limit = 8;
    const offset = (page - 1) * limit;
    const Review = client.models['staff-management-system']['StaffReview'];

    const {count, rows} = await Review.findAndCountAll({
        where: {targetId: targetUser.id},
        order: [['createdAt', 'DESC']],
        limit,
        offset
    });
    const allReviews = await Review.findAll({
        where: {targetId: targetUser.id},
        attributes: ['stars']
    });
    const avg = allReviews.length
        ? (allReviews.reduce((a, b) => a + b.stars, 0) / allReviews.length).toFixed(1)
    : 0;

    const embed = applyFooter(client, new EmbedBuilder()
        .setTitle(localize('staff-management-system', 'rev-title', { username: targetUser.username }))
        .setColor('Gold')
        .setDescription(localize('staff-management-system', 'rev-desc', { avg, count: allReviews.length }))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    );

    embed.addFields({
        name: localize('staff-management-system', 'label-hist'),
        value: rows.length > 0
        ? rows.map(r => `**${"⭐".repeat(r.stars)}** ${localize('staff-management-system', 'label-by')} <@${r.authorId}>${r.messageUrl
                ? ` • [Jump](${r.messageUrl})`
                : ''}\n"${r.comment}"`).join('\n\n')
        : localize('staff-management-system', 'p-no-hist') });

    const row = buildPaginationRow(
        `staff-mgmt_rev-page_${targetUser.id}_${page - 1}`,
        'page_count_disabled',
        `staff-mgmt_rev-page_${targetUser.id}_${page + 1}`,
        page,
        Math.ceil(count / limit) || 1
    );
    return {
        embeds: [embed.toJSON()],
        components: [row.toJSON()]
    };
}

async function getReviewHistory(client, interaction, targetUser) {
    await interaction.deferReply({ephemeral: true});
    const response = await generateReviewHistoryResponse(client, targetUser, 1);
    if (response.content && response.content.startsWith('❌')) return interaction.editReply(response);

    await interaction.editReply({
        ...response
    });
}

module.exports = {
    getConfig,
    getSafeChannelId,
    parseDurationToDays,
    applyFooter,
    checkStaffPermissions,
    buildPaginationRow,
    formatDuration,
    issueInfraction,
    issueSuspension,
    getInfractionHistory,
    voidInfraction,
    generateInfractionHistoryResponse,
    promoteUser,
    generatePromotionHistoryResponse,
    getPromotionHistory,
    generateUserPanel,
    generatePanelInfractions,
    generatePanelPromotions,
    generatePanelActivity,
    generatePanelReviews,
    generatePanelStatus,
    generatePanelShifts,
    generatePanelDeletion,
    executeDataDeletion,
    generatePanelSubpage,
    startActivityCheck,
    initActivityCheckAutomation,
    endActivityCheckProcess,
    submitReview,
    getReviewHistory,
    generateReviewHistoryResponse,
    getIsoWeekNumber
};
