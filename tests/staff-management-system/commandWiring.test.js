/*
 * Tests for the /staff-management command's option wiring (commands/
 * staff-management.js), separate from the underlying business logic (which is
 * covered in managementLogic / issueActions / activityChecks tests).
 *
 *   - subcommands.infraction.issue / .suspend / .void / .history and
 *     promotion.promote / review.submit pull the right options off the
 *     interaction and forward them to the (mocked) staff-management helpers
 *   - subcommands.panel renders the user panel ephemerally
 *   - activity-check.start gates on canManageChecks (permission) before starting
 *   - autoComplete.infraction.issue.type filters configured infraction types by
 *     the focused prefix, defaulting to Warning/Strike
 *
 * The sibling staff-management module is fully mocked so we only assert the
 * command layer's plumbing.
 */

jest.mock('../../modules/staff-management-system/staff-management', () => ({
    getConfig: (client, file) => client.configurations['staff-management-system'][file],
    applyFooter: (client, embed) => embed,
    checkStaffPermissions: jest.fn(() => true),
    issueInfraction: jest.fn().mockResolvedValue(),
    issueSuspension: jest.fn().mockResolvedValue(),
    voidInfraction: jest.fn().mockResolvedValue(),
    getInfractionHistory: jest.fn().mockResolvedValue(),
    promoteUser: jest.fn().mockResolvedValue(),
    getPromotionHistory: jest.fn().mockResolvedValue(),
    generateUserPanel: jest.fn().mockResolvedValue({
        embeds: [],
        components: []
    }),
    startActivityCheck: jest.fn().mockResolvedValue(),
    endActivityCheckProcess: jest.fn().mockResolvedValue(),
    submitReview: jest.fn().mockResolvedValue(),
    getReviewHistory: jest.fn().mockResolvedValue()
}));

const mgmt = require('../../modules/staff-management-system/staff-management');
const cmd = require('../../modules/staff-management-system/commands/staff-management');

function makeInteraction(opts = {}) {
    const optionMap = opts.options || {};
    return {
        client: {
            configurations: {'staff-management-system': {}},
            models: {'staff-management-system': {}}
        },
        member: {
            permissions: {has: () => true},
            roles: {cache: {some: () => true}}
        },
        user: {id: 'mod'},
        options: {
            getUser: jest.fn((k) => optionMap[k]),
            getMember: jest.fn((k) => optionMap[k]),
            getString: jest.fn((k) => optionMap[k]),
            getRole: jest.fn((k) => optionMap[k]),
            getInteger: jest.fn((k) => optionMap[k]),
            getFocused: jest.fn(() => opts.focused || '')
        },
        reply: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        respond: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    Object.values(mgmt).forEach(fn => typeof fn === 'function' && fn.mockClear?.());
});

describe('subcommand wiring', () => {
    test('panel renders the user panel ephemerally', async () => {
        const user = {id: 'u1'};
        const i = makeInteraction({options: {user}});
        await cmd.subcommands.panel(i);
        expect(mgmt.generateUserPanel).toHaveBeenCalledWith(i.client, user);
        expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({flags: expect.anything()}));
    });

    test('infraction.issue forwards user/type/reason/expiry', async () => {
        const member = {id: 'target'};
        const i = makeInteraction({
            options: {
                user: member,
                type: 'Warning',
                reason: 'why',
                expiry: '7d'
            }
        });
        await cmd.subcommands.infraction.issue(i);
        expect(mgmt.issueInfraction).toHaveBeenCalledWith(i.client, i, member, 'Warning', 'why', '7d');
    });

    test('infraction.suspend forwards user/duration/reason', async () => {
        const member = {id: 'target'};
        const i = makeInteraction({
            options: {
                user: member,
                duration: '7d',
                reason: 'why'
            }
        });
        await cmd.subcommands.infraction.suspend(i);
        expect(mgmt.issueSuspension).toHaveBeenCalledWith(i.client, i, member, '7d', 'why');
    });

    test('infraction.void forwards the reference', async () => {
        const i = makeInteraction({options: {reference: '42'}});
        await cmd.subcommands.infraction.void(i);
        expect(mgmt.voidInfraction).toHaveBeenCalledWith(i.client, i, '42');
    });

    test('infraction.history forwards the target user', async () => {
        const user = {id: 'u1'};
        const i = makeInteraction({options: {user}});
        await cmd.subcommands.infraction.history(i);
        expect(mgmt.getInfractionHistory).toHaveBeenCalledWith(i.client, i, user);
    });

    test('promotion.promote forwards user/role/reason', async () => {
        const member = {id: 'target'};
        const role = {id: 'role9'};
        const i = makeInteraction({
            options: {
                user: member,
                rank: role,
                reason: 'earned'
            }
        });
        await cmd.subcommands.promotion.promote(i);
        expect(mgmt.promoteUser).toHaveBeenCalledWith(i.client, i, member, role, 'earned');
    });

    test('review.submit forwards user/stars/comment', async () => {
        const user = {id: 'u1'};
        const i = makeInteraction({
            options: {
                user,
                stars: 5,
                comment: 'great'
            }
        });
        await cmd.subcommands.review.submit(i);
        expect(mgmt.submitReview).toHaveBeenCalledWith(i.client, i, user, 5, 'great');
    });
});

describe('activity-check.start permission gate', () => {
    // canManageChecks() is the command's own admin/role check (not the mocked
    // checkStaffPermissions), so we drive it via the interaction's member.
    test('starts when the member is an administrator', async () => {
        const i = makeInteraction();
        i.member = {
            permissions: {has: () => true},
            roles: {cache: {some: () => false}}
        };
        await cmd.subcommands['activity-check'].start(i);
        expect(mgmt.startActivityCheck).toHaveBeenCalledWith(i.client, i, false);
    });

    test('refuses and does not start when the member lacks permission', async () => {
        const i = makeInteraction();
        i.member = {
            permissions: {has: () => false},
            roles: {cache: {some: () => false}}
        };
        i.client.configurations['staff-management-system'].configuration = {supervisorRoles: ['sup']};
        await cmd.subcommands['activity-check'].start(i);
        expect(mgmt.startActivityCheck).not.toHaveBeenCalled();
        expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-no-perm')
        }));
    });
});

describe('infraction type autocomplete', () => {
    test('filters configured infraction types by the focused prefix', async () => {
        const i = makeInteraction({focused: 'str'});
        i.client.configurations['staff-management-system'].infractions = {infractionTypes: ['Warning', 'Strike', 'Strike 2']};
        await cmd.autoComplete.infraction.issue.type(i);
        const values = i.respond.mock.calls[0][0].map(c => c.value);
        expect(values).toEqual(['Strike', 'Strike 2']);
    });

    test('defaults to Warning/Strike when none are configured', async () => {
        const i = makeInteraction({focused: ''});
        i.client.configurations['staff-management-system'].infractions = {};
        await cmd.autoComplete.infraction.issue.type(i);
        expect(i.respond.mock.calls[0][0].map(c => c.value)).toEqual(['Warning', 'Strike']);
    });
});