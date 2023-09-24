const {embedType} = require('../../../src/functions/helpers');

module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (msg.partial) return;

    const {messageWithMentions} = require(`${__dirname}/messageCreate.js`);
    if (!messageWithMentions[msg.id]) return;
    const moduleStrings = client.configurations['anti-ghostping']['config'];
    if (messageWithMentions[msg.id].author.bot) return;
    if (messageWithMentions[msg.id].guild.id !== client.config.guildID) return;
    if (!moduleStrings.awaitBotMessages) return executeGhostPingMessage();
    setTimeout(async () => {
        const messages = await msg.channel.messages.fetch({after: msg.id});
        if (messages.filter(m => m.author.bot).size !== 0) return;
        await executeGhostPingMessage();
    }, 2000);

    /**
     * Executes the ghostping message
     * @private
     * @return {Promise<void>}
     */
    async function executeGhostPingMessage() {
        let mentionString = '';
        messageWithMentions[msg.id].mentions.members.forEach(m => {
            mentionString = `<@${m.id}>, `;
        });
        mentionString = mentionString.substring(0, mentionString.length - 2);
        await msg.channel.send(embedType(moduleStrings.youJustGotGhostPinged, {
            '%mentions%': mentionString,
            '%msgContent%': messageWithMentions[msg.id].content,
            '%authorMention%': messageWithMentions[msg.id].author
        }));
    }
};
