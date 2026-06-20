/*
 * Tests for the team-list per-role user-string builder.
 *
 * buildUserString was extracted (behavior-preserving) from updateEmbedsIfNeeded.
 * It renders the members holding a role either as a status list (includeStatus)
 * or a comma-separated mention list, drops the trailing ", " on the comma form,
 * falls back to a "no users" localized string for empty roles, and (when
 * onlineShowHighestRole is on) skips users already listed under a higher role -
 * tracked via the mutated listedUserIDs accumulator.
 */
const {buildUserString} = require('../../modules/team-list/events/botReady').__test;

const role = {
    id: 'r1',
    toString: () => '<@&r1>'
};

function member(id, status) {
    return {
        user: {
            id,
            toString: () => `<@${id}>`
        },
        presence: status ? {status} : null
    };
}

test('renders a comma-separated mention list and strips the trailing separator', () => {
    const members = [member('a'), member('b')];
    const out = buildUserString(members, role, {includeStatus: false}, []);
    expect(out).toBe('<@a>, <@b>');
});

test('renders a status line per member when includeStatus is on', () => {
    const members = [member('a', 'online'), member('b', 'dnd')];
    const out = buildUserString(members, role, {includeStatus: true}, []);
    expect(out).toContain('<@a>: 🟢 team-list.online');
    expect(out).toContain('<@b>: 🔴 team-list.dnd');
});

test('defaults a member without presence to the offline icon/label', () => {
    const out = buildUserString([member('a')], role, {includeStatus: true}, []);
    expect(out).toContain('⚫ team-list.offline');
});

test('returns the localized empty-role string when no members hold the role', () => {
    const out = buildUserString([], role, {includeStatus: false}, []);
    expect(out).toBe('team-list.no-users-with-role(r=<@&r1>)');
});

test('skips already-listed users when onlineShowHighestRole is enabled', () => {
    const listed = ['a'];
    const out = buildUserString([member('a'), member('b')], role, {
        includeStatus: false,
        onlineShowHighestRole: true
    }, listed);
    // 'a' was already listed under a higher role -> only 'b' appears
    expect(out).toBe('<@b>');
    expect(listed).toEqual(['a', 'b']);
});

test('does NOT skip duplicates when onlineShowHighestRole is disabled', () => {
    const listed = ['a'];
    const out = buildUserString([member('a'), member('b')], role, {
        includeStatus: false,
        onlineShowHighestRole: false
    }, listed);
    expect(out).toBe('<@a>, <@b>');
});

test('accumulates listed user ids across calls', () => {
    const listed = [];
    buildUserString([member('a')], role, {includeStatus: false}, listed);
    buildUserString([member('b')], role, {includeStatus: false}, listed);
    expect(listed).toEqual(['a', 'b']);
});