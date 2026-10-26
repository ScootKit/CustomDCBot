/**
 * User panel and history embeds makers
 * @module ping-protection
 * @author itskevinnn
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const {formatDate, safeSetFooter} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {getDeletionTypeLocaleKey} = require('./localHelpers');
const {
    getPingCountInWindow,
    fetchModHistory,
    fetchPingHistory,
    getLeaverStatus,
    getDeletionCooldown
} = require('./records');

function buildPanelMenu(userId, selected = 'overview') {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`ping-protection_panel-menu_${userId}`)
        .setPlaceholder(localize('ping-protection', 'panel-ph'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-over'))
                .setValue('overview')
                .setEmoji('🏠')
                .setDefault(selected === 'overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-hist'))
                .setValue('history')
                .setEmoji('📜')
                .setDefault(selected === 'history'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-actions'))
                .setValue('actions')
                .setEmoji('⚠️')
                .setDefault(selected === 'actions'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-delete'))
                .setValue('deletion')
                .setEmoji('🗑️')
                .setDefault(selected === 'deletion')
        );

    return new ActionRowBuilder().addComponents(menu);
}

function buildDeletionMenu(userId) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`ping-protection_delete-menu_${userId}`)
        .setPlaceholder(localize('ping-protection', 'panel-deletion-placeholder'))
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-back'))
                .setValue('back')
                .setEmoji('◀️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-pings'))
                .setValue('del_ping_history')
                .setEmoji('📜'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-actions'))
                .setValue('del_moderation_history')
                .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(localize('ping-protection', 'panel-opt-del-all'))
                .setValue('del_all')
                .setEmoji('💥')
        );

    return new ActionRowBuilder().addComponents(menu);
}

async function generateUserPanel(client, targetUser) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const retentionWeeks = storageConfig?.pingHistoryRetention || 12;
    const timeframeDays = retentionWeeks * 7;

    const pingCount = await getPingCountInWindow(client, targetUser.id, timeframeDays);
    const modData = await fetchModHistory(client, targetUser.id, 1, 1);

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'panel-title', {
            u: targetUser.tag || targetUser.username
        }))
        .setDescription(localize('ping-protection', 'panel-description', {
            u: targetUser.toString(),
            i: targetUser.id
        }))
        .setColor('Blue')
        .setThumbnail(targetUser.displayAvatarURL({dynamic: true}))
        .addFields([{
            name: localize('ping-protection', 'field-quick-history', {w: retentionWeeks}),
            value: localize('ping-protection', 'field-quick-desc', {
                p: pingCount,
                m: modData.total
            }),
            inline: false
        }]);

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [buildPanelMenu(targetUser.id, 'overview').toJSON()]
    };
}

// Generates a paginated history embed
async function generateHistoryResponse(client, userOrId, page = 1, isPanel = false) {
    const storageConfig = client.configurations['ping-protection']['storage'];
    const limit = 5;
    const isEnabled = Boolean(storageConfig?.enablePingHistory);

    const targetUser = typeof userOrId === 'string'
        ? await client.users.fetch(userOrId).catch(() => ({id: userOrId, username: 'Unknown User', displayAvatarURL: () => null}))
        : userOrId;

    const userId = targetUser.id;
    let total = 0;
    let history = [];
    let totalPages = 1;

    if (isEnabled) {
        const data = await fetchPingHistory(client, userId, page, limit);
        total = data.total;
        history = data.history;
        totalPages = Math.ceil(total / limit) || 1;
    }

    const leaverData = await getLeaverStatus(client, userId);
    let description = '';

    if (leaverData) {
        const dateStr = formatDate(leaverData.leftAt);
        const warningKey = history.length > 0 ? 'leaver-warning-long' : 'leaver-warning-short';
        description = description + `⚠️ ${localize('ping-protection', warningKey, {d: dateStr})}\n\n`;
    }

    if (!isEnabled) {
        description = description + localize('ping-protection', 'history-disabled');
    } else if (history.length === 0) {
        description = description + localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const timeString = formatDate(entry.createdAt);
            let targetString = 'Detected';
            if (entry.targetId) {
                targetString = entry.isRole ? `<@&${entry.targetId}>` : `<@${entry.targetId}>`;
            }

            const hasValidLink = entry.messageUrl && entry.messageUrl !== 'Blocked by AutoMod';
            const linkText = hasValidLink
                ? `[${localize('ping-protection', 'label-jump')}](${entry.messageUrl})`
                : localize('ping-protection', 'no-message-link');

            let typeString;
            if (entry.pingType === 'MENTION') typeString = localize('ping-protection', 'ping-mention');
            else if (entry.pingType === 'REPLY') typeString = localize('ping-protection', 'ping-reply');
            else typeString = localize('ping-protection', 'ping-unknown');

            const typeLine = `• **${localize('ping-protection', 'label-type')}:** ${typeString} (${linkText})`;
            return localize('ping-protection', 'list-entry-text', {
                index: (page - 1) * limit + index + 1,
                target: targetString,
                time: timeString,
                type: typeLine
            });
        });
        description = description + lines.join('\n\n');
    }

    // Switch customId prefixes depending on standalone vs panel origin
    const btnPrefix = isPanel ? `ping-protection_panel-hist_${userId}` : `ping-protection_hist-page_${userId}`;
    const countId = isPanel ? 'ping_protection_panel_hist_count' : 'ping_protection_page_count';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${btnPrefix}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(countId)
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${btnPrefix}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || !isEnabled)
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-history-title', {u: targetUser.username}))
        .setThumbnail(targetUser.displayAvatarURL({dynamic: true}))
        .setDescription(description)
        .setColor('Orange');

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    const components = isPanel
        ? [buildPanelMenu(userId, 'history').toJSON(), row.toJSON()]
        : [row.toJSON()];

    return {embeds: [embed.toJSON()], components};
}

// Generates a paginated moderation actions embed
async function generateActionsResponse(client, userOrId, page = 1, isPanel = false) {
    const moderationConfig = client.configurations['ping-protection']['moderation'];
    const limit = 5;
    const isEnabled = Array.isArray(moderationConfig) && moderationConfig.length > 0;

    const targetUser = typeof userOrId === 'string'
        ? await client.users.fetch(userOrId).catch(() => ({id: userOrId, username: 'Unknown User', displayAvatarURL: () => null}))
        : userOrId;

    const userId = targetUser.id;
    const data = await fetchModHistory(client, userId, page, limit);
    const total = data.total;
    const history = data.history;
    const totalPages = Math.ceil(total / limit) || 1;

    let description = '';
    if (history.length === 0) {
        description = description + localize('ping-protection', 'no-data-found');
    } else {
        const lines = history.map((entry, index) => {
            const duration = entry.actionDuration ? ` (${entry.actionDuration}m)` : '';
            const reasonText = entry.reason || localize('ping-protection', 'no-reason') || 'No reason';
            return `${(page - 1) * limit + index + 1}. **${entry.type}${duration}** - ${formatDate(entry.createdAt)}\n${localize('ping-protection', 'label-reason')}: ${reasonText}`;
        });
        description = description + (lines.join('\n\n') + `\n\n-# ${localize('ping-protection', 'actions-retention-note')}`);
    }

    const btnPrefix = isPanel ? `ping-protection_panel-actions_${userId}` : `ping-protection_mod-page_${userId}`;
    const countId = isPanel ? 'ping_protection_panel_actions_count' : 'ping_protection_page_count';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${btnPrefix}_${page - 1}`)
            .setLabel(localize('helpers', 'back'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(countId)
            .setLabel(`${page}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${btnPrefix}_${page + 1}`)
            .setLabel(localize('helpers', 'next'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages || (!isEnabled && history.length === 0))
    );

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'embed-actions-title', {u: targetUser.username}))
        .setThumbnail(targetUser.displayAvatarURL({dynamic: true}))
        .setDescription(description)
        .setColor(isEnabled ? 'Red' : 'Grey');

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    const components = isPanel
        ? [buildPanelMenu(userId, 'actions').toJSON(), row.toJSON()]
        : [row.toJSON()];

    return {embeds: [embed.toJSON()], components};
}

async function generatePanelDeletion(client, targetUser) {
    const cooldown = await getDeletionCooldown(client, targetUser.id);

    let description = localize('ping-protection', 'panel-deletion-desc', {
        u: targetUser.toString(),
        i: targetUser.id
    });

    if (cooldown) {
        description = description + `\n\n⚠️ ${localize('ping-protection', 'panel-deletion-cooldown-active', {
            time: formatDate(new Date(cooldown.blockedUntil)),
            type: localize('ping-protection', getDeletionTypeLocaleKey(cooldown.lastDeletionType))
        })}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(localize('ping-protection', 'panel-deletion-title', {
            u: targetUser.tag || targetUser.username
        }))
        .setDescription(description)
        .setColor('DarkRed')
        .setThumbnail(targetUser.displayAvatarURL({dynamic: true}));

    safeSetFooter(embed, client);
    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    return {
        embeds: [embed.toJSON()],
        components: [buildDeletionMenu(targetUser.id).toJSON()]
    };
}

module.exports = {
    buildPanelMenu,
    buildDeletionMenu,
    generateUserPanel,
    generateHistoryResponse,
    generateActionsResponse,
    generatePanelDeletion
};