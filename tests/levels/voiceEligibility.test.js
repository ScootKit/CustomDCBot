/*
 * Tests for the voice-XP eligibility helpers extracted from
 * modules/levels/events/voiceStateUpdate.js. These pure predicates decide
 * whether a member should earn voice XP:
 *   - isChannelBlacklisted: blacklist by channel, parent category or grandparent.
 *   - isRoleBlacklisted: blacklist by any held role (string/number id coercion).
 *   - hasHumanCompany: at least two non-bot members must share the channel.
 *   - isEligible: combines the above plus mute/deaf and stage-channel checks.
 */

const {ChannelType} = require('discord.js');
const {
    isChannelBlacklisted,
    isRoleBlacklisted,
    hasHumanCompany,
    isEligible
} = require('../../modules/levels/events/voiceStateUpdate');

function makeClient({
                        blacklistedChannels = [],
                        blacklistedRoles = []
                    } = {}) {
    return {
        configurations: {
            levels: {
                config: {
                    blacklisted_channels: blacklistedChannels,
                    blacklistedRoles
                }
            }
        }
    };
}

function makeChannel({
                         id = 'c1',
                         parentId = null,
                         grandParentId = null,
                         members = []
                     } = {}) {
    return {
        id,
        parentId,
        parent: parentId ? {parentId: grandParentId} : null,
        type: ChannelType.GuildVoice,
        members: {
            filter(fn) {
                return {size: members.filter(fn).length};
            }
        }
    };
}

describe('isChannelBlacklisted', () => {
    test('treats a missing channel as blacklisted', () => {
        expect(isChannelBlacklisted(makeClient(), null)).toBe(true);
    });

    test('blacklists by channel id', () => {
        const client = makeClient({blacklistedChannels: ['c1']});
        expect(isChannelBlacklisted(client, makeChannel({id: 'c1'}))).toBe(true);
    });

    test('blacklists by parent category', () => {
        const client = makeClient({blacklistedChannels: ['cat']});
        expect(isChannelBlacklisted(client, makeChannel({
            id: 'c1',
            parentId: 'cat'
        }))).toBe(true);
    });

    test('allows a non-blacklisted channel', () => {
        const client = makeClient({blacklistedChannels: ['other']});
        expect(isChannelBlacklisted(client, makeChannel({
            id: 'c1',
            parentId: 'cat'
        }))).toBe(false);
    });
});

describe('isRoleBlacklisted', () => {
    function makeMember(roleIds) {
        const roles = roleIds.map(id => ({id}));
        return {roles: {cache: {some: fn => roles.some(fn)}}};
    }

    test('true when a held role is blacklisted (numeric config coerced to string)', () => {
        const client = makeClient({blacklistedRoles: [123]});
        expect(isRoleBlacklisted(client, makeMember(['123']))).toBe(true);
    });

    test('false when no held role is blacklisted', () => {
        const client = makeClient({blacklistedRoles: ['999']});
        expect(isRoleBlacklisted(client, makeMember(['1', '2']))).toBe(false);
    });
});

describe('hasHumanCompany', () => {
    test('false when fewer than 2 humans present', () => {
        const channel = makeChannel({members: [{user: {bot: false}}, {user: {bot: true}}]});
        expect(hasHumanCompany(channel)).toBe(false);
    });

    test('true with 2 or more humans', () => {
        const channel = makeChannel({members: [{user: {bot: false}}, {user: {bot: false}}]});
        expect(hasHumanCompany(channel)).toBe(true);
    });

    test('false for a null channel', () => {
        expect(hasHumanCompany(null)).toBe(false);
    });
});

describe('isEligible', () => {
    function eligibleState() {
        return {
            channel: makeChannel({members: [{user: {bot: false}}, {user: {bot: false}}]}),
            member: {
                user: {bot: false},
                roles: {cache: {some: () => false}}
            },
            deaf: false,
            mute: false
        };
    }

    test('eligible for a normal active member with company', () => {
        expect(isEligible(makeClient(), eligibleState())).toBe(true);
    });

    test('not eligible when muted', () => {
        const state = eligibleState();
        state.mute = true;
        expect(isEligible(makeClient(), state)).toBe(false);
    });

    test('not eligible when deafened', () => {
        const state = eligibleState();
        state.deaf = true;
        expect(isEligible(makeClient(), state)).toBe(false);
    });

    test('not eligible for bots', () => {
        const state = eligibleState();
        state.member.user.bot = true;
        expect(isEligible(makeClient(), state)).toBe(false);
    });

    test('not eligible in a stage channel', () => {
        const state = eligibleState();
        state.channel.type = ChannelType.GuildStageVoice;
        expect(isEligible(makeClient(), state)).toBe(false);
    });

    test('not eligible without human company', () => {
        const state = eligibleState();
        state.channel = makeChannel({members: [{user: {bot: false}}]});
        expect(isEligible(makeClient(), state)).toBe(false);
    });

    test('not eligible with no channel', () => {
        expect(isEligible(makeClient(), {channel: null})).toBe(false);
    });
});