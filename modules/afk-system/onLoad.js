module.exports.onLoad = function (client) {
    if (client.afkSystemProviderRegistered) return;
    client.afkSystemProviderRegistered = true;

    client.nicknameManager.registerProvider('afk', 'afk-system', async (member) => {
        const AFKUser = client.models?.['afk-system']?.['AFKUser'];
        if (!AFKUser) return null;
        const session = await AFKUser.findOne({where: {userID: member.id}});
        if (!session) return null;
        return {
            source: 'afk',
            position: 'wrap',
            value: (s) => '[AFK] ' + s,
            priority: 500
        };
    });
};
