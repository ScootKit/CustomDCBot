/**
 * Manages the live-leaderboard
 * @module Levels-Leaderboard
 * @author Simon Csaba <mail@scderox.de>
 */
const {ChannelType, MessageEmbed} = require('discord.js');
const {localize} = require('../../src/functions/localize');
const {
    formatDiscordUserName,
    formatNumber,
    parseEmbedColor
} = require('../../src/functions/helpers');
const {displayLevel, isMaxLevel, calculateLevelXP} = require('./events/messageCreate');
const {client} = require('../../main');
let changed = false;

/**
 * Updates the leaderboard in the leaderboard channel
 * @param {Client} client Client
 * @param {Boolean} force If enabled the embed will update even if there was no registered change
 * @returns {Promise<void>}
 */
module.exports.updateLeaderBoard = async function (client, force = false) {
    if (!client.configurations['levels']['config']['leaderboard-channel']) return;
    if (!force && !changed) return;
    const moduleStrings = client.configurations['levels']['strings'];
    const channel = await client.channels.fetch(client.configurations['levels']['config']['leaderboard-channel']).catch(() => {
    });
    if (!channel || channel.type !== ChannelType.GuildText) return client.logger.error('[levels] ' + localize('levels', 'leaderboard-channel-not-found'));
    const [messageData] = await client.models['levels']['LiveLeaderboard'].findOrCreate({
        where: {
            channelID: channel.id
        },
        defaults: {
            channelID: channel.id
        }
    });
    let message = messageData.messageID ? await channel.messages.fetch(messageData.messageID).catch(() => {
    }) : null;


    const users = await client.models['levels']['User'].findAll({
        order: [
            ['xp', 'DESC']
        ],
        limit: 60
    });

    let leaderboardString = '';
    let i = 0;
    for (const user of users) {
        const member = channel.guild.members.cache.get(user.userID);
        if (!member) continue;
        if (i >= client.configurations['levels']['config']['leaderboard-channel-max-amount']) continue;
        i++;
        leaderboardString = leaderboardString + localize('levels', 'leaderboard-notation', {
            p: i,
            u: client.configurations['levels']['config']['useTags'] ? formatDiscordUserName(member.user) : member.user.toString(),
            l: displayLevel(user.level, client),
            xp: formatNumber(isMaxLevel(user.level, client) ? calculateLevelXP(client, client.configurations['levels']['config'].maximumLevel - 1) : user.xp)
        }) + '\n';
    }
    if (leaderboardString.length === 0) leaderboardString = localize('levels', 'no-user-on-leaderboard');

    const embed = new MessageEmbed()
        .setTitle(moduleStrings.liveLeaderBoardEmbed.title)
        .setDescription(moduleStrings.liveLeaderBoardEmbed.description)
        .setColor(parseEmbedColor(moduleStrings.liveLeaderBoardEmbed.color))
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
        .setThumbnail(channel.guild.iconURL())
        .addField(localize('levels', 'leaderboard'), leaderboardString);

    if (!client.strings.disableFooterTimestamp) embed.setTimestamp();

    const components = [{
        type: 'ACTION_ROW',
        components: [{
            type: 'BUTTON',
            label: moduleStrings.liveLeaderBoardEmbed.button,
            style: 'SUCCESS',
            customId: 'show-level-on-liveleaderboard-click'
        }]
    }];

    if (message) {
        await message.edit({
            embeds: [embed],
            components
        });
        if (force) client.logger.info(localize('levels', 'list-location', {l: message.url}));
    } else {
        message = await channel.send({
            embeds: [embed],
            components
        });
        messageData.messageID = message.id;
        await messageData.save();
    }
};

/**
 * Register if a change in the leaderboard occurred
 */
module.exports.registerNeededEdit = function () {
    if (!changed) changed = true;
};