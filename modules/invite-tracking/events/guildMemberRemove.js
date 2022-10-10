const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const {dateToDiscordTimestamp} = require('../../../src/functions/helpers');
const {stringNames} = require('./guildMemberJoin');

module.exports.run = async (client, member) => {
    if (!client.botReadyAt) return;
    if (member.guild.id !== client.guild.id) return;

    await client.models['invite-tracking']['UserInvite'].update({left: true}, {
        where: {
            userID: member.user.id
        }
    });

    const moduleConfig = client.configurations['invite-tracking']['config'];
    if (moduleConfig['logchannel-id']) {
        const userInvites = await client.models['invite-tracking']['UserInvite'].findAll({
            where: {
                userID: member.user.id
            },
            order: [['createdAt', 'DESC']]
        });
        const invite = userInvites[0];
        if (!invite) return;
        const c = client.channels.cache.get(moduleConfig['logchannel-id']);
        if (!c) return client.logger.error(localize('invite-tracking', 'log-channel-not-found-but-set', {c: moduleConfig['logchannel-id']}));
        const embed = new MessageEmbed()
            .setTitle('📤 ' + localize('invite-tracking', 'member-leave'))
            .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
            .setColor('RED')
            .addField(localize('invite-tracking', 'member'), `${member.user.tag} (\`${member.user.id}\`)`, true)
            .addField(localize('invite-tracking', 'invite-type'), localize('invite-tracking', stringNames[invite.inviteType]), true);
        if (!client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (invite.inviteCode) {
            let guildInvite = await member.guild.invites.fetch({ code: invite.inviteCode, force: true }).catch(() => {});
            if (!guildInvite) guildInvite = {};

            let inviteString = localize('invite-tracking', 'invite-code', {c: invite.inviteCode, u: 'https://discord.gg/' + invite.inviteCode});

            if (guildInvite.channel) inviteString = inviteString + '\n' + localize('invite-tracking', 'invite-channel', {c: guildInvite.channel.toString()});
            if (guildInvite.createdAt) inviteString = inviteString + '\n' + localize('invite-tracking', 'created-at', {t: dateToDiscordTimestamp(guildInvite.createdAt)});
            if (guildInvite.expiresAt) inviteString = inviteString + '\n' + localize('invite-tracking', 'expires-at', {t: dateToDiscordTimestamp(guildInvite.expiresAt)});

            if (invite.inviter) {
                const inviterInvites = await client.models['invite-tracking']['UserInvite'].findAll({
                    where: {
                        inviter: invite.inviter
                    }
                });
                inviteString = inviteString + '\n' + localize('invite-tracking', 'inviter', {u: `<@${invite.inviter}>`, i: inviterInvites.length, a: inviterInvites.filter(i => !i.left).length});
            }

            if (guildInvite.uses) inviteString = inviteString + '\n' + localize('invite-tracking', 'uses', {u: guildInvite.uses});
            if (guildInvite.maxUses) inviteString = inviteString + '\n' + localize('invite-tracking', 'max-uses', {u: guildInvite.maxUses});
            embed.addField(localize('invite-tracking', 'invite'), inviteString);
        }
        c.send({embeds: [embed]});
    }
};