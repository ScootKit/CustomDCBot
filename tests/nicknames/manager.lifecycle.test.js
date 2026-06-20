const EventEmitter = require('events');
const NicknameManager = require('../../src/functions/nicknameManager');

/**
 * Builds a minimal Client stub that emits lifecycle events the manager listens to.
 * @returns {EventEmitter}
 */
function makeClientStub() {
    const client = new EventEmitter();
    client.modules = {};
    client.logger = {
        warn: () => {
        },
        debug: () => {
        }
    };
    client.botReadyAt = new Date();
    client.guild = {
        id: 'g1',
        members: {cache: new Map()}
    };
    return client;
}

/**
 * Builds a GuildMember-shaped stub.
 * @param {string} id member id
 * @param {string} displayName user.displayName
 * @param {string|null} [nickname] member.nickname
 * @param {string} [guildId] guild id (defaults to g1)
 * @returns {Object}
 */
function makeMember(id, displayName, nickname, guildId = 'g1') {
    const setNickname = jest.fn().mockResolvedValue(null);
    return {
        id,
        nickname: nickname ?? null,
        user: {displayName},
        guild: {id: guildId},
        setNickname,
        partial: false
    };
}

/**
 * Returns a promise that resolves on the next microtask tick.
 * @returns {Promise<void>}
 */
function tick() {
    return new Promise(setImmediate);
}

describe('NicknameManager lifecycle', () => {
    test('install is idempotent', () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        m.install();
        expect(client.listenerCount('configReload')).toBe(1);
        expect(client.listenerCount('guildMemberUpdate')).toBe(1);
    });

    test('configReload wipes per-member contributions', () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        m.set('1', 'src', {
            position: 'suffix',
            value: ' X',
            priority: 1
        });
        client.emit('configReload');
        expect(m.members.get('1').contributions.size).toBe(0);
        expect(m.members.get('1').lastRendered).toBe(null);
    });

    test('guildMemberAdd attaches and requests update', async () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        const member = makeMember('1', 'Alice');
        client.emit('guildMemberAdd', member);
        await tick();
        // Renders to displayName, equal to current null/displayName, so no API call.
        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('guildMemberUpdate ignored when not bot ready', () => {
        const client = makeClientStub();
        client.botReadyAt = null;
        const m = new NicknameManager(client);
        m.install();
        const oldM = makeMember('1', 'Alice', 'old');
        const newM = makeMember('1', 'Alice', 'new');
        client.emit('guildMemberUpdate', oldM, newM);
        // No throw, no state change.
        expect(m.members.has('1')).toBe(false);
    });

    test('guildMemberUpdate skipped for partial members', () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        const oldM = makeMember('1', 'Alice', 'old');
        oldM.partial = true;
        const newM = makeMember('1', 'Alice', 'new');
        newM.partial = true;
        client.emit('guildMemberUpdate', oldM, newM);
        expect(m.members.has('1')).toBe(false);
    });

    test('botReady processes every cached member, including ones with role-prefix providers', async () => {
        const client = makeClientStub();
        client.modules = {nicknames: {enabled: true}};
        const m = new NicknameManager(client);
        m.install();

        // Three members: A needs prefix added; B already has it; C has no role.
        const memberA = makeMember('A', 'Alice', null);
        const memberB = makeMember('B', 'Bob', '[VIP] Bob');
        const memberC = makeMember('C', 'Carol', null);
        client.guild.members.cache.set('A', memberA);
        client.guild.members.cache.set('B', memberB);
        client.guild.members.cache.set('C', memberC);

        // Only A and B have the configured role.
        const roleHaver = new Set(['A', 'B']);
        m.registerProvider('nicknames', 'nicknames', async (member) => {
            const out = [{
                source: 'nicknames:base',
                position: 'base',
                value: member.user.displayName,
                priority: 100
            }];
            if (roleHaver.has(member.id)) {
                out.push({
                    source: 'nicknames:rolePrefix',
                    position: 'prefix',
                    value: '[VIP] ',
                    priority: 10
                });
            }
            return out;
        });

        client.emit('botReady');
        // Allow all queued setImmediate flushes to drain.
        for (let i = 0; i < 5; i = i + 1) await tick();

        expect(memberA.setNickname).toHaveBeenCalledWith('[VIP] Alice', expect.any(String));
        expect(memberB.setNickname).not.toHaveBeenCalled();
        expect(memberC.setNickname).not.toHaveBeenCalled();
    });

    test('guildMemberUpdate ignores echo of own write', async () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        const member = makeMember('1', 'Alice', 'Alice 🔥3');
        m.attachMember(member);
        m.members.get('1').lastRendered = 'Alice 🔥3';

        const oldM = makeMember('1', 'Alice', 'Alice');
        client.emit('guildMemberUpdate', oldM, member);
        await tick();
        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('guildMemberRemove drops state and member ref so they do not leak', () => {
        const client = makeClientStub();
        const m = new NicknameManager(client);
        m.install();
        const member = makeMember('1', 'Alice');
        member.guild = {id: 'g1'};
        m.attachMember(member);
        m.set('1', 'src', {position: 'suffix', value: ' X', priority: 1});

        client.emit('guildMemberRemove', member);

        expect(m.members.has('1')).toBe(false);
        expect(m.memberRefs?.has('1')).toBe(false);
    });

    test('bootstrap hook can poll providers itself to see active contributions', async () => {
        // The bootstrap hook is responsible for making any provider state it needs
        // visible (by calling pollProviders). This is the contract the nicknames
        // module's persistExternalEditAsBase relies on so it can strip live wraps
        // (e.g. AFK) out of the residue at restart — otherwise a user whose
        // nickname is "[AFK] Alice" at shutdown would have "[AFK] Alice" saved
        // as the new base and the AFK provider would re-wrap it to
        // "[AFK] [AFK] Alice" on the next render.
        const client = makeClientStub();
        client.modules = {afk: {enabled: true}};
        const m = new NicknameManager(client);
        m.install();

        const seenContribCounts = [];
        m.registerProvider('afk', 'afk', async () => ([{
            source: 'afk',
            position: 'wrap',
            value: (s) => '[AFK] ' + s,
            priority: 500
        }]));
        m.setBootstrapMemberHook(async (member) => {
            await m.pollProviders(member);
            seenContribCounts.push(m.getContributions(member.id).length);
        });

        const member = makeMember('1', 'Alice', '[AFK] Alice');
        client.guild.members.cache.set('1', member);

        client.emit('botReady');
        for (let i = 0; i < 5; i = i + 1) await tick();

        expect(seenContribCounts).toEqual([1]);
    });

    test('handleConfigReload preserves memberRefs so subsequent requestUpdate still flushes', async () => {
        // configReload wipes contributions but must NOT drop memberRefs — members
        // didn't actually leave the guild. Modules with timed handlers (e.g. mute
        // expiry) call requestUpdate after a reload and would silently no-op if
        // the ref was dropped, because flushMember bails when memberRefs lookup
        // returns undefined.
        const client = makeClientStub();
        client.modules = {streak: {enabled: true}};
        const m = new NicknameManager(client);
        m.install();

        m.registerProvider('nicknames', 'streak', async () => ([
            {source: 'nicknames:base', position: 'base', value: 'Alice', priority: 100},
            {source: 'streak', position: 'suffix', value: ' 🔥1', priority: 1}
        ]));

        const member = makeMember('1', 'Alice', null);
        m.attachMember(member);

        client.emit('configReload');

        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Alice 🔥1', expect.any(String));
    });

    test('guildMemberUpdate triggers a flush on manual nick change when nicknames module is disabled', async () => {
        // With the nicknames module off, no other listener will requestUpdate
        // after a manual nickname edit. The manager must schedule the flush
        // itself so decorating modules (here: streak) can re-apply their
        // contributions on top of the new base. Without this, a user who
        // manually removes their streak suffix would keep the bare nickname
        // until some unrelated event eventually fires.
        const client = makeClientStub();
        client.modules = {nicknames: {enabled: false}, streak: {enabled: true}};
        const m = new NicknameManager(client);
        m.install();

        m.registerProvider('streak', 'streak', async () => ({
            source: 'streak',
            position: 'suffix',
            value: ' 🔥3',
            match: / 🔥\d+/,
            priority: 1
        }));

        const oldM = makeMember('1', 'Alice', 'Alice 🔥3');
        const newM = makeMember('1', 'Alice', 'Bob');
        client.emit('guildMemberUpdate', oldM, newM);
        for (let i = 0; i < 5; i = i + 1) await tick();

        expect(newM.setNickname).toHaveBeenCalledWith('Bob 🔥3', expect.any(String));
    });

    test('guildMemberUpdate does not race the owning module on a manual edit', async () => {
        // Simulates the all-modules-enabled scenario: a user manually changes their
        // nickname. The nicknames module's own guildMemberUpdate handler awaits a DB
        // write (persistExternalEditAsBase) before requesting an update. If the
        // manager re-rendered from its own synchronous handler, the flush would
        // poll the provider with a stale base and clobber the manual edit. The
        // manager must not schedule a flush on its own from this event.
        const client = makeClientStub();
        client.modules = {nicknames: {enabled: true}};
        const m = new NicknameManager(client);
        m.install();

        // Provider returns a stale base — the value User.nickname held before the
        // manual edit was persisted. If a flush runs now, it would set this stale
        // value back, reverting the user's change.
        m.registerProvider('nicknames', 'nicknames', async () => ([{
            source: 'nicknames:base',
            position: 'base',
            value: 'Albi',
            priority: 100
        }]));

        const oldM = makeMember('1', 'Albi', 'Albi');
        const newM = makeMember('1', 'Albi', 'Dr. rer. nat. Albj');
        client.emit('guildMemberUpdate', oldM, newM);
        for (let i = 0; i < 5; i = i + 1) await tick();

        expect(newM.setNickname).not.toHaveBeenCalled();
    });
});