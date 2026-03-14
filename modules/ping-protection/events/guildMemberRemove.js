/**
 * Checks when a member leaves the server and handles data retention and/or deletion
 */

const { markUserAsLeft, deleteAllUserData } = require('../ping-protection');

module.exports.run = async function (client, member) {
    if (!client.botReadyAt) return;
    if (member.guild.id !== client.guildID) return;

    const storageConfig = client.configurations['ping-protection']['storage'];

    if (storageConfig && storageConfig.enableLeaverDataRetention) {
        await markUserAsLeft(client, member.id);
    } else {
        await deleteAllUserData(client, member.id);
    }
};