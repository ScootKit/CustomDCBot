const {localize} = require('../../../src/functions/localize');
const {MessageEmbed} = require('discord.js');

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('المستخدم', true);
    if (member.user.id === interaction.user.id) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('نزال', 'دعوة-نفسك-غير-ممكنة', {r: `<@${((await interaction.guild.members.fetch({withPresences: true})).filter(u => u.presence && u.user.id !== interaction.user.id && !u.user.bot).random() || {user: {id: 'RickAstley'}}).user.id}>`})
    });
    const rep = await interaction.reply({
        content: localize('نزال', 'رسالة-التحدي', {
            t: member.toString(),
            u: interaction.user.toString()
        }) + '\n*' + localize('duel', 'ازاي-اللعبة-دي-بتشتغل') + '*',
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
                        customId: 'اقبل-دعوة-النزال',
                        label: localize('duel', 'اقبل-الدعوة')
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: 'ارفض-دعوة-النزال',
                        label: localize('duel', 'ارفض-الدعوة')
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
    const a = rep.createMessageComponentCollector({componentType: 'BUTTON'});
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
                content: '⚠️ ' + localize('duel', 'انت-مش-الشخص-المدعو')
            });
            if (i.customId === 'duel-deny-invite') {
                endReason = localize('duel', 'الدعوة-مرفوضة', {
                    u: interaction.user.toString(),
                    i: member.toString()
                });
                return a.stop();
            }
            started = true;
        }

        if (!i.customId.includes('دعوة')) {
            if (i.user.id !== interaction.user.id && i.user.id !== member.user.id) return i.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('duel', 'مش-دورك')
            });
            const action = i.customId.replaceAll('duel-', '');
            if (currentAnswers[i.user.id]) {
                if (currentAnswers[i.user.id] === 'gun') bullets[i.user.id]++;
                if (currentAnswers[i.user.id] === 'reload') bullets[i.user.id]--;
            }
            if (action === 'reload') {
                if (bullets[i.user.id] === 5) return i.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('duel', 'الخزنة-مليانة')
                });
                bullets[i.user.id]++;
            }
            if (action === 'gun') {
                if (bullets[i.user.id] === 0) return i.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('duel', 'الخزنة-فاضية')
                });
                else bullets[i.user.id]--;
            }
            currentAnswers[i.user.id] = action;

            if (currentAnswers[member.user.id] && currentAnswers[interaction.user.id]) {
                guardAfterEachOther[member.user.id] = currentAnswers[member.user.id] === 'احرس' ? (guardAfterEachOther[member.user.id] + 1) : 0;
                guardAfterEachOther[interaction.user.id] = currentAnswers[interaction.user.id] === 'احرس' ? (guardAfterEachOther[interaction.user.id] + 1) : 0;
                let guardOver = false;
                if (currentAnswers[member.user.id] === 'اضرب' && guardAfterEachOther[interaction.user.id] >= 5) currentAnswers[interaction.user.id] = 'اعادة-تلقيم';
                if (currentAnswers[interaction.user.id] === 'اضرب' && guardAfterEachOther[member.user.id] >= 5) currentAnswers[member.user.id] = 'اعادة-تلقيم';
                if ((currentAnswers[interaction.user.id] === 'اضرب' && guardAfterEachOther[member.user.id] >= 5) || currentAnswers[member.user.id] === 'gun' && guardAfterEachOther[interaction.user.id] >= 5) guardOver = true;
                const answers = [currentAnswers[member.user.id], currentAnswers[interaction.user.id]].sort((a, b) => ['reload', 'guard', 'gun'].indexOf(a) - ['اعادة-تلقيم', 'احرس', 'اضرب'].indexOf(b));
                const params = {};
                const actionTo = {
                    'اعادة-تلقيم': 'r',
                    'احرس': 'd',
                    'اضرب': 'g'
                };
                params[actionTo[currentAnswers[member.user.id]] + '1'] = member.user.toString();
                params[actionTo[currentAnswers[interaction.user.id]] + (params[actionTo[currentAnswers[interaction.user.id]] + '1'] ? '2' : '1')] = interaction.user.toString();
                lastRoundString = localize('duel', (guardOver ? 'الحماية-انتهت' : '') + answers.join('-'), params);
                if (answers.join('-') === 'اعد-تلقيم-المسدس') ended = true;
                currentAnswers = {};
            }
        }


        let stateString = '\n\n' + localize('نزال', 'ايه-خطوتك-الجاية') + `\n${member.toString()}: ${localize('duel', currentAnswers[member.user.id] ? 'مستعد' : 'pending')}\n${interaction.user.toString()}: ${localize('نزال', currentAnswers[interaction.user.id] ? 'مستعد' : 'pending')}\n\n${localize('duel', 'معلومات-استكمال')}`;

        let mentions = undefined;
        if (!ended && !currentAnswers[interaction.user.id] && currentAnswers[member.user.id]) mentions = [interaction.user.id];
        if (!ended && !currentAnswers[member.user.id] && currentAnswers[interaction.user.id]) mentions = [member.user.id];
        const embed = new MessageEmbed()
            .setTitle(localize('نزال', ended ? 'اللعبة-انتهت' : 'game-running-header'))
            .setColor(ended ? 0x2ECC71 : (!mentions ? 0xD35400 : 0xE67E22))
            .setDescription(lastRoundString + (!ended ? stateString : '\n\n' + localize('نزال', 'ended-state')) + '\n*' + localize('duel', 'ازاي-بتشتغل-اللعبة') + '*')
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
                            customId: 'اضرب-نار',
                            style: 'SECONDARY',
                            emoji: '🔫',
                            label: localize('نزال', 'استعمل-السلاح')
                        },
                        {
                            type: 'BUTTON',
                            customId: 'احمى-نفسك',
                            style: 'SECONDARY',
                            emoji: '🛡️',
                            label: localize('نزال', 'احرس')
                        },
                        {
                            type: 'BUTTON',
                            customId: 'اعادة-تلقيم',
                            style: 'SECONDARY',
                            emoji: '🔄',
                            label: localize('نزال', 'اعادة-تلقيم')
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
    name: 'نزال',
    description: localize('نزال', 'وصف-الأمر'),

    options: [
        {
            type: 'المستخدم',
            required: true,
            name: 'المستخدم',
            description: localize('نزال', 'وصف-المستخدم')
        }
    ]
};
