const durationParser = require('parse-duration');
const {confDir} = require('../../../main');
const {createGiveaway} = require('../giveaways');
const {embedType} = require('./../../../src/functions/helpers');

module.exports.run = async function (client, msg) {
    const moduleConfig = require(`${confDir}/giveaways/config.json`);
    let allowed = false;
    for (const roleID of moduleConfig['allowed_roles']) {
        if (msg.member.roles.cache.get(roleID)) allowed = true;
    }
    if (!allowed) return msg.channel.send(...embedType(client.strings['not_enough_permissions']));

    const collector = await msg.channel.createMessageCollector(m => m.author.id === msg.author.id, {time: 60000});
    await msg.channel.send('Starting giveaway. Please mention a channel where the giveaway should take place. *You have one minute to complete the whole dialogue. Please keep this in mind.*');

    let step = 0;
    const data = {};
    collector.on('collect', async m => {
        if (m.content === 'cancel') {
            step = 3;
            msg.channel.send('Cancelled');
            return collector.stop();
        }
        switch (step) {
            case 0:
                if (m.mentions.channels.array().length === 0) return msg.channel.send('Please mention a channel. If you want to use a channel-ID type `<@ChannelIDHere>`.');
                data['channel'] = m.mentions.channels.first();
                step = 1;
                await msg.channel.send(`Great! The giveaway will take place in <#${m.mentions.channels.first().id}>. How many winners should the bot select?`);
                break;
            case 1:
                if (!parseInt(m.content)) return msg.channel.send('This is not a number. Try again.');
                data['winners'] = parseInt(m.content);
                step = 2;
                await msg.channel.send(`Nice! The giveaway will take place in <#${data['channel'].id}> and the bot will select ${m.content} winners. How long should the giveaway last? (example: \`2d 4h 2m\`)`);
                break;
            case 2:
                const duration = durationParser(m.content);
                const endAt = new Date(new Date().getTime() + duration);
                data['endAt'] = endAt.getTime();
                step = 3;
                await msg.channel.send(`Okay, the giveaway will end at ${endAt.getHours()}:${endAt.getMinutes()} on ${endAt.getDate()}.${endAt.getMonth() + 1}.${endAt.getFullYear()}. And finally: What should be given away?`);
                break;
            case 3:
                await createGiveaway(msg.author, data['channel'], m.content, data['endAt'], data['winners']);
                await msg.channel.send(`Done! I have created a giveaway in <#${data['channel'].id}> with ${m.content} winners and "${m.content}" as prize.`);
                collector.stop();
                return;
        }
    });

    collector.on('end', async () => {
        if (step !== 3) await msg.channel.send(`<@${msg.author.id}>: Giveaway-Setup stopped. It probably took to long or something like that.`);
    });
};

module.exports.help = {
    'name': 'gstart',
    'description': 'Starts a giveaway',
    'module': 'giveaway',
    'aliases': ['gstart', 'start-giveaway']
};

module.exports.config = {
    'restricted': false
};