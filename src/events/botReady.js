module.exports.run = async (client) => {
    await client.guild.members.fetch({withPresences: true}).catch(() => {
    });
    if (client.config.disableStatus) client.user.setActivity(null);
    else await client.user.setActivity(client.config.user_presence);
};