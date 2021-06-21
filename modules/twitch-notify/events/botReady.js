const {confDir} = require('../../../main');
const request = require('request');
live = false;

async function getToken(ClientID, ClientSecret) {
  var options = {
    url: 'https://id.twitch.tv/oauth2/token?client_id=' +ClientID+'&client_secret=' +ClientSecret+ '&grant_type=client_credentials',
    method: 'POST'
};
      
  request(options, function (error, response, body) {
    var body2 = JSON.parse(body)
    return body2['access_token']
});

async function checkLive (streamer, clientID, token) {
  var options = {
    url: 'https://api.twitch.tv/helix/streams?user_login='+streamer.toLowerCase(),
    method: 'GET',
    headers: {
      'Client-ID': clientID,
      'Authorization': 'Bearer ' + token
  } 
};

  request(options,(error, response, body) => {
    return body
  });
};
async function replacer(msg, username, game) {
  msg = msg.split('%streamer%').join(username)
			.split('%game%').join(game)
			.split('%url%').join('https://twitch.tv/' + username.toLowerCase());
}

async function sendMSG(client) {
  const moduleConf = require(`${confDir}/twitch-notify/config.json`);
  var token = await getToken(moduleConf['Twitch-ClientID'], moduleConf['ClientSecret']);
  var body = await checkLive(moduleConf['streamer'], moduleConf['Twitch-ClientID'], token);
  var bodyJSON = JSON.parse(body)
  var msg = await replacer(moduleConf['live-message'], bodyJSON['data'][0]['user_name'], bodyJSON['data'][0]['game_name']);
  if ((bodyJSON['data'][0][type] === "live")) {
    if (live) {
      //pass
    } else {
      live = true
      //send the Message
      const channel = await client.channels.fetch(moduleConf['live-message-channel']).catch(e => {
      });
      if (!channel) return console.error(`[twitch-notifications] Could not find channel with id ${moduleConfig['live-message-channel']}`);
      channel.send(msg);
    };
  } else {
    if (live) {
      live = false;
    } else {
      //pass
    };
  };
};

exports.run = async (client) => {
  await sendMSG(client);
  setInterval(() => {
    sendMSG(client);
  }, 60000);
}};
