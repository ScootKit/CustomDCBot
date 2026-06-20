const NicknameManager = require('../../src/functions/nicknameManager');

/**
 * Builds a NicknameManager bound to a client stub.
 * @param {Object} [modules]
 * @returns {NicknameManager}
 */
function makeManager(modules = {}) {
    const client = {
        modules,
        logger: {
            warn: () => {
            },
            debug: () => {
            }
        }
    };
    return new NicknameManager(client);
}

/**
 * Builds a minimal GuildMember-shaped object with a mockable setNickname.
 * @param {string} id
 * @param {string} displayName
 * @param {string|null} [nickname]
 * @param {Object} [opts]
 * @returns {Object}
 */
function makeMember(id, displayName, nickname, opts = {}) {
    const setNickname = opts.setNickname ?? jest.fn().mockResolvedValue();
    return {
        id,
        nickname: nickname ?? null,
        user: {displayName},
        setNickname
    };
}

/**
 * Awaits one event loop turn so queued setImmediate callbacks can run.
 * @returns {Promise<void>}
 */
function tick() {
    return new Promise(setImmediate);
}

describe('NicknameManager flush', () => {
    test('multiple set calls in same tick coalesce to one setNickname call', async () => {
        const m = makeManager();
        const member = makeMember('1', 'Alice');
        m.attachMember(member);

        m.set('1', 'nicknames:base', {
            position: 'base',
            value: 'Alice',
            priority: 100
        });
        m.set('1', 'src-a', {
            position: 'suffix',
            value: ' A',
            priority: 1
        });
        m.set('1', 'src-b', {
            position: 'suffix',
            value: ' B',
            priority: 2
        });
        m.requestUpdate('1');

        await tick();

        expect(member.setNickname).toHaveBeenCalledTimes(1);
        expect(member.setNickname).toHaveBeenCalledWith('Alice B A', expect.any(String));
    });

    test('skip setNickname when rendered === current member.nickname', async () => {
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Alice 🔥3');
        m.attachMember(member);

        m.set('1', 'nicknames:base', {
            position: 'base',
            value: 'Alice',
            priority: 100
        });
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).not.toHaveBeenCalled();
        expect(m.getLastRendered('1')).toBe('Alice 🔥3');
    });

    test('skip setNickname when rendered === displayName and member.nickname is null', async () => {
        const m = makeManager();
        const member = makeMember('1', 'Alice', null);
        m.attachMember(member);

        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('does not overwrite a manual nickname when no base contribution is provided', async () => {
        const m = makeManager();
        const member = makeMember('1', 'Bob', 'Alice');
        m.attachMember(member);

        m.requestUpdate('1');
        await tick();

        // No module touched this member; manager must leave the manual nickname alone.
        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('leaves manual nickname alone when only a disabled-module global transform is registered', async () => {
        // Module onLoad runs even when the module is disabled, so registration alone
        // is not a signal that the module wants to participate. The flush bail-out
        // must filter global transforms by enabled state.
        const m = makeManager({sanitizer: {enabled: false}});
        m.registerGlobalTransform('sanitizer', 'sanitizer', {
            position: 'baseTransform',
            value: (s) => s.toUpperCase(),
            priority: 50
        });
        const member = makeMember('1', 'Bob', 'Dr. rer. nat. Albj');
        m.attachMember(member);

        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('global transform applies to manual nickname (not displayName) when no base provider contributes', async () => {
        // Setup: sanitizer (a global baseTransform) is the ONLY enabled contributor.
        // The user manually set their nickname to "★Bob"; the sanitizer strips the
        // leading "★". Base must default to the manual nickname so the transform
        // operates on what's there, not on displayName which would clobber the edit.
        const m = makeManager({sanitizer: {enabled: true}});
        m.registerGlobalTransform('sanitizer', 'sanitizer', {
            position: 'baseTransform',
            value: (s) => s.replace(/^[★]+/, ''),
            priority: 50
        });
        const member = makeMember('1', 'Alice', '★Bob');
        m.attachMember(member);

        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob', expect.any(String));
    });

    test('decoration without a base owner derives base from current nickname instead of clobbering it', async () => {
        // The user manually set their nickname to "Bob"; activity-streak is the
        // only decorating module active (no nicknames module providing a base).
        // The manager must derive the base from "Bob" (not displayName "Alice")
        // and apply the streak suffix on top — preserving the manual edit while
        // still enforcing the always-on decoration.
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob');
        m.attachMember(member);

        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob 🔥3', expect.any(String));
    });

    test('derives base from current nickname and strips matching decoration on bootstrap', async () => {
        // Live nickname already includes the streak suffix the provider returns.
        // First flush has no lastDecorations history, so derivation falls back
        // to stripping the current decoration patterns. Result must equal the
        // live nickname so no API call is made.
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob 🔥3');
        m.attachMember(member);

        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).not.toHaveBeenCalled();
    });

    test('cold start: streak suffix with a different count is stripped via match regex', async () => {
        // Bot was offline while streak ticked from 3 to 4. Live nickname still
        // shows "Bob 🔥3"; the provider now returns " 🔥4". Without a match
        // pattern, stripping " 🔥4" from "Bob 🔥3" would fail and the next
        // render would produce "Bob 🔥3 🔥4". With the provider exposing
        // `match: / 🔥\d+/`, the prior count is recognized and stripped,
        // yielding "Bob 🔥4".
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob 🔥3');
        m.attachMember(member);

        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥4',
            match: / 🔥\d+/,
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob 🔥4', expect.any(String));
    });

    test('only activity-streak active: streak is re-added after the user removes it manually', async () => {
        // Activity-streak is the only decorating module; no nicknames module
        // owns the base. The user manually edits their nickname to plain "Bob"
        // (no suffix). Next flush must re-add the streak suffix on top — the
        // streak is core functionality and must always be enforced.
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob');
        m.attachMember(member);

        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥5',
            match: / 🔥\d+/,
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob 🔥5', expect.any(String));
    });

    test('manual streak-count edit is reverted to the DB value, not doubled', async () => {
        // DB says streak = 2. Live nickname is "Bob 🔥2". A user manually edits
        // their nickname to "Bob 🔥3" trying to display a higher streak. The
        // manager must derive the base by stripping the bogus " 🔥3" via the
        // provider's match regex (not the literal " 🔥2"), then re-apply the
        // authoritative " 🔥2" — so the result is "Bob 🔥2", not "Bob 🔥3 🔥2".
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob 🔥3');
        m.attachMember(member);

        // Provider returns the authoritative value with a match pattern that
        // catches any " 🔥<n>" suffix on the live nickname.
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥2',
            match: / 🔥\d+/,
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob 🔥2', expect.any(String));
    });

    test('removing a wrap strips it off the live nickname via lastDecorations', async () => {
        // User was AFK; live nickname has the [AFK] wrap. AFK ends. Provider
        // returns null; current decorations are now empty. lastDecorations
        // still records the wrap, so the manager strips it off the live
        // nickname instead of leaving the [AFK] permanently stuck.
        const m = makeManager();
        const member = makeMember('1', 'Alice', '[AFK] Bob');
        m.attachMember(member);

        // Establish lastDecorations by going through a flush WITH the wrap.
        m.set('1', 'afk', {
            position: 'wrap',
            value: (s) => '[AFK] ' + s,
            priority: 500
        });
        m.requestUpdate('1');
        await tick();

        // Now AFK ends — clear the contribution and request another flush.
        m.clear('1', 'afk');
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenLastCalledWith('Bob', expect.any(String));
    });

    test('only moderation active: untouched members are not flushed; only the muted one is wrapped', async () => {
        // Moderation provider returns a wrap only for muted members. With no
        // nicknames module, the manager has no opinion on un-muted members —
        // it must NOT touch their nicknames. The muted user gets the wrap
        // applied on top of their current (manual) nickname.
        const m = makeManager({moderation: {enabled: true}});

        m.registerProvider('mod:mute', 'moderation', async (member) => {
            if (!member.isCommunicationDisabled?.()) return null;
            return {
                source: 'mod:mute',
                position: 'wrap',
                value: (s) => '[Muted] ' + s,
                priority: 1000,
                exclusive: true
            };
        });

        const innocent = makeMember('A', 'Alice', 'AliceCustom');
        innocent.isCommunicationDisabled = () => false;
        m.attachMember(innocent);
        m.requestUpdate('A');

        const muted = makeMember('B', 'Bob', 'BobCustom');
        muted.isCommunicationDisabled = () => true;
        m.attachMember(muted);
        m.requestUpdate('B');

        await tick();
        await tick();

        expect(innocent.setNickname).not.toHaveBeenCalled();
        expect(muted.setNickname).toHaveBeenCalledWith('[Muted] BobCustom', expect.any(String));
    });

    test('decoration value change uses lastDecorations to strip the prior pattern', async () => {
        // Streak goes from " 🔥3" to " 🔥4". The first flush establishes
        // lastDecorations=[" 🔥3"]. After that the streak value changes; the
        // second flush must strip the OLD " 🔥3" off "Bob 🔥3" before applying
        // " 🔥4", producing "Bob 🔥4" — not "Bob 🔥3 🔥4".
        const m = makeManager();
        const member = makeMember('1', 'Alice', 'Bob 🔥3');
        m.attachMember(member);

        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥3',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        // Streak ticks up. Mutate the member ref's nickname to mirror Discord.
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥4',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(member.setNickname).toHaveBeenCalledWith('Bob 🔥4', expect.any(String));
    });

    test('updates lastRendered on successful setNickname', async () => {
        const m = makeManager();
        const member = makeMember('1', 'Alice');
        m.attachMember(member);

        m.set('1', 'nicknames:base', {
            position: 'base',
            value: 'Alice',
            priority: 100
        });
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥1',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(m.getLastRendered('1')).toBe('Alice 🔥1');
    });

    test('does not update lastRendered on setNickname failure', async () => {
        const setNickname = jest.fn().mockRejectedValue(new Error('rate limit'));
        const m = makeManager();
        const member = makeMember('1', 'Alice', null, {setNickname});
        m.attachMember(member);

        m.set('1', 'nicknames:base', {
            position: 'base',
            value: 'Alice',
            priority: 100
        });
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥1',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        expect(setNickname).toHaveBeenCalled();
        expect(m.getLastRendered('1')).toBe(null);
    });

    test('provider-driven flush does not schedule an infinite loop', async () => {
        const m = makeManager({mod: {enabled: true}});
        let pollCount = 0;

        /**
         * Stable provider; we count invocations to detect a polling loop.
         * @returns {Object}
         */
        function provider() {
            pollCount = pollCount + 1;
            return {
                position: 'suffix',
                value: ' X',
                priority: 1
            };
        }

        m.registerProvider('test', 'mod', provider);

        const member = makeMember('1', 'Alice');
        m.attachMember(member);
        m.requestUpdate('1');
        await tick();
        await tick();
        await tick();
        await tick();

        // One poll for the initial flush. Anything beyond a small handful is a loop.
        expect(pollCount).toBeLessThanOrEqual(2);
    });

    test('serializes pending setNickname per member', async () => {
        let resolveFirst;
        const firstPromise = new Promise(r => {
            resolveFirst = r;
        });
        const setNickname = jest.fn()
            .mockImplementationOnce(() => firstPromise)
            .mockResolvedValue();

        const m = makeManager();
        const member = makeMember('1', 'Alice', null, {setNickname});
        m.attachMember(member);

        m.set('1', 'nicknames:base', {
            position: 'base',
            value: 'Alice',
            priority: 100
        });
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥1',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        // First setNickname call is in flight. Queue another change.
        m.set('1', 'streak', {
            position: 'suffix',
            value: ' 🔥2',
            priority: 1
        });
        m.requestUpdate('1');
        await tick();

        // Second flush should be waiting on first; setNickname not yet called twice.
        expect(setNickname).toHaveBeenCalledTimes(1);

        resolveFirst();
        await tick();
        await tick();

        expect(setNickname).toHaveBeenCalledTimes(2);
        expect(setNickname).toHaveBeenLastCalledWith('Alice 🔥2', expect.any(String));
    });
});