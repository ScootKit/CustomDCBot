const {localize} = require('../../../src/functions/localize');
const {embedType, randomIntFromInterval, randomElementFromArray} = require('../../../src/functions/helpers');
const {generateIkeaName} = require('@scderox/ikea-name-generator');

module.exports.subcommands = {
    'number': function (interaction) {
        interaction.reply(embedType(interaction.client.configurations['fun']['config']['randomNumberMessage'],
            {
                '%min%': interaction.options.getNumber('min') || 1,
                '%max%': interaction.options.getNumber('max') || 42,
                '%number%': randomIntFromInterval(interaction.options.getNumber('min') || 1, interaction.options.getNumber('max') || 42)
            }
        ));
    },
    'ikea-name': function (interaction) {
        let count = interaction.options.getNumber('syllable-count') || Math.floor(Math.random() * 4) + 1;
        if (count && count > 20) count = 20;
        interaction.reply(embedType(interaction.client.configurations['fun']['config']['ikeaMessage'], {'%name%': generateIkeaName(count)}));
    },
    'dice': function (interaction) {
        interaction.reply(embedType(interaction.client.configurations['fun']['config']['diceRollMessage'], {'%number%': randomIntFromInterval(1, 6)}));
    },
    'coinflip': function (interaction) {
        interaction.reply(embedType(interaction.client.configurations['fun']['config']['coinFlipMessage'], {'%site%': localize('fun', `dice-site-${randomIntFromInterval(1, 2)}`)}));
    },
    '8ball': function (interaction) {
        interaction.reply(embedType(interaction.client.configurations['fun']['config']['8ballMessage'], {
            '%answer%': randomElementFromArray(interaction.client.configurations['fun']['config']['8BallMessages'])
        }));
    }
};

module.exports.config = {
    name: 'random',
    description: localize('fun', 'random-command-description'),
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'number',
            description: localize('fun', 'random-number-command-description'),
            options: [
                {
                    type: 'NUMBER',
                    name: 'min',
                    description: localize('fun', 'min-argument-description'),
                    required: false
                },
                {
                    type: 'NUMBER',
                    name: 'max',
                    description: localize('fun', 'max-argument-description'),
                    required: false
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'ikea-name',
            description: localize('fun', 'random-ikeaname-command-description'),
            options: [
                {
                    type: 'NUMBER',
                    name: 'syllable-count',
                    description: localize('fun', 'syllable-count-argument-description'),
                    required: false
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'dice',
            description: localize('fun', 'random-dice-command-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'coinflip',
            description: localize('fun', 'random-coinflip-command-description')
        },
        {
            type: 'SUB_COMMAND',
            name: '8ball',
            description: localize('fun', 'random-8ball-command-description')
        }
    ]
};