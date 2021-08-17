const {generatePartnerList} = require('../partnerlist');

module.exports.run = async function () {
    await generatePartnerList();
};