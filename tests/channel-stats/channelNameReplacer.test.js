/*
 * Covers channelNameReplacer from modules/channel-stats/events/botReady.js:
 * the placeholder-substitution engine that turns templates like
 * "Members: %memberCount%" into live counts. Uses real discord.js Collections
 * to back the member/role/channel caches so the .filter().size paths run for
 * real. Verifies user/member/bot counts, presence-based counts (online/dnd/
 * idle/offline), role-scoped counts (%userWithRoleCount-ID%) including the
 * recursive multi-role replacement, and guild-level counts. main/localize are
 * auto-stubbed by jest.config.
 */
const {Collection} = require('discord.js');
const {channelNameReplacer} = require('../../modules/channel-stats/events/botReady');

function member({
                    bot = false,
                    status = null,
                    roles = [],
                    premium = false
                } = {}) {
    return {
        user: {bot},
        presence: status ? {status} : null,
        premiumSinceTimestamp: premium ? Date.now() : null,
        roles: {cache: {has: (id) => roles.includes(id)}}
    };
}

function buildClient(members) {
    const cache = new Collection();
    members.forEach((m, i) => cache.set(String(i), m));
    const guild = {
        channels: {cache: new Collection(Array.from({length: 4}, (_, i) => [String(i), {}]))},
        roles: {cache: new Collection(Array.from({length: 3}, (_, i) => [String(i), {}]))},
        emojis: {cache: new Collection(Array.from({length: 5}, (_, i) => [String(i), {}]))},
        premiumSubscriptionCount: 7,
        premiumTier: 2
    };
    return {
        client: {guild: {members: {cache}}},
        channel: {guild}
    };
}

test('substitutes total user count and human member count (bots excluded)', async () => {
    const {
        client,
        channel
    } = buildClient([
        member(), member(), member({bot: true})
    ]);
    expect(await channelNameReplacer(client, channel, 'U:%userCount%')).toBe('U:3');
    expect(await channelNameReplacer(client, channel, 'M:%memberCount%')).toBe('M:2');
    expect(await channelNameReplacer(client, channel, 'B:%botCount%')).toBe('B:1');
});

test('counts presence states for online/offline/dnd/idle', async () => {
    const {
        client,
        channel
    } = buildClient([
        member({status: 'online'}),
        member({status: 'dnd'}),
        member({status: 'idle'}),
        member({status: 'offline'}),
        member() // no presence -> offline
    ]);
    expect(await channelNameReplacer(client, channel, '%onlineUserCount%')).toBe('3'); // online,dnd,idle
    expect(await channelNameReplacer(client, channel, '%dndCount%')).toBe('1');
    expect(await channelNameReplacer(client, channel, '%awayCount%')).toBe('1');
    expect(await channelNameReplacer(client, channel, '%offlineCount%')).toBe('2');
});

test('online member count excludes bots', async () => {
    const {
        client,
        channel
    } = buildClient([
        member({status: 'online'}),
        member({
            status: 'online',
            bot: true
        })
    ]);
    expect(await channelNameReplacer(client, channel, '%onlineMemberCount%')).toBe('1');
});

test('role-scoped counts resolve a specific role id', async () => {
    const {
        client,
        channel
    } = buildClient([
        member({roles: ['role-a']}),
        member({
            roles: ['role-a'],
            status: 'online'
        }),
        member({roles: ['role-b']})
    ]);
    expect(await channelNameReplacer(client, channel, '%userWithRoleCount-role-a%')).toBe('2');
    expect(await channelNameReplacer(client, channel, '%onlineUserWithRoleCount-role-a%')).toBe('1');
});

test('replaces multiple distinct role placeholders recursively', async () => {
    const {
        client,
        channel
    } = buildClient([
        member({roles: ['x']}),
        member({roles: ['y']}),
        member({roles: ['y']})
    ]);
    const out = await channelNameReplacer(client, channel, '%userWithRoleCount-x% / %userWithRoleCount-y%');
    expect(out).toBe('1 / 2');
});

test('substitutes guild-level counts', async () => {
    const {
        client,
        channel
    } = buildClient([member()]);
    expect(await channelNameReplacer(client, channel, '%channelCount%')).toBe('4');
    expect(await channelNameReplacer(client, channel, '%roleCount%')).toBe('3');
    expect(await channelNameReplacer(client, channel, '%emojiCount%')).toBe('5');
    expect(await channelNameReplacer(client, channel, '%guildBoosts%')).toBe('7');
});

test('counts boosters via premiumSinceTimestamp', async () => {
    const {
        client,
        channel
    } = buildClient([
        member({premium: true}), member({premium: true}), member()
    ]);
    expect(await channelNameReplacer(client, channel, '%boosterCount%')).toBe('2');
});

test('trims surrounding whitespace from the result', async () => {
    const {
        client,
        channel
    } = buildClient([member()]);
    expect(await channelNameReplacer(client, channel, '  hello  ')).toBe('hello');
});