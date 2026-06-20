/*
 * Tests for the nicknames guildMemberUpdate handler.
 *
 * It reacts to role or nickname changes for the configured guild (after
 * botReady, skipping the guild owner). When the nickname changed to something
 * other than what the manager last rendered, the external edit is persisted as
 * the new base. In all change cases the member is re-attached and an update is
 * requested.
 */
const mockPersist = jest.fn().mockResolvedValue();
jest.mock('../../modules/nicknames/persistExternalEditAsBase', () => ({
    persistExternalEditAsBase: (...a) => mockPersist(...a)
}));

const handler = require('../../modules/nicknames/events/guildMemberUpdate');

function makeClient({
                        ready = true,
                        lastRendered = null
                    } = {}) {
    return {
        botReadyAt: ready ? Date.now() : undefined,
        guild: {id: 'g1'},
        nicknameManager: {
            getLastRendered: jest.fn(() => lastRendered),
            attachMember: jest.fn(),
            requestUpdate: jest.fn()
        }
    };
}

function makeMember({
                        id = 'm1',
                        guildID = 'g1',
                        ownerId = 'owner',
                        nickname = null,
                        roleIds = []
                    } = {}) {
    return {
        id,
        nickname,
        guild: {
            id: guildID,
            ownerId
        },
        roles: {cache: {keys: () => roleIds[Symbol.iterator]()}}
    };
}

beforeEach(() => mockPersist.mockClear());

test('ignores updates before botReady', async () => {
    const client = makeClient({ready: false});
    await handler.run(client, makeMember(), makeMember({nickname: 'New'}));
    expect(client.nicknameManager.requestUpdate).not.toHaveBeenCalled();
});

test('ignores updates from a different guild', async () => {
    const client = makeClient();
    await handler.run(client, makeMember({guildID: 'other'}), makeMember({
        guildID: 'other',
        nickname: 'X'
    }));
    expect(client.nicknameManager.requestUpdate).not.toHaveBeenCalled();
});

test('ignores the guild owner', async () => {
    const client = makeClient();
    const oldM = makeMember({
        id: 'owner',
        ownerId: 'owner'
    });
    const newM = makeMember({
        id: 'owner',
        ownerId: 'owner',
        nickname: 'X'
    });
    await handler.run(client, oldM, newM);
    expect(client.nicknameManager.requestUpdate).not.toHaveBeenCalled();
});

test('does nothing when neither roles nor nickname changed', async () => {
    const client = makeClient();
    const oldM = makeMember({
        roleIds: ['r1'],
        nickname: 'Same'
    });
    const newM = makeMember({
        roleIds: ['r1'],
        nickname: 'Same'
    });
    await handler.run(client, oldM, newM);
    expect(client.nicknameManager.attachMember).not.toHaveBeenCalled();
});

test('persists an external nickname edit that differs from the last render', async () => {
    const client = makeClient({lastRendered: '[Bot] Alice'});
    const oldM = makeMember({nickname: 'Alice'});
    const newM = makeMember({nickname: 'Bob'}); // user manually changed it
    await handler.run(client, oldM, newM);
    expect(mockPersist).toHaveBeenCalledWith(client, newM);
    expect(client.nicknameManager.attachMember).toHaveBeenCalledWith(newM);
    expect(client.nicknameManager.requestUpdate).toHaveBeenCalledWith('m1');
});

test('does not persist when the nickname matches the manager last render', async () => {
    const client = makeClient({lastRendered: 'Rendered'});
    const oldM = makeMember({nickname: 'Old'});
    const newM = makeMember({nickname: 'Rendered'}); // the bot itself set it
    await handler.run(client, oldM, newM);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(client.nicknameManager.requestUpdate).toHaveBeenCalledWith('m1');
});

test('reacts to a role change even when the nickname is unchanged', async () => {
    const client = makeClient();
    const oldM = makeMember({
        roleIds: ['r1'],
        nickname: 'Same'
    });
    const newM = makeMember({
        roleIds: ['r1', 'r2'],
        nickname: 'Same'
    });
    await handler.run(client, oldM, newM);
    expect(mockPersist).not.toHaveBeenCalled(); // nick didn't change
    expect(client.nicknameManager.attachMember).toHaveBeenCalledWith(newM);
    expect(client.nicknameManager.requestUpdate).toHaveBeenCalled();
});

test('detects role removal (size shrink) as a change', async () => {
    const client = makeClient();
    const oldM = makeMember({
        roleIds: ['r1', 'r2'],
        nickname: 'Same'
    });
    const newM = makeMember({
        roleIds: ['r1'],
        nickname: 'Same'
    });
    await handler.run(client, oldM, newM);
    expect(client.nicknameManager.requestUpdate).toHaveBeenCalled();
});