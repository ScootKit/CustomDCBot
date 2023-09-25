const handleStarboard = require('../handleStarboard.js');

module.exports.run = async (client, msgReaction, user) => {
    handleStarboard(client, msgReaction, user, false);
};
module.exports.allowPartial = true;
