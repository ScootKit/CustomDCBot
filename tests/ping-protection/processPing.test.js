/*
 * Behavioural tests for ping-protection's processPing / executeAction /
 * executeDataDeletion.
 *
 * processPing decides whether a member crosses a moderation rule's ping
 * threshold within a timeframe and, if so, punishes them (unless a recent
 * action already exists). executeAction enforces role-hierarchy safety and
 * dispatches MUTE/KICK. executeDataDeletion fans out destroy() calls based on
 * the requested data type.
 */
const pp = require('../../modules/ping-protection/ping-protection');

function makeLogger() {
    return {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
    };
}

function makeClient({
                        moderation = [],
                        storage = {enablePingHistory: false},
                        pingCount = 0,
                        recentLog = null
                    } = {}) {
    return {
        user: {id: 'bot'},
        logger: makeLogger(),
        strings: {
            disableFooterTimestamp: true,
            footer: 'f',
            footerImgUrl: ''
        },
        configurations: {
            'ping-protection': {
                configuration: {enableAutomod: false},
                storage,
                moderation
            }
        },
        models: {
            'ping-protection': {
                PingHistory: {
                    findOne: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(),
                    count: jest.fn().mockResolvedValue(pingCount),
                    destroy: jest.fn().mockResolvedValue()
                },
                ModerationLog: {
                    findOne: jest.fn().mockResolvedValue(recentLog),
                    create: jest.fn().mockResolvedValue(),
                    destroy: jest.fn().mockResolvedValue()
                },
                LeaverData: {destroy: jest.fn().mockResolvedValue()}
            }
        }
    };
}

function makeMember({mutable = true} = {}) {
    const member = {
        id: 'victim',
        user: {
            id: 'victim',
            tag: 'Victim#0001'
        },
        toString: () => '<@victim>',
        roles: {highest: {position: mutable ? 1 : 5}},
        timeout: jest.fn().mockResolvedValue(),
        kick: jest.fn().mockResolvedValue(),
        guild: {
            members: {
                fetch: jest.fn().mockResolvedValue({roles: {highest: {position: 5}}})
            }
        }
    };
    return member;
}

describe('processPing', () => {
    test('does nothing when there are no moderation rules', async () => {
        const client = makeClient({moderation: []});
        const member = makeMember();
        await pp.processPing(client, 'victim', 'target', false, 'url', null, member);
        expect(member.timeout).not.toHaveBeenCalled();
        expect(client.models['ping-protection'].ModerationLog.create).not.toHaveBeenCalled();
    });

    test('punishes (MUTE) once the ping count meets the rule threshold', async () => {
        const client = makeClient({
            moderation: [{
                actionType: 'MUTE',
                muteDuration: 10,
                pingsCount: 3
            }],
            pingCount: 3
        });
        const member = makeMember();
        await pp.processPing(client, 'victim', 'target', false, 'url', null, member);
        expect(member.timeout).toHaveBeenCalledWith(10 * 60000, expect.any(String));
        expect(client.models['ping-protection'].ModerationLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                victimID: 'victim',
                type: 'MUTE',
                actionDuration: 10
            })
        );
    });

    test('does NOT punish when below threshold', async () => {
        const client = makeClient({
            moderation: [{
                actionType: 'MUTE',
                muteDuration: 10,
                pingsCount: 5
            }],
            pingCount: 2
        });
        const member = makeMember();
        await pp.processPing(client, 'victim', 'target', false, 'url', null, member);
        expect(member.timeout).not.toHaveBeenCalled();
    });

    test('skips punishment when a recent moderation log exists (anti-double-punish)', async () => {
        const client = makeClient({
            moderation: [{
                actionType: 'MUTE',
                muteDuration: 10,
                pingsCount: 1
            }],
            pingCount: 5,
            recentLog: {id: 1}
        });
        const member = makeMember();
        await pp.processPing(client, 'victim', 'target', false, 'url', null, member);
        expect(member.timeout).not.toHaveBeenCalled();
    });

    test('records ping history only when enabled in storage', async () => {
        const client = makeClient({
            moderation: [],
            storage: {enablePingHistory: true}
        });
        await pp.processPing(client, 'victim', 'target', false, 'url', null, makeMember());
        expect(client.models['ping-protection'].PingHistory.create).toHaveBeenCalled();
    });
});

describe('executeAction role hierarchy guard', () => {
    test('refuses to act when the target outranks the bot', async () => {
        const client = makeClient();
        const member = makeMember({mutable: false}); // member position 5, bot fetched as 5
        const ok = await pp.executeAction(client, member, {
            actionType: 'MUTE',
            muteDuration: 5
        }, 'reason', {}, null, {});
        expect(ok).toBe(false);
        expect(member.timeout).not.toHaveBeenCalled();
    });

    test('performs a KICK and reports success', async () => {
        const client = makeClient();
        const member = makeMember();
        const ok = await pp.executeAction(client, member, {actionType: 'KICK'}, 'reason', {}, null, {});
        expect(ok).toBe(true);
        expect(member.kick).toHaveBeenCalledWith('reason');
    });

    test('returns false for an unknown action type', async () => {
        const client = makeClient();
        const member = makeMember();
        const ok = await pp.executeAction(client, member, {actionType: 'WARN'}, 'reason', {}, null, {});
        expect(ok).toBe(false);
    });
});

describe('executeDataDeletion', () => {
    test('del_ping_history only wipes ping history', async () => {
        const client = makeClient();
        const models = client.models['ping-protection'];
        await pp.executeDataDeletion(client, 'u1', 'del_ping_history');
        expect(models.PingHistory.destroy).toHaveBeenCalledWith({where: {userId: 'u1'}});
        expect(models.ModerationLog.destroy).not.toHaveBeenCalled();
        expect(models.LeaverData.destroy).not.toHaveBeenCalled();
    });

    test('del_all wipes pings, mod logs, and leaver data', async () => {
        const client = makeClient();
        const models = client.models['ping-protection'];
        await pp.executeDataDeletion(client, 'u1', 'del_all');
        expect(models.PingHistory.destroy).toHaveBeenCalled();
        expect(models.ModerationLog.destroy).toHaveBeenCalledWith({where: {victimID: 'u1'}});
        expect(models.LeaverData.destroy).toHaveBeenCalledWith({where: {userId: 'u1'}});
    });
});