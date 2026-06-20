const handleStarboard = require('../handleStarboard.js');

module.exports.run = async (client, msgReaction, user) => {
    await handleStarboard(client, msgReaction, user, true);
};
module.exports.allowPartial = true;
