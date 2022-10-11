/**
 * @module twitch-notifications
 */
const {embedType} = require('../../../src/functions/helpers');

const {ApiClient} = require('@twurple/api');
const {ClientCredentialsAuthProvider} = require('@twurple/auth');
const {localize} = require('../../../src/functions/localize');

/**
 * General program
 * @param {Client} client Discord js Client
 * @param {ApiClient} apiClient Twitch API Client
 * @private
 */
function twitchNotifications(client, apiClient) {
    const streamers = client.configurations['twitch-notifications']['streamers'];

    /**
     * Function to add the Live-Role
     * @param {string} userID ID of the User
     * @param {String} roleID ID of the Role
     * @param {boolean} liveRole Should the live-role be active
     */
    async function addLiveRole(userID, roleID, liveRole) {
        if (!liveRole) return;
        if (!userID || userID === '' || !roleID || roleID === '') return;
        await client.guild.members.fetch();
        const member = client.guild.members.cache.get(userID);
        if (!member) {
            client.logger.error(localize('twitch-notifications', 'user-not-found', {u: userID}));
            return;
        }
        await member.roles.add(roleID);
    }

    /**
     * Sends the live-message
     * @param {string} username Username of the streamer
     * @param {string} game Game that is streamed
     * @param {string} thumbnailUrl URL of the thumbnail of the stream
     * @param {number} channelID ID of the live-message-channel
     * @param {number} i Index of the config-element-object
     * @returns {*}
     * @private
     */
    function sendMsg(username, game, thumbnailUrl, channelID, title, i) {
        const channel = client.channels.cache.get(channelID);
        if (!channel) return client.logger.fatal(`[twitch-notifications] ` + localize('twitch-notifications', 'channel-not-found', {c: channelID}));
        if (!streamers[i]['liveMessage']) return client.logger.fatal(`[twitch-notifications] ` + localize('twitch-notifications', 'message-not-found', {s: username}));
        channel.send(embedType(streamers[i]['liveMessage'], {
            '%streamer%': username,
            '%game%': game,
            '%url%': `https://twitch.tv/${username.toLowerCase()}`,
            '%thumbnailUrl%': (thumbnailUrl + `?_t=${new Date().getTime()}` || '').replaceAll('{width}', '1920').replaceAll('{height}', '1080'),
            '%title%': title
        }));
    }

    /**
     * Checks if the streamer is live
     * @param {string} userName Name of the Streamer
     * @returns {HelixStream}
     * @private
     */
    async function isStreamLive(userName) {
        const user = await apiClient.users.getUserByName(userName.toLowerCase());
        if (!user) return 'userNotFound';
        return await user.getStream();
    }

    streamers.forEach(start);

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
                name: value.streamer.toLowerCase()
            }
        });
        const stream = await isStreamLive(value.streamer);
        if (stream === 'userNotFound') {
            return client.logger.error(`[twitch-notifications] ` + localize('twitch-notifications', 'user-not-on-twitch', {u: value}));
        } else if (stream !== null && !streamer) {
            client.models['twitch-notifications']['streamer'].create({
                name: value.streamer.toLowerCase(),
                startedAt: stream.startDate.toString()
            });
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, streamers[index]['liveMessageChannel'], stream.title, index);
            addLiveRole(streamers[index]['id'], streamers[index]['role']);
        } else if (stream !== null && stream.startDate.toString() !== streamer.startedAt) {
            streamer.startedAt = stream.startDate.toString();
            streamer.save();
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, streamers[index]['liveMessageChannel'], stream.title, index);
            addLiveRole(streamers[index]['id'], streamers[index]['role']);
        } else if (stream === null) {
            if (!streamers[index]['liveRole']) return;
            if (!streamers[index]['id'] || streamers[index]['id'] === '' || !streamers[index]['role'] || streamers[index]['role'] === '') return;
            await client.guild.members.fetch();
            const member = client.guild.members.cache.get(streamers[index]['id']);
            if (!member) {
                client.logger.error(localize('twitch-notifications', 'user-not-found', {u: streamers[index]['id']}));
                return;
            }
            if (member.roles.cache.has(streamers[index]['role'])) {
                await member.roles.remove(streamers[index]['role']);
            }
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
    const interval = config['interval'] * 1000;
    const twitchCheckInterval = setInterval(() => {
        twitchNotifications(client, apiClient);
    }, interval);

    client.intervals.push(twitchCheckInterval);
};