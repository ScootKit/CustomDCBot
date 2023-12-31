const {localize} = require('../../../src/functions/localize');
const {embedType, truncate, formatDiscordUserName} = require('../../../src/functions/helpers');

module.exports.subcommands = {
    'end': async function (interaction) {
        const session = await interaction.client.models['afk-system']['AFKUser'].findOne({
            where: {
                userID: interaction.user.id
            }
        });
        if (!session) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('afk-system', 'no-running-session')
        });
        if (session.nickname) await interaction.member.setNickname(session.nickname, '[afk-system] ' + localize('afk-system', 'afk-nickname-change-audit-log')).catch(e => {
            interaction.client.logger.warn(localize('afk-system', 'can-not-edit-nickname', {
                e,
                u: formatDiscordUserName(interaction.user)
            }));
        });
        else await interaction.member.setNickname(null, '[afk-system] ' + localize('afk-system', 'afk-nickname-change-audit-log')).catch(e => {
            interaction.client.logger.warn(localize('afk-system', 'can-not-edit-nickname', {
                e,
                u: formatDiscordUserName(interaction.user)
            }));
        });
        await session.destroy();
        interaction.reply(embedType(interaction.client.configurations['afk-system']['config']['sessionEndedSuccessfully'], {}, {ephemeral: true}));
    },
    'start': async function(interaction) {
        const session = await interaction.client.models['afk-system']['AFKUser'].findOne({
            where: {
                userID: interaction.user.id
            }
        });
        if (session) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('afk-system', 'already-running-session')
        });
        await interaction.client.models['afk-system']['AFKUser'].create({
            userID: interaction.user.id,
            nickname: interaction.member.nickname,
            afkMessage: interaction.options.getString('reason'),
            autoEnd: typeof interaction.options.getBoolean('auto-end') === 'boolean' ? interaction.options.getBoolean('auto-end') : true
        });
        await interaction.member.setNickname('[AFK] ' + truncate(interaction.member.nickname || interaction.user.username, 32 - 6)).catch(e => {
            interaction.client.logger.warn(localize('afk-system', 'can-not-edit-nickname', {
                e,
                u: formatDiscordUserName(interaction.user)
            }));
        });
        interaction.reply(embedType(interaction.client.configurations['afk-system']['config']['sessionStartedSuccessfully'], {}, {ephemeral: true}));
    }
};

module.exports.config = {
    name: 'afk',
    description: localize('afk-system', 'command-description'),

    options: [
        {
            type: 'SUB_COMMAND',
            name: 'end',
            description: localize('afk-system', 'end-command-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'start',
            description: localize('afk-system', 'start-command-description'),
            options: [
                {
                    type: 'STRING',
                    required: false,
                    name: 'reason',
                    description: localize('afk-system', 'reason-option-description')
                },
                {
                    type: 'BOOLEAN',
                    required: false,
                    name: 'auto-end',
                    description: localize('afk-system', 'autoend-option-description')
                }
            ]
        }
    ]
};