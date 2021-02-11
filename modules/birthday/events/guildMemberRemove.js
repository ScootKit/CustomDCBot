const {generateGiveawayEmbed} = require('../birthday');

module.exports.run = async function (client) {
    await generateGiveawayEmbed(client);
};