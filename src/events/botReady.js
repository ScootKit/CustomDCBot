const {trackStart} = require('../functions/science');

module.exports.run = async (client) => {
    if (client.config.disableStatus) client.user.setActivity(null);
    else await client.user.setActivity(client.config.user_presence);
    await trackStart(client);
};