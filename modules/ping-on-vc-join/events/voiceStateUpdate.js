const {embedType} = require('../../../src/functions/helpers');

let cooldown = new Set();

exports.run = async (client, oldState, newState) => {
    const moduleConfig = require(`${client.configDir}/ping-on-vc-join/config.json`);

    if (!newState.channelID) return;
    if (!moduleConfig.channels.includes(newState.channelID)) return;

    const memberChannel = newState.guild.channels.cache.get(newState.channelID);
    if (!memberChannel) return;

    const member = await newState.guild.members.fetch(newState.id);
    if (!member) return;

    if (cooldown.has(member.user.id)) return;

    const notifyChannel = newState.guild.channels.cache.get(moduleConfig['notify_channel_id']);
    if (!notifyChannel) return console.error(`[Module: ping-on-vc-join] Notify channel not found`);

    await notifyChannel.send(...embedType(moduleConfig['message'], {
        '%vc%': memberChannel.name,
        '%tag%': member.user.tag,
        '%mention%': `<@${member.user.id}>`
    }));

    cooldown.add(member.user.id);
    setTimeout(() => {
        cooldown.delete(member.user.id);
    }, 300000); // 5 min

    if (moduleConfig['send_pn_to_member']) {
        await member.send(...embedType(moduleConfig['pn_message'], {
            '%vc%': memberChannel.name
        })).catch(e => {
            console.error(`[Module: ping-on-vc-join] Could not send PN to ${member.user.id}`);
        });
    }
};