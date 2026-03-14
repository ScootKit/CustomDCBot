const {localize} = require('../../../src/functions/localize');
const {
    embedType, dateToDiscordTimestamp, lockChannel, unlockChannel,
    sendMultipleSiteButtonMessage,
    truncate,
    formatDiscordUserName,
    parseEmbedColor,
    safeSetFooter
} = require('../../../src/functions/helpers');
const {moderationAction} = require('../moderationActions');
const {getLinkedGroup, linkAccounts, unlinkAccount, unlinkGroup} = require('../linkedAccounts');
const {activateLockdown, liftLockdown, isLockdownActive} = require('../lockdown');
const durationParser = require('parse-duration');
const {MessageEmbed} = require('discord.js');
const {Op} = require('sequelize');
let guildBanCache;

module.exports.beforeSubcommand = async function (interaction) {
    if (interaction.options.getUser('user')) {
        const targetUser = interaction.options.getUser('user');
        const sub = interaction.options.getSubcommand(false);
        const group = interaction.options.getSubcommandGroup(false);
        if (sub === 'actions' || sub === 'clear-punishments' || group === 'notes') {
            interaction.memberToExecuteUpon = interaction.guild.members.cache.get(targetUser.id) || {
                user: targetUser,
                id: targetUser.id,
                notFound: true
            };
        } else interaction.memberToExecuteUpon = interaction.options.getMember('user');
        if (!interaction.memberToExecuteUpon) {
            if (!['ban', 'actions'].includes(interaction.options['_subcommand'])) return interaction.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('moderation', 'user-not-on-server')
            });
            else {
                interaction.userNotOnServer = true;
                interaction.memberToExecuteUpon = {
                    user: targetUser,
                    id: targetUser.id,
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
    if (!interaction.replied && interaction.options['_subcommand'] !== 'actions') await interaction.deferReply({
        ephemeral: true
    });
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
        interaction.editReply({
            content: '⚠️ ' + localize('moderation', 'not-allowed-to-see-own-notes')
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

function collectLinkedUsers(interaction) {
    const users = [
        interaction.options.getUser('account'),
        interaction.options.getUser('account2'),
        interaction.options.getUser('account3'),
        interaction.options.getUser('account4'),
        interaction.options.getUser('account5')
    ].filter(Boolean);
    const unique = new Map();
    for (const user of users) unique.set(user.id, user);
    return Array.from(unique.values());
}

function formatUserMentions(userIDs) {
    if (!userIDs || userIDs.length === 0) return localize('moderation', 'linked-accounts-none');
    return userIDs.map(id => `<@${id}>`).join(' ');
}

function formatNoteAuthor(userID, interaction) {
    const user = (interaction.guild.members.cache.get(userID) || {user: {tag: userID}}).user;
    let name = formatDiscordUserName(user);
    if (name.startsWith('@')) name = name.slice(1);
    return name;
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
                const userTag = formatDiscordUserName((interaction.guild.members.cache.get(userID) || {user: {tag: userID}}).user);
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
                .setTitle(localize('moderation', 'notes-embed-title', {u: formatDiscordUserName(interaction.options.getUser('user'))}))
                .setThumbnail(interaction.options.getUser('user').avatarURL())
                .setColor(parseEmbedColor('GREEN'))
                .setAuthor({name: interaction.client.user.username, iconURL: interaction.client.user.avatarURL()})
                .setFields(fields);
            safeSetFooter(embed, interaction.client);
            interaction.editReply({
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
            return interaction.editReply({
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
            if (!note || (note || {}).authorID !== interaction.user.id) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'note-not-found-or-no-permissions')
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
            return interaction.editReply({
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
            if (!note || (note || {}).authorID !== interaction.user.id) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'note-not-found-or-no-permissions')
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
            return interaction.editReply({
                content: localize('moderation', 'note-deleted')
            });
        }
    },
    'accounts': {
        'link': async function (interaction) {
            if (!checkRoles(interaction, 3)) return;
            const config = interaction.client.configurations['moderation']['config'];
            if (!config['linked_accounts_enabled']) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'linked-accounts-disabled')
            });
            const main = interaction.options.getUser('main', true);
            const accounts = collectLinkedUsers(interaction);
            if (accounts.length === 0) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'linked-accounts-no-accounts')
            });
            const userIDs = [main.id, ...accounts.map(a => a.id)];
            await linkAccounts(interaction.client, main.id, userIDs, interaction.user.id);

            if (config['linked_accounts_mode'] === 'single') {
                const actionType = config['linked_accounts_single_action'];
                if (actionType && actionType !== 'none') {
                    for (const account of accounts) {
                        if (account.id === main.id) continue;
                        let member = await interaction.guild.members.fetch(account.id).catch(() => null);
                        if (!member && actionType !== 'ban') continue;
                        if (!member && actionType === 'ban') member = {id: account.id, notFound: true, user: {id: account.id, tag: account.id}};
                        let additionalData = {};
                        if (actionType === 'quarantine' && member.roles) {
                            additionalData = {roles: Array.from(member.roles.cache.keys())};
                        }
                        await moderationAction(interaction.client, actionType, interaction.member, member, localize('moderation', 'linked-accounts-single-reason', {m: formatDiscordUserName(main)}), additionalData);
                    }
                }
            }

            return interaction.editReply({
                content: localize('moderation', 'linked-accounts-linked', {
                    m: `<@${main.id}>`,
                    a: formatUserMentions(accounts.map(a => a.id))
                })
            });
        },
        'unlink': async function (interaction) {
            if (!checkRoles(interaction, 3)) return;
            const config = interaction.client.configurations['moderation']['config'];
            if (!config['linked_accounts_enabled']) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'linked-accounts-disabled')
            });
            const user = interaction.options.getUser('user', true);
            await unlinkAccount(interaction.client, user.id);
            return interaction.editReply({
                content: localize('moderation', 'linked-accounts-unlinked', {u: `<@${user.id}>`})
            });
        },
        'clear': async function (interaction) {
            if (!checkRoles(interaction, 3)) return;
            const config = interaction.client.configurations['moderation']['config'];
            if (!config['linked_accounts_enabled']) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'linked-accounts-disabled')
            });
            const main = interaction.options.getUser('main', true);
            await unlinkGroup(interaction.client, main.id);
            return interaction.editReply({
                content: localize('moderation', 'linked-accounts-cleared', {m: `<@${main.id}>`})
            });
        },
        'list': async function (interaction) {
            if (!checkRoles(interaction, 3)) return;
            const config = interaction.client.configurations['moderation']['config'];
            if (!config['linked_accounts_enabled']) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'linked-accounts-disabled')
            });
            const user = interaction.options.getUser('user', true);
            const group = await getLinkedGroup(interaction.client, user.id);
            if (!group) return interaction.editReply({
                content: localize('moderation', 'linked-accounts-none-for-user', {u: `<@${user.id}>`})
            });
            const linked = group.userIDs.filter(id => id !== user.id);
            return interaction.editReply({
                content: localize('moderation', 'linked-accounts-list', {
                    m: `<@${group.mainID}>`,
                    a: formatUserMentions(linked)
                })
            });
        }
    },
    'ban': function (interaction) {
        if (interaction.replied) return;
        if (!interaction.userNotOnServer) if (!checkRoles(interaction, 4)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        const parseDuration = interaction.options.getString('duration') ? new Date(new Date().getTime() + durationParser(interaction.options.getString('duration'))) : null;
        if (interaction.options.getInteger('days')) if (interaction.options.getInteger('days') < 0 || interaction.options.getInteger('days') > 7) return interaction.editReply({
            content: '⚠️ ' + localize('moderation', 'invalid-days')
        });
        moderationAction(interaction.client, 'ban', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {days: interaction.options.getInteger('days')}, parseDuration, interaction.options.getAttachment('proof'), {disableLinkedMirror}).then(r => {
            guildBanCache = null;
            if (r) {
                if (parseDuration) interaction.editReply({
                    content: localize('moderation', 'expiring-action-done', {
                        d: dateToDiscordTimestamp(parseDuration),
                        i: r.actionID
                    })
                });
                else interaction.editReply({
                    content: localize('moderation', 'action-done', {i: r.actionID})
                });
            } else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'unban': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 4)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'unban', interaction.member, interaction.options.getString('id'), interaction.options.getString('reason'), {}, null, null, {disableLinkedMirror}).then(r => {
            guildBanCache = null;
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'clear': function (interaction) {
        if (!checkRoles(interaction, 3)) return;
        interaction.channel.bulkDelete(interaction.options.getInteger('amount') || 50, true).then(() => {
            interaction.editReply({
                content: localize('moderation', 'cleared-channel')
            }).catch(() => {
                interaction.editReply({
                    content: '⚠️ ' + localize('moderation', 'clear-failed')
                });
            });
        });
    },
    'quarantine': function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        const parseDuration = interaction.options.getString('duration') ? new Date(new Date().getTime() + durationParser(interaction.options.getString('duration'))) : null;
        const quarantineRoleId = interaction.client.configurations['moderation']['config']['quarantine-role-id'];
        const roles = Array.from(interaction.memberToExecuteUpon.roles.cache.filter(f => !f.managed).keys()).filter(r => r !== quarantineRoleId);
        moderationAction(interaction.client, 'quarantine', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {roles}, parseDuration, null, {disableLinkedMirror}).then(r => {
            if (r) {
                if (parseDuration) interaction.editReply({
                    content: localize('moderation', 'expiring-action-done', {
                        d: dateToDiscordTimestamp(parseDuration),
                        i: r.actionID
                    })
                });
                else interaction.editReply({
                    content: localize('moderation', 'action-done', {i: r.actionID})
                });
            } else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'unquarantine': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        const lastAction = await interaction.client.models['moderation']['ModerationAction'].findOne({
            where: {
                victimID: interaction.memberToExecuteUpon.user.id,
                type: 'quarantine'
            },
            order: [['createdAt', 'DESC']]
        });
        if (!lastAction) return interaction.editReply({
            ephemeral: true,
            content: '⚠️ ' + localize('moderation', 'no-quarantine-action-found')
        });
        if (!(lastAction.additionalData.roles instanceof Array)) lastAction.additionalData.roles = [];
        moderationAction(interaction.client, 'unquarantine', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {roles: lastAction.additionalData.roles || []}, null, null, {disableLinkedMirror}).then(r => {
            if (r) {
                interaction.editReply({content: localize('moderation', 'action-done', {i: r.actionID})});
            } else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'kick': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 3)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'kick', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {}, null, interaction.options.getAttachment('proof'), {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'mute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        const parseDuration = new Date(new Date().getTime() + durationParser(interaction.options.getString('duration')));
        if (durationParser(interaction.options.getString('duration')) > 2419200000) return interaction.editReply({
            ephemeral: true,
            content: '⚠️ ' + localize('moderation', 'mute-max-duration')
        });
        moderationAction(interaction.client, 'mute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {}, parseDuration, interaction.options.getAttachment('proof'), {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'unmute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'unmute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {}, null, null, {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'warn': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'warn', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {}, null, interaction.options.getAttachment('proof'), {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'channel-mute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'channel-mute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {channel: interaction.channel}, null, interaction.options.getAttachment('proof'), {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'remove-channel-mute': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        const disableLinkedMirror = !!interaction.options.getBoolean('only-target') && interaction.client.configurations['moderation']['config']['linked_accounts_enabled'];
        moderationAction(interaction.client, 'unchannel-mute', interaction.member, interaction.memberToExecuteUpon, interaction.options.getString('reason'), {channel: interaction.channel}, null, null, {disableLinkedMirror}).then(r => {
            if (r) interaction.editReply({
                content: localize('moderation', 'action-done', {i: r.actionID})
            });
            else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    },
    'lockdown': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 4)) return;
        const lockdownConfig = interaction.client.configurations['moderation']['lockdown'];
        if (!lockdownConfig || !lockdownConfig.enabled) return interaction.editReply({
            content: '⚠️ ' + localize('moderation', 'lockdown-not-enabled')
        });
        const enable = interaction.options.getBoolean('enable');
        if (enable) {
            if (await isLockdownActive(interaction.client)) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'lockdown-already-active')
            });
            const reason = interaction.options.getString('reason') || localize('moderation', 'no-reason');
            const result = await activateLockdown(interaction.client, reason, formatDiscordUserName(interaction.user), false);
            if (!result) return interaction.editReply({content: '⚠️ ' + localize('moderation', 'lockdown-already-active')});
            interaction.editReply({content: '🔒 ' + localize('moderation', 'lockdown-activated-reply', {c: result.affectedChannels.toString()})});
        } else {
            if (!await isLockdownActive(interaction.client)) return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'lockdown-not-active')
            });
            const result = await liftLockdown(interaction.client, interaction.options.getString('reason') || localize('moderation', 'no-reason'), formatDiscordUserName(interaction.user));
            if (!result) return interaction.editReply({content: '⚠️ ' + localize('moderation', 'lockdown-not-active')});
            interaction.editReply({content: '🔓 ' + localize('moderation', 'lockdown-lifted-reply', {c: result.restoredChannels.toString()})});
        }
    },
    'lock': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        await lockChannel(interaction.channel, [...interaction.client.configurations['moderation']['config']['moderator-roles_level2'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level3'], ...interaction.client.configurations['moderation']['config']['moderator-roles_level4']], `[moderation] ${interaction.options.getString('reason') || localize('moderation', 'no-reason')}`);
        await interaction.channel.send(embedType(interaction.client.configurations['moderation']['strings']['lock_channel_message'], {
            '%user%': formatDiscordUserName(interaction.user),
            '%reason%': interaction.options.getString('reason') || localize('moderation', 'no-reason')
        }));
        await interaction.editReply({
            ephemeral: true,
            content: localize('moderation', 'locked-channel-successfully')
        });
    },
    'unlock': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 2)) return;
        await unlockChannel(interaction.channel, localize('moderation', 'unlock-audit-log-reason'));
        await interaction.channel.send(embedType(interaction.client.configurations['moderation']['strings']['unlock_channel_message'], {
            '%user%': formatDiscordUserName(interaction.user)
        }));
        await interaction.editReply({
            ephemeral: true,
            content: localize('moderation', 'unlocked-channel-successfully')
        });
    },
    'actions': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        const moduleConfig = interaction.client.configurations['moderation']['config'];
        if (moduleConfig['actions_restrict_channels']) {
            const allowed = moduleConfig['actions_allowed_channels'] || [];
            if (!allowed.includes(interaction.channel.id)) {
                return interaction.editReply({
                    content: '⚠️ ' + localize('moderation', 'actions-channel-not-allowed')
                });
            }
        }
        const targetMember = interaction.memberToExecuteUpon;
        const targetUser = interaction.memberToExecuteUpon.user;
        let linkedGroup = null;
        if (moduleConfig['linked_accounts_enabled']) {
            linkedGroup = await getLinkedGroup(interaction.client, targetUser.id);
        }
        const includeAltActions = !!moduleConfig['dossier_include_alt_actions'];
        const victimIDs = (linkedGroup && includeAltActions) ? linkedGroup.userIDs : [targetUser.id];
        const actions = await interaction.client.models['moderation']['ModerationAction'].findAll({
            where: {victimID: victimIDs},
            order: [['createdAt', 'DESC']]
        });
        const autoModBatchIds = new Set(
            actions
                .filter(a => a.type === 'warn' && a.additionalData && a.additionalData.autoModBatchId)
                .map(a => a.additionalData.autoModBatchId)
        );
        const visibleActions = actions.filter(a => {
            if (a.additionalData && a.additionalData.autoModBatchId && a.type !== 'warn') {
                return !autoModBatchIds.has(a.additionalData.autoModBatchId);
            }
            return true;
        });
        const joinedAt = (targetMember && targetMember.joinedAt) ? dateToDiscordTimestamp(new Date(targetMember.joinedAt), 'D') : localize('moderation', 'unknown');
        const createdAt = targetUser.createdAt ? dateToDiscordTimestamp(new Date(targetUser.createdAt), 'D') : localize('moderation', 'unknown');
        const counts = {
            ban: actions.filter(a => a.type === 'ban').length,
            quarantine: actions.filter(a => a.type === 'quarantine').length,
            mute: actions.filter(a => a.type === 'mute').length,
            warn: actions.filter(a => a.type === 'warn').length
        };
        const notesLines = [];
        const notesLimit = 10;
        const showNotes = moduleConfig['dossier_show_notes'] && (!moduleConfig['dossier_notes_require_opt_in'] || interaction.options.getBoolean('show-notes'));
        if (showNotes) {
            const notesRecord = await interaction.client.models['moderation']['UserNotes'].findOne({
                where: {userID: targetUser.id}
            });
            const notes = (notesRecord ? notesRecord.notes : []).filter(n => n.content && n.content !== '[deleted]').sort((a, b) => b.lastUpdateAt - a.lastUpdateAt);
            for (const note of notes) {
                if (notesLines.length >= notesLimit) break;
                notesLines.push(localize('moderation', 'dossier-note-line', {
                    i: note.id,
                    t: dateToDiscordTimestamp(new Date(note.lastUpdateAt), 'R'),
                    author: `<@${note.authorID}>`,
                    c: note.content.replaceAll('\n', ' '),
                    altInfo: ''
                }));
            }
        }

        const showLinkedAccounts = moduleConfig['dossier_show_linked_accounts'] && showNotes;
        let linkedText = null;
        if (linkedGroup && showLinkedAccounts) {
            const linked = linkedGroup.userIDs.filter(id => id !== targetUser.id);
            if (linked.length !== 0) linkedText = formatUserMentions(linked);
        }
        if (linkedGroup && showNotes && moduleConfig['dossier_include_alt_notes']) {
            const linked = linkedGroup.userIDs.filter(id => id !== targetUser.id);
            for (const linkedID of linked) {
                if (notesLines.length >= notesLimit) break;
                const linkedNotes = await interaction.client.models['moderation']['UserNotes'].findOne({
                    where: {userID: linkedID}
                });
                const ln = (linkedNotes ? linkedNotes.notes : []).filter(n => n.content && n.content !== '[deleted]').sort((a, b) => b.lastUpdateAt - a.lastUpdateAt);
                for (const note of ln) {
                    if (notesLines.length >= notesLimit) break;
                    notesLines.push(localize('moderation', 'dossier-note-line', {
                        i: note.id,
                        t: dateToDiscordTimestamp(new Date(note.lastUpdateAt), 'R'),
                        author: `<@${note.authorID}>`,
                        c: note.content.replaceAll('\n', ' '),
                        altInfo: `\n> ${localize('moderation', 'dossier-note-alt-inline', {u: `<@${linkedID}>`})}`
                    }));
                }
            }
        }
        const lines = [
            localize('moderation', 'dossier-subtitle', {u: formatDiscordUserName(targetUser), m: `<@${targetUser.id}>`}),
            localize('moderation', 'dossier-joined', {d: joinedAt}),
            localize('moderation', 'dossier-created', {d: createdAt}),
            localize('moderation', 'dossier-counts', {
                b: counts.ban,
                q: counts.quarantine,
                m: counts.mute,
                w: counts.warn
            })
        ];

        if (showLinkedAccounts) {
            lines.push(localize('moderation', 'dossier-separator'));
            lines.push(localize('moderation', 'dossier-linked-title'));
            if (linkedText) lines.push(linkedText);
            else lines.push(localize('moderation', 'linked-accounts-none'));
        }

        if (showNotes) {
            lines.push(localize('moderation', 'dossier-separator'));
            lines.push(localize('moderation', 'dossier-notes-title'));
            if (notesLines.length === 0) lines.push(localize('moderation', 'dossier-notes-empty'));
            else lines.push(...notesLines);
        }
        if (visibleActions.length === 0) {
            lines.push(localize('moderation', 'dossier-separator'));
            lines.push(localize('moderation', 'no-actions-value', {u: `<@${interaction.memberToExecuteUpon.user.id}>`}));
        } else {
            lines.push(localize('moderation', 'dossier-separator'));
            lines.push(localize('moderation', 'dossier-actions-title'));
            for (const action of visibleActions) {
                const isAlt = action.victimID !== targetUser.id;
                const actionLines = [
                    localize('moderation', 'action-header', {i: action.actionID, t: action.type}),
                    localize('moderation', 'action-reason-line', {r: action.reason}),
                    localize('moderation', 'action-by-line', {u: action.memberID ? `<@${action.memberID}>` : localize('moderation', 'unknown')}),
                    localize('moderation', 'action-at-line', {t: dateToDiscordTimestamp(new Date(action.createdAt))})
                ];
                if (action.expiresOn) actionLines.push(localize('moderation', 'action-expires-line', {d: dateToDiscordTimestamp(new Date(action.expiresOn))}));
                if (action.type === 'warn' && action.additionalData && action.additionalData.autoModActions && action.additionalData.autoModActions.length > 0) {
                    const autoMods = action.additionalData.autoModActions.map((entry) => {
                        if (typeof entry === 'string') return entry;
                        const d = entry.duration || localize('moderation', 'unknown');
                        return localize('moderation', 'automod-log-line', {d, a: entry.type, r: entry.reason || ''}).trim();
                    });
                    actionLines.push(localize('moderation', 'action-automod-line', {a: autoMods.join(' | ')}));
                }
                if (isAlt) actionLines.push(localize('moderation', 'action-alt-line', {u: `<@${action.victimID}>`}));
                lines.push(localize('moderation', 'action-block', {a: actionLines.join('\n')}));
            }
            lines.push(localize('moderation', 'dossier-separator'));
        }

        const descriptionPages = [];
        const maxLen = 1400;
        let buffer = '';
        for (const line of lines) {
            const add = (buffer.length === 0 ? line : `\n${line}`);
            if ((buffer + add).length > maxLen) {
                descriptionPages.push(buffer);
                buffer = line;
            } else buffer += add;
        }
        if (buffer.length !== 0) descriptionPages.push(buffer);
        if (descriptionPages.length === 0) descriptionPages.push(localize('moderation', 'no-actions-value', {u: `<@${interaction.memberToExecuteUpon.user.id}>`}));

        /**
         * Adds a new site
         * @private
         * @param fs
         */
        function addSite(description, index, total) {
            const embed = new MessageEmbed()
                .setColor(parseEmbedColor('YELLOW'))
                .setAuthor({name: interaction.client.user.username, iconURL: interaction.client.user.avatarURL()})
                .setTitle(localize('moderation', 'actions-embed-title', {
                    u: formatDiscordUserName(interaction.memberToExecuteUpon.user),
                    i: index + 1
                }))
                .setDescription(description)
                .setThumbnail(interaction.memberToExecuteUpon.user.avatarURL())
            safeSetFooter(embed, interaction.client);
            return embed;
        }

        const embedSites = descriptionPages.map((d, i) => addSite(d, i, descriptionPages.length));
        sendMultipleSiteButtonMessage(interaction.channel, embedSites, [interaction.user.id], interaction);
    },
    'revoke-warn': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 1)) return;
        const action = await interaction.client.models['moderation']['ModerationAction'].findOne({
            where: {
                actionID: interaction.options.getString('warn-id')
            }
        });
        if (!action) return interaction.editReply({
            ephemeral: true,
            content: localize('moderation', 'warning-not-found')
        });
        moderationAction(interaction.client, 'unwarn', interaction.member, {
            id: interaction.options.getString('warn-id'),
            user: {id: interaction.options.getString('warn-id'), tag: 'Unknown'}
        }, interaction.options.getString('reason')).then(async r => {
            if (r) {
                await action.destroy();
                interaction.editReply({content: localize('moderation', 'action-done', {i: r.actionID})});
            } else interaction.editReply({content: '⚠️ ' + r});
        }).catch((r) => {
            interaction.editReply({content: '⚠️ ' + r});
        });
    }
    ,
    'clear-punishments': async function (interaction) {
        if (interaction.replied) return;
        if (!checkRoles(interaction, 4)) return;
        const moduleConfig = interaction.client.configurations['moderation']['config'];
        if (!moduleConfig['debug_clear_punishments_enabled']) {
            return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'clear-punishments-disabled')
            });
        }
        const confirm = interaction.options.getString('confirm', true);
        if (confirm !== 'CONFIRM') {
            return interaction.editReply({
                content: '⚠️ ' + localize('moderation', 'clear-punishments-confirm-required')
            });
        }
        const targetUser = interaction.options.getUser('user', true);
        const targetMember = interaction.memberToExecuteUpon && !interaction.memberToExecuteUpon.notFound
            ? interaction.memberToExecuteUpon
            : null;
        const reason = localize('moderation', 'clear-punishments-reason');
        const quarantineRoleId = moduleConfig['quarantine-role-id'];

        if (targetMember) {
            if (targetMember.isCommunicationDisabled()) {
                await moderationAction(interaction.client, 'unmute', interaction.member, targetMember, reason, {}, null, null, {suppressLog: true});
            }
            if (quarantineRoleId && targetMember.roles.cache.get(quarantineRoleId)) {
                const lastAction = await interaction.client.models['moderation']['ModerationAction'].findOne({
                    where: {
                        victimID: targetUser.id,
                        type: 'quarantine'
                    },
                    order: [['createdAt', 'DESC']]
                });
                const roles = (lastAction && lastAction.additionalData && lastAction.additionalData.roles instanceof Array)
                    ? lastAction.additionalData.roles
                    : [];
                await moderationAction(interaction.client, 'unquarantine', interaction.member, targetMember, reason, {roles}, null, null, {suppressLog: true});
            }
        }

        await moderationAction(interaction.client, 'unban', interaction.member, targetUser.id, reason, {}, null, null, {suppressLog: true}).catch(() => {
        });

        const deleted = await interaction.client.models['moderation']['ModerationAction'].destroy({
            where: {victimID: targetUser.id}
        });

        return interaction.editReply({
            content: localize('moderation', 'clear-punishments-done', {u: `<@${targetUser.id}>`, n: deleted})
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
                    name: truncate(`[${action.type}] ${formatDiscordUserName((interaction.client.guild.members.cache.get(action.victimID) || {user: {tag: action.victimID}}).user)}: ${action.reason}`, 100)
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
            for (const match of guildBanCache.filter(b => formatDiscordUserName(b.user).toLowerCase().includes(interaction.value) || b.user.username.toLowerCase().includes(interaction.value) || b.user.id.includes(interaction.value)).values()) {
                if (possibleValues.length !== 25) possibleValues.push({
                    name: formatDiscordUserName(match.user),
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
        const data = embedType(interaction.client.configurations['moderation']['strings']['no_permissions'], {
            '%required_level%': minLevel
        }, {ephemeral: true});
        if (interaction.deferred) interaction.editReply(data);
        else interaction.reply(data);
        return false;
    }
    if (!interaction.memberToExecuteUpon || interaction.memberToExecuteUpon.notFound) return true;
    if (interaction.memberToExecuteUpon.roles.cache.find(r => allowedRoles.includes(r.id))) {
        const data = embedType(interaction.client.configurations['moderation']['strings']['this_is_a_mod'], {
            '%required_level%': minLevel
        }, {ephemeral: true});
        if (interaction.deferred) interaction.editReply(data);
        else interaction.reply(data);
        return false;
    }
    return true;
}

module.exports.config = {
    name: 'moderate',
    description: localize('moderation', 'moderate-command-description'),

    defaultMemberPermissions: ['MODERATE_MEMBERS'],
    options: function (client) {
        const opts = [
            {
                type: 'SUB_COMMAND',
                name: 'clear-punishments',
                description: localize('moderation', 'moderate-clear-punishments-command-description'),
                options: [
                    {
                        type: 'USER',
                        name: 'user',
                        required: true,
                        description: localize('moderation', 'moderate-user-description')
                    },
                    {
                        type: 'STRING',
                        name: 'confirm',
                        required: true,
                        description: localize('moderation', 'moderate-clear-punishments-confirm-description')
                    }
                ]
            },
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
                            type: 'ATTACHMENT',
                            name: 'proof',
                            required: (client.configurations['moderation']['config']['require_proof'] && client.configurations['moderation']['config']['require_reason']),
                            description: localize('moderation', 'moderate-proof-description')
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
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'ATTACHMENT',
                            name: 'proof',
                            required: (client.configurations['moderation']['config']['require_proof'] && client.configurations['moderation']['config']['require_reason']),
                            description: localize('moderation', 'moderate-proof-description')
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'ATTACHMENT',
                            name: 'proof',
                            required: (client.configurations['moderation']['config']['require_proof'] && client.configurations['moderation']['config']['require_reason']),
                            description: localize('moderation', 'moderate-proof-description')
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
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
                        },
                        {
                            type: 'ATTACHMENT',
                            name: 'proof',
                            required: (client.configurations['moderation']['config']['require_proof'] && client.configurations['moderation']['config']['require_reason']),
                            description: localize('moderation', 'moderate-proof-description')
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
                        }
                    ];
                }
            },
            {
                type: 'SUB_COMMAND',
                name: 'channel-mute',
                description: localize('moderation', 'moderate-channel-mute-description'),
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
                            type: 'ATTACHMENT',
                            name: 'proof',
                            required: (client.configurations['moderation']['config']['require_proof'] && client.configurations['moderation']['config']['require_reason']),
                            description: localize('moderation', 'moderate-proof-description')
                        },
                        {
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
                        }
                    ];
                }
            },
            {
                type: 'SUB_COMMAND',
                name: 'remove-channel-mute',
                description: localize('moderation', 'moderate-unchannel-mute-description'),
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
                            type: 'BOOLEAN',
                            name: 'only-target',
                            required: false,
                            description: localize('moderation', 'moderate-only-target-description')
                        }
                    ];
                }
            },
            {
                type: 'SUB_COMMAND_GROUP',
                name: 'accounts',
                description: localize('moderation', 'linked-accounts-command-description'),
                options: [
                    {
                        type: 'SUB_COMMAND',
                        name: 'link',
                        description: localize('moderation', 'linked-accounts-link-description'),
                        options: [
                            {
                                type: 'USER',
                                name: 'main',
                                required: true,
                                description: localize('moderation', 'linked-accounts-main-description')
                            },
                            {
                                type: 'USER',
                                name: 'account',
                                required: true,
                                description: localize('moderation', 'linked-accounts-account-description')
                            },
                            {
                                type: 'USER',
                                name: 'account2',
                                required: false,
                                description: localize('moderation', 'linked-accounts-account-description')
                            },
                            {
                                type: 'USER',
                                name: 'account3',
                                required: false,
                                description: localize('moderation', 'linked-accounts-account-description')
                            },
                            {
                                type: 'USER',
                                name: 'account4',
                                required: false,
                                description: localize('moderation', 'linked-accounts-account-description')
                            },
                            {
                                type: 'USER',
                                name: 'account5',
                                required: false,
                                description: localize('moderation', 'linked-accounts-account-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'unlink',
                        description: localize('moderation', 'linked-accounts-unlink-description'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                required: true,
                                description: localize('moderation', 'linked-accounts-user-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'clear',
                        description: localize('moderation', 'linked-accounts-clear-description'),
                        options: [
                            {
                                type: 'USER',
                                name: 'main',
                                required: true,
                                description: localize('moderation', 'linked-accounts-main-description')
                            }
                        ]
                    },
                    {
                        type: 'SUB_COMMAND',
                        name: 'list',
                        description: localize('moderation', 'linked-accounts-list-description'),
                        options: [
                            {
                                type: 'USER',
                                name: 'user',
                                required: true,
                                description: localize('moderation', 'linked-accounts-user-description')
                            }
                        ]
                    }
                ]
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
                },
                    {
                        type: 'BOOLEAN',
                        name: 'show-notes',
                        required: false,
                        description: localize('moderation', 'moderate-actions-show-notes')
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
        ];

        const lockdownConfig = client.configurations['moderation']['lockdown'];
        if (lockdownConfig && lockdownConfig.enabled) {
            opts.push({
                type: 'SUB_COMMAND',
                name: 'lockdown',
                description: localize('moderation', 'moderate-lockdown-command-description'),
                options: [{
                    type: 'BOOLEAN',
                    name: 'enable',
                    required: true,
                    description: localize('moderation', 'moderate-lockdown-enable-description')
                }, {
                    type: 'STRING',
                    name: 'reason',
                    required: client.configurations['moderation']['config']['require_reason'],
                    description: localize('moderation', 'moderate-reason-description')
                }]
            });
        }

        return opts;
    }
};
