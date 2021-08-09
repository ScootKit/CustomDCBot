const {confDir} = require('../../../main');
const { TwitchApiClient } = require('twitch');
const { TwitchClientCredentialsAuthProvider } = require('twitch-auth');

const clientId = '84mlld0q4slrppp5a3z2s2eb82l4pf';
const clientSecret = 'jbzdrayiia45ewssgwcndw5gg1b9vo';
const authProvider = new TwitchClientCredentialsAuthProvider(clientId, clientSecret);
const ttvApiClient = new TwitchApiClient({ authProvider });

live = false;
async function twitch_notify(client) {
  function replacer(msg, username, game) {
    msg = msg.split('%streamer%').join(username)
        .split('%game%').join(game)
        .split('%url%').join('https://twitch.tv/' + username.toLowerCase());
    return msg
  };

  function isStreamLive(userName) {
    const user = ttvApiClient.helix.users.getUserByName(userName.toLowerCase());
    if (!user) {
      return false;
    }
    return user.getStream() !== null;
  };

  isStreamLive(confDir['streamer']).then(function (stream) {
    if(stream) {
      
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
