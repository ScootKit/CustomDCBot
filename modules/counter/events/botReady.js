const {localize} = require('../../../src/functions/localize');
module.exports.run = async function(client) {
    const moduleConfig = client.configurations['counter']['config'];
    for (const cID of moduleConfig['channels']) {
        const channel = await client.models['counter']['CountChannel'].findOne({
            where: {
                channelID: cID
            }
        });
        if (!channel) {
            await client.models['counter']['CountChannel'].create({
                channelID: cID,
                currentNumber: 0,
                userCounts: {}
            });
            client.logger.debug('[counter] ' + localize('counter', 'created-db-entry', {i: cID}));
        }
    }
};