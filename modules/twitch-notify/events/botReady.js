const {confDir} = require('../../../main');
const config = require(`${confDir}/twitch-notify/config.json`);
const {embedType} = require('../../../src/functions/helpers');

const {ApiClient} = require('twitch');
const {ClientCredentialsAuthProvider} = require('twitch-auth');

const ClientID = config['twitchClientID'];
const ClientSecret = config['clientSecret'];
const authProvider = new ClientCredentialsAuthProvider(ClientID, ClientSecret);
const apiClient = new ApiClient({authProvider});

function twitchNotify(client) {
  function sendMsg(username, game, thumbnailUrl, channelID) {
    const channel = client.channels.cache.get(channelID)
    if (!channel) return console.error(`[twitch-notify] Could not find channel with id ${channelID}`);
    channel.send(...embedType(config['liveMessage'], {
      '%streamer%': username,
      '%game%': game,
      '%url%': `https://twitch.tv/${username.toLowerCase()}`,
      '%thumbnailUrl': thumbnailUrl
    }));
  }

  async function isStreamLive(userName) {
    const user = await apiClient.helix.users.getUserByName(userName.toLowerCase());
    if (!user) return false;
    return await user.getStream();
  };
  
  config['streamers'].forEach(start)
  
  function start(value, index) {
    let streamer = await client.models['twitch-notify']['streamer'].findOne({
      where: {
          id: value.toLowerCase()
      }
  });
    const stream = await isStreamLive(value)

    if(stream !== null && stream.startDate !== streamer.startedAt) {
      streamer.startedAt = stream.startDate;
      streamer.save()
      sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index])
    } else if(stream !== null && !streamer) {
      client.models['twitch-notify']['streamer'].create({
        id: value,
        startedAt: stream.startDate
      });
      sendMsg(stream.userDisplayName, stream.gameName, stream.thumbnailUrl, config['liveMessageChannels'][index])
    }
  };
};

exports.run = async (client) => {
  await twitchNotify(client);
  if(config['interval'] > 60) return console.error(`[twitch-notify] The value of the interval must be equal or higher than 60`);
  interval = config['interval'] * 1000;
  setInterval(() => {
    twitchNotify(client);
  }, interval);
};