const {embedType} = require('../../../src/functions/helpers');
const {generatePartnerList} = require('../partnerlist');
const {confDir} = require('../../../main');

module.exports.run = async function (client, msg) {
    const moduleConfig = require(`${confDir}/partner-list/config.json`);
    let allowed = false;
    for (const roleID of moduleConfig['adminRoles']) {
        if (msg.member.roles.cache.get(roleID)) allowed = true;
    }
    if (!allowed) return msg.channel.send(...embedType(client.strings['not_enough_permissions']));

    const collector = await msg.channel.createMessageCollector(m => m.author.id === msg.author.id, {time: 60000 * 2});
    await msg.channel.send('Adding a partner. Please enter the name of the new partner.\n*You have two minutes to complete the whole dialogue. Please keep this in mind. To cancel write "cancel" at any time*');

    let step = 0;
    let data = {};
    collector.on('collect', async m => {
        if (m.content === 'cancel') {
            step = 3;
            msg.channel.send('Cancelled');
            return collector.stop();
        }
        switch (step) {
            case 0:
                data['name'] = m.content;
                step = 1;
                await msg.channel.send(`Great! Please enter the category of the partner now.`);
                break;
            case 1:
                data['category'] = m.content;
                step = 2;
                await msg.channel.send(`Nice! Please enter the user-id of the partner now.`);
                break;
            case 2:
                data['userID'] = m.content;
                step = 3;
                await msg.channel.send(`Okay - Please send an invite-link in this channel to continue.`);
                break;
            case 3:
                await client.models['partner-list']['Partner'].create({
                    invLink: m.content,
                    teamUserID: msg.author.id,
                    userID: data['userID'],
                    name: data['name'],
                    category: data['category']
                });
                await generatePartnerList();
                await msg.channel.send('Great work! I have added the partner to the partner-list!');
                collector.stop();
                return;
        }
    });

    collector.on('end', async () => {
        if (step !== 3) await msg.channel.send(`<@${msg.author.id}>: Partner-Setup stopped. It probably took to long or something like that.`);
    });
};

module.exports.help = {
    'name': 'add-partner',
    'description': 'Adds a new partner to the partnerlist',
    'module': 'partner-list',
    'aliases': ['padd', 'add-partner']
};

module.exports.config = {
    'restricted': false
};