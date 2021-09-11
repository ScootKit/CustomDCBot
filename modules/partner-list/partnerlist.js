const {MessageEmbed} = require('discord.js');

/**
 * Generate the partner-list embed
 * @param {Client} client
 * @returns {Promise<void>}
 */
async function generatePartnerList(client) {
    const moduleConf = client.configurations['partner-list']['config'];
    const channel = await client.channels.fetch(moduleConf['channelID']).catch(() => {
    });
    if (!channel) return console.error(`[Partner-List] Could not find channel with ID ${moduleConf['channelID']}.`);
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

    if (partners.length === 0) embed.addField('ℹ Information', 'There are currently no partners. This is odd, but that\'s how it is ¯\\_(ツ)_/¯\n\nTo add a partner, run `/partner add` as a slash-command.');

    if (messages.last()) await messages.last().edit({embeds: [embed]});
    else channel.send({embeds: [embed]});
}

module.exports.generatePartnerList = generatePartnerList;