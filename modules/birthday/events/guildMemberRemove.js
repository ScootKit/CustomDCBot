const {generateBirthdayEmbed} = require('../birthday');

module.exports.run = async function (client) {
    await generateBirthdayEmbed(client);
};