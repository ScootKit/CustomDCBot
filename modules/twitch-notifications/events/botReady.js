/**
 * @module twitch-notifications
 */
const {embedType} = require('../../../src/functions/helpers');

const {ApiClient} = require('@twurple/api');
const {AppTokenAuthProvider} = require('@twurple/auth');
const {localize} = require('../../../src/functions/localize');

const INTERVAL_SECONDS = 180;

/**
 * Classifies a streamer poll result into the action the poller should take.
 * Extracted (behavior-preserving) from the `start` branch ladder so the
 * decision logic can be unit-tested without the Twitch API / Discord client.
 *
 * @param {('userNotFound'|null|Object)} stream sentinel string, null (offline) or a HelixStream-like object with `startDate`
 * @param {?{startedAt: string}} streamer persisted streamer row (null if unknown)
 * @returns {'userNotFound'|'newLive'|'reLive'|'offline'|'noChange'}
 */
function classifyStreamUpdate(stream, streamer) {
    if (stream === 'userNotFound') return 'userNotFound';
    if (stream !== null && !streamer) return 'newLive';
    if (stream !== null && stream.startDate.toString() !== streamer.startedAt) return 'reLive';
    if (stream === null) return 'offline';
    return 'noChange';
}

module.exports.__test = {classifyStreamUpdate};

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
        const member = client.guild.members.cache.get(userID);
        if (!member) {
            client.logger.error(localize('twitch-notifications', 'user-not-on-twitch', {u: userID}));
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
        const action = classifyStreamUpdate(stream, streamer);
        if (action === 'userNotFound') {
            return client.logger.error(`[twitch-notifications] ` + localize('twitch-notifications', 'user-not-on-twitch', {u: value}));
        } else if (action === 'newLive') {
            client.models['twitch-notifications']['streamer'].create({
                name: value.streamer.toLowerCase(),
                startedAt: stream.startDate.toString()
            });
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, streamers[index]['liveMessageChannel'], stream.title, index);
            addLiveRole(streamers[index]['id'], streamers[index]['role'], streamers[index]['liveRole']);
        } else if (action === 'reLive') {
            streamer.startedAt = stream.startDate.toString();
            streamer.save();
            sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, streamers[index]['liveMessageChannel'], stream.title, index);
            addLiveRole(streamers[index]['id'], streamers[index]['role'], streamers[index]['liveRole']);
        } else if (action === 'offline') {
            if (!streamers[index]['liveRole']) return;
            if (!streamers[index]['id'] || streamers[index]['id'] === '' || !streamers[index]['role'] || streamers[index]['role'] === '') return;
            const member = client.guild.members.cache.get(streamers[index]['id']);
            if (!member) {
                client.logger.error(localize('twitch-notifications', 'user-not-on-twitch', {u: streamers[index]['id']}));
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
    if (!config || !config['twitchClientID'] || !config['clientSecret']) {
        client.logger.error('[twitch-notifications] Missing twitchClientID or clientSecret in configs/config.json — module disabled. Create a Twitch app at https://dev.twitch.tv/console/apps to obtain credentials.');
        return;
    }

    const authProvider = new AppTokenAuthProvider(config['twitchClientID'], config['clientSecret']);
    const apiClient = new ApiClient({authProvider});

    await twitchNotifications(client, apiClient);
    const intervalSeconds = config['interval'] || INTERVAL_SECONDS;
    const twitchCheckInterval = setInterval(() => {
        twitchNotifications(client, apiClient);
    }, intervalSeconds * 1000);
    client.intervals.push(twitchCheckInterval);
};