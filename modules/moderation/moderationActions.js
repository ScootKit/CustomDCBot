const {embedType} = require('../../src/functions/helpers');
const {confDir} = require('../../main');
const {MessageEmbed} = require('discord.js');

module.exports.moderationAction = async function (client, type, user, victim, reason) {
    const moduleConfig = require(`${confDir}/moderation/config.json`);
    const moduleStrings = require(`${confDir}/moderation/strings.json`);
    if (!reason) reason = 'Not set';
    return new Promise(async resolve => {
        const guild = await client.guilds.fetch(client.guildID);
        const muteRole = await guild.roles.fetch(moduleConfig['muterole-id']);
        if (!muteRole) {
            console.error('Could not find muterole. Can not mute user');
            return resolve(false);
        }
        switch (type) {
            case 'mute':
                await victim.roles.add(muteRole);
                sendMessage(victim, embedType(moduleStrings['mute_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                break;
            case 'unmute':
                if (!muteRole) {
                    console.error('Could not find muterole. Can not mute user');
                    return resolve(false);
                }
                await victim.roles.remove(muteRole);
                sendMessage(victim, embedType(moduleStrings['unmute_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                break;
            case 'kick':
                sendMessage(victim, embedType(moduleStrings['kick_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                if (victim.kickable) await victim.kick();
                break;
            case 'ban':
                sendMessage(victim, embedType(moduleStrings['ban_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                if (victim.bannable) await victim.ban();
                break;
            case 'warn':
                sendMessage(victim, embedType(moduleStrings['warn_message'], {
                    '%reason%': reason,
                    '%user%': user.user.tag
                }));
                break;
            case 'unban':
                await guild.members.unban(victim);
                const userid = victim;
                victim = {};
                victim.user = {};
                victim.user.tag = userid;
                victim.user.id = userid;
                victim.id = userid;
                break;
            default:
                return resolve(false);
        }
        const moderationAction = await client.models['moderation']['ModerationAction'].create({
            victim: victim.id,
            memberID: user.id,
            reason: reason,
            type: type
        });
        const channel = await guild.channels.cache.get(moduleConfig['logchannel-id']);
        if (!channel) {
            console.error('Missing logchannel');
        } else {
            await channel.send(new MessageEmbed().setColor(0xe67e22).setFooter(client.strings['footer']).setTimestamp().setAuthor(client.user.tag, client.user.avatarURL()).setTitle(`Case #${moderationAction.actionID}`).setThumbnail(client.user.avatarURL()).addField('Victim', `${victim.user.tag}\n\`${victim.user.id}\``, true)
                .addField('User', `${user.user.tag}\n\`${user.user.id}\``, true).addField('Action', type, true).addField('Reason', reason));
        }
        resolve(moderationAction);
    });
};

function sendMessage(user, content) {
    user.send(...content).catch(console.error);
}