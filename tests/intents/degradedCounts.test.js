const {memberCountOrFallback, onlineCountOrNull} = require('../../src/functions/helpers');

test('memberCountOrFallback uses guild.memberCount regardless of cache', () => {
    const guild = {memberCount: 40000, members: {cache: {size: 3}}};
    expect(memberCountOrFallback(guild)).toBe(40000);
});

test('onlineCountOrNull returns null when GuildPresences is not active', () => {
    const client = {_activeIntents: ['Guilds']};
    const guild = {members: {cache: {filter: () => ({size: 5})}}};
    expect(onlineCountOrNull(client, guild)).toBeNull();
});

test('onlineCountOrNull counts online members when GuildPresences is active', () => {
    const client = {_activeIntents: ['Guilds', 'GuildPresences']};
    const guild = {members: {cache: {filter: (fn) => ({size: 5})}}};
    expect(onlineCountOrNull(client, guild)).toBe(5);
});
