const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');

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
        await session.destroy();
        interaction.client.nicknameManager.attachMember(interaction.member);
        interaction.client.nicknameManager.requestUpdate(interaction.member.id);
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
            afkMessage: interaction.options.getString('reason'),
            autoEnd: typeof interaction.options.getBoolean('auto-end') === 'boolean' ? interaction.options.getBoolean('auto-end') : true
        });
        interaction.client.nicknameManager.attachMember(interaction.member);
        interaction.client.nicknameManager.requestUpdate(interaction.member.id);
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