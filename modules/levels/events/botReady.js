const {updateLeaderBoard} = require('../leaderboardChannel');

module.exports.run = async function (client) {
    if (!client.configurations['levels']['config']['leaderboard-channel']) return;
    await updateLeaderBoard(client, true);
    const interval = setInterval(() => {
        updateLeaderBoard(client);
    }, 300042);
    client.intervals.push(interval);
};