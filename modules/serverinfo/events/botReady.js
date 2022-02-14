/**
 * Manages the serverinfo-embed
 * @module Partner-List
 * @author Simon Csaba <mail@scderox.de>
 */
const {formatDate} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');

exports.run = async (client) => {
    await generateEmbed(client);
    const interval = setInterval(() => {
        generateEmbed(client);
    }, 300000);
    client.intervals.push(interval);
};

/**
 * Generates the serverinfo embed
 * @param {Client} client
 * @returns {Promise<void>}
 */
async function generateEmbed(client) {
    const config = client.configurations['serverinfo']['config'];
    const fieldConfig = client.configurations['serverinfo']['fields'];
    const channel = await client.channels.fetch(config.channelID).catch(() => {
    });
    if (!channel && (channel || {}).type !== 'GUILD_TEXT') return client.logger.error(`[serverinfo] Could not find channel with id ${config.channelID}`);
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    const embed = new MessageEmbed()
        .setTitle(config.embed.title)
        .setDescription(config.embed.description)
        .setColor(config.embed.color)
        .setTimestamp()
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
        .setThumbnail(channel.guild.iconURL())
        .setAuthor({name: client.user.tag, iconURL: client.user.avatarURL()});

    const guildMembers = await channel.guild.members.fetch({withPresences: true});
    const guildCreationDate = new Date(channel.guild.createdAt);
    const guildRoles = await channel.guild.roles.fetch();

    /**
     * Replaces the content with the variables of this module
     * @private
     * @param {String} content Content to replace variables in
     * @returns {String} String with the variables replaced
     */
    function replacer(content) {
        content = content.replaceAll('%memberCount%', guildMembers.size)
            .replaceAll('%botCount%', guildMembers.filter(m => m.user.bot).size)
            .replaceAll('%userCount%', guildMembers.filter(m => !m.user.bot).size)
            .replaceAll('%onlineMemberCount%', guildMembers.filter(m => m.presence).size)
            .replaceAll('%daysSinceCreation%', ((new Date().getTime() - guildCreationDate.getTime()) / 86400000).toFixed(0))
            .replaceAll('%guildCreationTimestamp%', formatDate(guildCreationDate))
            .replaceAll('%guildBoosts%', channel.guild.premiumSubscriptionCount)
            .replaceAll('%boostLevel%', channel.guild.premiumTier)
            .replaceAll('%channelCount%', channel.guild.channels.cache.size)
            .replaceAll('%roleCount%', guildRoles.size)
            .replaceAll('%emojiCount%', channel.guild.emojis.cache.size)
            .replaceAll('%newline%', '\n')
            .replaceAll('%boosterCount%', guildMembers.filter(m => m.premiumSinceTimestamp).size);
        return content;
    }

    fieldConfig.forEach(field => {
        embed.addField(field.name, replacer(field.content), !!field.inline);
    });

    if (messages.first()) await messages.first().edit({embeds: [embed]});
    else await channel.send({embeds: [embed]});
}