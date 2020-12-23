exports.run = async (client) => {
    await client.user.setActivity(client.config.user_presence);
};