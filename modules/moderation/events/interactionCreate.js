const {verificationPassed, verificationFail, sendDMPart} = require('./guildMemberAdd');
const {localize} = require('../../../src/functions/localize');
const {ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder} = require('discord.js');
const {embedType} = require('../../../src/functions/helpers');
const durationParser = require('parse-duration');

// In-memory captcha solutions: userId -> { solution, expiresAt }
const pendingCaptchas = new Map();

// Cooldown for captcha image generation: userId -> timestamp of last generation
const captchaGenerationCooldowns = new Map();
const CAPTCHA_GENERATION_COOLDOWN_MS = 60000; // 1 minute

// Clean up expired captchas and cooldowns every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of pendingCaptchas) {
        if (now > data.expiresAt) pendingCaptchas.delete(userId);
    }
    for (const [userId, timestamp] of captchaGenerationCooldowns) {
        if (now - timestamp > 600000) captchaGenerationCooldowns.delete(userId); // cleanup after 10 min max
    }
}, 300000);

const WORD_LIST_EASY = ['RAIN', 'MOON', 'STAR', 'WOLF', 'TREE', 'FIRE', 'GOLD', 'SNOW', 'LAKE', 'ROCK',
    'LEAF', 'BIRD', 'BOOK', 'DOOR', 'RING', 'BLUE', 'CAKE', 'CORN', 'DUST', 'WAVE'];

const WORD_LIST_MEDIUM = ['BRIDGE', 'CASTLE', 'FLOWER', 'GUITAR', 'HARBOR', 'ISLAND', 'JUNGLE', 'KNIGHT', 'LEMON', 'MARBLE',
    'NEEDLE', 'ORANGE', 'PENCIL', 'QUARTZ', 'RABBIT', 'SILVER', 'TURTLE', 'VELVET', 'WALNUT', 'ZENITH',
    'ANCHOR', 'BREEZE', 'CANDLE', 'DESERT', 'EAGLE', 'FOREST', 'GLOBAL', 'HAMMER', 'IVORY', 'JACKET',
    'KITTEN', 'MIRROR', 'NECTAR', 'OYSTER', 'PLANET', 'RAVEN', 'SUNSET', 'THRONE', 'PEARL', 'COMET',
    'TIGER', 'CLOUD', 'PRISM', 'BLAZE', 'FROST', 'DELTA', 'OCEAN', 'STONE', 'VAPOR', 'CEDAR'];

const WORD_LIST_HARD = ['THUNDER', 'HORIZON', 'MYSTERY', 'JOURNEY', 'PROPHET', 'VOYAGER', 'PYRAMID', 'ECLIPSE',
    'COMPASS', 'LAGOON', 'ARCHERY', 'TWILIGHT', 'PARADISE', 'MONARCHY', 'LABYRINTH', 'ALCHEMY',
    'CHEMISTRY', 'OCTOBER', 'CATHEDRAL', 'ORCHESTRA'];

function generateSimpleChallenge(type, difficulty) {
    const level = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    if (type === 'math') {
        let a, b, op, answer;
        if (level === 'easy') {
            a = Math.floor(Math.random() * 10) + 1;
            b = Math.floor(Math.random() * 10) + 1;
            op = Math.random() < 0.5 ? '+' : '-';
            answer = op === '+' ? a + b : a - b;
        } else if (level === 'hard') {
            const ops = ['+', '-', '×'];
            op = ops[Math.floor(Math.random() * ops.length)];
            if (op === '×') {
                a = Math.floor(Math.random() * 12) + 1;
                b = Math.floor(Math.random() * 12) + 1;
                answer = a * b;
            } else {
                a = Math.floor(Math.random() * 100) + 1;
                b = Math.floor(Math.random() * 100) + 1;
                answer = op === '+' ? a + b : a - b;
            }
        } else {
            // medium — current behaviour
            a = Math.floor(Math.random() * 50) + 1;
            b = Math.floor(Math.random() * 50) + 1;
            op = Math.random() < 0.5 ? '+' : '-';
            answer = op === '+' ? a + b : a - b;
        }
        return {question: localize('moderation', 'simple-math-challenge', {a, op, b}), answer: String(answer)};
    }
    // word
    const list = level === 'easy' ? WORD_LIST_EASY : level === 'hard' ? WORD_LIST_HARD : WORD_LIST_MEDIUM;
    const word = list[Math.floor(Math.random() * list.length)];
    return {question: localize('moderation', 'simple-word-challenge', {w: word}), answer: word};
}

module.exports.run = async (client, interaction) => {
    if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return;
    const verificationConfig = client.configurations['moderation']['verification'];

    // === Legacy DM restart button (captcha-dm type) ===
    if (interaction.customId === 'mod-rvp') {
        if (interaction.member.roles.cache.filter(r => verificationConfig['verification-passed-role'].includes(r.id)).size !== 0) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('moderation', 'already-verified')
        });
        sendDMPart(verificationConfig, interaction.member).then(() => {
            interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'restarted-verification')
            });
        }).catch(() => {
            interaction.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('moderation', 'dms-still-disabled', {g: interaction.member.guild.name})
            });
        });
        return;
    }

    // === New "Verify Me" button ===
    if (interaction.customId === 'mod-verify') {
        // Already verified?
        if (verificationConfig['verification-passed-role'] && interaction.member.roles.cache.filter(r => verificationConfig['verification-passed-role'].includes(r.id)).size !== 0) {
            return interaction.reply({ephemeral: true, content: '⚠️ ' + localize('moderation', 'already-verified')});
        }

        const VerificationRequest = client.models['moderation']['VerificationRequest'];
        let request = await VerificationRequest.findOne({
            where: {userID: interaction.user.id},
            order: [['createdAt', 'DESC']]
        });

        // Check cooldown and retries (for captcha / captcha-dm / word / math)
        if (['captcha', 'captcha-dm', 'word', 'math'].includes(verificationConfig.type)) {
            if (!request || request.status === 'approved') {
                request = await VerificationRequest.create({
                    userID: interaction.user.id,
                    type: verificationConfig.type
                });
            }

            // Check max retries — re-execute punishment if somehow missed
            const maxRetries = verificationConfig.maxRetries || 3;
            if (request.attempts >= maxRetries) {
                if (request.status !== 'denied') {
                    await request.update({status: 'denied'});
                    await interaction.deferReply({ephemeral: true});
                    await verificationFail(interaction.member, interaction);
                    return;
                }
                return interaction.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('moderation', 'retries-exhausted')
                });
            }

            // Check cooldown
            if (request.lastAttemptAt) {
                const cooldown = durationParser(verificationConfig.retryCooldown || '5m');
                const lastAttemptTime = new Date(request.lastAttemptAt).getTime();
                const elapsed = Date.now() - lastAttemptTime;
                if (elapsed < cooldown) {
                    const readyAt = Math.ceil((lastAttemptTime + cooldown) / 1000);
                    return interaction.reply(embedType(verificationConfig['cooldown-message'] || localize('moderation', 'cooldown-message'), {'%t%': `<t:${readyAt}:R>`}, {ephemeral: true}));
                }
            }
        }

        // === Captcha type: send ephemeral with image ===
        if (verificationConfig.type === 'captcha') {
            // Cooldown to prevent captcha image generation spam
            const lastGeneration = captchaGenerationCooldowns.get(interaction.user.id);
            if (lastGeneration) {
                const elapsed = Date.now() - lastGeneration;
                if (elapsed < CAPTCHA_GENERATION_COOLDOWN_MS) {
                    const readyAt = Math.ceil((lastGeneration + CAPTCHA_GENERATION_COOLDOWN_MS) / 1000);
                    return interaction.reply(embedType(verificationConfig['cooldown-message'] || localize('moderation', 'cooldown-message'), {'%t%': `<t:${readyAt}:R>`}, {ephemeral: true}));
                }
            }

            await interaction.deferReply({ephemeral: true});
            if (!client.scnxSetup) return interaction.editReply({content: '⚠️ Captcha generation is not available.'});
            const captcha = await require('../../../src/functions/scnx-integration').generateCaptcha(verificationConfig.captchaLevel);
            captchaGenerationCooldowns.set(interaction.user.id, Date.now());

            pendingCaptchas.set(interaction.user.id, {
                solution: captcha.solution,
                expiresAt: Date.now() + 300000 // 5 minutes
            });

            await interaction.editReply({
                ...embedType(verificationConfig['captcha-message'] || localize('moderation', 'captcha-verification-pending')),
                files: [new AttachmentBuilder(captcha.buffer, {name: 'captcha.png'})],
                components: [
                    {
                        type: 1, // ACTION_ROW
                        components: [
                            {
                                type: 2, // BUTTON
                                label: '🔑 ' + localize('moderation', 'enter-solution-button'),
                                customId: 'mod-captcha-solve',
                                style: 1 // PRIMARY
                            }
                        ]
                    }
                ]
            });
            return;
        }

        // === Word / Math type: open modal directly ===
        if (verificationConfig.type === 'word' || verificationConfig.type === 'math') {
            const challenge = generateSimpleChallenge(verificationConfig.type, verificationConfig.captchaLevel);

            pendingCaptchas.set(interaction.user.id, {
                solution: challenge.answer,
                expiresAt: Date.now() + 300000
            });

            const modal = new ModalBuilder()
                .setCustomId('mod-simple-modal')
                .setTitle(localize('moderation', 'verification-modal-title'))
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('answer')
                            .setLabel(challenge.question)
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder(localize('moderation', 'simple-solution-label'))
                    )
                );
            await interaction.showModal(modal);
            return;
        }

        // === Manual type: submit for review ===
        if (verificationConfig.type === 'manual') {
            if (request && request.type === 'manual' && request.status === 'pending') {
                return interaction.reply({
                    ephemeral: true,
                    content: '⏳ ' + localize('moderation', 'already-pending-review')
                });
            }

            if (!request || request.status === 'denied') {
                request = await VerificationRequest.create({userID: interaction.user.id, type: 'manual'});
            }

            await interaction.reply({ephemeral: true, content: localize('moderation', 'verification-submitted')});

            // Post approve/deny in log channel
            const logChannel = interaction.guild.channels.cache.get(verificationConfig['verification-log']);
            if (logChannel) {
                const logMsg = await logChannel.send({
                    embeds: [{
                        title: localize('moderation', 'verification'),
                        color: 0x57F287, // GREEN
                        description: `${localize('moderation', 'user')}: ${interaction.member.toString()} (\`${interaction.user.id}\`)\n${localize('moderation', 'manual-verification-needed')}`
                    }],
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 2,
                                    label: '❌ ' + localize('moderation', 'verification-deny'),
                                    customId: `mod-ver-d-${interaction.user.id}`,
                                    style: 4 // DANGER
                                },
                                {
                                    type: 2,
                                    label: '✅ ' + localize('moderation', 'verification-approve'),
                                    customId: `mod-ver-p-${interaction.user.id}`,
                                    style: 3 // SUCCESS
                                }
                            ]
                        }
                    ]
                });
                await request.update({logMessageID: logMsg.id});
            }
            return;
        }

        // === Button type: one click, no challenge ===
        if (verificationConfig.type === 'button') {
            await verificationPassed(interaction.member, interaction);
            return;
        }

        return;
    }

    // === "Enter Solution" button for captcha type ===
    if (interaction.customId === 'mod-captcha-solve') {
        const pending = pendingCaptchas.get(interaction.user.id);
        if (!pending || Date.now() > pending.expiresAt) {
            pendingCaptchas.delete(interaction.user.id);
            return interaction.reply({ephemeral: true, content: '⚠️ ' + localize('moderation', 'captcha-expired')});
        }

        const modal = new ModalBuilder()
            .setCustomId('mod-captcha-modal')
            .setTitle(localize('moderation', 'verification-modal-title'))
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('answer')
                        .setLabel(localize('moderation', 'captcha-solution-label'))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
        await interaction.showModal(modal);
        return;
    }

    // === Modal submit for captcha ===
    if (interaction.customId === 'mod-captcha-modal') {
        await handleVerificationModalSubmit(client, interaction, verificationConfig);
        return;
    }

    // === Modal submit for simple ===
    if (interaction.customId === 'mod-simple-modal') {
        await handleVerificationModalSubmit(client, interaction, verificationConfig);
        return;
    }

    // === Manual approve/deny buttons ===
    if (!interaction.customId.startsWith('mod-ver-')) return;
    const parsedId = interaction.customId.replace('mod-ver-', '');
    const action = parsedId.split('-')[0];
    const userId = parsedId.split('-')[1];
    const member = await interaction.guild.members.fetch(userId).catch(() => {
    });
    if (!member) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('moderation', 'member-not-found')
    });

    // Update VerificationRequest record
    const VerificationRequest = client.models['moderation']['VerificationRequest'];
    const request = await VerificationRequest.findOne({where: {userID: userId, status: 'pending'}});
    if (request) await request.update({status: action === 'p' ? 'approved' : 'denied'});

    if (action === 'p') await verificationPassed(member);
    else await verificationFail(member);
    await interaction.message.edit({embeds: interaction.message.embeds, components: []});
    await interaction.reply({ephemeral: true, content: localize('moderation', 'verification-update-proceeded')});
};

async function handleVerificationModalSubmit(client, interaction, verificationConfig) {
    const answer = interaction.fields.getTextInputValue('answer').trim();
    const pending = pendingCaptchas.get(interaction.user.id);

    if (!pending || Date.now() > pending.expiresAt) {
        pendingCaptchas.delete(interaction.user.id);
        return interaction.reply({ephemeral: true, content: '⚠️ ' + localize('moderation', 'captcha-expired')});
    }

    const VerificationRequest = client.models['moderation']['VerificationRequest'];
    let request = await VerificationRequest.findOne({where: {userID: interaction.user.id, status: 'pending'}});
    if (!request) {
        const denied = await VerificationRequest.findOne({
            where: {userID: interaction.user.id, status: 'denied'},
            order: [['createdAt', 'DESC']]
        });
        if (denied) {
            const maxRetries = verificationConfig.maxRetries || 3;
            if (denied.attempts >= maxRetries) {
                return interaction.reply({
                    ephemeral: true,
                    content: '⚠️ ' + localize('moderation', 'retries-exhausted')
                });
            }
            request = denied;
            await request.update({status: 'pending'});
        } else {
            request = await VerificationRequest.create({userID: interaction.user.id, type: verificationConfig.type});
        }
    }

    const isCorrect = answer.toUpperCase() === pending.solution.toUpperCase();
    pendingCaptchas.delete(interaction.user.id);

    if (isCorrect) {
        await request.update({status: 'approved'});
        await interaction.deferReply({ephemeral: true});
        await verificationPassed(interaction.member, interaction);
        return;
    }

    // Wrong answer
    const attempts = request.attempts + 1;
    await request.update({attempts, lastAttemptAt: new Date()});

    const maxRetries = verificationConfig.maxRetries || 3;
    if (attempts >= maxRetries) {
        await request.update({status: 'denied'});
        await interaction.deferReply({ephemeral: true});
        await verificationFail(interaction.member, interaction);
        return;
    }

    const cooldownMs = durationParser(verificationConfig.retryCooldown || '5m');
    const cooldownMinutes = Math.ceil(cooldownMs / 60000);
    await interaction.reply({
        ephemeral: true,
        content: '❌ ' + localize('moderation', 'retry-message', {t: cooldownMinutes + 'm', a: attempts, m: maxRetries})
    });
}