/*
 * Test stub for the bot entrypoint. Mirrors enough of the shape that
 * src/functions/helpers.js needs to load and execute without a live Discord
 * client. Tests that need richer behavior can mutate `module.exports.client`
 * directly in their setup.
 */
module.exports = {
    client: {
        config: {
            disableEveryoneProtection: false,
            timezone: 'UTC'
        },
        strings: {
            footer: 'test-footer',
            footerImgUrl: '',
            disableFooterTimestamp: false
        },
        scnxSetup: false,
        user: null,
        guild: null
    }
};