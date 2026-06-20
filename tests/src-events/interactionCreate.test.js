/*
 * Tests for the central interaction router (src/events/interactionCreate.js).
 *
 * The router decides, for every incoming interaction, whether to: reject with a
 * startup/wrong-guild warning, delegate to the scnx integration (custom commands,
 * select-roles, role buttons), look up a slash command, enforce module/disabled/
 * restricted guards, route autocomplete to the right autoComplete handler, or run
 * the command (with subcommand dispatch) and surface execution errors.
 *
 * scnx-integration is mocked inline so we can assert delegation without loading the
 * real integration. localize and main are auto-mapped by jest.config moduleNameMapper.
 */

/*
 * NOTE: the router requires localize via '../functions/localize' (no `src/`
 * segment) so jest.config's moduleNameMapper does not redirect it to the stub.
 * The real localize therefore loads here; warning-message assertions match on the
 * leading ⚠️ marker + ephemeral flag rather than exact localized text, which keeps
 * them resilient to wording/translation changes while still asserting the branch.
 */

jest.mock('../../src/functions/scnx-integration', () => ({
    customCommandInteractionClick: jest.fn().mockResolvedValue('cc-click'),
    handleSelectRoles: jest.fn().mockResolvedValue('select-roles'),
    handleRoleButton: jest.fn().mockResolvedValue('role-button'),
    customCommandSlashInteraction: jest.fn().mockResolvedValue('cc-slash')
}), {virtual: true});

const scnx = require('../../src/functions/scnx-integration');
const handler = require('../../src/events/interactionCreate');

/**
 * Builds a client stub with the surface the router touches.
 * @param {Object} [over] overrides merged onto the base client
 * @returns {Object}
 */
function makeClient(over = {}) {
    return {
        botReadyAt: new Date(),
        guild: {
            id: 'g1',
            name: 'Home'
        },
        scnxSetup: false,
        config: {botOperators: []},
        modules: {},
        commands: [],
        strings: {},
        logger: {
            error: jest.fn(),
            warn: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
        },
        ...over
    };
}

/**
 * Builds an interaction stub. Type predicates default to false; pass `type` to flip one.
 * @param {Object} [opts]
 * @returns {Object}
 */
function makeInteraction(opts = {}) {
    const {
        type = 'command',
        customId,
        commandName,
        guild = {
            id: 'g1',
            name: 'Home'
        },
        options = {},
        client: clientForInteraction = {
            logger: {
                error: jest.fn(),
                warn: jest.fn(),
                info: jest.fn(),
                debug: jest.fn()
            }
        }
    } = opts;
    const i = {
        customId,
        commandName,
        guild,
        user: {
            id: 'u1',
            tag: 'User#0001',
            username: 'User',
            discriminator: '0001'
        },
        options: {
            _group: undefined,
            _subcommand: undefined,
            _hoistedOptions: [],
            ...options
        },
        client: clientForInteraction,
        isAutocomplete: () => type === 'autocomplete',
        isButton: () => type === 'button',
        isSelectMenu: () => type === 'selectmenu',
        isCommand: () => type === 'command',
        isModalSubmit: () => type === 'modal',
        reply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue(),
        respond: jest.fn().mockResolvedValue(),
        deferred: false
    };
    return i;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('startup guard (botReadyAt unset)', () => {
    test('autocomplete gets empty respond before bot ready', async () => {
        const client = makeClient({botReadyAt: null});
        const interaction = makeInteraction({type: 'autocomplete'});
        await handler.run(client, interaction);
        expect(interaction.respond).toHaveBeenCalledWith({});
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('non-autocomplete gets startup warning reply before bot ready', async () => {
        const client = makeClient({botReadyAt: null});
        const interaction = makeInteraction({type: 'command'});
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith({
            content: expect.stringMatching(/^⚠️ /),
            ephemeral: true
        });
    });
});

describe('guild guards', () => {
    test('returns silently when interaction has no guild', async () => {
        const client = makeClient();
        const interaction = makeInteraction({guild: null});
        const result = await handler.run(client, interaction);
        expect(result).toBeUndefined();
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.respond).not.toHaveBeenCalled();
    });

    test('wrong-guild autocomplete responds empty', async () => {
        const client = makeClient();
        const interaction = makeInteraction({
            type: 'autocomplete',
            guild: {id: 'other'}
        });
        await handler.run(client, interaction);
        expect(interaction.respond).toHaveBeenCalledWith({});
    });

    test('wrong-guild command replies with wrong-guild warning including guild name', async () => {
        const client = makeClient();
        const interaction = makeInteraction({
            type: 'command',
            guild: {id: 'other'}
        });
        await handler.run(client, interaction);
        // Real localize interpolates the guild name into the message.
        expect(interaction.reply).toHaveBeenCalledWith({
            content: expect.stringContaining('Home'),
            ephemeral: true
        });
        expect(interaction.reply.mock.calls[0][0].content).toMatch(/^⚠️ /);
    });
});

describe('scnx delegation by customId', () => {
    test('cc- prefixed customId routes to customCommandInteractionClick when scnxSetup', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'cc-foo'
        });
        const result = await handler.run(client, interaction);
        expect(scnx.customCommandInteractionClick).toHaveBeenCalledWith(interaction);
        expect(result).toBe('cc-click');
    });

    test('cc- prefixed customId is NOT delegated when scnxSetup is false', async () => {
        const client = makeClient({scnxSetup: false});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'cc-foo'
        });
        await handler.run(client, interaction);
        expect(scnx.customCommandInteractionClick).not.toHaveBeenCalled();
    });

    test('select-roles select menu routes to handleSelectRoles', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'selectmenu',
            customId: 'select-roles-1'
        });
        const result = await handler.run(client, interaction);
        expect(scnx.handleSelectRoles).toHaveBeenCalledWith(client, interaction);
        expect(result).toBe('select-roles');
    });

    test('select-roles-apply button routes to handleSelectRoles', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'select-roles-apply'
        });
        await handler.run(client, interaction);
        expect(scnx.handleSelectRoles).toHaveBeenCalledWith(client, interaction);
    });

    test('select-roles-cancel button routes to handleSelectRoles', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'select-roles-cancel'
        });
        await handler.run(client, interaction);
        expect(scnx.handleSelectRoles).toHaveBeenCalledWith(client, interaction);
    });

    test('srb- prefixed button routes to handleRoleButton', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'srb-123'
        });
        const result = await handler.run(client, interaction);
        expect(scnx.handleRoleButton).toHaveBeenCalledWith(client, interaction);
        expect(result).toBe('role-button');
    });

    test('unrelated button with no commandName returns silently', async () => {
        const client = makeClient({scnxSetup: true});
        const interaction = makeInteraction({
            type: 'button',
            customId: 'something-else'
        });
        const result = await handler.run(client, interaction);
        expect(result).toBeUndefined();
        expect(scnx.handleSelectRoles).not.toHaveBeenCalled();
        expect(scnx.handleRoleButton).not.toHaveBeenCalled();
        expect(interaction.reply).not.toHaveBeenCalled();
    });
});

describe('command lookup', () => {
    test('missing command on scnx setup delegates to customCommandSlashInteraction', async () => {
        const client = makeClient({
            scnxSetup: true,
            commands: []
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'ghost'
        });
        const result = await handler.run(client, interaction);
        expect(scnx.customCommandSlashInteraction).toHaveBeenCalledWith(interaction);
        expect(result).toBe('cc-slash');
    });

    test('missing command without scnx replies not-found', async () => {
        const client = makeClient({
            scnxSetup: false,
            commands: []
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'ghost'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith({
            content: expect.stringMatching(/^⚠️ /),
            ephemeral: true
        });
    });

    test('command lookup is case-insensitive', async () => {
        const run = jest.fn().mockResolvedValue('ran');
        const command = {
            name: 'Ping',
            options: [],
            run
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'pInG'
        });
        const result = await handler.run(client, interaction);
        expect(run).toHaveBeenCalledWith(interaction);
        expect(result).toBe('ran');
    });
});

describe('module / disabled guards', () => {
    test('command from disabled module without scnx replies module-disabled', async () => {
        const command = {
            name: 'x',
            module: 'fun',
            options: [],
            run: jest.fn()
        };
        const client = makeClient({
            commands: [command],
            modules: {fun: {enabled: false}}
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith({
            ephemeral: true,
            content: expect.stringMatching(/^⚠️ /)
        });
        // The disabled module name is interpolated into the message.
        expect(interaction.reply.mock.calls[0][0].content).toContain('fun');
        expect(command.run).not.toHaveBeenCalled();
    });

    test('command from disabled module with scnx delegates to custom command handler', async () => {
        const command = {
            name: 'x',
            module: 'fun',
            options: [],
            run: jest.fn()
        };
        const client = makeClient({
            scnxSetup: true,
            commands: [command],
            modules: {fun: {enabled: false}}
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(scnx.customCommandSlashInteraction).toHaveBeenCalledWith(interaction);
    });

    test('disabled()-function command replies command-disabled', async () => {
        const command = {
            name: 'x',
            options: [],
            run: jest.fn(),
            disabled: () => true
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith({
            ephemeral: true,
            content: expect.stringMatching(/^⚠️ /)
        });
        expect(command.run).not.toHaveBeenCalled();
    });

    test('disabled()-function command in autocomplete responds with empty array', async () => {
        const command = {
            name: 'x',
            options: [],
            disabled: () => true,
            autoComplete: {}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(interaction.respond).toHaveBeenCalledWith([]);
    });

    test('disabled() receiving false does not block execution', async () => {
        const run = jest.fn().mockResolvedValue();
        const command = {
            name: 'x',
            options: [],
            run,
            disabled: () => false
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(run).toHaveBeenCalled();
    });
});

describe('lazy options resolution', () => {
    test('function options are resolved via command.options(client)', async () => {
        const optionsFn = jest.fn().mockResolvedValue([]);
        const run = jest.fn().mockResolvedValue();
        const command = {
            name: 'x',
            options: optionsFn,
            run
        };
        const interactionClient = {marker: true};
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            client: interactionClient
        });
        await handler.run(client, interaction);
        expect(optionsFn).toHaveBeenCalledWith(interactionClient);
        expect(run).toHaveBeenCalled();
    });
});

describe('autocomplete routing', () => {
    test('no focused option responds empty object', async () => {
        const command = {
            name: 'x',
            options: [],
            autoComplete: {}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _hoistedOptions: [{
                    name: 'q',
                    value: 'abc',
                    focused: false
                }]
            }
        });
        await handler.run(client, interaction);
        expect(interaction.respond).toHaveBeenCalledWith({});
    });

    test('flat command routes focused option to autoComplete[name]', async () => {
        const acFn = jest.fn().mockResolvedValue('ac');
        const command = {
            name: 'x',
            options: [],
            autoComplete: {q: acFn}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _hoistedOptions: [{
                    name: 'q',
                    value: 'typed',
                    focused: true
                }]
            }
        });
        await handler.run(client, interaction);
        expect(acFn).toHaveBeenCalledWith(interaction);
        expect(interaction.value).toBe('typed');
    });

    test('subcommand-bearing command routes via autoComplete[subCommand][name]', async () => {
        const acFn = jest.fn().mockResolvedValue('ac');
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }],
            autoComplete: {sub: {q: acFn}}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _subcommand: 'sub',
                _hoistedOptions: [{
                    name: 'q',
                    value: 't',
                    focused: true
                }]
            }
        });
        await handler.run(client, interaction);
        expect(acFn).toHaveBeenCalledWith(interaction);
    });

    test('group+subcommand routes via autoComplete[group][subCommand][name]', async () => {
        const acFn = jest.fn().mockResolvedValue('ac');
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }],
            autoComplete: {grp: {sub: {q: acFn}}}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _group: 'grp',
                _subcommand: 'sub',
                _hoistedOptions: [{
                    name: 'q',
                    value: 't',
                    focused: true
                }]
            }
        });
        await handler.run(client, interaction);
        expect(acFn).toHaveBeenCalledWith(interaction);
    });

    test('autocomplete handler throwing is caught, logged, and responds with empty array', async () => {
        const boom = new Error('ac fail');
        const command = {
            name: 'x',
            module: 'mod',
            options: [],
            autoComplete: {q: jest.fn().mockRejectedValue(boom)}
        };
        const client = makeClient({
            commands: [command],
            modules: {mod: {enabled: true}}
        });
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _hoistedOptions: [{
                    name: 'q',
                    value: 't',
                    focused: true
                }]
            }
        });
        await handler.run(client, interaction);
        expect(interaction.client.logger.error).toHaveBeenCalled();
        expect(interaction.respond).toHaveBeenCalledWith([]);
    });

    test('autocomplete throw reports to captureException when available', async () => {
        const boom = new Error('ac fail');
        const captureException = jest.fn().mockReturnValue('sentry-1');
        const command = {
            name: 'x',
            module: 'mod',
            options: [],
            autoComplete: {q: jest.fn().mockRejectedValue(boom)}
        };
        const client = makeClient({
            commands: [command],
            captureException,
            modules: {mod: {enabled: true}}
        });
        const interaction = makeInteraction({
            type: 'autocomplete',
            commandName: 'x',
            options: {
                _hoistedOptions: [{
                    name: 'q',
                    value: 't',
                    focused: true
                }]
            }
        });
        await handler.run(client, interaction);
        expect(captureException).toHaveBeenCalledWith(boom, expect.objectContaining({
            command: 'x',
            module: 'mod',
            focusedOption: 'q',
            userID: 'u1'
        }));
    });
});

describe('restricted commands', () => {
    test('non-operator is rejected with permissions message', async () => {
        const run = jest.fn();
        const command = {
            name: 'x',
            options: [],
            run,
            restricted: true
        };
        const client = makeClient({
            commands: [command],
            config: {botOperators: ['admin']}
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(run).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
        // embedType wraps the string; ephemeral should be preserved.
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.ephemeral).toBe(true);
    });

    test('operator passes the restricted check and runs', async () => {
        const run = jest.fn().mockResolvedValue();
        const command = {
            name: 'x',
            options: [],
            run,
            restricted: true
        };
        const client = makeClient({
            commands: [command],
            config: {botOperators: ['u1']}
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(run).toHaveBeenCalledWith(interaction);
    });
});

describe('command execution + subcommand dispatch', () => {
    test('flat command (no subcommands) calls run directly', async () => {
        const run = jest.fn().mockResolvedValue('ok');
        const command = {
            name: 'x',
            options: [],
            run
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        const result = await handler.run(client, interaction);
        expect(run).toHaveBeenCalledWith(interaction);
        expect(result).toBe('ok');
    });

    test('subcommand command without subcommands handler errors out', async () => {
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }]
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            client: {logger: {error: jest.fn()}},
            options: {_subcommand: 'sub'}
        });
        await handler.run(client, interaction);
        expect(interaction.client.logger.error).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('subcommand dispatches to subcommands[subCommand]', async () => {
        const subFn = jest.fn().mockResolvedValue();
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }],
            subcommands: {sub: subFn}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            options: {_subcommand: 'sub'}
        });
        await handler.run(client, interaction);
        expect(subFn).toHaveBeenCalledWith(interaction);
    });

    test('group+subcommand dispatches to subcommands[group][subCommand]', async () => {
        const subFn = jest.fn().mockResolvedValue();
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND_GROUP',
                name: 'grp'
            }],
            subcommands: {grp: {sub: subFn}}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            options: {
                _group: 'grp',
                _subcommand: 'sub'
            }
        });
        await handler.run(client, interaction);
        expect(subFn).toHaveBeenCalledWith(interaction);
    });

    test('beforeSubcommand runs before the subcommand handler', async () => {
        const order = [];
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }],
            beforeSubcommand: jest.fn(async () => order.push('before')),
            subcommands: {sub: jest.fn(async () => order.push('sub'))}
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            options: {_subcommand: 'sub'}
        });
        await handler.run(client, interaction);
        expect(order).toEqual(['before', 'sub']);
    });

    test('command.run runs after the subcommand when both present', async () => {
        const order = [];
        const command = {
            name: 'x',
            options: [{
                type: 'SUB_COMMAND',
                name: 'sub'
            }],
            subcommands: {sub: jest.fn(async () => order.push('sub'))},
            run: jest.fn(async () => order.push('run'))
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x',
            options: {_subcommand: 'sub'}
        });
        await handler.run(client, interaction);
        expect(order).toEqual(['sub', 'run']);
    });
});

describe('execution error handling', () => {
    test('error on non-deferred interaction replies with execution-failed message', async () => {
        const boom = new Error('kaboom');
        const command = {
            name: 'x',
            options: [],
            run: jest.fn().mockRejectedValue(boom)
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        interaction.deferred = false;
        await handler.run(client, interaction);
        expect(interaction.client.logger.error).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
        expect(interaction.editReply).not.toHaveBeenCalled();
    });

    test('error on deferred interaction uses editReply', async () => {
        const boom = new Error('kaboom');
        const command = {
            name: 'x',
            options: [],
            run: jest.fn().mockRejectedValue(boom)
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        interaction.deferred = true;
        await handler.run(client, interaction);
        expect(interaction.editReply).toHaveBeenCalled();
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test('execution error reports to captureException and stores trace id', async () => {
        const boom = new Error('kaboom');
        const captureException = jest.fn().mockReturnValue('trace-9');
        const command = {
            name: 'x',
            module: 'm',
            options: [],
            run: jest.fn().mockRejectedValue(boom)
        };
        const client = makeClient({
            commands: [command],
            captureException,
            modules: {m: {enabled: true}}
        });
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(captureException).toHaveBeenCalledWith(boom, expect.objectContaining({
            command: 'x',
            module: 'm',
            userID: 'u1'
        }));
    });

    test('reply failure during error handling is swallowed (no throw)', async () => {
        const boom = new Error('kaboom');
        const command = {
            name: 'x',
            options: [],
            run: jest.fn().mockRejectedValue(boom)
        };
        const client = makeClient({commands: [command]});
        const interaction = makeInteraction({
            type: 'command',
            commandName: 'x'
        });
        interaction.reply = jest.fn().mockRejectedValue(new Error('Unknown interaction'));
        await expect(handler.run(client, interaction)).resolves.toBeUndefined();
    });
});

describe('non-command, non-autocomplete interactions', () => {
    test('a button matching a command name but not isCommand returns before run', async () => {
        const run = jest.fn();
        const command = {
            name: 'x',
            options: [],
            run
        };
        const client = makeClient({commands: [command]});
        // type modal => isCommand false, isAutocomplete false
        const interaction = makeInteraction({
            type: 'modal',
            commandName: 'x'
        });
        await handler.run(client, interaction);
        expect(run).not.toHaveBeenCalled();
    });
});

describe('module export flags', () => {
    test('ignoreBotReadyCheck is set so the dispatcher still invokes before bot ready', () => {
        expect(handler.ignoreBotReadyCheck).toBe(true);
    });
});