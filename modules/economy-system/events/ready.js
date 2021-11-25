module.exports.run = async function(client) {
    client.models['economy-system']['cooldown'].findAll().destry();
    client.logger.debug('[economy-system] Reseted all cooldowns');
    if (client.logChannel) client.logChannel.send('[economy-system] Reseted all cooldowns');
};