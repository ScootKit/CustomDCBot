const {confDir} = require('../../../main');
const config = require(`${confDir}/twitch-notify/config.json`);

const { TwitchApiClient } = require('twitch');
const { TwitchClientCredentialsAuthProvider } = require('twitch-auth');

const authProvider = new TwitchClientCredentialsAuthProvider(config['Twitch-ClientID'], config['ClientSecret']);
const ttvApiClient = new TwitchApiClient({ authProvider });

let live = false;

function twitch_notify(client) {
  function replacer(msg, username, game) {
    msg = msg.split('%streamer%').join(username)
        .split('%game%').join(game)
        .split('%url%').join('https://twitch.tv/' + username.toLowerCase());
    return msg
  };

  function sendMSG(username, game) {
    const channel = await client.channels.fetch(config['live-message-channel']).catch(e => {
    });
    if (!channel) return console.error(`[twitch-notify] Could not find channel with id ${config['live-message-channel']}`);
    msg = replacer(config['live-message'], username, game);
    channel.send(msg);
  }

  async function isStreamLive(userName) {
    const user = await ttvApiClient.helix.users.getUserByName(userName.toLowerCase());
    if (!user) {
      return false;
    }
    return await user.getStream();
  };

  isStreamLive(config['streamer']).then(function (stream) {
    if(stream !== null && !live) {
      live = true;
      sendMSG(stream.userDisplayName, stream.gameName)
    }
  }, function (err) {
    console.error(err)
  })
};

exports.run = async (client) => {
  await twitch_notify(client);
  setInterval(() => {
    twitch_notify(client);
  }, 60000);
};
