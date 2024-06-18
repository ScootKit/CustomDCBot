const {truncate} = require("../../../src/functions/helpers");
module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (newGuildMember.nickname === oldGuildMember.nickname && newGuildMember.roles.highest.position === oldGuildMember.guild.me.roles.highest.position) return;

    const roles = client.configurations['nickname']['config'];
    const moduleModel = client.models['nickname']['User'];

    let hoistrole;
    if (newGuildMember.roles.hoist) hoistrole = newGuildMember.roles.hoist.id;

    let rolePrefix = roles.find(r => r.roleID === hoistrole)?.prefix || '';

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