const {MessageEmbed} = require('discord.js');

exports.run = async (client) => {
    await generateEmbed(client);
    setInterval(() => {
        generateEmbed(client);
    }, 300000);
};

async function generateEmbed(client) {
    const config = require(`${client.configDir}/serverinfo/config.json`);
    const fieldConfig = require(`${client.configDir}/serverinfo/fields.json`);
    const channel = await client.channels.fetch(config.channelID).catch(e => {
    });
    if (!channel) return console.error(`[serverinfo] Could not find channel with id ${config.channelID}`);
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    const embed = new MessageEmbed()
        .setTitle(config.embed.title)
        .setDescription(config.embed.description)
        .setColor(config.embed.color)
        .setTimestamp()
        .setFooter(client.strings.footer)
        .setThumbnail(channel.guild.iconURL())
        .setAuthor(client.user.tag, client.user.avatarURL());

    const guildMembers = await channel.guild.members.fetch();
    const guildCreationDate = new Date(channel.guild.createdAt);
    const guildRoles = await channel.guild.roles.fetch();

    function replacer(content) {
        content = content.split('%memberCount%').join(guildMembers.size)
            .split('%botCount%').join(guildMembers.filter(m => m.user.bot).size)
            .split('%userCount%').join(guildMembers.filter(m => !m.user.bot).size)
            .split('%onlineMemberCount%').join(guildMembers.filter(m => m.presence.status !== 'offline').size)
            .split('%daysSinceCreation%').join(((new Date().getTime() - guildCreationDate.getTime()) / 86400000).toFixed(0))
            .split('%guildCreationTimestamp%').join(`${guildCreationDate.getHours()}:${guildCreationDate.getMinutes()} ${guildCreationDate.getDate()}.${guildCreationDate.getMonth() + 1}.${guildCreationDate.getFullYear()}`)
            .split('%guildBoosts%').join(channel.guild.premiumSubscriptionCount)
            .split('%boostLevel%').join(channel.guild.premiumTier)
            .split('%guildRegion%').join(channel.guild.region)
            .split('%channelCount%').join(channel.guild.channels.cache.size)
            .split('%roleCount%').join(guildRoles.cache.size)
            .split('%emojiCount%').join(channel.guild.emojis.cache.size)
            .split('%newline%').join('\n')
            .split('%boosterCount%').join(guildMembers.filter(m => m.premiumSinceTimestamp).size);
        return content;
    }

    fieldConfig.forEach(field => {
        embed.addField(field.name, replacer(field.content), !!field.inline);
    });

    if (messages.last()) await messages.last().edit(embed);
    else await channel.send(embed);
}