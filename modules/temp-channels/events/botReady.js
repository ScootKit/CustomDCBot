const {migrate} = require('../../../src/functions/helpers');
module.exports.run = async function () {
    await migrate('temp-channels', 'TempChannelV1', 'TempChannel');
};