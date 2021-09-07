const {embedType} = require('../../../src/functions/helpers');

const {ApiClient} = require('twitch');
const {ClientCredentialsAuthProvider} = require('twitch-auth');
/**
 * General program
 * @param {object} client Discord js Client
 * @param {object} apiClient Twitch API Client
 */
function twitchNotifications(client, apiClient) {
    const config = require(`${confDir}/twitch-notifications/config.json`);
    /**
     * Sends the live-message
     * @param {string} username Username of the streamer 
     * @param {string} game Game that is streamed
     * @param {string} thumbnailUrl URL of the thumbnail of the stream
     * @param {number} channelID ID of the live-message-channel
     * @returns {Promise<void>}
     */
    function sendMsg(username, game, thumbnailUrl, channelID) {
        const channel = client.channels.cache.get(channelID);
        if (!channel) return console.error(`[twitch-notifications] Could not find channel with id ${channelID}`);
        channel.send(...embedType(config['liveMessage'], {
            '%streamer%': username,
            '%game%': game,
            '%url%': `https://twitch.tv/${username.toLowerCase()}`,
            '%thumbnailUrl': thumbnailUrl
        }));
    }
    /**
     * Checks if the streamer is live
     * @param {string} userName Name of the Streamer
     * @returns {object}
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
     */
    async function start(value, index) {
        const streamer = await client.models['twitch-notifications']['streamer'].findOne({
            where: {
                name: value.toLowerCase()
            }
        });
        const stream = await isStreamLive(value);
        if (stream === 'userNotFound') {
            return console.error(`Cannot find user ${value}`);
        } else if (stream !== null && !streamer) {
            client.models['twitch-notifications']['streamer'].create({
                name: value.toLowerCase(),
                startedAt: stream.startDate.toString()
            });
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index]);
        } else if (stream !== null && stream.startDate.toString() !== streamer.startedAt) {
            streamer.startedAt = stream.startDate.toString();
            streamer.save();
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index]);
        }
    }
}

exports.run = async (client) => {
    const config = client.configurations['twitch-notifications']['config'];

    const ClientID = config['twitchClientID'];
    const ClientSecret = config['clientSecret'];
    const authProvider = new ClientCredentialsAuthProvider(ClientID, ClientSecret);
    const apiClient = new ApiClient({authProvider});

    await twitchNotifications(client, apiClient);
    if (config['interval'] > 60) return console.error(`[twitch-notifications] The value of the interval must be equal or higher than 60`);
    const interval = config['interval'] * 1000;
    let twitchCheckInterval = setInterval(() => {
        twitchNotifications(client, apiClient);
    }, interval);

    client.on('configReload', () => {
        clearInterval(twitchCheckInterval)
    })
};
