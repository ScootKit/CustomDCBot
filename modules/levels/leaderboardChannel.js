/**
 * Manages the live-leaderboard
 * @module Levels-Leaderboard
 * @author Simon Csaba <mail@scderox.de>
 */
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../src/functions/localize');
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
    if (!channel || channel.type !== 'GUILD_TEXT') return client.logger.error('[levels] ' + localize('levels', 'leaderboard-channel-not-found'));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);

    const users = await client.models['levels']['User'].findAll({
        order: [
            ['xp', 'DESC']
        ],
        limit: 15
    });

    let leaderboardString = '';
    let i = 0;
    for (const user of users) {
        const member = channel.guild.members.cache.get(user.userID);
        if (!member) continue;
        i++;
        leaderboardString = leaderboardString + localize('levels', 'leaderboard-notation', {
            p: i,
            u: client.configurations['levels']['config']['useTags'] ? member.user.tag : member.user.toString(),
            l: user.level,
            xp: user.xp
        }) + '\n';
    }
    if (leaderboardString.length === 0) leaderboardString = localize('levels', 'no-user-on-leaderboard');

    const embed = new MessageEmbed()
        .setTitle(moduleStrings.liveLeaderBoardEmbed.title)
        .setDescription(moduleStrings.liveLeaderBoardEmbed.description)
        .setColor(moduleStrings.liveLeaderBoardEmbed.color)
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

    if (messages.first()) await messages.first().edit({embeds: [embed], components});
    else await channel.send({embeds: [embed], components});
};

/**
 * Register if a change in the leaderboard occurred
 */
module.exports.registerNeededEdit = function () {
    if (!changed) changed = true;
};