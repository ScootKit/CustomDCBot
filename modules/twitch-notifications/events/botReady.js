const {embedType} = require('../../../src/functions/helpers');

const {ApiClient} = require('twitch');
const {ClientCredentialsAuthProvider} = require('twitch-auth');

/**
 * General program
 * @param {object} client Discord js Client
 * @param {object} apiClient Twitch API Client
 * @private
 */
function twitchNotifications(client, apiClient) {
    const config = client.configurations['twitch-notifications']['config'];

    /**
     * Sends the live-message
     * @param {string} username Username of the streamer
     * @param {string} game Game that is streamed
     * @param {string} thumbnailUrl URL of the thumbnail of the stream
     * @param {number} channelID ID of the live-message-channel
     * @returns {Promise<void>}
     * @private
     */
    function sendMsg(username, game, thumbnailUrl, channelID) {
        const channel = client.channels.cache.get(channelID);
        if (!channel) return client.logger.fatal(`[twitch-notifications] Could not find channel with id ${channelID}`);
        channel.send(embedType(config['liveMessage'], {
            '%streamer%': username,
            '%game%': game,
            '%url%': `https://twitch.tv/${username.toLowerCase()}`,
            '%thumbnailUrl': thumbnailUrl
        }));
        client.logger.debug(`[twitch-notifications] sended the live-message for ${username} successfully in ${channel.name}`);
    }

    /**
     * Checks if the streamer is live
     * @param {string} userName Name of the Streamer
     * @returns {object}
     * @private
     */
    async function isStreamLive(userName) {
        const user = await apiClient.helix.users.getUserByName(userName.toLowerCase());
        if (!user) return 'userNotFound';
        return await user.getStream();
    }

    config['streamers'].forEach(start);

    /**
     * Starts checking if the streamer is live
     * @param {string} value Current Streamer
     * @param {number} index Index of current Streamer
     * @returns {Promise<void>}
     * @private
     */
    async function start(value, index) {
        const streamer = await client.models['twitch-notifications']['streamer'].findOne({
            where: {
                name: value.toLowerCase()
            }
        });
        const stream = await isStreamLive(value);
        if (stream === 'userNotFound') {
            return client.logger.error(`Cannot find user ${value} on Twitch`);
        } else if (stream !== null && !streamer) {
            client.models['twitch-notifications']['streamer'].create({
                name: value.toLowerCase(),
                startedAt: stream.startDate.toString()
            });
            client.logger.debug(`[twitch-notifications] Created database-model for streamer ${stream.userDisplayName} with starting-date ${stream.startDate.toString()}`);
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index]);
        } else if (stream !== null && stream.startDate.toString() !== streamer.startedAt) {
            const oldStartingDate = streamer.startedAt;
            streamer.startedAt = stream.startDate.toString();
            streamer.save();
            client.logger.debug(`[twitch-notifications] Updated starting-date from ${oldStartingDate} to ${stream.startDate.toString()}`);
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index]);
        }
    }
}

module.exports.run = async (client) => {
    const config = client.configurations['twitch-notifications']['config'];

    const ClientID = config['twitchClientID'];
    const ClientSecret = config['clientSecret'];
    const authProvider = new ClientCredentialsAuthProvider(ClientID, ClientSecret);
    const apiClient = new ApiClient({authProvider});

    await twitchNotifications(client, apiClient);
    if (config['interval'] > 60) return client.logger.fatal(`[twitch-notifications] The value of the interval must be equal or higher than 60`);
    const interval = config['interval'] * 1000;
    const twitchCheckInterval = setInterval(() => {
        twitchNotifications(client, apiClient);
    }, interval);

    client.intervals.push(twitchCheckInterval);
};
