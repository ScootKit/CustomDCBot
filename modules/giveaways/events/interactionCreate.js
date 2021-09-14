const {calculateUserEntries, checkRequirements, endGiveaway} = require('../giveaways');
const {embedType, formatDate} = require('../../../src/functions/helpers');

exports.run = async (client, interaction) => {
    if (!interaction.client.botReadyAt) return;
    if (interaction.isSelectMenu()) {
        if (interaction.customId !== 'end-giveaway') return;
        await endGiveaway(interaction.values[0], null, true);
        await interaction.update({content: 'Giveaway ended successfully.', components: []});
    }
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'giveaway') return;
    const moduleStrings = interaction.client.configurations['giveaways']['strings'];

    const giveaway = await client.models['giveaways']['Giveaway'].findOne({
        where: {
            messageID: interaction.message.id
        }
    });

    if (giveaway.requirements.length === 0) return await enterUser();

    const [failedRequirements, notPassedRequirementsString] = await checkRequirements(interaction.member, giveaway);
    if (failedRequirements) {
        interaction.reply(embedType(moduleStrings['requirementsNotPassed'], {
            '%requirements%': notPassedRequirementsString
        }, {ephemeral: true}));
    } else await enterUser();

    /**
     * Enters this user to this giveaway
     * @private
     * @returns {Promise<void>}
     */
    async function enterUser() {
        if (giveaway.entries[interaction.user.id]) return await interaction.reply(embedType(moduleStrings.alreadyEnteredMessage, {
            '%price%': giveaway.price,
            '%entries%': calculateUserEntries(interaction.member)
        }, {ephemeral: true}));
        const entries = giveaway.entries;
        giveaway.entries = {}; // Thx sequelize
        entries[interaction.user.id] = calculateUserEntries(interaction.member);
        giveaway.entries = entries;
        await giveaway.save();
        await interaction.reply(embedType(moduleStrings.confirmationMessage, {
            '%price%': giveaway.price,
            '%entries%': calculateUserEntries(interaction.member)
        }, {ephemeral: true}));

        const enteredUsers = [];
        let totalEntries = 0;
        for (const userID in entries) {
            totalEntries = totalEntries + entries[userID];
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
                if (r.type === 'messages') requirementString = requirementString + `• Must have ${r.messageCount} new messages (check with \`/gmessages\`)\n`;
                if (r.type === 'roles') {
                    let rolesString = ''; // Surely there is a better way to to this kind of stuff, but I am to stupid to find it
                    r.roles.forEach(rID => rolesString = rolesString + `<@&${rID}> `);
                    requirementString = requirementString + `• Must have one of this roles to enter: ${rolesString}\n`;
                }
            });

            await interaction.message.edit(await embedType(moduleStrings['giveaway_message_with_requirements'], {
                '%prize%': giveaway.prize,
                '%winners%': giveaway.winnerCount,
                '%requirements%': requirementString,
                '%sponsorLink%': giveaway.sponsorWebsite || 'None',
                '%endAt%': formatDate(endAt),
                '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
                '%organiser%': `<@${giveaway.organiser}>`,
                '%entryCount%': interaction.channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : totalEntries,
                '%enteredCount%': interaction.channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : enteredUsers.length
            }, {components}));
        } else {
            await interaction.message.edit(await embedType(moduleStrings['giveaway_message'], {
                '%prize%': giveaway.prize,
                '%winners%': giveaway.winnerCount,
                '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
                '%endAt%': formatDate(endAt),
                '%sponsorLink%': giveaway.sponsorWebsite || 'None',
                '%organiser%': `<@${giveaway.organiser}>`,
                '%entryCount%': interaction.channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : totalEntries,
                '%enteredCount%': interaction.channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : enteredUsers.length
            }, {components}));
        }
    }
};