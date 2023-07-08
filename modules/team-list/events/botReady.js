const isEqual = require('is-equal');
const {disableModule, truncate} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const schedule = require('node-schedule');

const statusIcons = {
    'online': '🟢',
    'dnd': '🔴',
    'idle': '🟡',
    'offline': '⚫'
};

module.exports.run = async function (client) {
    await updateEmbedsIfNeeded(client);
    const job = schedule.scheduleJob('1,16,31,46 * * * *', async () => {
        await updateEmbedsIfNeeded(client);
    });
    client.jobs.push(job);
};

let lastSavedEmbed = null;

/**
 * Updates the embed if needed
 * @param client
 * @returns {Promise<void>}
 */
async function updateEmbedsIfNeeded(client) {
    const channels = client.configurations['team-list']['config'];
    for (const channelConfig of channels) {
        const embed = new MessageEmbed()
            .setColor(channelConfig.embed.color)
            .setTitle(channelConfig.embed.title)
            .setDescription(channelConfig.embed.description)
            .setTimestamp()
            .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl});

        if (channelConfig.embed['thumbnail-url']) embed.setThumbnail(channelConfig.embed['thumbnail-url']);
        if (channelConfig.embed['img-url']) embed.setImage(channelConfig.embed['img-url']);

        const channel = await client.channels.fetch(channelConfig['channelID']).catch(() => {
        });
        if (!channel) return disableModule('team-list', localize('team-list', 'channel-not-found', {c: channelConfig['channelID']}));
        const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
        const guildMembers = await channel.guild.members.fetch();

        const roles = (await channel.guild.roles.fetch()).filter(f => channelConfig.roles.includes(f.id)).sort((a, b) => a.position < b.position ? 1 : -1);
        for (const role of roles.values()) {
            let userString = '';
            for (const member of guildMembers.filter(m => m.roles.cache.has(role.id)).values()) {
                userString = userString + (channelConfig.includeStatus ? `* ${member.user.toString()}: ${statusIcons[(member.presence || {status: 'offline'}).status]} ${localize('team-list', (member.presence || {status: 'offline'}).status)}\n` : `${member.user.toString()}, `);
            }
            if (userString === '') userString = localize('team-list', 'no-users-with-role', {r: role.toString()});
            else if (!channelConfig.includeStatus) userString = userString.substring(0, userString.length - 2);

            embed.addField(channelConfig['nameOverwrites'][role.id] || role.name, truncate((channelConfig['descriptions'][role.id] ? `${channelConfig['descriptions'][role.id]}\n` : '') + userString, 1024));
        }

        if (embed.fields.length === 0) embed.addField('⚠', localize('team-list', 'no-roles-selected'));

        if (isEqual(lastSavedEmbed, embed.toJSON())) return;
        lastSavedEmbed = embed.toJSON();

        if (messages.last()) await messages.last().edit({embeds: [embed]});
        else channel.send({embeds: [embed]});
    }
}