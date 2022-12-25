const {migrate, embedType} = require('../../../src/functions/helpers');
const {client} = require('../../../main');
const {sendMessage} = require('../channel-settings');
const {localize} = require('../../../src/functions/localize');
module.exports.run = async function () {
    const settingsChannel = client.channels.cache.get(client.configurations['temp-channels']['config']['settingsChannel']);
    await migrate('temp-channels', 'TempChannelV1', 'TempChannel');

    if (settingsChannel) {
        const messages = (await settingsChannel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
        if (messages.first()) {
            const moduleConfig = client.configurations['temp-channels']['config'];
            const components = [{
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'add-user'),
                        style: 'SUCCESS',
                        customId: 'tempc-add',
                        emoji: '➕'
                    },
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'remove-user'),
                        style: 'DANGER',
                        customId: 'tempc-remove',
                        emoji: '➖'
                    },
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'list-users'),
                        style: 'PRIMARY',
                        customId: 'tempc-list',
                        emoji: '📃'
                    }]
            },
            {
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'public-channel'),
                        style: 'SUCCESS',
                        customId: 'tempc-public',
                        emoji: '🔓'
                    },
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'private-channel'),
                        style: 'DANGER',
                        customId: 'tempc-private',
                        emoji: '🔒'
                    },
                    {
                        type: 'BUTTON',
                        label: localize('temp-channels', 'edit-channel'),
                        style: 'SECONDARY',
                        customId: 'tempc-edit',
                        emoji: '📝'
                    }]
            }];
            const message = embedType(moduleConfig['settingsMessage'], {}, {components});
            await messages.first().edit(message);
        } else await sendMessage(settingsChannel);
    }
};