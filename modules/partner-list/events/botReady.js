const {generatePartnerList} = require('../partnerlist');

module.exports.run = async function (client) {
    await generatePartnerList(client);
};