const {embedType} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

const cooldown = new Set();

exports.run = async (client, oldState, newState) => {
    if (!client.botReadyAt) return;
    if (!newState.channel) return;
    const channel = await client.channels.fetch(newState.channelId);
    if (channel.guild.id !== client.guild.id) return;

    const moduleConfig = client.configurations['ping-on-vc-join']['config'];
    const configElement = moduleConfig.find(e => e.channels.includes(channel.id));
    if (!configElement) return;
    const member = await client.guild.members.fetch(newState.id);

    if (cooldown.has(member.user.id)) return;

    const notifyChannel = newState.guild.channels.cache.get(configElement['notify_channel_id']);
    if (!notifyChannel) return client.logger.error(`[ping-on-vc-join] ` + localize('ping-on-vc-join', 'channel-bot-found', {c: configElement['notify_channel_id']}));

    setTimeout(async () => { // Wait 3 seconds before pinging a role
        if (!member.voice) return;
        if (member.voice.channelId !== channel.id) return;
        await notifyChannel.send(embedType(configElement['message'], {
            '%vc%': channel.name,
            '%tag%': member.user.tag,
            '%mention%': `<@${member.user.id}>`
        }));

        cooldown.add(member.user.id);
        setTimeout(() => {
            cooldown.delete(member.user.id);
        }, 300000); // 5 min

        if (configElement['send_pn_to_member']) {
            await member.send(embedType(configElement['pn_message'], {
                '%vc%': channel.name
            })).catch(() => {
                client.logger.info(`[ping-on-vc-join] ` + localize('ping-on-vc-join', 'could-not-send-pn', {m: member.user.id}));
            });
        }
    }, 3000);
};