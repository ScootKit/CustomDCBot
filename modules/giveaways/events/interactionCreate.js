const {calculateUserEntries, checkRequirements} = require('../giveaways');
const {embedType, formatDate} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');

const toBeProcessed = [];

exports.run = async (client, interaction) => {
    if (!interaction.client.botReadyAt) return;
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('giveaway-l') && interaction.customId !== 'giveaway') return;
    await interaction.deferReply({ephemeral: true});
    toBeProcessed.push(interaction);
    startProcessing();
};

let processing = false;

/**
 * This is here to prevent race conditions leading to unregistered entries. It's bad I know, but it gets the job done. I should rewrite the whole system
 */
async function startProcessing() {
    if (processing) return;
    for (const k in toBeProcessed) {
        await processReply(toBeProcessed[k]);
        delete toBeProcessed[k];
    }
    processing = false;
    if (toBeProcessed.filter(f => f !== null).length !== 0) await startProcessing();
}

async function processReply(interaction) {
    const client = interaction.client;
    const moduleStrings = interaction.client.configurations['giveaways']['strings'];
    if (interaction.customId.startsWith('giveaway-l')) {
        const giveaway = await client.models['giveaways']['Giveaway'].findOne({
            where: {
                id: interaction.customId.replaceAll('giveaway-l-', '')
            }
        });
        if (!giveaway) return;
        const entries = {...giveaway.entries};
        delete entries[interaction.user.id];
        giveaway.entries = {...entries};
        await giveaway.save();
        interaction.editReply({content: localize('giveaways', 'giveaway-left')}).then(() => {
        });
        interaction.channel.messages.fetch(giveaway.messageID).then(m => updateGiveaway(giveaway, m).then(() => {
        }));

        return;
    }
    if (interaction.customId !== 'giveaway') return;

    const giveaway = await client.models['giveaways']['Giveaway'].findOne({
        where: {
            messageID: interaction.message.id
        }
    });

    if (interaction.member.roles.cache.find(r => (interaction.client.configurations['giveaways']['config'].entryDeniedRoles || []).includes(r.id))) return interaction.editReply(embedType(moduleStrings['deniedRoleMessage'], {}));

    if (giveaway.requirements.length === 0) return await enterUser();

    const [failedRequirements, notPassedRequirementsString] = await checkRequirements(interaction.member, giveaway);
    if (failedRequirements) {
        interaction.editReply(embedType(moduleStrings['requirementsNotPassed'], {
            '%requirements%': notPassedRequirementsString
        }));
    } else await enterUser();

    /**
     * Enters this user to this giveaway
     * @private
     * @returns {Promise<void>}
     */
    async function enterUser() {
        if (giveaway.entries[interaction.user.id]) return interaction.editReply(embedType(moduleStrings.alreadyEnteredMessage, {
            '%price%': giveaway.price,
            '%entries%': calculateUserEntries(interaction.member)
        }, {
            components: [{
                type: 'ACTION_ROW',
                components: [{
                    type: 'BUTTON',
                    style: 'DANGER',
                    label: 'Leave giveaway',
                    customId: `giveaway-l-${giveaway.id}`
                }]
            }]
        }));
        const entries = giveaway.entries;
        giveaway.entries = {}; // Thx sequelize
        entries[interaction.user.id] = calculateUserEntries(interaction.member);
        giveaway.entries = entries;
        await giveaway.save();
        interaction.editReply(embedType(moduleStrings.confirmationMessage, {
            '%price%': giveaway.price,
            '%entries%': calculateUserEntries(interaction.member)
        })).then(() => {
        });

        interaction.channel.messages.fetch(giveaway.messageID).then(m => updateGiveaway(giveaway, m).then(() => {
        }));
    }

    async function updateGiveaway(giveaway, message) {
        const enteredUsers = [];
        let totalEntries = 0;
        for (const userID in giveaway.entries) {
            totalEntries = totalEntries + giveaway.entries[userID];
            if (!enteredUsers.includes(userID)) enteredUsers.push(userID);
        }
        const components = [{
            type: 'ACTION_ROW',
            components: [{type: 'BUTTON', label: moduleStrings.buttonContent, style: 'PRIMARY', customId: 'giveaway'}]
        }];
        const endAt = new Date(parseInt(giveaway.endAt));

        if (giveaway.requirements.length !== 0) {
            let requirementString = '';
            giveaway.requirements.forEach((r) => {
                if (r.type === 'messages') requirementString = requirementString + `• ${localize('giveaways', 'required-messages', {mc: r.messageCount})}\n`;
                if (r.type === 'roles') {
                    let rolesString = ''; // Surely there is a better way to to this kind of stuff, but I am to stupid to find it
                    r.roles.forEach(rID => rolesString = rolesString + `<@&${rID}> `);
                    requirementString = rolesString + `• ${localize('giveaways', 'roles-required', {r: rolesString})}\n`;
                }
            });

            await message.edit(embedType(moduleStrings['giveaway_message_with_requirements'], {
                '%prize%': giveaway.prize,
                '%winners%': giveaway.winnerCount,
                '%requirements%': requirementString,
                '%sponsorLink%': giveaway.sponsorWebsite || localize('giveaways', 'no-link'),
                '%endAt%': formatDate(endAt),
                '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
                '%organiser%': `<@${giveaway.organiser}>`,
                '%entryCount%': interaction.channel.type === 'GUILD_NEWS' ? localize('giveaways', 'not-supported-for-news-channel') : totalEntries,
                '%enteredCount%': interaction.channel.type === 'GUILD_NEWS' ? localize('giveaways', 'not-supported-for-news-channel') : enteredUsers.length
            }, {components}));
        } else {
            await message.edit(embedType(moduleStrings['giveaway_message'], {
                '%prize%': giveaway.prize,
                '%winners%': giveaway.winnerCount,
                '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
                '%endAt%': formatDate(endAt),
                '%sponsorLink%': giveaway.sponsorWebsite || localize('giveaways', 'no-link'),
                '%organiser%': `<@${giveaway.organiser}>`,
                '%entryCount%': interaction.channel.type === 'GUILD_NEWS' ? localize('giveaways', 'not-supported-for-news-channel') : totalEntries,
                '%enteredCount%': interaction.channel.type === 'GUILD_NEWS' ? localize('giveaways', 'not-supported-for-news-channel') : enteredUsers.length
            }, {components}));
        }
    }
}