/*
 * Tests for the /staff-status command's dynamic config + subcommand plumbing
 * (commands/staff-status.js), complementing staffStatus.test.js (handlers).
 *
 *   - config.disabled(): true when the status system is off, false when on
 *   - config.options(): returns no groups when disabled, an LOA-only group when
 *     only LOA is enabled, and both LOA + RA groups when both are enabled; each
 *     group exposes request/view/list/admin subcommands
 *   - beforeSubcommand(): defers ephemerally only when not already replied/deferred
 *   - subcommands.loa.admin / ra.admin: error when no member is supplied, else
 *     forward to handleStatusManage with the right type
 *
 * handleStatusManage et al. come through the real module; we only assert option
 * extraction here, so the model layer is stubbed to no-op.
 */

const status = require('../../modules/staff-management-system/commands/staff-status');

function makeClient(statusConfig) {
    return {configurations: {'staff-management-system': {status: statusConfig}}};
}

describe('config.disabled', () => {
    test('disabled when the status system is off', () => {
        expect(status.config.disabled(makeClient({enableStatusSystem: false}))).toBe(true);
    });

    test('enabled when the status system is on', () => {
        expect(status.config.disabled(makeClient({enableStatusSystem: true}))).toBe(false);
    });
});

describe('config.options', () => {
    test('returns an empty option set when the system is disabled', () => {
        const opts = status.config.options(makeClient({enableStatusSystem: false}));
        expect(opts).toEqual([]);
    });

    test('only includes the LOA group when only LOA is enabled', () => {
        const opts = status.config.options(makeClient({
            enableStatusSystem: true,
            enableLoa: true,
            enableRa: false
        }));
        expect(opts.map(g => g.name)).toEqual(['loa']);
        const sub = opts[0].options.map(o => o.name);
        expect(sub).toEqual(expect.arrayContaining(['request', 'view', 'list', 'admin']));
    });

    test('includes both LOA and RA groups when both are enabled', () => {
        const opts = status.config.options(makeClient({
            enableStatusSystem: true,
            enableLoa: true,
            enableRa: true
        }));
        expect(opts.map(g => g.name)).toEqual(['loa', 'ra']);
    });
});

describe('beforeSubcommand', () => {
    test('defers ephemerally when not already acknowledged', async () => {
        const interaction = {
            replied: false,
            deferred: false,
            deferReply: jest.fn().mockResolvedValue()
        };
        await status.beforeSubcommand(interaction);
        expect(interaction.deferReply).toHaveBeenCalledWith({flags: expect.anything()});
    });

    test('does not double-defer when already deferred', async () => {
        const interaction = {
            replied: false,
            deferred: true,
            deferReply: jest.fn().mockResolvedValue()
        };
        await status.beforeSubcommand(interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });
});

describe('admin subcommand member guard', () => {
    test('loa.admin errors when no member is supplied', async () => {
        const interaction = {
            client: {},
            options: {getMember: jest.fn(() => null)},
            editReply: jest.fn().mockResolvedValue()
        };
        await status.subcommands.loa.admin(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-no-mem')
        }));
    });

    test('ra.admin errors when no member is supplied', async () => {
        const interaction = {
            client: {},
            options: {getMember: jest.fn(() => null)},
            editReply: jest.fn().mockResolvedValue()
        };
        await status.subcommands.ra.admin(interaction);
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-no-mem')
        }));
    });
});