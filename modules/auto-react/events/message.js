exports.run = async (client, msg) => {
    checkChannel(msg);
    checkMembers(msg);
};

function checkMembers(msg) {
    const moduleConfig = require(`${msg.client.configDir}/auto-react/config.json`);
    msg.mentions.members.forEach(m => {
        if (!moduleConfig.members[m.id]) return;
        moduleConfig.members[m.id].split('|').forEach(emoji => {
            msg.react(emoji);
        });
    });
}

function checkChannel(msg) {
    const moduleConfig = require(`${msg.client.configDir}/auto-react/config.json`);
    if (!moduleConfig.channels[msg.channel.id]) return;
    moduleConfig.channels[msg.channel.id].split('|').forEach(emoji => {
        msg.react(emoji);
    });
}