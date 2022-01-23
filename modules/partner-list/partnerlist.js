/**
 * Manages the Partner-List-Embed
 * @module Partner-List
 * @author Simon Csaba <mail@scderox.de>
 */
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../src/functions/localize');

/**
 * Generate the partner-list embed
 * @param {Client} client
 * @returns {Promise<void>}
 */
async function generatePartnerList(client) {
    const moduleConf = client.configurations['partner-list']['config'];
    const channel = await client.channels.fetch(moduleConf['channelID']).catch(() => {
    });
    if (!channel) return client.logger.error('[Partner-List] ' + localize('partner-list', 'channel-not-found', {c: moduleConf['channelID']}));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    const partners = await client.models['partner-list']['Partner'].findAll({});
    const sortedByCategory = {};
    partners.forEach(partner => {
        if (!sortedByCategory[partner.category]) sortedByCategory[partner.category] = [];
        sortedByCategory[partner.category].push(partner);
    });
    const embed = new MessageEmbed()
        .setTitle(moduleConf['embed']['title'])
        .setAuthor(client.user.username, client.user.avatarURL())
        .setColor(moduleConf['embed']['color'])
        .setDescription(moduleConf['embed']['description']);
    moduleConf['categories'].forEach(category => {
        if (sortedByCategory[category]) {
            let string = '';
            sortedByCategory[category].forEach(partner => {
                string = string + moduleConf['embed']['partner-string'].split('%invite%').join(partner.invLink).split('%name%').join(partner.name).split('%userID%').join(partner.userID).split('%id%').join(partner.id).split('%teamMemberID%').join(partner.teamUserID) + '\n';
            });
            embed.addField(category, string.length >= 1020 ? string.substr(0, 1020) + '...' : string);
            delete sortedByCategory[category];
        }
    });
    for (const category in sortedByCategory) {
        let string = '';
        sortedByCategory[category].forEach(partner => {
            string = string + moduleConf['embed']['partner-string'].split('%invite%').join(partner.invLink).split('%name%').join(partner.name).split('%userID%').join(partner.userID).split('%id%').join(partner.id).split('%teamMemberID%').join(partner.teamUserID) + '\n';
        });
        embed.addField(category, string.length >= 1020 ? string.substr(0, 1020) + '...' : string);
    }

    if (partners.length === 0) embed.addField('ℹ ' + localize('partner-list', 'information'), localize('partner-list', 'no-partners'));

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
}

module.exports.generatePartnerList = generatePartnerList;