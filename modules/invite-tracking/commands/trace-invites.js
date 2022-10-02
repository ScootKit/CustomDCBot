const {localize} = require('../../../src/functions/localize');
const {stringNames} = require('../events/guildMemberJoin');

module.exports.run = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
    const user = interaction.options.getUser('user', true);
    const invitedUsers = await interaction.client.models['invite-tracking']['UserInvite'].findAll({
        where: {
            inviter: user.id,
            left: false
        }
    });
    const userInvites = await interaction.client.models['invite-tracking']['UserInvite'].findAll({
        where: {
            userID: user.id,
            left: false
        },
        order: [['createdAt', 'DESC']]
    });

    let content = `**${localize('invite-tracking', 'invited-by')}**\n`;
    if (!userInvites[0]) content = content + localize('invite-tracking', 'inviter-not-found');
    else content = content + `${localize('invite-tracking', stringNames[userInvites[0].inviteType])}${userInvites[0].inviter ? ` by <@${userInvites[0].inviter}>` : ''}${userInvites[0].inviteCode ? ` via code [${userInvites[0].inviteCode}](https://discord.gg/${userInvites[0].inviteCode})` : ''}`;

    content = content + `\n\n**${localize('invite-tracking', 'invited-users')}**\n`;
    if (invitedUsers.length === 0) content = content + localize('invite-tracking', 'no-users-invited');
    else {
        let i = 0;
        for (const invite of invitedUsers) {
            i++;
            if (i > 10) continue;
            content = content + `<@${invite.userID}>\n`;
        }
        if (i > 10) content = content + localize('invite-tracking', 'and-x-more-users', {x: i - 10}) + '\n';
    }

    content = content + `\n**${localize('invite-tracking', 'created-invites')}**\n`;
    const guildInvites = await interaction.guild.invites.fetch();
    let y = 0;
    for (const invite of guildInvites.filter(i => i.inviter.id === user.id).values()) {
        y++;
        if (y > 5) continue;
        content = content + `[${invite.code}](${invite.url}) (${invite.uses}${invite.maxUses ? `/${invite.maxUses}` : ''} uses) to ${invite.channel.toString()}\n`;
    }
    if (y > 5) content = content + localize('invite-tracking', 'and-x-more-invites', {x: y - 5}) + '\n';
    if (y === 0) content = content + `${localize('invite-tracking', 'no-invites')}\n`;

    content = content + `\n*${localize('invite-tracking', 'not-showing-left-users')}*`;
    await interaction.editReply({content, allowedMentions: {parse: []}, components: [{
        type: 'ACTION_ROW',
        components: [
            {
                type: 'BUTTON',
                label: '🗑️ ' + localize('invite-tracking', 'revoke-user-invite'),
                style: 'DANGER',
                customId: `uinv-rev-${user.id}`
            }
        ]
    }]});
};

module.exports.config = {
    name: 'trace-invites',
    description: localize('invite-tracking', 'trace-command-description'),
    defaultPermission: false,
    options: [
        {
            type: 'USER',
            name: 'user',
            required: true,
            description: localize('invite-tracking', 'argument-user-description')
        }
    ]
};