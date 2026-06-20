/*
 * Behavior tests for the suggestions core module (suggestion.js).
 *
 * Covers the parts with real branching/transition logic:
 *   - generateSuggestionEmbed(): picks the right config field
 *     (unanswered / approved / denied) based on suggestion.adminAnswer and edits
 *     the suggestion message accordingly; bails out if the message is gone
 *   - notifyMembers(): respects the sendPNNotifications switch, builds the
 *     subscriber set (suggester + admin answerer, de-duplicated) and skips the
 *     ignored user
 *   - createSuggestion(): pings the notify role, reacts, optionally opens a
 *     thread, persists the row and renders the embed
 *
 * embedType/formatDiscordUserName are mocked so we assert which config field and
 * params were used, not the embed renderer itself.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((field, params) => ({
        field,
        params
    })),
    formatDiscordUserName: (u) => (u && u.tag) || 'unknown'
}));

const helpers = require('../../src/functions/helpers');
const {
    generateSuggestionEmbed,
    notifyMembers,
    createSuggestion
} = require('../../modules/suggestions/suggestion');

const moduleConfig = {
    suggestionChannel: 'sugg-chan',
    sendPNNotifications: true,
    notifyRole: '',
    allowUserComment: false,
    reactions: [],
    threadName: 'Comments',
    unansweredSuggestion: 'UNANSWERED',
    approvedSuggestion: 'APPROVED',
    deniedSuggestion: 'DENIED',
    teamChange: 'TEAMCHANGE'
};

function makeClient({
                        message = {edit: jest.fn().mockResolvedValue()},
                        config = moduleConfig
                    } = {}) {
    return {
        guild: {id: 'g1'},
        configurations: {suggestions: {config}},
        channels: {
            fetch: jest.fn().mockResolvedValue({
                messages: {fetch: jest.fn().mockResolvedValue(message)}
            })
        },
        users: {
            fetch: jest.fn().mockResolvedValue({
                avatarURL: () => 'a',
                tag: 'U#1',
                send: jest.fn().mockResolvedValue()
            })
        }
    };
}

beforeEach(() => helpers.embedType.mockClear());

describe('generateSuggestionEmbed', () => {
    test('uses the unanswered field when there is no admin answer', async () => {
        const message = {edit: jest.fn().mockResolvedValue()};
        const client = makeClient({message});
        await generateSuggestionEmbed(client, {
            id: 1,
            suggestion: 's',
            messageID: 'm',
            suggesterID: 'u',
            adminAnswer: null
        });
        expect(helpers.embedType).toHaveBeenCalledWith('UNANSWERED', expect.any(Object));
        expect(message.edit).toHaveBeenCalled();
    });

    test('uses the approved field when the admin approved', async () => {
        const client = makeClient();
        await generateSuggestionEmbed(client, {
            id: 1,
            suggestion: 's',
            messageID: 'm',
            suggesterID: 'u',
            adminAnswer: {
                action: 'approve',
                reason: 'ok',
                userID: 'admin'
            }
        });
        expect(helpers.embedType).toHaveBeenCalledWith('APPROVED', expect.objectContaining({
            '%adminUser%': '<@admin>',
            '%adminMessage%': 'ok'
        }));
    });

    test('uses the denied field for any non-approve action', async () => {
        const client = makeClient();
        await generateSuggestionEmbed(client, {
            id: 1,
            suggestion: 's',
            messageID: 'm',
            suggesterID: 'u',
            adminAnswer: {
                action: 'deny',
                reason: 'no',
                userID: 'admin'
            }
        });
        expect(helpers.embedType).toHaveBeenCalledWith('DENIED', expect.any(Object));
    });

    test('does nothing if the suggestion message no longer exists', async () => {
        const client = makeClient({message: null});
        await generateSuggestionEmbed(client, {
            id: 1,
            messageID: 'gone',
            suggesterID: 'u',
            adminAnswer: null
        });
        expect(helpers.embedType).not.toHaveBeenCalled();
    });
});

describe('notifyMembers', () => {
    test('does nothing when DM notifications are disabled', async () => {
        const client = makeClient({
            config: {
                ...moduleConfig,
                sendPNNotifications: false
            }
        });
        await notifyMembers(client, {suggesterID: 'u1'}, 'team');
        expect(client.users.fetch).not.toHaveBeenCalled();
    });

    test('notifies the suggester and admin answerer, skipping the ignored user', async () => {
        const sent = [];
        const client = makeClient();
        client.users.fetch = jest.fn(async (id) => ({
            id,
            send: jest.fn(async (m) => sent.push({
                id,
                m
            }))
        }));
        const suggestion = {
            suggestion: 'title',
            messageID: 'm1',
            suggesterID: 'u1',
            adminAnswer: {userID: 'admin1'}
        };
        await notifyMembers(client, suggestion, 'team', 'admin1');
        // admin1 is the ignored user, so only u1 gets notified.
        expect(sent.map(s => s.id)).toEqual(['u1']);
    });

    test('does not double-notify when the admin answerer equals the suggester', async () => {
        const client = makeClient();
        const fetched = [];
        client.users.fetch = jest.fn(async (id) => {
            fetched.push(id);
            return {
                id,
                send: jest.fn().mockResolvedValue()
            };
        });
        await notifyMembers(client, {
            suggestion: 't',
            messageID: 'm',
            suggesterID: 'u1',
            adminAnswer: {userID: 'u1'}
        }, 'team');
        expect(fetched).toEqual(['u1']);
    });
});

describe('createSuggestion', () => {
    function makeGuild(config) {
        const suggestionMsg = {
            id: 'new-msg',
            startThread: jest.fn().mockResolvedValue(),
            react: jest.fn().mockResolvedValue()
        };
        const channel = {send: jest.fn().mockResolvedValue(suggestionMsg)};
        const created = {id: 77};
        const client = {
            guild: {id: 'g1'},
            configurations: {suggestions: {config}},
            channels: {fetch: jest.fn().mockResolvedValue({messages: {fetch: jest.fn().mockResolvedValue({edit: jest.fn().mockResolvedValue()})}})},
            users: {
                fetch: jest.fn().mockResolvedValue({
                    avatarURL: () => 'a',
                    tag: 'U#1'
                })
            },
            models: {suggestions: {Suggestion: {create: jest.fn().mockResolvedValue(created)}}}
        };
        const guild = {
            client,
            channels: {cache: {get: () => channel}}
        };
        return {
            guild,
            channel,
            suggestionMsg,
            created,
            client
        };
    }

    test('persists the suggestion and renders the embed', async () => {
        const {
            guild,
            channel,
            created,
            client
        } = makeGuild(moduleConfig);
        const result = await createSuggestion(guild, 'my idea', {id: 'author'});
        expect(channel.send).toHaveBeenCalled();
        expect(client.models.suggestions.Suggestion.create).toHaveBeenCalledWith(expect.objectContaining({
            suggestion: 'my idea',
            messageID: 'new-msg',
            suggesterID: 'author'
        }));
        expect(result).toBe(created);
    });

    test('pings the notify role when configured', async () => {
        const {
            guild,
            channel
        } = makeGuild({
            ...moduleConfig,
            notifyRole: 'role9'
        });
        await createSuggestion(guild, 'idea', {id: 'author'});
        expect(channel.send.mock.calls[0][0]).toContain('<@&role9>');
    });

    test('opens a thread and applies reactions when enabled', async () => {
        const {
            guild,
            suggestionMsg
        } = makeGuild({
            ...moduleConfig,
            allowUserComment: true,
            threadName: 'Talk',
            reactions: ['👍', '👎']
        });
        await createSuggestion(guild, 'idea', {id: 'author'});
        expect(suggestionMsg.startThread).toHaveBeenCalledWith({name: 'Talk'});
        expect(suggestionMsg.react).toHaveBeenCalledWith('👍');
        expect(suggestionMsg.react).toHaveBeenCalledWith('👎');
    });
});