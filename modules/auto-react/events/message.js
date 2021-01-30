exports.run = async (client, msg) => {
    const moduleConfig = require(`${client.configDir}/auto-react/config.json`);
    if (!moduleConfig.channels[msg.channel.id]) return;
    moduleConfig.channels[msg.channel.id].split('|').forEach(emoji => {
        msg.react(emoji);
    });
};