exports.run = async (client, msg) => {
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (msg.content.includes(client.config.prefix)) return;
    if (msg.channel.type === 'news') {
        msg.channel.startTyping();
        await msg.crosspost();
        await msg.channel.stopTyping(true);
        await msg.react('✅').then((r) => {
            setTimeout(() => {
                r.remove();
            }, 2500);
        });
    }
};