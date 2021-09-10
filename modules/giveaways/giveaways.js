const {formatDate, randomElementFromArray} = require('../../src/functions/helpers');
const {scheduleJob} = require('node-schedule');
const {embedType} = require('../../src/functions/helpers');
const {confDir} = require('../../main');

/**
 * Create a new giveaway
 * @param {User} organiser User who organized this giveaway
 * @param {Channel} channel Channel in which this giveaway should take place
 * @param {String} prize Prize which should be given away
 * @param {Date} endAt Date on which the giveaway should end
 * @param {Number} winners Count of winners the bot should select
 * @param {Array<Object>} requirements Array of requirements
 * @param {String} sponsorLink Link to the sponsor's website (if applicable)
 * @returns {Promise<void>}
 */
module.exports.createGiveaway = async function (organiser, channel, prize, endAt, winners, requirements = [], sponsorLink = null) {
    const moduleStrings = channel.client.configurations['giveaways']['strings'];
    let m;
    const components = [{
        type: 'ACTION_ROW',
        components: [{type: 'BUTTON', label: moduleStrings.buttonContent, style: 'PRIMARY', customId: 'giveaway'}]
    }];
    if (requirements.length === 0) m = await channel.send(await embedType(moduleStrings['giveaway_message'], {
        '%prize%': prize,
        '%winners%': winners,
        '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
        '%endAt%': formatDate(endAt),
        '%sponsorLink%': sponsorLink || 'None',
        '%organiser%': `<@${organiser.id}>`,
        '%entryCount%': channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : 0,
        '%enteredCount%': channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : 0
    }, {components}));
    else {
        let requirementString = '';
        requirements.forEach((r) => {
            if (r.type === 'messages') requirementString = requirementString + `• Must have ${r.messageCount} new messages (check with \`/gmessages\`)\n`;
            if (r.type === 'roles') {
                let rolesString = ''; // Surely there is a better way to to this kind of stuff, but I am to stupid to find it
                r.roles.forEach(rID => rolesString = rolesString + `<@&${rID}> `);
                requirementString = rolesString + `• Must have one of this roles to enter: ${rolesString}\n`;
            }
        });
        m = await channel.send(await embedType(moduleStrings['giveaway_message_with_requirements'], {
            '%prize%': prize,
            '%winners%': winners,
            '%requirements%': requirementString,
            '%sponsorLink%': sponsorLink || 'None',
            '%endAt%': formatDate(endAt),
            '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
            '%organiser%': `<@${organiser.id}>`,
            '%entryCount%': channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : 0,
            '%enteredCount%': channel.type === 'GUILD_NEWS' ? 'Not supported for news-channels' : 0
        }, {components}));
    }
    const dbItem = await channel.client.models['giveaways']['Giveaway'].create({
        endAt: endAt.getTime(),
        winnerCount: winners,
        prize: prize,
        requirements: requirements,
        countMessages: !!requirements.find(e => e.type === 'messages'),
        messageCount: {},
        sponsorWebsite: sponsorLink,
        organiser: organiser.id,
        messageID: m.id,
        channelID: channel.id
    });
    const job = scheduleJob(endAt, async () => {
        await endGiveaway(dbItem.id, job, true);
    });
    channel.client.jobs.push(job);
};

/**
 * Ends a giveaway
 * @param {Number} gID ID of the giveaway to end
 * @param {Job} job Job which should get canceled after the giveaway ends
 * @param {Boolean} checkIfGiveawayEnded If enabled the function will return early when this giveaway already ended
 * @param {Number} maxWinCount Number of persons who can win this giveaway (overwrites Giveaway.winner)
 * @returns {Promise<void>}
 */
async function endGiveaway(gID, job = null, checkIfGiveawayEnded = false, maxWinCount = null) {
    const {client} = require('../../main');
    const moduleStrings = client.configurations['giveaways']['strings'];
    const moduleConfig = client.configurations['giveaways']['config'];

    const giveaway = await client.models['giveaways']['Giveaway'].findOne({
        where: {
            id: gID
        }
    });
    if (!giveaway) return;
    if (job) job.cancel();
    if (checkIfGiveawayEnded && giveaway.ended) return;

    const channel = await client.channels.fetch(giveaway.channelID).catch(() => {
    });
    if (!channel) return;
    const message = await channel.messages.fetch(giveaway.messageID).catch(() => {
    });
    if (!message) return;

    const winners = [];
    let userEntries = [];
    let enteredUsers = 0;

    for (const id in giveaway.entries) {
        const member = await channel.guild.members.fetch(id).catch(() => {
        });
        if (!member) continue;
        const [failedReqCheck] = await checkRequirements(member, giveaway);
        if (failedReqCheck) continue;
        enteredUsers++;
        for (let i = 0; i < calculateUserEntries(member); i++) userEntries.push(id);
    }

    const entries = userEntries.length;
    if (userEntries.length === 0) {
        await editMessage('None');
        return await message.reply(embedType(moduleStrings['no_winner_message'], {
            '%prize%': giveaway.prize,
            '%sponsorLink%': giveaway.sponsorWebsite || 'None',
            '%organiser%': `<@${giveaway.organiser}>`
        }, {}));
    }


    if (maxWinCount) giveaway.winnerCount = maxWinCount;
    if (enteredUsers < giveaway.winnerCount) giveaway.winnerCount = enteredUsers;

    for (let winnerCount = 0; winnerCount < giveaway.winnerCount; winnerCount++) {
        const winner = randomElementFromArray(userEntries);
        winners.push(winner);
        userEntries = userEntries.filter(u => u !== winner);
    }


    let winnersstring = '';
    winners.forEach(winner => {
        winnersstring = winnersstring + `<@${winner}> `;
    });

    await message.reply(await embedType(moduleStrings['winner_message'], {
        '%prize%': giveaway.prize,
        '%winners%': winnersstring,
        '%sponsorLink%': giveaway.sponsorWebsite || 'None',
        '%organiser%': `<@${giveaway.organiser}>`
    }));

    await editMessage(winnersstring);

    if (moduleConfig.sendDMOnWin) {
        for (const winnerID of winners) {
            const member = channel.guild.members.cache.get(winnerID);
            if (member) member.send(await embedType(moduleStrings['winner_DM_message'], {
                '%prize%': giveaway.prize,
                '%winners%': winnersstring,
                '%sponsorLink%': giveaway.sponsorWebsite || 'None',
                '%organiser%': `<@${giveaway.organiser}>`,
                '%url%': message.url
            })).catch(() => {
            });
        }
    }

    /**
     * Edits the message if needed
     * @private
     * @param {String} winners Winnerstring
     * @returns {Promise<void>}
     */
    async function editMessage(winnerString) {
        const endAt = new Date(parseInt(giveaway.endAt));
        if (!maxWinCount) {
            const components = [{
                type: 'ACTION_ROW',
                components: [{
                    type: 'BUTTON',
                    label: moduleStrings.buttonContent,
                    style: 'PRIMARY',
                    customId: 'giveaway',
                    disabled: true
                }]
            }];
            await message.edit(
                await embedType(moduleStrings['giveaway_message_edit_after_winning'], {
                    '%prize%': giveaway.prize,
                    '%endAt%': formatDate(endAt),
                    '%endAtDiscordFormation%': `<t:${(endAt.getTime() / 1000).toFixed(0)}:R>`,
                    '%winners%': winnerString,
                    '%sponsorLink%': giveaway.sponsorWebsite || 'None',
                    '%organiser%': `<@${giveaway.organiser}>`,
                    '%entryCount%': entries,
                    '%enteredCount%': enteredUsers
                }, {components})
            );
            giveaway.ended = true;
            giveaway.save();
        }
    }

    if (job) job.cancel();
}

module.exports.endGiveaway = endGiveaway;

/**
 * Checks if a [GuildMember](https://discord.js.org/#/docs/main/stable/class/GuildMember) passes the requirements for a giveaway
 * @param {GuildMember} member Guild member
 * @param {Object} giveaway Giveaway in which the user has to pass the requiremetns
 * @returns {Promise<Array>} Returns array with these values: 1. if the users passes the requirements 2. Which requirements where not passed in a human-readable string
 */
async function checkRequirements(member, giveaway) {
    let failedRequirements = false;
    let notPassedRequirementsString = '';
    const moduleConfig = require(`${confDir}/giveaways/config.json`);
    if (member.roles.cache.find(r => (moduleConfig.bypassRoles || []).includes(r.id))) {
        return [failedRequirements, notPassedRequirementsString];
    }
    for (const requirement of giveaway.requirements) {
        switch (requirement.type) {
            case 'roles':
                let passedRoleRequirement = false;
                let rolesString = '';
                for (const r of requirement.roles) {
                    rolesString = rolesString + `<@&${r}> `;
                    if (member.roles.cache.get(r)) passedRoleRequirement = true;
                }
                if (!passedRoleRequirement) {
                    notPassedRequirementsString = notPassedRequirementsString + `\t• Have one of these roles: ${rolesString}\n`;
                    failedRequirements = true;
                }
                break;
            case 'messages':
                if (!giveaway.messageCount[member.user.id]) giveaway.messageCount[member.user.id] = 0;
                if (parseInt(giveaway.messageCount[member.user.id]) < parseInt(requirement.messageCount)) {
                    notPassedRequirementsString = notPassedRequirementsString + `\t• Have at least ${requirement.messageCount} new messages (${giveaway.messageCount[member.user.id]}/${requirement.messageCount})\n`;
                    failedRequirements = true;
                }
                break;
        }
    }
    return [failedRequirements, notPassedRequirementsString];
}

module.exports.checkRequirements = checkRequirements;

/**
 * Calculate the entries of a GuildMember
 * @param {GuildMember} member [GuildMember](https://discord.js.org/#/docs/main/stable/class/GuildMember)
 * @returns {number} Entries this user has
 */
function calculateUserEntries(member) {
    const moduleConfig = member.client.configurations['giveaways']['config'];
    let entries = 1;
    for (const rID in moduleConfig.multipleEntries) {
        if (member.roles.cache.get(rID)) entries = entries + moduleConfig.multipleEntries[rID];
    }
    return entries;
}

module.exports.calculateUserEntries = calculateUserEntries;