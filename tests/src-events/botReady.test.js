/*
 * Tests for src/events/botReady.js.
 *
 * botReady sets the bot's activity/presence (or clears it when disableStatus is
 * set).
 */

const handler = require('../../src/events/botReady');

/**
 * Builds a client stub with a spyable user + logger.
 * @param {Object} [config]
 * @returns {Object}
 */
function makeClient(config = {}) {
    return {
        config: {user_presence: {activities: [{name: 'hi'}]}, ...config},
        user: {setActivity: jest.fn().mockResolvedValue()},
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
        }
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('botReady presence', () => {
    test('sets the configured presence when status is not disabled', async () => {
        const client = makeClient({disableStatus: false});
        await handler.run(client);
        expect(client.user.setActivity).toHaveBeenCalledWith(client.config.user_presence);
    });

    test('clears the activity (null) when disableStatus is true', async () => {
        const client = makeClient({disableStatus: true});
        await handler.run(client);
        expect(client.user.setActivity).toHaveBeenCalledWith(null);
    });
});
