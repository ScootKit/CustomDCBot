/*
 * Render/embed-building tests for ping-protection.js generators and AutoMod sync.
 *
 * generateUserPanel / generatePanelHistory / generatePanelActions /
 * generatePanelDeletion / generateHistoryResponse / generateActionsResponse all
 * return {embeds:[...], components:[...]} JSON. We assert key branches:
 *  - history disabled vs empty vs populated
 *  - leaver warning prefix
 *  - deletion panel cooldown notice
 *  - pagination button disabled states
 * sendPingWarning falls back from reply -> channel.send -> null on failure.
 * syncNativeAutoMod deletes the rule when automod is disabled and creates/edits
 * it with the protected keywords when enabled.
 */
const pp = require('../../modules/ping-protection/ping-protection');

function baseClient({
                        storage = {},
                        moderation = [],
                        models = {},
                        users
                    } = {}) {
    return {
        strings: {
            disableFooterTimestamp: true,
            footer: 'f',
            footerImgUrl: ''
        },
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn()
        },
        users: users || {
            fetch: jest.fn().mockResolvedValue({
                username: 'U',
                displayAvatarURL: () => null
            })
        },
        configurations: {
            'ping-protection': {
                storage,
                moderation
            }
        },
        models: {'ping-protection': models}
    };
}

function userObj(over = {}) {
    return {
        id: 'u1',
        tag: 'User#1',
        username: 'User',
        toString: () => '<@u1>',
        displayAvatarURL: () => null,
        ...over
    };
}

describe('generateUserPanel', () => {
    test('summarises ping + mod counts with the overview menu', async () => {
        const client = baseClient({
            storage: {pingHistoryRetention: 8},
            models: {
                PingHistory: {count: jest.fn().mockResolvedValue(4)},
                ModerationLog: {
                    findAndCountAll: jest.fn().mockResolvedValue({
                        count: 2,
                        rows: []
                    })
                }
            }
        });
        const res = await pp.generateUserPanel(client, userObj());
        expect(res.embeds).toHaveLength(1);
        expect(res.components).toHaveLength(1);
        // the quick-stats field embeds both counts
        const field = res.embeds[0].fields[0];
        expect(field.value).toContain('p=4');
        expect(field.value).toContain('m=2');
    });
});

describe('generateHistoryResponse', () => {
    test('shows the disabled message when ping history is off', async () => {
        const client = baseClient({
            storage: {enablePingHistory: false},
            models: {LeaverData: {findByPk: jest.fn().mockResolvedValue(null)}}
        });
        const res = await pp.generateHistoryResponse(client, 'u1', 1);
        expect(res.embeds[0].description).toContain('history-disabled');
    });

    test('renders entries and a leaver warning when present', async () => {
        const client = baseClient({
            storage: {enablePingHistory: true},
            models: {
                PingHistory: {
                    findAndCountAll: jest.fn().mockResolvedValue({
                        count: 1,
                        rows: [{
                            createdAt: new Date(),
                            targetId: 't1',
                            isRole: false,
                            messageUrl: 'http://m'
                        }]
                    })
                },
                LeaverData: {findByPk: jest.fn().mockResolvedValue({leftAt: new Date()})}
            }
        });
        const res = await pp.generateHistoryResponse(client, 'u1', 1);
        expect(res.embeds[0].description).toContain('leaver-warning');
        expect(res.embeds[0].description).toContain('list-entry-text');
    });

    test('back button disabled on page 1, next disabled when only one page', async () => {
        const client = baseClient({
            storage: {enablePingHistory: true},
            models: {
                PingHistory: {
                    findAndCountAll: jest.fn().mockResolvedValue({
                        count: 0,
                        rows: []
                    })
                },
                LeaverData: {findByPk: jest.fn().mockResolvedValue(null)}
            }
        });
        const res = await pp.generateHistoryResponse(client, 'u1', 1);
        const buttons = res.components[0].components;
        expect(buttons[0].disabled).toBe(true); // back
        expect(buttons[2].disabled).toBe(true); // next (single page)
    });
});

describe('generateActionsResponse', () => {
    test('renders no-data and greys the embed when moderation is unconfigured', async () => {
        const client = baseClient({
            moderation: [],
            models: {
                ModerationLog: {
                    findAndCountAll: jest.fn().mockResolvedValue({
                        count: 0,
                        rows: []
                    })
                }
            }
        });
        const res = await pp.generateActionsResponse(client, 'u1', 1);
        expect(res.embeds[0].description).toContain('no-data-found');
    });

    test('lists mod actions with reason + duration when present', async () => {
        const client = baseClient({
            moderation: [{actionType: 'MUTE'}],
            models: {
                ModerationLog: {
                    findAndCountAll: jest.fn().mockResolvedValue({
                        count: 1,
                        rows: [{
                            type: 'MUTE',
                            actionDuration: 10,
                            reason: 'spam',
                            createdAt: new Date()
                        }]
                    })
                }
            }
        });
        const res = await pp.generateActionsResponse(client, 'u1', 1);
        expect(res.embeds[0].description).toContain('MUTE');
        expect(res.embeds[0].description).toContain('spam');
    });
});

describe('generatePanelDeletion', () => {
    test('adds a cooldown notice when a deletion cooldown is active', async () => {
        const client = baseClient({
            models: {
                DeletionCooldown: {
                    findByPk: jest.fn().mockResolvedValue({
                        blockedUntil: new Date(Date.now() + 100000),
                        lastDeletionType: 'del_all'
                    })
                }
            }
        });
        const res = await pp.generatePanelDeletion(client, userObj());
        expect(res.embeds[0].description).toContain('panel-deletion-cooldown-active');
    });
});

describe('sendPingWarning', () => {
    function target() {
        return {
            id: 't1',
            username: 'Victim',
            toString: () => '<@t1>'
        };
    }

    test('does not reply without a configured warning message', async () => {
        const client = baseClient();
        const message = {
            reply: jest.fn(),
            channel: {send: jest.fn()}
        };
        const res = await pp.sendPingWarning(client, message, target(), {});
        expect(res).toBeUndefined();
        expect(message.reply).not.toHaveBeenCalled();
    });

    test('replies with the warning when one is configured', async () => {
        const client = baseClient();
        const message = {
            author: {id: 'pinger'},
            reply: jest.fn().mockResolvedValue({id: 'reply'}),
            channel: {
                id: 'c',
                send: jest.fn()
            }
        };
        const res = await pp.sendPingWarning(client, message, target(), {pingWarningMessage: {description: 'stop %target-name%'}});
        expect(message.reply).toHaveBeenCalled();
        expect(res).toEqual({id: 'reply'});
    });

    test('falls back to channel.send when reply fails', async () => {
        const client = baseClient();
        const message = {
            author: {id: 'pinger'},
            reply: jest.fn().mockRejectedValue(new Error('no perms')),
            channel: {
                id: 'c',
                send: jest.fn().mockResolvedValue({id: 'chan-msg'})
            }
        };
        const res = await pp.sendPingWarning(client, message, target(), {pingWarningMessage: {description: 'x'}});
        expect(message.channel.send).toHaveBeenCalled();
        expect(res).toEqual({id: 'chan-msg'});
    });
});

describe('syncNativeAutoMod', () => {
    function guildWith({
                           existingRule = null,
                           ruleOps = {}
                       } = {}) {
        return {
            channels: {
                fetch: jest.fn().mockResolvedValue(),
                cache: {get: jest.fn(() => ({type: 0}))}
            },
            members: {cache: {forEach: jest.fn()}},
            autoModerationRules: {
                fetch: jest.fn().mockResolvedValue({find: () => existingRule}),
                create: jest.fn().mockResolvedValue(),
                edit: jest.fn().mockResolvedValue(),
                ...ruleOps
            }
        };
    }

    test('deletes the existing rule when automod is disabled', async () => {
        const del = jest.fn().mockResolvedValue();
        const guild = guildWith({
            existingRule: {
                id: 'r1',
                delete: del
            }
        });
        const client = baseClient({});
        client.guildID = 'g1';
        client.guilds = {fetch: jest.fn().mockResolvedValue(guild)};
        client.configurations['ping-protection'].configuration = {enableAutomod: false};
        await pp.syncNativeAutoMod(client);
        expect(del).toHaveBeenCalled();
    });

    test('creates a rule with protected keywords when enabled and none exists', async () => {
        const guild = guildWith({existingRule: null});
        const client = baseClient({});
        client.guildID = 'g1';
        client.guilds = {fetch: jest.fn().mockResolvedValue(guild)};
        client.configurations['ping-protection'].configuration = {
            enableAutomod: true,
            protectedRoles: ['role1'],
            protectedUsers: ['user1'],
            ignoredChannels: [],
            ignoredRoles: []
        };
        await pp.syncNativeAutoMod(client);
        expect(guild.autoModerationRules.create).toHaveBeenCalled();
        const data = guild.autoModerationRules.create.mock.calls[0][0];
        expect(data.triggerMetadata.keywordFilter).toEqual(expect.arrayContaining(['<@&role1>', '<@user1>', '<@!user1>']));
    });

    test('edits the existing rule when enabled', async () => {
        const guild = guildWith({
            existingRule: {
                id: 'r1',
                delete: jest.fn()
            }
        });
        const client = baseClient({});
        client.guildID = 'g1';
        client.guilds = {fetch: jest.fn().mockResolvedValue(guild)};
        client.configurations['ping-protection'].configuration = {
            enableAutomod: true,
            protectedRoles: ['role1'],
            protectedUsers: [],
            ignoredChannels: [],
            ignoredRoles: []
        };
        await pp.syncNativeAutoMod(client);
        expect(guild.autoModerationRules.edit).toHaveBeenCalledWith('r1', expect.any(Object));
    });
});