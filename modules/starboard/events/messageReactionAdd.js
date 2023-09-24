const handleStarboard = require('../handleStarboard.js');

module.exports.run = async (client, msgReaction) => {
    handleStarboard(client, msgReaction, false);
};
