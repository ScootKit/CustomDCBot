const isEqual = require('is-equal');
const {disableModule} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const schedule = require('node-schedule');


module.exports.run = async function (client) {
    await updateEmbedIfNeeded(client);
    const job = schedule.scheduleJob('1,16,31,46 * * * *', async () => {
        await updateEmbedIfNeeded(client);
    });
    client.jobs.push(job);
};

let lastSavedEmbed = null;

/**
 * Updates the embed if needed
 * @param client
 * @returns {Promise<void>}
 */
async function updateEmbedIfNeeded(client) {
    const moduleConf = client.configurations['team-list']['config'];
    const embed = new MessageEmbed()
        .setColor(moduleConf.embed.color)
        .setTitle(moduleConf.embed.title)
        .setDescription(moduleConf.embed.description)
        .setTimestamp()
        .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl});

    if (moduleConf.embed['thumbnail-url']) embed.setThumbnail(moduleConf.embed['thumbnail-url']);
    if (moduleConf.embed['icon-url']) embed.setThumbnail(moduleConf.embed['icon-url']);

    const channel = await client.channels.fetch(moduleConf['channelID']).catch(() => {
    });
    if (!channel) return disableModule('team-list', localize('team-list', 'channel-not-found', {c: moduleConf['channelID']}));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    const guildMembers = await channel.guild.members.fetch();

    for (const rID of moduleConf.roles) {
        const role = await channel.guild.roles.fetch(rID);
        if (!role) return disableModule('team-list', localize('team-list', 'role-not-found', {r: rID}));

        let userString = '';
        for (const member of guildMembers.filter(m => m.roles.cache.has(rID)).values()) {
            userString = userString + `${member.user.toString()}, `;
        }
        if (userString === '') userString = localize('team-list', 'no-users-with-role', {r: role.toString()});
        else userString = userString.substring(0, userString.length - 2);

        embed.addField(moduleConf['nameOverwrites'][rID] || role.name, (moduleConf['descriptions'][rID] ? `${moduleConf['descriptions'][rID]}\n` : '') + userString);
    }

    if (embed.fields.length === 0) embed.addField('⚠', localize('team-list', 'no-roles-selected'));

    if (isEqual(lastSavedEmbed, embed.toJSON())) return;
    lastSavedEmbed = embed.toJSON();

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
}