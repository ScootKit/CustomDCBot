const {localize} = require("../../src/functions/localize");
renameMember = async function (client, guildMember) {
    let newName;
    const moduleConf = client.configurations['username-check']['config'];
    if (moduleConf.userWhitelist.includes(guildMember.user.id)) return;


    if (guildMember.nickname !== null) {
        newName = await checkUsername(client, guildMember.nickname);
        if (newName === guildMember.nickname) return;
    } else if (moduleConf.alsoCheckUsername) {
        newName = await checkUsername(client, guildMember.user.username);
        if (newName === guildMember.user.username) return;
    } else return;

    if (moduleConf.keepNickname) {
        try {
            await guildMember.setNickname(newName);
        } catch (e) {
            client.logger.error('[username-check] ' + localize('username-check', 'nickname-error', {u: guildMember.user.username, e: e}))
        }
    } else {
        await guildMember.setNickname(null, localize('username-check', 'nickname-reset', {u: guildMember.user.username}));
    }
}

module.exports.renameMember = renameMember;

async function checkUsername(client, name) {
    const moduleConf = client.configurations['username-check']['config'];
    if (name.length === 0) return 'INVALID NAME';
    if (moduleConf.symbolWhitelist === []) {
        if (name.charAt(0).match(/^[a-zA-Z0-9]$/)) {
            return name;
        } else {
            return await checkUsername(client, name.substring(1));
        }
    } else if (!moduleConf.symbolWhitelist.includes(name.charAt(0)) && !moduleConf.isBlacklist) {
        if (name.charAt(0).match(/^[a-zA-Z0-9]$/)) {
            return name;
        } else {
            return await checkUsername(client, name.substring(1));
        }
    } else if (moduleConf.symbolWhitelist.includes(name.charAt(0)) && moduleConf.isBlacklist) {
        return await checkUsername(client, name.substring(1));
    } else {
        return name;
    }
}