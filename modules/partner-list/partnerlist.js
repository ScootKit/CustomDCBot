const {client, confDir} = require('../../main');
const {MessageEmbed} = require('discord.js');

async function generatePartnerList() {
    const moduleConf = require(`${confDir}/partner-list/config.json`);
    const channel = await client.channels.fetch(moduleConf['channelID']).catch(e => {
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
    moduleConf['sortCategories'].forEach(category => {
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
    if (messages.last()) await messages.last().edit(embed);
    else channel.send(embed);
}

module.exports.generatePartnerList = generatePartnerList;