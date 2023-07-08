const {createSuggestion} = require('../suggestion');

module.exports.run = async function (client, msg) {
    if (msg.author.bot || !msg.guild || msg.guild.id !== client.config.guildID) return;
    if (client.configurations['suggestions']['config'].suggestionChannel !== msg.channel.id) return;
    await msg.delete();
    await createSuggestion(msg.guild, msg.cleanContent, msg.author);
};