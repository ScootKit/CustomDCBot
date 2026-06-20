/*
 * Behavior tests for the moderation "issue" actions in staff-management.js:
 *
 *   - issueInfraction(): feature gate, self-target guard, permission gate, the
 *     "use the suspension command instead" guard, invalid-duration rejection, and
 *     the happy path that persists an Infraction
 *   - issueSuspension(): both feature gates (infractions + suspensions),
 *     self-target / permission guards, invalid duration, and the happy path that
 *     upserts a suspended StaffProfile, adds the suspension role and creates the
 *     Infraction record
 *   - promoteUser(): feature gate, self-promote guard, the role-hierarchy guard
 *     when autoAddRole is on, and the happy path that adds the role + persists a
 *     Promotion
 *
 * embedTypeV2 / dateToDiscordTimestamp / safeSetFooter are mocked; the channel
 * log + DM steps are exercised lightly (no channel configured) to keep the focus
 * on the decision logic and persistence.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({
        content: '',
        embeds: []
    }),
    safeSetFooter: jest.fn((embed) => embed),
    dateToDiscordTimestamp: jest.fn(() => '<t:0:F>')
}));

const mgmt = require('../../modules/staff-management-system/staff-management');

function modelStub(methods = {}) {
    return {
        create: jest.fn().mockResolvedValue({
            caseId: 100,
            update: jest.fn().mockResolvedValue()
        }),
        upsert: jest.fn().mockResolvedValue(),
        findOne: jest.fn().mockResolvedValue(null),
        ...methods
    };
}

function makeClient(models = {}, configs = {}) {
    return {
        guildID: 'g1',
        strings: {footer: 'f'},
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn()
        },
        models: {
            'staff-management-system': {
                Infraction: modelStub(),
                StaffProfile: modelStub(),
                Promotion: modelStub(),
                ...models
            }
        },
        configurations: {'staff-management-system': configs}
    };
}

function targetMember(id = 'target') {
    return {
        id,
        user: {
            id,
            tag: 'T#1',
            username: 'T',
            toString: () => `<@${id}>`,
            displayAvatarURL: () => 'https://cdn.example/a.png',
            send: jest.fn().mockResolvedValue()
        },
        roles: {
            cache: {filter: () => ({map: () => []})},
            remove: jest.fn().mockResolvedValue(),
            add: jest.fn().mockResolvedValue()
        }
    };
}

function makeInteraction(overrides = {}) {
    return {
        user: {
            id: 'mod',
            username: 'Mod',
            toString: () => '<@mod>',
            displayAvatarURL: () => 'https://cdn.example/m.png'
        },
        member: {
            permissions: {has: () => true},
            roles: {cache: {some: () => true}}
        },
        guild: {
            channels: {fetch: jest.fn().mockResolvedValue(null)},
            roles: {cache: {get: () => null}}
        },
        options: {getChannel: () => null},
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        ...overrides
    };
}

describe('issueInfraction', () => {
    test('is gated behind enableInfractions', async () => {
        const client = makeClient({}, {infractions: {enableInfractions: false}});
        const interaction = makeInteraction();
        await mgmt.issueInfraction(client, interaction, targetMember(), 'Warning', 'reason', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-feat-disabled')}));
    });

    test('refuses self-infractions', async () => {
        const client = makeClient({}, {infractions: {enableInfractions: true}});
        const interaction = makeInteraction({
            user: {
                id: 'self',
                username: 'S',
                toString: () => '<@self>',
                displayAvatarURL: () => 'x'
            }
        });
        await mgmt.issueInfraction(client, interaction, targetMember('self'), 'Warning', 'r', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-self-infract')}));
    });

    test('rejects insufficient permissions', async () => {
        const client = makeClient({}, {
            infractions: {
                enableInfractions: true,
                staffRoles: ['staff']
            }
        });
        const interaction = makeInteraction({
            member: {
                permissions: {has: () => false},
                roles: {cache: {some: () => false}}
            }
        });
        await mgmt.issueInfraction(client, interaction, targetMember(), 'Warning', 'r', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-gen-no-perm')}));
    });

    test('redirects suspensions to the dedicated command', async () => {
        const client = makeClient({}, {infractions: {enableInfractions: true}});
        const interaction = makeInteraction();
        await mgmt.issueInfraction(client, interaction, targetMember(), 'Suspension', 'r', null);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-use-susp')}));
    });

    test('rejects an invalid expiry duration', async () => {
        const client = makeClient({}, {infractions: {enableInfractions: true}});
        const interaction = makeInteraction();
        await mgmt.issueInfraction(client, interaction, targetMember(), 'Warning', 'r', 'garbage');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-inv-dur')}));
    });

    test('persists the infraction on the happy path', async () => {
        const create = jest.fn().mockResolvedValue({
            caseId: 42,
            update: jest.fn().mockResolvedValue()
        });
        const client = makeClient({Infraction: modelStub({create})}, {infractions: {enableInfractions: true}});
        const interaction = makeInteraction();
        await mgmt.issueInfraction(client, interaction, targetMember(), 'Warning', 'broke a rule', '7d');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'target',
            issuerId: 'mod',
            type: 'Warning',
            reason: 'broke a rule',
            active: true
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('succ-infract')}));
    });
});

describe('issueSuspension', () => {
    test('requires both enableInfractions and enableSuspensions', async () => {
        const client1 = makeClient({}, {
            infractions: {
                enableInfractions: false,
                enableSuspensions: true
            }
        });
        const i1 = makeInteraction();
        await mgmt.issueSuspension(client1, i1, targetMember(), '7d', 'r');
        expect(i1.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-feat-disabled')}));

        const client2 = makeClient({}, {
            infractions: {
                enableInfractions: true,
                enableSuspensions: false
            }
        });
        const i2 = makeInteraction();
        await mgmt.issueSuspension(client2, i2, targetMember(), '7d', 'r');
        expect(i2.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-feat-disabled')}));
    });

    test('rejects an invalid duration', async () => {
        const client = makeClient({}, {
            infractions: {
                enableInfractions: true,
                enableSuspensions: true
            }
        });
        const interaction = makeInteraction();
        await mgmt.issueSuspension(client, interaction, targetMember(), 'nonsense', 'r');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-inv-dur')}));
    });

    test('suspends: upserts the profile, adds the role and creates the infraction', async () => {
        const upsert = jest.fn().mockResolvedValue();
        const create = jest.fn().mockResolvedValue({
            caseId: 50,
            update: jest.fn().mockResolvedValue()
        });
        const client = makeClient(
            {
                StaffProfile: modelStub({upsert}),
                Infraction: modelStub({create})
            },
            {
                infractions: {
                    enableInfractions: true,
                    enableSuspensions: true,
                    suspensionRole: 'susp-role'
                }
            }
        );
        const target = targetMember();
        const interaction = makeInteraction();
        await mgmt.issueSuspension(client, interaction, target, '7d', 'bad behaviour');
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'target',
            isSuspended: true
        }));
        expect(target.roles.add).toHaveBeenCalledWith('susp-role');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            type: 'Suspension',
            durationDays: 7
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('succ-susp')}));
    });
});

describe('promoteUser', () => {
    function newRole(position = 1) {
        return {
            id: 'role9',
            name: 'Senior',
            position,
            toString: () => '<@&role9>'
        };
    }

    test('is gated behind enablePromotions', async () => {
        const client = makeClient({}, {promotions: {enablePromotions: false}});
        const interaction = makeInteraction();
        await mgmt.promoteUser(client, interaction, targetMember(), newRole(), 'great');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-feat-disabled')}));
    });

    test('refuses self-promotion', async () => {
        const client = makeClient({}, {promotions: {enablePromotions: true}});
        const interaction = makeInteraction({
            user: {
                id: 'self',
                username: 'S',
                toString: () => '<@self>',
                displayAvatarURL: () => 'x'
            }
        });
        await mgmt.promoteUser(client, interaction, targetMember('self'), newRole(), 'great');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-self-promo')}));
    });

    test('blocks when the bot role is not high enough to grant the role', async () => {
        const client = makeClient({}, {
            promotions: {
                enablePromotions: true,
                autoAddRole: true
            }
        });
        const interaction = makeInteraction();
        interaction.guild.members = {me: {roles: {highest: {position: 1}}}};
        await mgmt.promoteUser(client, interaction, targetMember(), newRole(5), 'great');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('err-role-hier')}));
    });

    test('adds the role and persists a promotion on the happy path', async () => {
        const create = jest.fn().mockResolvedValue({update: jest.fn().mockResolvedValue()});
        const client = makeClient({Promotion: modelStub({create})}, {
            promotions: {
                enablePromotions: true,
                autoAddRole: true
            }
        });
        const interaction = makeInteraction();
        interaction.guild.members = {me: {roles: {highest: {position: 10}}}};
        const target = targetMember();
        await mgmt.promoteUser(client, interaction, target, newRole(5), 'earned it');
        expect(target.roles.add).toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'target',
            issuerId: 'mod',
            newRole: 'role9',
            reason: 'earned it'
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({content: expect.stringContaining('succ-promo')}));
    });
});