const {localize} = require('../../../src/functions/localize');
const {ComponentType, MessageEmbed} = require('discord.js');
const {safeSetFooter} = require('../../../src/functions/helpers');

const DUEL_ACTION_ORDER = ['reload', 'guard', 'gun'];

/**
 * Sorts a pair of duel actions by their canonical priority (reload < guard < gun).
 * The sorted pair, joined with '-', is the key used to look up the round result.
 * @param {String} a First player's action
 * @param {String} b Second player's action
 * @returns {Array<String>} The two actions in canonical order
 */
function sortDuelAnswers(a, b) {
    return [a, b].sort((x, y) => DUEL_ACTION_ORDER.indexOf(x) - DUEL_ACTION_ORDER.indexOf(y));
}

/**
 * The duel ends when one player shoots (gun) while the other was reloading.
 * @param {Array<String>} sortedAnswers Pair of actions in canonical order
 * @returns {Boolean} Whether this round ends the game
 */
function isDuelGameOver(sortedAnswers) {
    return sortedAnswers.join('-') === 'reload-gun';
}

module.exports.sortDuelAnswers = sortDuelAnswers;
module.exports.isDuelGameOver = isDuelGameOver;

module.exports.run = async function (interaction) {
    const options = interaction.options;
    let opponent = typeof options.getUser === 'function' ? options.getUser('user') : null;
    if (!opponent) {
        const userOption = options._hoistedOptions?.find(option => option.name === 'user');
        if (userOption?.value) opponent = await interaction.client.users.fetch(userOption.value);
    }
    if (!opponent) return interaction.reply({
        ephemeral: true,
        content: '⚠️ The selected user could not be resolved. Please run /duel again and select a user.'
    });
    if (opponent.id === interaction.user.id) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('duel', 'self-invite-not-possible', {r: `<@${(interaction.guild.members.cache.filter(u => u.presence && u.user.id !== interaction.user.id && !u.user.bot).random() || {user: {id: 'RickAstley'}}).user.id}>`})
    });
    const rep = await interaction.reply({
        content: localize('duel', 'challenge-message', {
            t: opponent.toString(),
            u: interaction.user.toString()
        }) + '\n*' + localize('duel', 'how-does-this-game-work') + '*',
        allowedMentions: {
            users: [opponent.id]
        },
        fetchReply: true,
        components: [
            {
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        style: 'PRIMARY',
                        customId: 'duel-accept-invite',
                        label: localize('duel', 'accept-invite')
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: 'duel-deny-invite',
                        label: localize('duel', 'deny-invite')
                    }
                ]
            }
        ]
    });
    let started = false;
    let ended = false;
    let endReason = null;
    let currentAnswers = {};
    const bullets = {};
    const guardAfterEachOther = {};
    bullets[interaction.user.id] = 0;
    bullets[opponent.id] = 0;
    guardAfterEachOther[interaction.user.id] = 0;
    guardAfterEachOther[opponent.id] = 0;
    const a = rep.createMessageComponentCollector({componentType: ComponentType.Button, time: 600000});
    setTimeout(() => {
        if (started || a.ended) return;
        endReason = localize('duel', 'invite-expired', {u: interaction.user.toString(), i: opponent.toString()});
        a.stop();
    }, 120000);

    let lastRoundString = '';

    a.on('collect', (i) => {
        if (!started) {
            if (i.user.id !== opponent.id) return i.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('duel', 'you-are-not-the-invited-one')
            });
            if (i.customId === 'duel-deny-invite') {
                endReason = localize('duel', 'invite-denied', {
                    u: interaction.user.toString(),
                    i: opponent.toString()
                });
                return a.stop();
            }
            started = true;
        }

        if (!i.customId.includes('invite')) {
            if (i.user.id !== interaction.user.id && i.user.id !== opponent.id) return i.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('duel', 'not-your-game')
            });
            const action = i.customId.replaceAll('duel-', '');
            if (currentAnswers[i.user.id]) {
                if (currentAnswers[i.user.id] === 'gun') bullets[i.user.id]++;
                if (currentAnswers[i.user.id] === 'reload') bullets[i.user.id]--;
            }
            if (action === 'reload') {
                if (bullets[i.user.id] === 5) return i.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('duel', 'bullets-full')
                });
                bullets[i.user.id]++;
            }
            if (action === 'gun') {
                if (bullets[i.user.id] === 0) return i.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('duel', 'no-bullets')
                });
                else bullets[i.user.id]--;
            }
            currentAnswers[i.user.id] = action;

            if (currentAnswers[opponent.id] && currentAnswers[interaction.user.id]) {
                guardAfterEachOther[opponent.id] = currentAnswers[opponent.id] === 'guard' ? (guardAfterEachOther[opponent.id] + 1) : 0;
                guardAfterEachOther[interaction.user.id] = currentAnswers[interaction.user.id] === 'guard' ? (guardAfterEachOther[interaction.user.id] + 1) : 0;
                let guardOver = false;
                if (currentAnswers[opponent.id] === 'gun' && guardAfterEachOther[interaction.user.id] >= 5) currentAnswers[interaction.user.id] = 'reload';
                if (currentAnswers[interaction.user.id] === 'gun' && guardAfterEachOther[opponent.id] >= 5) currentAnswers[opponent.id] = 'reload';
                if ((currentAnswers[interaction.user.id] === 'gun' && guardAfterEachOther[opponent.id] >= 5) || currentAnswers[opponent.id] === 'gun' && guardAfterEachOther[interaction.user.id] >= 5) guardOver = true;
                const answers = sortDuelAnswers(currentAnswers[opponent.id], currentAnswers[interaction.user.id]);
                const params = {};
                const actionTo = {
                    'reload': 'r',
                    'guard': 'd',
                    'gun': 'g'
                };
                params[actionTo[currentAnswers[opponent.id]] + '1'] = opponent.toString();
                params[actionTo[currentAnswers[interaction.user.id]] + (params[actionTo[currentAnswers[interaction.user.id]] + '1'] ? '2' : '1')] = interaction.user.toString();
                lastRoundString = localize('duel', (guardOver ? 'guard-over-' : '') + answers.join('-'), params);
                if (isDuelGameOver(answers)) ended = true;
                currentAnswers = {};
            }
        }


        let stateString = '\n\n' + localize('duel', 'what-do-you-want-to-do') + `\n${opponent.toString()}: ${localize('duel', currentAnswers[opponent.id] ? 'ready' : 'pending')}\n${interaction.user.toString()}: ${localize('duel', currentAnswers[interaction.user.id] ? 'ready' : 'pending')}\n\n${localize('duel', 'continues-info')}`;

        let mentions = undefined;
        if (!ended && !currentAnswers[interaction.user.id] && currentAnswers[opponent.id]) mentions = [interaction.user.id];
        if (!ended && !currentAnswers[opponent.id] && currentAnswers[interaction.user.id]) mentions = [opponent.id];
        const embed = new MessageEmbed()
            .setTitle(localize('duel', ended ? 'game-ended' : 'game-running-header'))
            .setColor(ended ? 0x2ECC71 : (!mentions ? 0xD35400 : 0xE67E22))
            .setDescription(lastRoundString + (!ended ? stateString : '\n\n' + localize('duel', 'ended-state')) + '\n*' + localize('duel', 'how-does-this-game-work') + '*');
        safeSetFooter(embed, interaction.client);

        i.update({
            content: ended ? 'GGs!' : `<@${opponent.id}> vs <@${interaction.user.id}>`,
            embeds: [
                embed
            ],
            allowedMentions: {
                users: mentions
            },
            components: ended ? [] : [
                {
                    type: 'ACTION_ROW',
                    components: [
                        {
                            type: 'BUTTON',
                            customId: 'duel-gun',
                            style: 'SECONDARY',
                            emoji: '🔫',
                            label: localize('duel', 'use-gun')
                        },
                        {
                            type: 'BUTTON',
                            customId: 'duel-guard',
                            style: 'SECONDARY',
                            emoji: '🛡️',
                            label: localize('duel', 'guard')
                        },
                        {
                            type: 'BUTTON',
                            customId: 'duel-reload',
                            style: 'SECONDARY',
                            emoji: '🔄',
                            label: localize('duel', 'reload')
                        }
                    ]
                }
            ]
        });
    });
    a.on('end', () => {
        if (!ended) rep.edit({
                content: endReason,
                components: []
        }).catch(() => {
        });
        }
    );
};


module.exports.config = {
    name: 'duel',
    description: localize('duel', 'command-description'),

    options: [
        {
            type: 'USER',
            required: true,
            name: 'user',
            description: localize('duel', 'user-description')
        }
    ]
};
