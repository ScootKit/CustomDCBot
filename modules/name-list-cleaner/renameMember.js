const {localize} = require("../../src/functions/localize");
renameMember = async function (client, guildMember) {
    const moduleConf = client.configurations['name-list-cleaner']['config'];
    if (moduleConf.userWhitelist.includes(guildMember.user.id)) return;
    let hasNickname = guildMember.nickname !== null;


    if (hasNickname) {
        let newName = checkUsername(client, guildMember.nickname, false);
        if (newName === guildMember.nickname) return;
    } else if (moduleConf.alsoCheckUsernames) {
        let newName = checkUsername(client, guildMember.user.username, true);
        if (newName === guildMember.user.username) return;
    } else {
        return;
    }

    if (guildMember.guild.ownerId === guildMember.id) {
        client.logger.error('[name-list-cleaner] ' + localize('name-list-cleaner', 'owner-cannot-be-renamed', {u: guildMember.user.username}))
        return;
    }

    if (moduleConf.keepNickname) {
        try {
            await guildMember.setNickname(newName, localize('name-list-cleaner', 'nickname-changed', {u: guildMember.user.username}));
        } catch (e) {
            client.logger.error('[name-list-cleaner] ' + localize('name-list-cleaner', 'nickname-error', {u: guildMember.user.username, e: e}))
        }
    } else {
        if (!hasNickname) {
            return;
        }
        try {
            await guildMember.setNickname(null, localize('name-list-cleaner', 'nickname-reset', {u: guildMember.user.username}));
        } catch (e) {
            client.logger.error('[name-list-cleaner] ' + localize('name-list-cleaner', 'nickname-error', {u: guildMember.user.username, e: e}))
        }
    }
}

module.exports.renameMember = renameMember;

function checkUsername(client, name, isUsername) {
    const moduleConf = client.configurations['name-list-cleaner']['config'];
    const regEx = /^[a-zA-Z0-9]$/;
    if (name.length === 0) {
        if (isUsername) {
            return 'User'
        } else {
            return null;
        }
    }
    if (moduleConf.symbolWhitelist.length === 0) {
        if (name.charAt(0).match(regEx)) {
            return name;
        } else {
            return checkUsername(client, name.substring(1), isUsername);
        }
    } else if (!moduleConf.symbolWhitelist.includes(name.charAt(0)) && !moduleConf.isBlacklist) {
        if (name.charAt(0).match(regEx)) {
            return name;
        } else {
            return checkUsername(client, name.substring(1), isUsername);
        }
    } else if (moduleConf.symbolWhitelist.includes(name.charAt(0)) && moduleConf.isBlacklist) {
        return checkUsername(client, name.substring(1), isUsername);
    } else {
        return name;
    }
}