const {updateLeaderBoard} = require('../leaderboardChannel');

module.exports.run = async function (client, member) {
    if (!client.configurations['levels']['config']['reset-on-leave']) return;
    const user = await client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) return;
    await user.destroy();
    await updateLeaderBoard(client);
};