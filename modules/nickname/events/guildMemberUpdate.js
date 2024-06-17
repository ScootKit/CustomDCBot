module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;
    if (newGuildMember.nickname === oldGuildMember.nickname && newGuildMember.roles.highest.position === oldGuildMember.guild.me.roles.highest.position) return;

    const roles = client.configurations['nickname']['config'];
    const moduleModel = client.models['nickname']['User'];

    let rolePrefix = "";
    let hoistrole
    if (newGuildMember.roles.hoist === null) {
        hoistrole = null;
    } else {
        hoistrole = newGuildMember.roles.hoist.id;
    }

    for (const role of roles) {
        if (role.roleID === hoistrole) {
            rolePrefix = role.prefix;
        }
    }

    let user = await moduleModel.findOne({
        attributes: ['userID', 'nickname'],
        raw: true,
        where: {
            userID: newGuildMember.id
        }
    });
    let memberName;
    if (newGuildMember.nickname === null) {
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
            await moduleModel.update({
                userID: newGuildMember.id,
                nickname: memberName
            }, {
                where: {
                    userID: newGuildMember.id
                }
            });
        }
    } else {
        await moduleModel.create({
            userID: newGuildMember.id,
            nickname: memberName
        });

    }

    try {
        await newGuildMember.setNickname(rolePrefix + memberName);
    } catch (e) {
    }
};