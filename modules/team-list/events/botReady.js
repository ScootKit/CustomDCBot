const isEqual = require('is-equal');
const {
    truncate,
    parseEmbedColor,
    safeSetFooter
} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {
    protectMessage,
    unprotectMessage,
    registerProtectedMessageProvider
} = require('../../../src/functions/protectedMessages');
const {MessageEmbed} = require('discord.js');

// Restore auto-delete protection for the team list from the database on startup.
registerProtectedMessageProvider(async (client) => {
    if (!client.modules['team-list']?.enabled) return [];
    const rows = await client.models['team-list']['TeamListMessage'].findAll({attributes: ['channelID', 'messageID']});
    return rows
        .filter(r => r.channelID && r.messageID)
        .map(r => ({
            channelId: r.channelID,
            messageId: r.messageID
        }));
});
const schedule = require('node-schedule');

const statusIcons = {
    'online': '🟢',
    'dnd': '🔴',
    'idle': '🟡',
    'offline': '⚫'
};

/**
 * Builds the user-list string shown for a single role field.
 * Extracted (behavior-preserving) from updateEmbedsIfNeeded so the
 * status-line vs comma-list formatting, the highest-role dedup, and the
 * empty-role fallback can be unit-tested. Mutates `listedUserIDs` to track
 * which users have already been printed (used by onlineShowHighestRole).
 *
 * @param {Iterable} membersWithRole members holding this role (Map values / array)
 * @param {Object} role the role being rendered (needs toString())
 * @param {Object} channelConfig the per-channel team-list config element
 * @param {string[]} listedUserIDs accumulator of already-listed user ids (mutated)
 * @returns {string}
 */
function buildUserString(membersWithRole, role, channelConfig, listedUserIDs) {
    let userString = '';
    const members = Array.from(membersWithRole);

    // Without GuildPresences every member reads as offline, so drop the status column entirely
    // rather than rendering everyone as offline.
    const showStatus = Boolean(channelConfig.includeStatus) &&
        Boolean(members[0]?.client?._activeIntents?.includes('GuildPresences'));
    for (const member of members) {
        if (listedUserIDs.includes(member.user.id) && channelConfig.onlineShowHighestRole) continue;
        listedUserIDs.push(member.user.id);
        const status = (member.presence || {status: 'offline'}).status;
        userString = userString + (showStatus
            ? `* ${member.user.toString()}: ${statusIcons[status]} ${localize('team-list', status)}\n`
            : `${member.user.toString()}, `);
    }
    if (userString === '') userString = localize('team-list', 'no-users-with-role', {r: role.toString()});
    else if (!showStatus) userString = userString.substring(0, userString.length - 2);
    return userString;
}

module.exports.__test = {
    buildUserString,
    statusIcons
};

module.exports.run = async function (client) {
    await updateEmbedsIfNeeded(client);
    const job = schedule.scheduleJob('1,16,31,46 * * * *', async () => {
        await updateEmbedsIfNeeded(client);
    });
    client.jobs.push(job);
};

let lastSavedEmbed = {};

/**
 * Updates the embed if needed
 * @param client
 * @returns {Promise<void>}
 */
async function updateEmbedsIfNeeded(client) {
    const channels = client.configurations['team-list']['config'];
    for (let configIndex = 0; configIndex < channels.length; configIndex++) {
        const channelConfig = channels[configIndex];
        const embed = new MessageEmbed()
            .setColor(parseEmbedColor(channelConfig.embed.color));

        safeSetFooter(embed, client);

        if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (channelConfig.embed.description) embed.setDescription(channelConfig.embed.description);
        if (channelConfig.embed.title) embed.setTitle(channelConfig.embed.title);
        if (channelConfig.embed['thumbnail-url']) embed.setThumbnail(channelConfig.embed['thumbnail-url']);
        if (channelConfig.embed['img-url']) embed.setImage(channelConfig.embed['img-url']);

        const channel = await client.channels.fetch(channelConfig['channelID']).catch(() => {
        });
        if (!channel) {
            client.logger.error(`[team-list] Could not find channel with id ${channelConfig['channelID']}`);
            continue;
        }

        const guildMembers = client.guild.members.cache;

        const roles = (await channel.guild.roles.fetch()).filter(f => channelConfig.roles.includes(f.id)).sort((a, b) => a.position < b.position ? 1 : -1);
        const listedUserIDs = [];
        let fieldCount = 0;
        for (const role of roles.values()) {
            const membersWithRole = guildMembers.filter(m => m.roles.cache.has(role.id)).values();
            const userString = buildUserString(membersWithRole, role, channelConfig, listedUserIDs);
            fieldCount++;
            embed.addField(channelConfig['nameOverwrites'][role.id] || role.name, truncate((channelConfig['descriptions'][role.id] ? `${channelConfig['descriptions'][role.id]}\n` : '') + userString, 1024));
        }

        if (fieldCount === 0) embed.addField('⚠️', localize('team-list', 'no-roles-selected'));

        const cacheKey = `${channelConfig['channelID']}-${configIndex}`;
        if (isEqual(lastSavedEmbed[cacheKey], embed.toJSON())) continue;
        lastSavedEmbed[cacheKey] = embed.toJSON();

        const [messageData] = await client.models['team-list']['TeamListMessage'].findOrCreate({
            where: {
                channelID: channel.id,
                configIndex
            },
            defaults: {
                channelID: channel.id,
                configIndex
            }
        });

        let message = messageData.messageID ? await channel.messages.fetch(messageData.messageID).catch(() => {
        }) : null;

        try {
            if (message) {
                await message.edit({embeds: [embed]});
                protectMessage(client, channel.id, message.id);
            } else {
                if (messageData.messageID) unprotectMessage(client, channel.id, messageData.messageID);
                message = await channel.send({embeds: [embed]});
                messageData.messageID = message.id;
                await messageData.save();
                protectMessage(client, channel.id, message.id);
            }
        } catch (e) {
            client.logger.error(`[team-list] Failed to send/edit message in channel ${channelConfig['channelID']}: ${e.message}`);
        }
    }
}