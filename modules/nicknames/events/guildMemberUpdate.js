const {truncate} = require("../../../src/functions/helpers");
module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (newGuildMember.nickname === oldGuildMember.nickname && newGuildMember.roles.cache.size === oldGuildMember.guild.me.roles.cache.size) return;

    const roles = client.configurations['nicknames']['config'];
    const moduleModel = client.models['nicknames']['User'];

    let rolePrefix = '';
    let userRoles = newGuildMember.roles.cache.map(r => r.id);
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
            userID: newGuildMember.id
        }
    });
    let memberName;
    if (!newGuildMember.nickname) {
        memberName = newGuildMember.user.displayName;
    } else {
        memberName = newGuildMember.nickname;
    }

    for (const role of roles) {
        if (memberName.startsWith(role.prefix)) {
            memberName = memberName.replace(role.prefix, "");
        }
    }

    if (user) {
        if (memberName !== user.nickname) {
            user.nickname = memberName;
            await user.save();
        }
    } else {
        await moduleModel.create({
            userID: newGuildMember.id,
            nickname: memberName
        });

    }

    try {
        await newGuildMember.setNickname(truncate(rolePrefix + memberName, 32));
    } catch (e) {
        client.logger.error(e);
    }
};
