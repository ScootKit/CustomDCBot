const {localize} = require('../../../src/functions/localize');
const {ComponentType, MessageEmbed} = require('discord.js');

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('user', true);
    if (member.user.id === interaction.user.id) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('duel', 'self-invite-not-possible', {r: `<@${(interaction.guild.members.cache.filter(u => u.presence && u.user.id !== interaction.user.id && !u.user.bot).random() || {user: {id: 'RickAstley'}}).user.id}>`})
    });
    const rep = await interaction.reply({
        content: localize('duel', 'challenge-message', {
            t: member.toString(),
            u: interaction.user.toString()
        }) + '\n*' + localize('duel', 'how-does-this-game-work') + '*',
        allowedMentions: {
            users: [member.user.id]
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
    bullets[member.user.id] = 0;
    guardAfterEachOther[interaction.user.id] = 0;
    guardAfterEachOther[member.user.id] = 0;
    const a = rep.createMessageComponentCollector({componentType: ComponentType.Button});
    setTimeout(() => {
        if (started || a.ended) return;
        endReason = localize('duel', 'invite-expired', {u: interaction.user.toString(), i: member.toString()});
        a.stop();
    }, 120000);

    let lastRoundString = '';

    a.on('collect', (i) => {
        if (!started) {
            if (i.user.id !== member.id) return i.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('duel', 'you-are-not-the-invited-one')
            });
            if (i.customId === 'duel-deny-invite') {
                endReason = localize('duel', 'invite-denied', {
                    u: interaction.user.toString(),
                    i: member.toString()
                });
                return a.stop();
            }
            started = true;
        }

        if (!i.customId.includes('invite')) {
            if (i.user.id !== interaction.user.id && i.user.id !== member.user.id) return i.reply({
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

            if (currentAnswers[member.user.id] && currentAnswers[interaction.user.id]) {
                guardAfterEachOther[member.user.id] = currentAnswers[member.user.id] === 'guard' ? (guardAfterEachOther[member.user.id] + 1) : 0;
                guardAfterEachOther[interaction.user.id] = currentAnswers[interaction.user.id] === 'guard' ? (guardAfterEachOther[interaction.user.id] + 1) : 0;
                let guardOver = false;
                if (currentAnswers[member.user.id] === 'gun' && guardAfterEachOther[interaction.user.id] >= 5) currentAnswers[interaction.user.id] = 'reload';
                if (currentAnswers[interaction.user.id] === 'gun' && guardAfterEachOther[member.user.id] >= 5) currentAnswers[member.user.id] = 'reload';
                if ((currentAnswers[interaction.user.id] === 'gun' && guardAfterEachOther[member.user.id] >= 5) || currentAnswers[member.user.id] === 'gun' && guardAfterEachOther[interaction.user.id] >= 5) guardOver = true;
                const answers = [currentAnswers[member.user.id], currentAnswers[interaction.user.id]].sort((a, b) => ['reload', 'guard', 'gun'].indexOf(a) - ['reload', 'guard', 'gun'].indexOf(b));
                const params = {};
                const actionTo = {
                    'reload': 'r',
                    'guard': 'd',
                    'gun': 'g'
                };
                params[actionTo[currentAnswers[member.user.id]] + '1'] = member.user.toString();
                params[actionTo[currentAnswers[interaction.user.id]] + (params[actionTo[currentAnswers[interaction.user.id]] + '1'] ? '2' : '1')] = interaction.user.toString();
                lastRoundString = localize('duel', (guardOver ? 'guard-over-' : '') + answers.join('-'), params);
                if (answers.join('-') === 'reload-gun') ended = true;
                currentAnswers = {};
            }
        }


        let stateString = '\n\n' + localize('duel', 'what-do-you-want-to-do') + `\n${member.toString()}: ${localize('duel', currentAnswers[member.user.id] ? 'ready' : 'pending')}\n${interaction.user.toString()}: ${localize('duel', currentAnswers[interaction.user.id] ? 'ready' : 'pending')}\n\n${localize('duel', 'continues-info')}`;

        let mentions = undefined;
        if (!ended && !currentAnswers[interaction.user.id] && currentAnswers[member.user.id]) mentions = [interaction.user.id];
        if (!ended && !currentAnswers[member.user.id] && currentAnswers[interaction.user.id]) mentions = [member.user.id];
        const embed = new MessageEmbed()
            .setTitle(localize('duel', ended ? 'game-ended' : 'game-running-header'))
            .setColor(ended ? 0x2ECC71 : (!mentions ? 0xD35400 : 0xE67E22))
            .setDescription(lastRoundString + (!ended ? stateString : '\n\n' + localize('duel', 'ended-state')) + '\n*' + localize('duel', 'how-does-this-game-work') + '*')
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl});

        i.update({
            content: ended ? 'GGs!' : `<@${member.user.id}> vs <@${interaction.user.id}>`,
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
            rep.edit({
                content: endReason,
                components: []
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
