module.exports.run = async (client, msg) => {
    if (!msg.guild) return;
    if (!client.botReadyAt) return;
    if (msg.guild.id !== client.guildID) return;
    if (msg.content.startsWith(client.config.prefix)) return;
    if (msg.channel.type === 'GUILD_NEWS') {
        const config = client.configurations['auto-publisher']['config'];
        if (config.ignoreBots && msg.author.bot) return;
        if (!config.blacklist) config.blacklist = [];
        if (!config.whitelist) config.blacklist = [];
        if (!config.mode) config.mode = 'all';
        if (config.mode === 'blacklist' && config.blacklist.includes(msg.channel.id)) return;
        if (config.mode === 'whitelist' && !config.whitelist.includes(msg.channel.id)) return;
        if (msg.crosspostable) await msg.crosspost();
        await msg.react('✅').then((r) => {
            setTimeout(() => {
                r.remove();
            }, 2500);
        });
    }
};