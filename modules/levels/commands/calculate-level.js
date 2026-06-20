const {
    formatNumber,
    parseEmbedColor,
    safeSetFooter
} = require('../../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {localize} = require('../../../src/functions/localize');
const {calculateLevelXP} = require('../events/messageCreate');

const formulaStrings = {
    'EXPONENTIAL': 'x * 750 + ((x - 1) * 500)',
    'LINEAR': 'x * 750',
    'EXPONENTIATION': '350 * (x - 1) ^ 2'
};

/**
 * Returns the human-readable string of the configured level formula
 * @private
 * @param {Object} moduleConfig
 * @returns {string}
 */
function getFormulaString(moduleConfig) {
    if (moduleConfig.curveType === 'CUSTOM') {
        return moduleConfig.customLevelCurve || formulaStrings['EXPONENTIAL'];
    }
    return formulaStrings[moduleConfig.curveType] || formulaStrings['EXPONENTIAL'];
}

module.exports.run = async function (interaction) {
    const moduleStrings = interaction.client.configurations['levels']['strings'];
    const moduleConfig = interaction.client.configurations['levels']['config'];

    const requestedLevel = interaction.options.getInteger('level');
    const startFromZero = !!moduleConfig.startFromZero;
    const minRequested = startFromZero ? 0 : 1;

    if (requestedLevel < minRequested || requestedLevel > 1000000) {
        return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('levels', 'level-out-of-range')
        });
    }

    if (moduleConfig.maximumLevelEnabled && requestedLevel > moduleConfig.maximumLevel) {
        return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('levels', 'calculate-level-above-max', {
                requested: formatNumber(requestedLevel),
                max: formatNumber(moduleConfig.maximumLevel)
            })
        });
    }

    const internalLevel = requestedLevel + (startFromZero ? 1 : 0);

    let xpNeeded;
    if (internalLevel <= 1) {
        xpNeeded = 0;
    } else {
        try {
            xpNeeded = calculateLevelXP(interaction.client, internalLevel);
        } catch (e) {
            return interaction.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('levels', 'invalid-custom-formula')
            });
        }
    }

    const minXP = moduleConfig['min-xp'];
    const maxXP = moduleConfig['max-xp'];
    if (!minXP || !maxXP) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('levels', 'calculate-level-zero-xp-range')
    });
    const avgXP = (minXP + maxXP) / 2;

    const minMessages = Math.ceil(xpNeeded / maxXP);
    const avgMessages = Math.ceil(xpNeeded / avgXP);
    const maxMessages = Math.ceil(xpNeeded / minXP);

    const formulaString = getFormulaString(moduleConfig);

    const embed = new MessageEmbed()
        .setColor(parseEmbedColor((moduleStrings.leaderboardEmbed && moduleStrings.leaderboardEmbed.color) || 'GREEN'))
        .setTitle(localize('levels', 'calculate-level-embed-title', {l: formatNumber(requestedLevel)}))
        .addField(localize('levels', 'calculate-level-formula'), `\`${formulaString}\``, false)
        .addField(localize('levels', 'calculate-level-xp-needed', {l: formatNumber(requestedLevel)}), formatNumber(xpNeeded), false)
        .addField(localize('levels', 'calculate-level-messages-needed', {l: formatNumber(requestedLevel)}), localize('levels', 'calculate-level-messages-value', {
            min: formatNumber(minMessages),
            avg: formatNumber(avgMessages),
            max: formatNumber(maxMessages)
        }), false);

    const voiceXPPerMinute = parseFloat(moduleConfig.voiceXPPerMinute);
    if (voiceXPPerMinute > 0) {
        const voiceMinutes = Math.ceil(xpNeeded / voiceXPPerMinute);
        embed.addField(
            localize('levels', 'calculate-level-voice-needed', {l: formatNumber(requestedLevel)}),
            localize('levels', 'calculate-level-voice-value', {minutes: formatNumber(voiceMinutes)}),
            false
        );
    }

    safeSetFooter(embed, interaction.client);

    interaction.reply({
        ephemeral: true,
        embeds: [embed]
    });
};

module.exports.config = {
    name: 'calculate-level',
    description: localize('levels', 'calculate-level-command-description'),
    disabled: function (client) {
        return !client.configurations['levels']['config'].enableLevelCalculator;
    },
    options: [
        {
            type: 'INTEGER',
            name: 'level',
            description: localize('levels', 'calculate-level-level-description'),
            required: true,
            minValue: 0
        }
    ]
};
