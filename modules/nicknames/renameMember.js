const {truncate} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

renameMember = async function (client, guildMember) {
    const roles = client.configurations['nicknames']['config'];
    const moduleModel = client.models['nicknames']['User'];

    let rolePrefix = '';
    let userRoles = guildMember.roles.cache.sort((a, b) => b.position - a.position).map(r => r.id);
    for (const userRole of userRoles) {
        let role = roles.find(r => r.roleID === userRole);
        if (role) {
            rolePrefix = role.prefix;
            break;
        }
    }


    let user = await moduleModel.findOne({
        attributes: ['userID', 'nickname'],
        where: {
            userID: guildMember.id
        }
    });
    let memberName;
    if (!guildMember.nickname) {
        memberName = guildMember.user.displayName;
    } else {
        memberName = guildMember.nickname;
    }

    for (const role of roles) {
        if (memberName.startsWith(role.prefix)) {
            memberName = memberName.replace(role.prefix, '');
        }
    }

    if (user) {
        if (memberName !== user.nickname) {
            user.nickname = memberName;
            await user.save();
        }
    } else {
        await moduleModel.create({
            userID: guildMember.id,
            nickname: memberName
        });

    }

    if (guildMember.displayName === truncate(rolePrefix + memberName, 32)) return;
    if (guildMember.guild.ownerId === guildMember.id) {
       client.logger.error('[nicknames] ' + localize('nicknames', 'owner-cannot-be-renamed', {u: guildMember.user.username}))
       return;
    }
    if (guildMember.guild.ownerId === guildMember.id) {
       client.logger.error('[nicknames] ' + localize('nicknames', 'owner-cannot-be-renamed', {u: guildMember.user.username}))
       return;
    }
    try {
        await guildMember.setNickname(truncate(rolePrefix + memberName, 32));
    } catch (e) {
        client.logger.error('[nicknames] ' + localize('nicknames', 'nickname-error', {u: guildMember.user.username, e: e}))
    }
}
module.exports.renameMember = renameMember;