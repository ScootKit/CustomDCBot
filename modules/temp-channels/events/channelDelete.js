const {Op} = require('sequelize');
const {localize} = require('../../../src/functions/localize');

module.exports.run = async function (client, channel) {
    if (!client.botReadyAt) return;
    if (!channel.id) return;
    const dbChannel = await client.models['temp-channels']['TempChannel'].findOne({
        where: {
            [Op.or]: {
                id: channel.id,
                noMicChannel: channel.id
            }
        }
    });
    if (dbChannel) {
        const id = dbChannel.noMicChannel || dbChannel.id;
        const otherChannel = await client.channels.fetch(id).catch(() => {
        });
        if (otherChannel) await otherChannel.delete(`[temp-channels] ${localize('temp-channels', 'removed-audit-log-reason')}`).catch(e => console.error(e));
        await dbChannel.destroy();
    }
};