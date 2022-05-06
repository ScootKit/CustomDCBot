const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');

module.exports.subcommands = {
    'redeem': async function (interaction) {
        const moduleStrings = interaction.client.configurations['hunt-the-code']['strings'];
        const codeObject = await interaction.client.models['hunt-the-code']['Code'].findOne({
            where: {
                code: interaction.options.getString('code').toUpperCase()
            }
        });
        if (!codeObject) return interaction.reply(embedType(moduleStrings.codeNotFoundMessage, {}, {ephemeral: true}));
        const [user] = await interaction.client.models['hunt-the-code']['User'].findOrCreate({
            where: {
                id: interaction.user.id
            }
        });
        if (user.foundCodes.includes(codeObject.code)) return interaction.reply(embedType(moduleStrings.codeAlreadyRedeemed, {
            '%userCodesCount%': user.foundCount,
            '%displayName%': codeObject.displayName,
            '%codeUseCount%': codeObject.foundCount
        }, {ephemeral: true}));
        user.foundCount++;
        user.foundCodes = [...user.foundCodes, codeObject.code];
        await user.save();
        codeObject.foundCount++;
        interaction.reply(embedType(moduleStrings.codeRedeemed, {
            '%displayName%': codeObject.displayName,
            '%codeUseCount%': codeObject.foundCount,
            '%userCodesCount%': user.foundCount
        }, {ephemeral: true}));
        await codeObject.save();
    },
    'profile': async function (interaction) {
        const [user] = await interaction.client.models['hunt-the-code']['User'].findOrCreate({
            where: {
                id: interaction.user.id
            }
        });
        const codes = await interaction.client.models['hunt-the-code']['Code'].findAll({
            attributes: ['displayName', 'code']
        });
        let foundCodes = '';
        for (const code of user.foundCodes) {
            const codeObject = codes.find(c => c.code === code);
            if (!codeObject) continue;
            foundCodes = foundCodes + `\n• ${codeObject.displayName}`
        }
        if (!foundCodes) foundCodes = localize('hunt-the-code', 'no-codes-found')
        interaction.reply(embedType(interaction.client.configurations['hunt-the-code']['strings'].profileMessage, {
            '%username%': interaction.user.username,
            '%foundCount%': user.foundCount,
            '%allCodesCount%': codes.length,
            '%foundCodes%': foundCodes
        }, {ephemeral: true}));
    },
    'leaderboard': async function (interaction) {
        const moduleStrings = interaction.client.configurations['hunt-the-code']['strings'];
        const users = await interaction.client.models['hunt-the-code']['User'].findAll({
            attributes: ['id', 'foundCount'],
            order: [
                ['foundCount', 'DESC']
            ],
            limit: 20
        });
        let userString = '';
        for (const user of users) {
            userString = userString + `\n<@${user.id}>: ${user.foundCount}`
        }
        if (userString === '') userString = localize('hunt-the-code', 'no-users')
        const embed = new MessageEmbed()
            .setDescription(userString)
            .setTitle(moduleStrings.leaderboardMessage.title)
            .setImage(moduleStrings.leaderboardMessage.image || null)
            .setThumbnail(moduleStrings.leaderboardMessage.thumbnail || null)
            .setColor(moduleStrings.leaderboardMessage.color);
        interaction.reply({
            ephemeral: true,
            embeds: [embed]
        })
    }
};

module.exports.config = {
    name: 'hunt-the-code',
    description: localize('hunt-the-code', 'command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'redeem',
            description: localize('hunt-the-code', 'redeem-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'code',
                    required: true,
                    description: localize('hunt-the-code', 'code-redeem-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'leaderboard',
            description: localize('hunt-the-code', 'leaderboard-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'profile',
            description: localize('hunt-the-code', 'profile-description')
        }
    ]
};