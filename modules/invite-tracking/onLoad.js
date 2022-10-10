const InvitesTracker = require('@androz2091/discord-invites-tracker');
const {localize} = require('../../src/functions/localize');

module.exports.onLoad = function (client) {
    if (!client.inviteHook) {
        const tracker = InvitesTracker.init(client, {
            fetchGuilds: true,
            fetchVanity: true,
            fetchAuditLogs: true,
            activeGuilds: [client.config.guildID]
        });
        client.inviteHook = true;
        localize('invite-tracking', 'hook-installed');
        tracker.on('guildMemberAdd', async (member, type, invite) => {
            client.emit('guildMemberJoin', member, type, invite);
        });
    }
};