const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');
const {dateToDiscordTimestamp} = require('../../../src/functions/helpers');

const stringNames = {
    normal: 'normal-invite',
    vanity: 'vanity-invite',
    permissions: 'missing-permissions',
    unknown: 'unknown-invite'
};
module.exports.stringNames = stringNames;

module.exports.run = async (client, member, type, invite) => {
    if (!client.botReadyAt) return;
    if (member.guild.id !== client.guild.id) return;

    const moduleConfig = client.configurations['invite-tracking']['config'];

    const beforeInvites = await client.models['invite-tracking']['UserInvite'].findAll({
        where: {
            userID: member.user.id
        },
        order: [['createdAt', 'DESC']]
    });

    await client.models['invite-tracking']['UserInvite'].create({
        inviteCode: invite ? invite.code : null,
        inviteType: type,
        inviter: invite ? invite.inviter.id : null,
        userID: member.user.id
    });

    if (moduleConfig['logchannel-id']) {
        const c = client.channels.cache.get(moduleConfig['logchannel-id']);
        if (!c) return client.logger.error(localize('invite-tracking', 'log-channel-not-found-but-set', {c: moduleConfig['logchannel-id']}));
        const components = [{
            type: 'ACTION_ROW',
            components: []
        }];
        const embed = new MessageEmbed()
            .setTitle('📥 ' + localize('invite-tracking', 'new-member'))
            .setFooter({text: client.strings.footer, iconURL: client.strings.footerImgUrl})
            .setColor('GREEN')
            .addField(localize('invite-tracking', 'member'), `${member.toString()} (\`${member.user.id}\`)`, true)
            .addField(localize('invite-tracking', 'invite-type'), localize('invite-tracking', stringNames[type]), true);
        if (client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (beforeInvites.length !== 0) embed.setDescription(localize('invite-tracking', 'joined-for-the-x-time', {u: member.user.username, x: beforeInvites.length, t: dateToDiscordTimestamp(beforeInvites[0].createdAt)}));
        if (invite) {
            const fetchedInvite = await member.guild.invites.fetch({code: invite.code, force: true}).catch(() => {});
            if (fetchedInvite) invite = fetchedInvite;
            let inviteString = localize('invite-tracking', 'invite-code', {c: invite.code, u: invite.url});
            if (invite.channel) inviteString = inviteString + '\n' + localize('invite-tracking', 'invite-channel', {c: invite.channel.toString()});
            if (invite.createdAt) inviteString = inviteString + '\n' + localize('invite-tracking', 'created-at', {t: dateToDiscordTimestamp(invite.createdAt)});
            if (invite.expiresAt) inviteString = inviteString + '\n' + localize('invite-tracking', 'expires-at', {t: dateToDiscordTimestamp(invite.expiresAt)});
            if (invite.inviter) {
                const userInvites = await client.models['invite-tracking']['UserInvite'].findAll({
                    where: {
                        inviter: invite.inviter.id
                    }
                });
                inviteString = inviteString + '\n' + localize('invite-tracking', 'inviter', {u: invite.inviter.toString(), i: userInvites.length, a: userInvites.filter(i => !i.left).length});
            }
            if (invite.uses) inviteString = inviteString + '\n' + localize('invite-tracking', 'uses', {u: invite.uses});
            if (invite.maxUses) inviteString = inviteString + '\n' + localize('invite-tracking', 'max-uses', {u: invite.maxUses});
            components[0].components.push({
                type: 'BUTTON',
                label: '🗑️ ' + localize('invite-tracking', 'revoke-invite'),
                style: 'DANGER',
                customId: `inv-rev-${invite.code}`
            });
            embed.addField(localize('invite-tracking', 'invite'), inviteString);
        }
        c.send({embeds: [embed], components});
    }
};