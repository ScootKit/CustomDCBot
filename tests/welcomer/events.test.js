/*
 * Behavior tests for the welcomer event handlers.
 *
 *  - guildMemberAdd: guards (not ready / wrong guild / bot+suppress), DM on join,
 *    immediate vs deferred role assignment, sending join messages, and persisting
 *    the sent message (create new vs update existing welcomer User row).
 *  - guildMemberRemove: sends leave messages and (when enabled) deletes the stored
 *    welcome message within the 7-day window.
 *  - guildMemberUpdate: posts boost / unboost messages on premium transitions and
 *    grants/removes boost roles.
 *  - interactionCreate: the welcome-button flow — self-press guard, missing-channel
 *    guards, removing the clicked button, and posting the welcome-button message.
 *
 * baseRoles side-channels (handleRoleRemoval etc.) are mocked out for the update
 * handler so we isolate the boost behaviour. localize/main are jest-mapped stubs;
 * embedType/embedTypeV2 run for real.
 */

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

function makeUser(id = 'u1') {
    return {
        id,
        bot: false,
        username: 'User',
        discriminator: '0',
        bot_: false,
        toString: () => `<@${id}>`,
        fetch: jest.fn().mockResolvedValue(),
        send: jest.fn().mockResolvedValue(),
        avatarURL: () => 'http://a/u.png',
        defaultAvatarURL: 'http://a/def.png',
        bannerURL: () => 'http://a/banner.png',
        createdAt: new Date('2020-01-01')
    };
}

function membersCache(size = 5) {
    return {
        size,
        filter: () => ({size: size - 1})
    };
}

function makeClient(overrides = {}) {
    return {
        botReadyAt: Date.now(),
        guild: {
            id: 'g1',
            name: 'Guild',
            premiumTier: 2,
            premiumSubscriptionCount: 3,
            members: {cache: membersCache()}
        },
        logger: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn()
        },
        users: {fetch: jest.fn()},
        configurations: {
            'welcomer': {
                config: {},
                channels: [],
                'random-messages': []
            }
        },
        models: {
            'welcomer': {
                User: {
                    findOne: jest.fn().mockResolvedValue(null),
                    findAll: jest.fn().mockResolvedValue([]),
                    create: jest.fn().mockResolvedValue({}),
                    update: jest.fn().mockResolvedValue({})
                }
            }
        },
        ...overrides
    };
}

function makeMember({
                        id = 'u1',
                        bot = false,
                        pending = false,
                        guildId = 'g1',
                        premiumSince = null
                    } = {}) {
    const user = makeUser(id);
    user.bot = bot;
    return {
        id,
        user,
        pending,
        premiumSince,
        joinedAt: new Date('2024-01-01'),
        guild: {
            id: guildId,
            name: 'Guild',
            channels: {fetch: jest.fn()}
        },
        roles: {
            add: jest.fn().mockResolvedValue(),
            remove: jest.fn().mockResolvedValue(),
            cache: {has: () => false}
        },
        toString: () => `<@${id}>`,
        fetch: jest.fn().mockResolvedValue()
    };
}

describe('guildMemberAdd', () => {
    const handler = require('../../modules/welcomer/events/guildMemberAdd');

    function configure(client, {
        channels = [],
        config = {}
    } = {}) {
        client.configurations.welcomer.channels = channels;
        client.configurations.welcomer.config = {'give-roles-on-join': [], ...config};
    }

    test('ignores joins before the bot is ready', async () => {
        const client = makeClient();
        client.botReadyAt = null;
        configure(client);
        const member = makeMember();
        await handler.run(client, member);
        expect(member.user.fetch).not.toHaveBeenCalled();
    });

    test('ignores joins from another guild', async () => {
        const client = makeClient();
        configure(client);
        await handler.run(client, makeMember({guildId: 'other'}));
        expect(client.models.welcomer.User.create).not.toHaveBeenCalled();
    });

    test('skips bots when not-send-messages-if-member-is-bot is set', async () => {
        const client = makeClient();
        configure(client, {
            config: {
                'not-send-messages-if-member-is-bot': true,
                'give-roles-on-join': []
            }
        });
        const member = makeMember({bot: true});
        await handler.run(client, member);
        expect(member.user.fetch).not.toHaveBeenCalled();
    });

    test('sends a join DM when sendDirectMessageOnJoin is enabled', async () => {
        const client = makeClient();
        configure(client, {
            config: {
                sendDirectMessageOnJoin: true,
                joinDM: 'hi %mention%',
                'give-roles-on-join': []
            }
        });
        const member = makeMember();
        await handler.run(client, member);
        expect(member.user.send).toHaveBeenCalled();
    });

    test('sends the join message and creates a welcomer User row', async () => {
        const client = makeClient();
        const channel = {
            send: jest.fn().mockResolvedValue({
                id: 'sent1',
                channelId: 'wc'
            })
        };
        const member = makeMember();
        member.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        configure(client, {
            channels: [{
                type: 'join',
                channelID: 'wc',
                message: 'welcome %mention%'
            }],
            config: {'give-roles-on-join': []}
        });
        await handler.run(client, member);
        expect(channel.send).toHaveBeenCalled();
        expect(client.models.welcomer.User.create).toHaveBeenCalledWith(expect.objectContaining({
            userID: 'u1',
            channelID: 'wc',
            messageID: 'sent1'
        }));
    });

    test('updates an existing welcomer User row instead of creating a new one', async () => {
        const client = makeClient();
        const existing = {update: jest.fn().mockResolvedValue()};
        client.models.welcomer.User.findOne.mockResolvedValue(existing);
        const channel = {
            send: jest.fn().mockResolvedValue({
                id: 'sent2',
                channelId: 'wc'
            })
        };
        const member = makeMember();
        member.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        configure(client, {
            channels: [{
                type: 'join',
                channelID: 'wc',
                message: 'welcome'
            }],
            config: {'give-roles-on-join': []}
        });
        await handler.run(client, member);
        expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({messageID: 'sent2'}));
        expect(client.models.welcomer.User.create).not.toHaveBeenCalled();
    });

    test('logs an error and skips a channel that cannot be fetched', async () => {
        const client = makeClient();
        const member = makeMember();
        member.guild.channels.fetch = jest.fn().mockResolvedValue(null);
        configure(client, {
            channels: [{
                type: 'join',
                channelID: 'missing',
                message: 'x'
            }],
            config: {'give-roles-on-join': []}
        });
        await handler.run(client, member);
        expect(client.logger.error).toHaveBeenCalled();
        expect(client.models.welcomer.User.create).not.toHaveBeenCalled();
    });
});

describe('assignJoinRoles', () => {
    const {assignJoinRoles} = require('../../modules/welcomer/events/guildMemberAdd');

    test('adds the configured join roles after the 500ms delay', async () => {
        const member = makeMember();
        member.client = {logger: {error: jest.fn()}};
        const fresh = {roles: {add: jest.fn().mockResolvedValue()}};
        member.fetch = jest.fn().mockResolvedValue(fresh);
        assignJoinRoles(member, {'give-roles-on-join': ['r1', 'r2']});
        await jest.advanceTimersByTimeAsync(500);
        expect(fresh.roles.add).toHaveBeenCalledWith(['r1', 'r2'], expect.any(String));
    });

    test('does nothing when there are no join roles', () => {
        const member = makeMember();
        const spy = jest.spyOn(global, 'setTimeout');
        assignJoinRoles(member, {'give-roles-on-join': []});
        expect(spy).not.toHaveBeenCalled();
    });

    test('respects the doNotGiveWelcomeRole flag set during the delay', async () => {
        const member = makeMember();
        member.client = {logger: {error: jest.fn()}};
        member.fetch = jest.fn();
        assignJoinRoles(member, {'give-roles-on-join': ['r1']});
        member.doNotGiveWelcomeRole = true;
        await jest.advanceTimersByTimeAsync(500);
        expect(member.fetch).not.toHaveBeenCalled();
    });
});

describe('guildMemberRemove', () => {
    const handler = require('../../modules/welcomer/events/guildMemberRemove');

    test('sends a leave message in each leave channel', async () => {
        const client = makeClient();
        const channel = {send: jest.fn().mockResolvedValue()};
        const member = makeMember();
        member.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        client.configurations.welcomer.channels = [{
            type: 'leave',
            channelID: 'lc',
            message: 'bye %mention%'
        }];
        client.configurations.welcomer.config = {'delete-welcome-message': false};
        await handler.run(client, member);
        expect(channel.send).toHaveBeenCalled();
    });

    test('deletes the stored welcome message within the 7-day window when enabled', async () => {
        const client = makeClient();
        const fetchedMessage = {delete: jest.fn().mockResolvedValue()};
        const channel = {
            send: jest.fn().mockResolvedValue(),
            messages: {fetch: jest.fn().mockResolvedValue(fetchedMessage)}
        };
        const member = makeMember();
        member.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        const row = {
            channelID: 'wc',
            messageID: 'm9',
            timestamp: new Date(),
            destroy: jest.fn().mockResolvedValue()
        };
        client.models.welcomer.User.findAll.mockResolvedValue([row]);
        client.models.welcomer.User.findOne.mockResolvedValue(row);
        client.configurations.welcomer.channels = [];
        client.configurations.welcomer.config = {'delete-welcome-message': true};
        await handler.run(client, member);
        expect(fetchedMessage.delete).toHaveBeenCalled();
        expect(row.destroy).toHaveBeenCalled();
    });
});

describe('guildMemberUpdate boost messages', () => {
    // Stub the base-role helpers so we test only the boost path.
    jest.mock('../../modules/welcomer/baseRoles', () => ({
        handleRoleRemoval: jest.fn(),
        handleHoldingRelease: jest.fn(),
        checkWatchdog: jest.fn()
    }));
    const handler = require('../../modules/welcomer/events/guildMemberUpdate');

    function boostSetup(type) {
        const client = makeClient();
        const channel = {send: jest.fn().mockResolvedValue()};
        client.configurations.welcomer.channels = [{
            type,
            channelID: 'bc',
            message: 'boost %mention%'
        }];
        client.configurations.welcomer.config = {'give-roles-on-boost': ['boostRole']};
        const newMember = makeMember({premiumSince: type === 'boost' ? new Date() : null});
        newMember.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        return {
            client,
            channel,
            newMember
        };
    }

    test('sends a boost message and adds the boost role on a new boost', async () => {
        const {
            client,
            channel,
            newMember
        } = boostSetup('boost');
        const oldMember = makeMember({premiumSince: null});
        await handler.run(client, oldMember, newMember);
        expect(channel.send).toHaveBeenCalled();
        expect(newMember.roles.add).toHaveBeenCalledWith(['boostRole']);
    });

    test('sends an unboost message and removes the boost role when boosting stops', async () => {
        const {
            client,
            channel,
            newMember
        } = boostSetup('unboost');
        const oldMember = makeMember({premiumSince: new Date()});
        await handler.run(client, oldMember, newMember);
        expect(channel.send).toHaveBeenCalled();
        expect(newMember.roles.remove).toHaveBeenCalledWith(['boostRole']);
    });

    test('does nothing on an update with no premium transition', async () => {
        const {
            client,
            channel
        } = boostSetup('boost');
        const oldMember = makeMember({premiumSince: null});
        const newMember = makeMember({premiumSince: null});
        newMember.guild.channels.fetch = jest.fn().mockResolvedValue(channel);
        await handler.run(client, oldMember, newMember);
        expect(channel.send).not.toHaveBeenCalled();
    });
});

describe('welcomer interactionCreate (welcome button)', () => {
    const handler = require('../../modules/welcomer/events/interactionCreate');

    function makeInteraction({
                                 customId = 'welcome-target',
                                 userId = 'clicker',
                                 channels = [],
                                 sendChannel
                             } = {}) {
        return {
            isButton: () => true,
            customId,
            user: {
                id: userId,
                toString: () => `<@${userId}>`,
                avatarURL: () => 'http://a/c.png',
                username: 'C',
                discriminator: '0'
            },
            channel: {id: 'jc'},
            message: {components: []},
            guild: {channels: {cache: {get: () => sendChannel}}},
            reply: jest.fn().mockResolvedValue(),
            update: jest.fn().mockResolvedValue(),
            client: {
                users: {
                    fetch: jest.fn().mockResolvedValue({
                        id: 'target',
                        toString: () => '<@target>',
                        avatarURL: () => 'http://a/t.png',
                        username: 'T',
                        discriminator: '0'
                    })
                },
                configurations: {welcomer: {channels}}
            }
        };
    }

    test('ignores non-button interactions', async () => {
        const interaction = makeInteraction();
        interaction.isButton = () => false;
        await handler.run({}, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('ignores buttons that are not welcome buttons', async () => {
        const interaction = makeInteraction({customId: 'something-else'});
        await handler.run({configurations: {welcomer: {channels: []}}}, interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('refuses to welcome yourself', async () => {
        const interaction = makeInteraction({
            customId: 'welcome-clicker',
            userId: 'clicker'
        });
        await handler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('welcome-yourself-error')
        }));
    });

    test('removes the clicked button and posts the welcome-button message', async () => {
        const sendChannel = {send: jest.fn().mockResolvedValue()};
        const channels = [{
            channelID: 'jc',
            type: 'join',
            'welcome-button-channel': 'send-ch',
            'welcome-button-message': 'welcomed by %clickUserMention%'
        }];
        const interaction = makeInteraction({
            channels,
            sendChannel
        });
        await handler.run(interaction.client, interaction);
        expect(interaction.update).toHaveBeenCalled();
        expect(sendChannel.send).toHaveBeenCalled();
        const payload = JSON.stringify(sendChannel.send.mock.calls[0][0]);
        expect(payload).toContain('clicker');
    });

    test('warns when the configured welcome-button target channel is missing', async () => {
        const channels = [{
            channelID: 'jc',
            type: 'join',
            'welcome-button-channel': 'gone'
        }];
        const interaction = makeInteraction({
            channels,
            sendChannel: undefined
        });
        await handler.run(interaction.client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('channel-not-found')
        }));
        expect(interaction.update).not.toHaveBeenCalled();
    });
});