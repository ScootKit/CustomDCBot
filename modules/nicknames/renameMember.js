const {truncate} = require('../../src/functions/helpers');
const {localize} = require('../../src/functions/localize');

renameMember = async function (client, guildMember) {
    const roles = client.configurations['nicknames']['strings'];
    const config = client.configurations['nicknames']['config'];
    const moduleModel = client.models['nicknames']['User'];

    let forceDisplayname = config['forceDisplayname'];
    let rolePrefix = '';
    let roleSuffix = '';
    let userRoles = guildMember.roles.cache.sort((a, b) => b.position - a.position).map(r => r.id);
    for (const userRole of userRoles) {
        let role = roles.find(r => r.roleID === userRole);
        if (role) {
            rolePrefix = role.prefix;
            roleSuffix = role.suffix;
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
    if (!guildMember.nickname || forceDisplayname) {
        memberName = guildMember.user.displayName;
    } else {
        memberName = guildMember.nickname;
    }

    for (const role of roles) {
        if (memberName.startsWith(role.prefix)) {
            memberName = memberName.replace(role.prefix, '');
        }
        if (memberName.endsWith(role.suffix)) {
            memberName = memberName.replace(role.suffix, '');
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

    if (guildMember.displayName === truncate(rolePrefix + memberName, 32 - roleSuffix.length).concat(roleSuffix)) return;
    if (guildMember.guild.ownerId === guildMember.id) {
        client.logger.error('[nicknames] ' + localize('nicknames', 'owner-cannot-be-renamed', {u: guildMember.user.username}));
        return;
    }
    if (guildMember.guild.ownerId === guildMember.id) {
        client.logger.error('[nicknames] ' + localize('nicknames', 'owner-cannot-be-renamed', {u: guildMember.user.username}));
        return;
    }
    try {
        await guildMember.setNickname(truncate(rolePrefix + memberName, 32 - roleSuffix.length).concat(roleSuffix));
    } catch (e) {
        client.logger.error('[nicknames] ' + localize('nicknames', 'nickname-error', {
            u: guildMember.user.username,
            e: e
        }));
    }
}
module.exports.renameMember = renameMember;