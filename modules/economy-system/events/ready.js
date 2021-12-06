/**
 * Wait until the bot is ready
 * @param {Client} client Client
 * @returns {Promise}
 * @private
 */
async function checkReady(client) {
    return new Promise(async (resolve) => {

        /**
         * Check if the bot is ready
         * @returns {Promise<void>}
         * @private
         */
        function check() {
            if (client.botReadyAt) return resolve();
            else {
                setTimeout(check, 1000);
            }
        }
        setTimeout(check, 10000);
    });
}

module.exports.run = async function(client) {
    await checkReady(client).then(() => {
        client.logger.debug('[economy-system] Exited from loop');
    });
    const models = await client.models['economy-system']['cooldown'].findAll();
    if (models.length !== 0) {
        models.forEach(async (element) => {
            await element.destroy();
        });
    }
    client.logger.debug('[economy-system] Reseted all cooldowns');
    if (client.logChannel) client.logChannel.send('[economy-system] Reseted all cooldowns');
};