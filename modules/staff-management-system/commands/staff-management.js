const { MessageFlags, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { embedTypeV2 } = require('../../../src/functions/helpers');
const { localize } = require('../../../src/functions/localize');
const {
    applyFooter,
    issueInfraction,
    getInfractionHistory,
    issueSuspension,
    voidInfraction,
    promoteUser,
    getPromotionHistory,
    submitReview,
    getReviewHistory,
    startActivityCheck,
    endActivityCheckProcess,
    generateUserPanel
} = require('../staff-management');

function canManageChecks(client, member) {
    if (member.permissions.has('Administrator')) return true;
    const config = client.configurations['staff-management-system']['configuration'] || {};
    const supRoles = config.supervisorRoles || [];
    const mgmtRoles = config.managementRoles || [];
    return member.roles.cache.some(r => supRoles.includes(r.id) || mgmtRoles.includes(r.id));
}

async function handleProfileView(client, interaction, targetUser) {
    const config = client.configurations['staff-management-system']['profiles'];
    if (!config || !config.enableProfiles) return interaction.editReply({
        content: localize('staff-management-system', 'err-prof-dis')
    });

    if (!config.profileEmbedMessage) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-prof-cfg')
        });
    }

    const user = targetUser || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply({
        content: localize('staff-management-system', 'err-no-mem')
    });

    const restrictToStaff = config.onlyAllowStaffProfile !== false;
    if (restrictToStaff) {
        const generalConfig = client.configurations['staff-management-system']['configuration'] || {};

        const staffRoles = Array.isArray(generalConfig.staffRoles)
            ? generalConfig.staffRoles
            : (generalConfig.staffRoles
                    ? [generalConfig.staffRoles]
            : []
        );
        const supRoles = Array.isArray(generalConfig.supervisorRoles)
            ? generalConfig.supervisorRoles
            : (generalConfig.supervisorRoles
                    ? [generalConfig.supervisorRoles]
            : []
        );
        const mgmtRoles = Array.isArray(generalConfig.managementRoles)
            ? generalConfig.managementRoles
            : (generalConfig.managementRoles
                    ? [generalConfig.managementRoles]
            : []
        );

        const allStaffRoles = [...staffRoles, ...supRoles, ...mgmtRoles];
        const isAdmin = member.permissions.has('Administrator');
        const isStaff = allStaffRoles.length > 0 && member.roles.cache.some(r => allStaffRoles.includes(r.id));

        if (!isAdmin && !isStaff) {
            if (user.id === interaction.user.id) {
                return interaction.editReply({
                    content: localize('staff-management-system', 'err-prof-no-own')
                });
            } else {
                return interaction.editReply({
                    content: localize('staff-management-system', 'err-prof-no-tgt')
                });
            }
        }
    }

    const Profile = client.models['staff-management-system']['StaffProfile'];
    const Review = client.models['staff-management-system']['StaffReview'];

    const [profile] = await Profile.findOrCreate({
        where: {userId: user.id}
    });

    const reviewsConfig = client.configurations['staff-management-system']['reviews'];
    const reviewsEnabled = reviewsConfig && reviewsConfig.enableReviews;

    let ratingDisplay = localize('staff-management-system', 'rev-dis-text');
    if (reviewsEnabled) {
        let avgRatingText = localize('staff-management-system', 'rev-no-rate');
        const allReviews = await Review.findAll({
            where: {targetId: user.id},
            attributes: ['stars']
        });
        if (allReviews.length > 0) {
            avgRatingText = (allReviews.reduce((a, b) => a + b.stars, 0) / allReviews.length).toFixed(1);
        }
        ratingDisplay = `⭐ ${avgRatingText}`;
    }

    let discordStatus = localize('staff-management-system', 'stat-offl');
    if (member.presence) {
        switch (member.presence.status) {
            case 'online': discordStatus = localize('staff-management-system', 'stat-onl'); break;
            case 'idle': discordStatus = localize('staff-management-system', 'stat-idl'); break;
            case 'dnd': discordStatus = localize('staff-management-system', 'stat-dnd'); break;
            case 'offline': discordStatus = localize('staff-management-system', 'stat-offl'); break;
        }
    }

    const statusLines = [discordStatus];
    if (profile.onDuty) statusLines.push(localize('staff-management-system', 'stat-prof-ond'));
    if (profile.activityStatus === 'LOA') statusLines.push(localize('staff-management-system', 'stat-prof-loa'));
    if (profile.activityStatus === 'RA') statusLines.push(localize('staff-management-system', 'stat-prof-ra'));

    const introText = profile.customIntro || localize('staff-management-system', 'prof-no-intro');
    const nicknameText = profile.customNickname || user.username;

    const placeholders = {
        '%user-mention%': user.toString(),
        '%username%': user.username,
        '%nickname%': nicknameText,
        '%intro%': introText,
        '%status%': statusLines.join('\n'),
        '%rating%': ratingDisplay,
        '%avatar%': user.displayAvatarURL({
            dynamic: true,
            format: 'png',
            size: 1024
        }) || ''
    };

    let embedTemplate = config.profileEmbedMessage;
    let msgOpts = await embedTypeV2(embedTemplate, placeholders);

    if (!msgOpts) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-prof-empty')
        });
    }

    await interaction.editReply(msgOpts);
}

async function handleProfileEdit(client, interaction) {
    const config = client.configurations['staff-management-system']['profiles'];
    if (!config || !config.enableProfiles) return interaction.reply({
        content: localize('staff-management-system', 'err-prof-dis'),
        flags: MessageFlags.Ephemeral
    });

    const restrictToStaff = config.onlyAllowStaffProfile !== false;
    if (restrictToStaff) {
        const generalConfig = client.configurations['staff-management-system']['configuration'] || {};

        const staffRoles = Array.isArray(generalConfig.staffRoles)
            ? generalConfig.staffRoles
            : (generalConfig.staffRoles
                    ? [generalConfig.staffRoles]
            : []
        );
        const supRoles = Array.isArray(generalConfig.supervisorRoles)
            ? generalConfig.supervisorRoles
            : (generalConfig.supervisorRoles
                    ? [generalConfig.supervisorRoles]
            : []
        );
        const mgmtRoles = Array.isArray(generalConfig.managementRoles)
            ? generalConfig.managementRoles
            : (generalConfig.managementRoles
                    ? [generalConfig.managementRoles]
            : []
        );

        const allStaffRoles = [
            ...staffRoles,
            ...supRoles,
            ...mgmtRoles
        ];

        const isAdmin = interaction.member.permissions.has('Administrator');
        const hasStaffRole = allStaffRoles.length > 0 && interaction.member.roles.cache.some(r => allStaffRoles.includes(r.id));

        if (!isAdmin && !hasStaffRole) {
            return interaction.reply({
                content: localize('staff-management-system', 'err-prof-perm'),
                flags: MessageFlags.Ephemeral
            });
        }
    }

    const Profile = client.models['staff-management-system']['StaffProfile'];
    const profile = await Profile.findByPk(interaction.user.id);

    const modal = new ModalBuilder()
        .setCustomId(`staff-mgmt_profile-edit`)
        .setTitle(localize('staff-management-system', 'prof-edit-title'));

    modal.addComponents(
        new ActionRowBuilder()
        .addComponents(
            new TextInputBuilder()
            .setCustomId('nickname')
            .setLabel(localize('staff-management-system', 'prof-edit-nick'))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(profile?.customNickname || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
            .setCustomId('intro')
            .setLabel(localize('staff-management-system', 'prof-edit-intro'))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(profile?.customIntro || '')
        )
    );

    return interaction.showModal(modal);
}

async function handleProfileAdminWipe(client, interaction, targetUser) {
    const profilesConfig = client.configurations['staff-management-system']['profiles'];
    const generalConfig = client.configurations['staff-management-system']['configuration'] || {};

    if (!profilesConfig || !profilesConfig.enableProfiles) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-prof-dis')
        });
    }

    const mRoles = Array.isArray(generalConfig.managementRoles)
        ? generalConfig.managementRoles
        : (generalConfig.managementRoles
                ? [generalConfig.managementRoles]
        : []
    );
    const sRoles = Array.isArray(generalConfig.supervisorRoles)
        ? generalConfig.supervisorRoles
        : (generalConfig.supervisorRoles
                ? [generalConfig.supervisorRoles]
        : []
    );

    const requiredRoles = profilesConfig.managePermission === 'Management'
        ? mRoles
    : [...sRoles, ...mRoles];

    const isAdmin = interaction.member.permissions.has('Administrator');
    const hasRequiredRole = requiredRoles.length > 0 && interaction.member.roles.cache.some(r => requiredRoles.includes(r.id));

    if (!isAdmin && !hasRequiredRole) {
        return interaction.editReply({
            content: localize('staff-management-system', 'err-no-perm')
        });
    }

    const Profile = client.models['staff-management-system']['StaffProfile'];
    await Profile.update({
            customNickname: null,
            customIntro: null
        },
        {
            where: {userId: targetUser.id}
    });

    await interaction.editReply({
        content: localize('staff-management-system', 'succ-prof-wipe', {u: targetUser.username})
    });
}

module.exports.autoComplete = {
    'infraction': {
        'issue': {
            'type': async function (interaction) {
                const config = interaction.client.configurations['staff-management-system']['infractions'] || {};
                const types = config.infractionTypes && config.infractionTypes.length > 0
                    ? config.infractionTypes
                : ['Warning', 'Strike'];

                const focusedValue = interaction.options.getFocused() || '';
                const filtered = types.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase()));
                await interaction.respond(filtered.slice(0, 25).map(choice => ({ name: choice, value: choice })));
            }
        }
    }
};

module.exports.subcommands = {
    'panel': async (i) => {
        const user = i.options.getUser('user');
        const payload = await generateUserPanel(i.client, user);
        await i.reply({
            ...payload,
            flags: MessageFlags.Ephemeral
        });
    },
    'infraction': {
        'issue': async (i) => {
            const user = i.options.getMember('user');
            const type = i.options.getString('type');
            const reason = i.options.getString('reason');
            const expiry = i.options.getString('expiry');
            await issueInfraction(i.client, i, user, type, reason, expiry);
        },
        'suspend': async (i) => {
            const user = i.options.getMember('user');
            const duration = i.options.getString('duration');
            const reason = i.options.getString('reason');
            await issueSuspension(i.client, i, user, duration, reason);
        },
        'history': async (i) => {
            const user = i.options.getUser('user');
            await getInfractionHistory(i.client, i, user);
        },
        'void': async (i) => {
            const caseId = i.options.getString('reference');
            await voidInfraction(i.client, i, caseId);
        }
    },
    'promotion': {
        'promote': async (i) => {
            const user = i.options.getMember('user');
            const role = i.options.getRole('rank');
            const reason = i.options.getString('reason');
            await promoteUser(i.client, i, user, role, reason);
        },
        'history': async (i) => {
            const user = i.options.getUser('user');
            await getPromotionHistory(i.client, i, user);
        }
    },
    'activity-check': {
        'start': async (i) => {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            if (!canManageChecks(i.client, i.member)) return i.editReply({
                content: localize('staff-management-system', 'err-no-perm')
            });
            await startActivityCheck(i.client, i, false);
        },
        'view': async (i) => {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            if (!canManageChecks(i.client, i.member)) return i.editReply({
                content: localize('staff-management-system', 'err-no-perm')
            });

            const ActivityCheck = i.client.models['staff-management-system']['ActivityCheck'];
            const ActivityCheckResponse = i.client.models['staff-management-system']['ActivityCheckResponse'];
            const activeCheck = await ActivityCheck.findOne({
                where: {status: 'ACTIVE'}
            });

            if (!activeCheck) {
                const config = i.client.configurations['staff-management-system']['activity-checks'] || {};
                const generalConfig = i.client.configurations['staff-management-system']['configuration'] || {};
                let logChannelId = config.logChannel;
                if (!logChannelId || (Array.isArray(logChannelId) && logChannelId.length === 0)) logChannelId = generalConfig.generalLogChannel;
                if (Array.isArray(logChannelId)) logChannelId = logChannelId[0];

                const channelPing = logChannelId
                    ? `<#${logChannelId}>`
                    : localize('staff-management-system', 'lbl-log-chan');

                return i.editReply({
                    content: localize('staff-management-system', 'info-ac-none', {c: channelPing})
                });
            }

            const responseCount = await ActivityCheckResponse.count({
                where: { activityCheckId: activeCheck.id }
            });

            const embed = applyFooter(i.client, new EmbedBuilder()
                .setTitle(localize('staff-management-system', 'ac-live-title'))
                .setColor('Blue')
                .setDescription(
                    `**${localize('staff-management-system', 'general-ends')}:** <t:${Math.floor(new Date(activeCheck.endTime).getTime() / 1000)}:R>\n` +
                    `**${localize('staff-management-system', 'general-chan')}:** <#${activeCheck.channelId}>\n` +
                    `**${localize('staff-management-system', 'ac-tot-res')}:** ${responseCount}`
                )
            );
            await i.editReply({
                embeds: [embed]
            });
        },
        'end': async (i) => {
            await i.deferReply({ flags: MessageFlags.Ephemeral });
            if (!canManageChecks(i.client, i.member)) return i.editReply({
                content: localize('staff-management-system', 'err-no-perm')
            });

            const ActivityCheck = i.client.models['staff-management-system']['ActivityCheck'];
            const activeCheck = await ActivityCheck.findOne({ where: { status: 'ACTIVE' } });

            if (!activeCheck) return i.editReply({
                content: localize('staff-management-system', 'err-ac-noact')
            });

            await endActivityCheckProcess(i.client, activeCheck);
            await i.editReply({
                content: localize('staff-management-system', 'succ-ac-end')
            });
        }
    },
    'profile': {
        'view': async (i) => {
            await i.deferReply({
                flags: MessageFlags.Ephemeral
            });
            const user = i.options.getUser('user') || i.user;
            await handleProfileView(i.client, i, user);
        },
        'edit': async (i) => {
            await handleProfileEdit(i.client, i);
        },
        'wipe': async (i) => {
            await i.deferReply({
                flags: MessageFlags.Ephemeral
            });
            const user = i.options.getUser('user');
            await handleProfileAdminWipe(i.client, i, user);
        }
    },
    'review': {
        'submit': async (i) => {
            const user = i.options.getUser('user');
            const stars = i.options.getInteger('stars');
            const comment = i.options.getString('comment');
            await submitReview(i.client, i, user, stars, comment);
        },
        'history': async (i) => {
            const user = i.options.getUser('user') || i.user;
            await getReviewHistory(i.client, i, user);
        }
    }
};

module.exports.config = {
    name: 'staff-management',
    description: localize('staff-management-system', 'cmd-desc-smg'),
    usage: '/staff-management',
    type: 'slash',
    defaultPermission: false,
    options: function (client) {
        const array = [];

        const infractionsConfig = client.configurations['staff-management-system']['infractions'] || {};
        const promotionsConfig = client.configurations['staff-management-system']['promotions'] || {};
        const activityChecksConfig = client.configurations['staff-management-system']['activity-checks'] || {};
        const profilesConfig = client.configurations['staff-management-system']['profiles'] || {};
        const reviewsConfig = client.configurations['staff-management-system']['reviews'] || {};

        array.push({
            type: 'SUB_COMMAND',
            name: 'panel',
            description: localize('staff-management-system', 'cmd-desc-panel'),
            options: [
                {
                    type: 'USER',
                    name: 'user',
                    description: localize('staff-management-system', 'cmd-desc-panel-user'),
                    required: true
                }
            ]
        });

        if (infractionsConfig.enableInfractions) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'infraction',
                description: localize('staff-management-system', 'cmd-desc-infractions'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'issue',
                        description: localize('staff-management-system', 'cmd-desc-issue'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-issue-user'),
                                required: true
                            },
                            {
                                type: 'STRING',
                                name: 'type',
                                description: localize('staff-management-system', 'cmd-desc-issue-type'),
                                required: true,
                                autocomplete: true
                            },
                            {
                                type: 'STRING',
                                name: 'reason',
                                description: localize('staff-management-system', 'cmd-desc-issue-reason'),
                                required: true
                            },
                            {
                                type: 'STRING',
                                name: 'expiry',
                                description: localize('staff-management-system', 'cmd-desc-issue-expiry'),
                                required: false
                            }
                        ]
                    },
                    ...(infractionsConfig.enableSuspensions ? [{
                        type: 'SUB_COMMAND',
                        name: 'suspend',
                        description: localize('staff-management-system', 'cmd-desc-suspend'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-suspend-user'),
                                required: true
                            },
                            {
                                type: 'STRING',
                                name: 'duration',
                                description: localize('staff-management-system', 'cmd-desc-suspend-duration'),
                                required: true
                            },
                            {
                                type: 'STRING',
                                name: 'reason',
                                description: localize('staff-management-system', 'cmd-desc-suspend-reason'),
                                required: true
                            }
                        ]
                    }] : []),
                    {
                        type: 'SUB_COMMAND',
                        name: 'history',
                        description: localize('staff-management-system', 'cmd-desc-history'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-history-user'),
                                required: true
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'void',
                        description: localize('staff-management-system', 'cmd-desc-void'),
                        options: [
                            {
                                type: 'STRING',
                                name: 'reference',
                                description: localize('staff-management-system', 'cmd-desc-void-case-ref'),
                                required: true
                            }
                        ]
                    }
                ]
            });
        }

        if (promotionsConfig.enablePromotions) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'promotion',
                description: localize('staff-management-system', 'cmd-desc-promotion'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'promote',
                        description: localize('staff-management-system', 'cmd-desc-promote'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-promote-user'),
                                required: true
                            },
                            {
                                type: 'ROLE',
                                name: 'rank',
                                description: localize('staff-management-system', 'cmd-desc-promote-rank'),
                                required: true
                            },
                            {
                                type: 'STRING',
                                name: 'reason',
                                description: localize('staff-management-system', 'cmd-desc-promote-reason'),
                                required: true
                            },
                            {
                                type: 'CHANNEL',
                                name: 'channel',
                                description: localize('staff-management-system', 'cmd-desc-promote-channel'),
                                required: false,
                                channelTypes: [0, 5]
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'history',
                        description: localize('staff-management-system', 'cmd-desc-prom-history'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-prom-history-user'),
                                required: true
                            }
                        ]
                    }
                ]
            });
        }

        if (activityChecksConfig.enableActivityChecks) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'activity-check',
                description: localize('staff-management-system', 'cmd-desc-ac'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'start',
                        description: localize('staff-management-system', 'cmd-desc-ac-start'),
                        options: [
                            {
                                type: 'CHANNEL',
                                name: 'channel',
                                description: localize('staff-management-system', 'cmd-desc-ac-start-channel'),
                                required: false,
                                channelTypes: [0]
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'view',
                        description: localize('staff-management-system', 'cmd-desc-ac-view')
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'end',
                        description: localize('staff-management-system', 'cmd-desc-ac-end')
                    }
                ]
            });
        }

        if (profilesConfig.enableProfiles) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'profile',
                description: localize('staff-management-system', 'cmd-desc-profile'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'view',
                        description: localize('staff-management-system', 'cmd-desc-profile-view'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-profile-view-user'),
                                required: false
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'edit',
                        description: localize('staff-management-system', 'cmd-desc-profile-edit')
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'wipe',
                        description: localize('staff-management-system', 'cmd-desc-profile-wipe'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-profile-wipe-user'),
                                required: true
                            }
                        ]
                    }
                ]
            });
        }

        if (reviewsConfig.enableReviews) {
            array.push({
                type: 'SUB_COMMAND_GROUP',
                name: 'review',
                description: localize('staff-management-system', 'cmd-desc-review'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'submit',
                        description: localize('staff-management-system', 'cmd-desc-review-submit'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-review-submit-user'),
                                required: true
                            },
                            {
                                type: 'INTEGER',
                                name: 'stars',
                                description: localize('staff-management-system', 'cmd-desc-review-submit-stars'),
                                required: true,
                                choices: [
                                    {
                                        name: '1 ⭐',
                                        value: 1
                                    },
                                    {
                                        name: '2 ⭐⭐',
                                        value: 2
                                    },
                                    {
                                        name: '3 ⭐⭐⭐',
                                        value: 3
                                    },
                                    {
                                        name: '4 ⭐⭐⭐⭐',
                                        value: 4
                                    },
                                    {
                                        name: '5 ⭐⭐⭐⭐⭐',
                                        value: 5
                                    }
                                ]
                            },
                            {
                                type: 'STRING',
                                name: 'comment',
                                description: localize('staff-management-system', 'cmd-desc-review-submit-comment'),
                                required: true
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'history',
                        description: localize('staff-management-system', 'cmd-desc-review-history'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                description: localize('staff-management-system', 'cmd-desc-review-history-user'),
                                required: false
                            }
                        ]
                    }
                ]
            });
        }

        return array;
    }
};