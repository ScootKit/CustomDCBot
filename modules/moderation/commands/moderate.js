const {localize} = require('../../../src/functions/localize');
const {
    embedType, dateToDiscordTimestamp, lockChannel, unlockChannel,
    sendMultipleSiteButtonMessage, truncate
} = require('../../../src/functions/helpers');
const {moderationAction} = require('../moderationActions');
const durationParser = require('parse-duration');
const {MessageEmbed} = require('discord.js');
const {Op} = require('sequelize');
let guildBanCache;

module.exports.beforeSubcommand = async function (interaction) {
    if (interaction.options.getUser('user')) {
        interaction.memberToExecuteUpon = interaction.options.getMember('user');
        if (!interaction.memberToExecuteUpon) {
            if (interaction.options['_subcommand'] !== 'ban') return interaction.reply({
                ephemeral: true,
                content: '⚠ ' + localize('moderation', 'user-not-on-server')
            });
            else {
                interaction.userNotOnServer = true;
                interaction.memberToExecuteUpon = {
                    user: interaction.options.getUser('user'),
                    id: interaction.options.getUser('user').id,
                    notFound: true
                };
            }
        }
        if (interaction.memberToExecuteUpon.user.id === interaction.client.user.id) {
            interaction.memberToExecuteUpon = null;
            return interaction.reply({
                ephemeral: true,
                content: '[I\'m sorry, Dave, I\'m afraid I can\'t do that.](https://youtu.be/7qnd-hdmgfk)'
            });
        }
    }
};

/**
 * Fetches the notes of a user and returns `false` when system already responded
 * @private
 * @param {Interaction} interaction Interaction
 * @returns {Promise<boolean|Model>} Object of notesUser
 */
async function fetchNotesUser(interaction) {
    if (interaction.replied) return false;
    if (interaction.options.getUser('user').id === interaction.user.id) {
        interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('moderation', 'not-allowed-to-see-own-notes')
        });
        return false;
    }
    let notesUser = await interaction.client.models['moderation']['UserNotes'].findOne({
        where: {
            userID: interaction.options.getUser('user').id
        }
    });
    if (!notesUser) notesUser = await interaction.client.models['moderation']['UserNotes'].create({
        userID: interaction.options.getUser('user').id,
        notes: []
    });
    return notesUser;
}

module.exports.subcommands = {
    'notes': {
        'view': async function (interaction) {
            const notesUser = await fetchNotesUser(interaction);
            if (!notesUser) return;
            const byUser = {};
            let i = 0;
            for (const note of notesUser.notes.filter(n => n.content !== '[deleted]').reverse()) {
                if (!byUser[note.authorID]) {
                    i++;
                    if (i > 24) continue;
                    byUser[note.authorID] = [];
                }
                byUser[note.authorID].push(note);
            }
            const fields = [];
            for (const userID in byUser) {
                const userTag = (interaction.guild.members.cache.get(userID) || {user: {tag: userID}}).user.tag;
                let notesString = '';
                for (const note of byUser[userID]) {
                    notesString = notesString + `\n#${note.id}: ${dateToDiscordTimestamp(new Date(note.lastUpdateAt), 'R')}: \`${note.content.replaceAll('`', '')}\``;
                }
                fields.push({
                    name: localize('moderation', 'user-notes-field-title', {t: userTag}),
                    value: truncate(notesString, 1024)
                });
            }
            if (fields.length === 0) fields.push({
                name: localize('moderation', 'info-field-title'),
                value: localize('moderation', 'no-notes-found')
            });
            if (fields.length === 24) fields.push({
                name: localize('moderation', 'info-field-title'),
                value: localize('moderation', 'more-notes', {x: i - 24})
            });
            const embed = new MessageEmbed()
                .setTitle(localize('moderation', 'notes-embed-title', {u: interaction.options.getUser('user').tag}))
                .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
                .setThumbnail(interaction.options.getUser('user').avatarURL())
                .setColor('GREEN')
                .setAuthor({name: interaction.client.user.username, iconURL: interaction.client.user.avatarURL()})
                .setFields(fields);
            interaction.reply({
                ephemeral: true,
                embeds: [embed]
            });
        },
        'create': async function (interaction) {
            const notesUser = await fetchNotesUser(interaction);
            if (!notesUser) return;
            const notes = notesUser.notes;
            notesUser.notes = [];
            notes.push({
                content: interaction.options.getString('notes'),
                lastUpdateAt: new Date().getTime(),
                createdAt: new Date().getTime(),
                authorID: interaction.user.id,
                id: notes.length + 1
            });
            notesUser.notes = notes;
            await notesUser.save();
            return interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'note-added')
            });
        },
        'edit': async function (interaction) {
            const notesUser = await fetchNotesUser(interaction);
            if (!notesUser) return;
            const notes = notesUser.notes;
            notesUser.notes = [];
            const noteIndex = notes.findIndex(n => n.id === interaction.options.getInteger('note-id'));
            const note = notes[noteIndex];
            if (!note || (note || {}).authorID !== interaction.user.id) return interaction.reply({
                ephemeral: true,
                content: '⚠ ' + localize('moderation', 'note-not-found-or-no-permissions')
            });
            notes[noteIndex] = {
                content: interaction.options.getString('notes'),
                lastUpdateAt: new Date().getTime(),
                createdAt: note.createdAt,
                authorID: interaction.user.id,
                id: note.id
            };
            notesUser.notes = notes;
            await notesUser.save();
            return interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'note-edited')
            });
        },
        'delete': async function (interaction) {
            const notesUser = await fetchNotesUser(interaction);
            if (!notesUser) return;
            const notes = notesUser.notes;
            notesUser.notes = [];
            const noteIndex = notes.findIndex(n => n.id === interaction.options.getInteger('note-id'));
            const note = notes[noteIndex];
            if (!note || (note || {}).authorID !== interaction.user.id) return interaction.reply({
                ephemeral: true,
                content: '⚠ ' + localize('moderation', 'note-not-found-or-no-permissions')
            });
            notes[noteIndex] = {
                content: '[deleted]',
                lastUpdateAt: new Date().getTime(),
                createdAt: note.createdAt,
                authorID: interaction.user.id,
                id: note.id
            };
            notesUser.notes = notes;
            await notesUser.save();
            return interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'note-deleted')
            });
        }
    },
    'ban': function (interaction) {
        if (interaction.replied) return;
        if (!interaction.userNotOnServer) if (!checkRoles(interaction, 4)) return;
        const parseDuration = interaction.options.getString('duration') ? new Date(new Date().getTime() + durationParser(interaction.options.getString('duration'))) : null;
        if (interaction.options.getInteger('days')) if (interaction.options.getInteger('days') < 0 || interaction.options.getInteger('days') > 7) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('moderation', 'invalid-days')
        });
        moderationAction(interaction.client, 'ban', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {days: interaction.options.getInteger('days')}, parseDuration).then(r => {
            guildBanCache = null;
            if (r) {
                if (parseDuration) interaction.reply({
                    ephemeral: true,
                    content: localize('moderation', 'expiring-action-done', {d: dateToDiscordTimestamp(parseDuration), i: r.actionID})
                });
                else interaction.reply({
                    ephemeral: true,
                    content: localize('moderation', 'action-done', {i: r.actionID})
                });
            } else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'unban': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 4)) return;
        moderationAction(interaction.client, 'unban', interaction.member, interaction.options.getString('id'), interaction.options.getString('reason')).then(r => {
            guildBanCache = null;
            if (r) interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'clear': function (interaction) {
        if (!checkRoles(interaction, 3)) return;
        interaction.channel.bulkDelete(interaction.options.getInteger('amount') || 50, true).then(() => {
            interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'cleared-channel')
            }).catch(() => {
                interaction.reply({
                    ephemeral: true,
                    content: '⚠ ' + localize('moderation', 'clear-failed')
                });
            });
        });
    },
    'quarantine': function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        const parseDuration = interaction.options.getString('duration') ? new Date(new Date().getTime() + durationParser(interaction.options.getString('duration'))) : null;
        moderationAction(interaction.client, 'quarantine', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {roles: Array.from(interaction.options.getMember('user').roles.cache.keys())}, parseDuration).then(r => {
            if (r) {
                if (parseDuration) interaction.reply({
                    ephemeral: true,
                    content: localize('moderation', 'expiring-action-done', {d: dateToDiscordTimestamp(parseDuration), i: r.actionID})
                });
                else interaction.reply({
                    ephemeral: true,
                    content: localize('moderation', 'action-done', {i: r.actionID})
                });
            } else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'unquarantine': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        const lastAction = await interaction.client.models['moderation']['ModerationAction'].findOne({
            where: {
                victimID: interaction.memberToExecuteUpon.user.id,
                type: 'quarantine'
            },
            order: [['createdAt', 'DESC']]
        });
        if (!lastAction) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('moderation', 'no-quarantine-action-found')
        });
        if (!(lastAction.additionalData.roles instanceof Array)) lastAction.additionalData.roles = [];
        moderationAction(interaction.client, 'unquarantine', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {roles: lastAction.additionalData.roles || []}).then(r => {
            if (r) {
                interaction.reply({ephemeral: true, content: localize('moderation', 'action-done', {i: r.actionID})});
            } else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'kick': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        moderationAction(interaction.client, 'kick', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason')).then(r => {
            if (r) interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'mute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        const parseDuration = new Date(new Date().getTime() + durationParser(interaction.options.getString('duration')));
        if (durationParser(interaction.options.getString('duration')) > 2419200000) return interaction.reply({
            ephemeral: true,
            content: '⚠ ' + localize('moderation', 'mute-max-duration')
        });
        moderationAction(interaction.client, 'mute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {}, parseDuration).then(r => {
            if (r) interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'unmute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        moderationAction(interaction.client, 'unmute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason')).then(r => {
            if (r) interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'warn': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        moderationAction(interaction.client, 'warn', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason')).then(r => {
            if (r) interaction.reply({
                ephemeral: true,
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    },
    'lock': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        await lockChannel(interaction.channel, [...interaction.client.configurations['moderation']['config']['moderator-roles_level2'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level3'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level4']], `[moderation] ${interaction.options.getString('reason') || localize('moderation', 'no-reason')}`);
        await interaction.channel.send(embedType(interaction.client.configurations['moderation']['strings']['lock_channel_message'], {
            '%user%': interaction.user.tag,
            '%reason%': interaction.options.getString('reason') || localize('moderation', 'no-reason')
        }));
        await interaction.reply({
            ephemeral: true,
            content: localize('moderation', 'locked-channel-successfully')
        });
    },
    'unlock': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        await unlockChannel(interaction.channel, localize('moderation', 'unlock-audit-log-reason'));
        await interaction.channel.send(embedType(interaction.client.configurations['moderation']['strings']['unlock_channel_message'], {
            '%user%': interaction.user.tag
        }));
        await interaction.reply({
            ephemeral: true,
            content: localize('moderation', 'unlocked-channel-successfully')
        });
    },
    'actions': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        const actions = await interaction.client.models['moderation']['ModerationAction'].findAll({
            where: {
                victimID: interaction.memberToExecuteUpon.id
            },
            order: [['createdAt', 'DESC']]
        });
        const sites = [];
        let fieldCount = 0;
        let fieldCache = [];
        actions.forEach(action => {
            fieldCount++;
            fieldCache.push({
                name: `#${action.actionID}: ${action.type}`,
                value: localize('moderation', 'action-description-format', {
                    reason: action.reason,
                    u: action.memberID,
                    t: dateToDiscordTimestamp(new Date(action.createdAt))
                })
            });
            if (fieldCount % 3 === 0) {
                addSite(fieldCache);
                fieldCache = [];
            }
        });
        if (fieldCache.length !== 0) addSite(fieldCache);
        if (sites.length === 0) addSite([{
            name: localize('moderation', 'no-actions-title'),
            value: localize('moderation', 'no-actions-title', {u: interaction.memberToExecuteUpon.user.tag})
        }]);

        /**
         * Adds a new site
         * @private
         * @param fs
         */
        function addSite(fs) {
            const embed = new MessageEmbed()
                .setColor('YELLOW')
                .setAuthor({name: interaction.client.user.username, iconURL: interaction.client.user.avatarURL()})
                .setTitle(localize('moderation', 'actions-embed-title', {
                    u: interaction.memberToExecuteUpon.user.tag,
                    i: sites.length + 1
                }))
                .setDescription(localize('moderation', 'actions-embed-description', {u: interaction.memberToExecuteUpon.user.tag}))
                .setThumbnail(interaction.memberToExecuteUpon.user.avatarURL())
                .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
                .addFields(fs);
            sites.push(embed);
        }

        sendMultipleSiteButtonMessage(interaction.channel, sites, [interaction.user.id], interaction);
    },
    'revoke-warn': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        const action = await interaction.client.models['moderation']['ModerationAction'].findOne({
            where: {
                actionID: interaction.options.getString('warn-id')
            }
        });
        if (!action) return interaction.reply({
            ephemeral: true,
            content: localize('moderation', 'warning-not-found')
        });
        moderationAction(interaction.client, 'unwarn', interaction.member, {
            id: interaction.options.getString('warn-id'),
            user: {id: interaction.options.getString('warn-id'), tag: 'Unknown'}
        }, interaction.options.getString('reason')).then(async r => {
            if (r) {
                await action.destroy();
                interaction.reply({ephemeral: true, content: localize('moderation', 'action-done', {i: r.actionID})});
            } else interaction.reply({ephemeral: true, content: '⚠ ' + r});
        }).catch((r) => {
            interaction.reply({ephemeral: true, content: '⚠ ' + r});
        });
    }
};

module.exports.autoComplete = {
    'revoke-warn': {
        'warn-id': async function (interaction) {
            const actions = await interaction.client.models['moderation']['ModerationAction'].findAll({
                where: {
                    victimID: {
                        [Op.not]: interaction.user.id
                    }
                }
            });
            const returnValue = [];
            interaction.value = interaction.value.toLowerCase();
            for (const action of actions.filter(a => a.reason.toLowerCase().includes(interaction.value) || a.victimID.includes(interaction.value) || a.type.toLowerCase().includes(interaction.value) || (interaction.client.guild.members.cache.get(a.victimID) || {user: {tag: a.victimID}}).user.tag.toLowerCase().includes(interaction.value))) {
                if (returnValue.length !== 25) returnValue.push({
                    value: action.actionID.toString(),
                    name: truncate(`[${action.type}] ${(interaction.client.guild.members.cache.get(action.victimID) || {user: {tag: action.victimID}}).user.tag}: ${action.reason}`, 100)
                });
            }
            interaction.respond(returnValue);
        }
    },
    'unban': {
        'id': async function (interaction) {
            if (!guildBanCache) {
                guildBanCache = await interaction.guild.bans.fetch();
                setTimeout(() => {
                    guildBanCache = null;
                }, 300000);
            }
            interaction.value = interaction.value.toLowerCase();
            const possibleValues = [];
            for (const match of guildBanCache.filter(b => b.user.tag.toLowerCase().includes(interaction.value) || b.user.username.toLowerCase().includes(interaction.value) || b.user.id.includes(interaction.value)).values()) {
                if (possibleValues.length !== 25) possibleValues.push({
                    name: match.user.tag,
                    value: match.user.id
                });
            }
            interaction.respond(possibleValues);
        }
    }
};

/**
 * Check if the user has the required roles
 * @private
 * @param {Interaction} interaction Interaction to perform action on
 * @param {Number} minLevel Required mod-level
 * @return {boolean}
 */
function checkRoles(interaction, minLevel) {
    let allowedRoles = [];
    for (let i = 1; i <= 5 - minLevel; i++) {
        allowedRoles = allowedRoles.concat(interaction.client.configurations['moderation']['config'][`moderator-roles_level${5 - i}`]);
    }
    if (!interaction.member.roles.cache.find(r => allowedRoles.includes(r.id))) {
        interaction.reply(embedType(interaction.client.configurations['moderation']['strings']['no_permissions'], {
            '%required_level%': minLevel
        }, {ephemeral: true}));
        return false;
    }
    if (!interaction.memberToExecuteUpon) return true;
    if (interaction.memberToExecuteUpon.roles.cache.find(r => allowedRoles.includes(r.id))) {
        interaction.reply(embedType(interaction.client.configurations['moderation']['strings']['this_is_a_mod'], {
            '%required_level%': minLevel
        }, {ephemeral: true}));
        return false;
    }
    return true;
}

module.exports.config = {
    name: 'moderate',
    description: localize('moderation', 'moderate-command-description'),
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND_GROUP',
            name: 'notes',
            description: localize('moderation', 'moderate-notes-command-description'),
            options: [
                {
                    type: 'SUB_COMMAND',
                    name: 'view',
                    description: localize('moderation', 'moderate-notes-command-view'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            required: true,
                            description: localize('moderation', 'moderate-user-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'create',
                    description: localize('moderation', 'moderate-notes-command-create'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            required: true,
                            description: localize('moderation', 'moderate-user-description')
                        },
                        {
                            type: 'STRING',
                            name: 'notes',
                            required: true,
                            description: localize('moderation', 'moderate-notes-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'edit',
                    description: localize('moderation', 'moderate-notes-command-edit'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            required: true,
                            description: localize('moderation', 'moderate-user-description')
                        },
                        {
                            type: 'INTEGER',
                            name: 'note-id',
                            required: true,
                            description: localize('moderation', 'moderate-note-id-description')
                        },
                        {
                            type: 'STRING',
                            name: 'notes',
                            required: true,
                            description: localize('moderation', 'moderate-notes-description')
                        }
                    ]
                },
                {
                    type: 'SUB_COMMAND',
                    name: 'delete',
                    description: localize('moderation', 'moderate-notes-command-delete'),
                    options: [
                        {
                            type: 'USER',
                            name: 'user',
                            required: true,
                            description: localize('moderation', 'moderate-user-description')
                        },
                        {
                            type: 'INTEGER',
                            name: 'note-id',
                            required: true,
                            description: localize('moderation', 'moderate-note-id-description')
                        }
                    ]
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'ban',
            description: localize('moderation', 'moderate-ban-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('moderation', 'moderate-duration-description')
                },
                {
                    type: 'INTEGER',
                    name: 'days',
                    required: false,
                    description: localize('moderation', 'moderate-days-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'quarantine',
            description: localize('moderation', 'moderate-quarantine-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: false,
                    description: localize('moderation', 'moderate-duration-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'unban',
            description: localize('moderation', 'moderate-unban-command-description'),
            options: function (client) {
                return [{
                    type: 'STRING',
                    name: 'id',
                    required: true,
                    autocomplete: true,
                    description: localize('moderation', 'moderate-userid-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'unquarantine',
            description: localize('moderation', 'moderate-unquarantine-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'clear',
            description: localize('moderation', 'moderate-clear-command-description'),
            options: [{
                type: 'INTEGER',
                name: 'amount',
                required: false,
                description: localize('moderation', 'moderate-clear-amount-description')
            }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'kick',
            description: localize('moderation', 'moderate-kick-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'mute',
            description: localize('moderation', 'moderate-mute-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'duration',
                    required: true,
                    description: localize('moderation', 'moderate-duration-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'unmute',
            description: localize('moderation', 'moderate-unmute-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'warn',
            description: localize('moderation', 'moderate-warn-command-description'),
            options: function (client) {
                return [{
                    type: 'USER',
                    name: 'user',
                    required: true,
                    description: localize('moderation', 'moderate-user-description')
                },
                {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'actions',
            description: localize('moderation', 'moderate-actions-command-description'),
            options: [{
                type: 'USER',
                name: 'user',
                required: true,
                description: localize('moderation', 'moderate-user-description')
            }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'revoke-warn',
            description: localize('moderation', 'moderate-unwarn-command-description'),
            options: function (client) {
                return [{
                    type: 'STRING',
                    name: 'warn-id',
                    required: true,
                    autocomplete: true,
                    description: localize('moderation', 'moderate-warnid-description')
                }, {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'lock',
            description: localize('moderation', 'moderate-lock-command-description'),
            options: function (client) {
                return [
                    {
                        type: 'STRING',
                        name: 'reason',
                        required: client.configurations['moderation']['config']['require_reason'],
                        description: localize('moderation', 'moderate-reason-description')
                    }
                ];
            }
        },
        {
            type: 'SUB_COMMAND',
            name: 'unlock',
            description: localize('moderation', 'moderate-unlock-command-description')
        }
    ]
};