/**
 * Checks when a member rejoins the server and updates their leaver status
 */

const { markUserAsRejoined } = require('../ping-protection');

module.exports.run = async function (client, member) {
    if (!client.botReadyAt) return;
    if (member.guild.id !== client.guildID) return;

    await markUserAsRejoined(client, member.id);
};