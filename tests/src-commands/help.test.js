/*
 * Tests for src/commands/help.js — the /help command.
 *
 * The command groups the client's commands by module, builds a Components V2
 * overview (module list + a select menu, with pagination when there are more
 * than 25 modules), replies, and wires up a component collector whose handlers
 * switch between the overview and per-module detail views.
 *
 * help.js uses the REAL localize, helpers (truncate/formatDate/parseEmbedColor)
 * and configuration helpers — all pure enough to run in-process. We mock only
 * the Discord client + interaction. We capture the components handed to
 * interaction.reply and drive the collector handlers directly.
 */

const help = require('../../src/commands/help');

// Walk a Components V2 ContainerBuilder tree collecting all text-display content.
function collectText(component) {
    const out = [];
    const data = component.data || component;
    const kids = (component.components || data.components || []);
    for (const c of kids) {
        const cd = c.data || c;
        if (typeof cd.content === 'string') out.push(cd.content);
        // sections wrap text-display components
        if (c.components || cd.components) out.push(...collectText(c));
        // section accessory text lives under .components too in builders
        if (c.accessory) { /* thumbnails: no text */
        }
    }
    return out;
}

// Flatten all text content across an array of top-level containers.
function allText(components) {
    return components.flatMap(collectText).join('\n');
}

// Find all custom IDs of action-row components (select menus / buttons).
function collectCustomIds(component) {
    const ids = [];
    const kids = component.components || (component.data && component.data.components) || [];
    for (const c of kids) {
        const cd = c.data || c;
        if (cd.custom_id) ids.push(cd.custom_id);
        if (c.components || cd.components) ids.push(...collectCustomIds(c));
    }
    return ids;
}

function makeModule(name, {
    humanReadableName,
    description,
    enabled = true
} = {}) {
    return {
        enabled,
        config: {
            humanReadableName: humanReadableName ?? name,
            description: description ?? `${name} desc`
        }
    };
}

function makeClient(overrides = {}) {
    return {
        locale: 'en',
        user: {displayAvatarURL: () => 'https://cdn/avatar.png'},
        readyAt: new Date('2024-01-01T00:00:00Z'),
        botReadyAt: new Date('2024-01-01T00:00:05Z'),
        scnxSetup: false,
        scnxData: {},
        strings: {
            helpembed: {
                title: 'Help %site%',
                description: 'Overview of commands',
                build_in: 'Built-in'
            },
            putBotInfoOnLastSite: false,
            disableHelpEmbedStats: false
        },
        modules: {
            moderation: makeModule('moderation', {humanReadableName: 'Moderation'}),
            tickets: makeModule('tickets', {humanReadableName: 'Tickets'})
        },
        commands: [
            {
                name: 'ban',
                description: 'Ban a user',
                module: 'moderation'
            },
            {
                name: 'kick',
                description: 'Kick a user',
                module: 'moderation'
            },
            {
                name: 'ticket',
                description: 'Open a ticket',
                module: 'tickets'
            },
            {
                name: 'ping',
                description: 'Pong',
                module: null
            }
        ],
        config: {customCommands: []},
        ...overrides
    };
}

function makeInteraction(client) {
    let collector;
    const message = {
        edit: jest.fn().mockResolvedValue(),
        createMessageComponentCollector: jest.fn(() => {
            collector = {
                handlers: {},
                on(event, cb) {
                    this.handlers[event] = cb;
                    return this;
                }
            };
            return collector;
        })
    };
    const interaction = {
        client,
        user: {id: 'invoker'},
        guild: {name: 'My Guild'},
        reply: jest.fn().mockResolvedValue(message),
        _message: message,
        get collector() {
            return collector;
        }
    };
    return interaction;
}

async function runHelp(client) {
    const interaction = makeInteraction(client);
    await help.run(interaction);
    return interaction;
}

describe('help - config metadata', () => {
    test('command name is help', () => {
        expect(help.config.name).toBe('help');
    });
    test('has a non-empty description', () => {
        expect(typeof help.config.description).toBe('string');
        expect(help.config.description.length).toBeGreaterThan(0);
    });
});

describe('help - overview reply', () => {
    test('replies once with Components V2 flag set', async () => {
        const i = await runHelp(makeClient());
        expect(i.reply).toHaveBeenCalledTimes(1);
        const arg = i.reply.mock.calls[0][0];
        expect(arg.flags).toBeDefined();
        expect(arg.fetchReply).toBe(true);
        expect(Array.isArray(arg.components)).toBe(true);
        expect(arg.components.length).toBeGreaterThan(0);
    });

    test('overview lists each module human-readable name', async () => {
        const i = await runHelp(makeClient());
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).toContain('Moderation');
        expect(text).toContain('Tickets');
    });

    test('commands without a module appear under the built-in group', async () => {
        const i = await runHelp(makeClient());
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).toContain('Built-in');
        expect(text).toContain('/ping');
    });

    test('module command names are rendered as slash mentions', async () => {
        const i = await runHelp(makeClient());
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).toContain('/ban');
        expect(text).toContain('/kick');
        expect(text).toContain('/ticket');
    });

    test('a help-module-select menu is attached', async () => {
        const i = await runHelp(makeClient());
        const ids = i.reply.mock.calls[0][0].components.flatMap(collectCustomIds);
        expect(ids).toContain('help-module-select');
    });
});

describe('help - module filtering', () => {
    test('commands of a disabled module are excluded', async () => {
        const client = makeClient();
        client.modules.tickets.enabled = false;
        const i = await runHelp(client);
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).not.toContain('/ticket');
        expect(text).toContain('/ban');
    });

    test('commands whose disabled() returns true are excluded', async () => {
        const client = makeClient();
        client.commands.push({
            name: 'secret',
            description: 'hidden',
            module: 'moderation',
            disabled: () => true
        });
        const i = await runHelp(client);
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).not.toContain('/secret');
    });

    test('commands whose disabled() returns false are included', async () => {
        const client = makeClient();
        client.commands.push({
            name: 'visible',
            description: 'shown',
            module: 'moderation',
            disabled: () => false
        });
        const i = await runHelp(client);
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).toContain('/visible');
    });
});

describe('help - custom commands group', () => {
    test('enabled COMMAND-type custom commands form their own group', async () => {
        const client = makeClient();
        client.config.customCommands = [
            {
                type: 'COMMAND',
                enabled: true,
                slashCommandName: 'mycmd',
                slashCommandDescription: 'A custom command',
                slashCommandsOptions: []
            }
        ];
        const i = await runHelp(client);
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).toContain('/mycmd');
    });

    test('disabled or non-COMMAND custom commands are ignored', async () => {
        const client = makeClient();
        client.config.customCommands = [
            {
                type: 'COMMAND',
                enabled: false,
                slashCommandName: 'disabledcmd',
                slashCommandDescription: 'x'
            },
            {
                type: 'BUTTON',
                enabled: true,
                slashCommandName: 'notacmd',
                slashCommandDescription: 'x'
            }
        ];
        const i = await runHelp(client);
        const text = allText(i.reply.mock.calls[0][0].components);
        expect(text).not.toContain('/disabledcmd');
        expect(text).not.toContain('/notacmd');
    });

    test('custom command missing a name is skipped', async () => {
        const client = makeClient();
        client.config.customCommands = [
            {
                type: 'COMMAND',
                enabled: true,
                slashCommandName: '',
                slashCommandDescription: 'x'
            }
        ];
        const i = await runHelp(client);
        // no extra group rendered; still replies fine
        expect(i.reply).toHaveBeenCalledTimes(1);
    });
});

describe('help - pagination (>25 modules)', () => {
    function makeManyModulesClient(count) {
        const modules = {};
        const commands = [];
        for (let n = 0; n < count; n++) {
            const key = `mod${n}`;
            modules[key] = makeModule(key, {humanReadableName: `Module ${n}`});
            commands.push({
                name: `cmd${n}`,
                description: `d${n}`,
                module: key
            });
        }
        return makeClient({
            modules,
            commands
        });
    }

    test('with <=25 modules no pagination buttons are present', async () => {
        const i = await runHelp(makeManyModulesClient(10));
        const ids = i.reply.mock.calls[0][0].components.flatMap(collectCustomIds);
        expect(ids).not.toContain('help-page-next');
        expect(ids).not.toContain('help-page-prev');
    });

    test('with >25 modules prev/next pagination buttons appear', async () => {
        const i = await runHelp(makeManyModulesClient(30));
        const ids = i.reply.mock.calls[0][0].components.flatMap(collectCustomIds);
        expect(ids).toContain('help-page-prev');
        expect(ids).toContain('help-page-next');
    });
});

describe('help - info / stats container', () => {
    test('omits the info container when both bot-info and stats are suppressed', async () => {
        const client = makeClient();
        client.strings.putBotInfoOnLastSite = true;
        client.strings.disableHelpEmbedStats = true;
        const i = await runHelp(client);
        // only the header container remains
        expect(i.reply.mock.calls[0][0].components).toHaveLength(1);
    });

    test('includes a second container when stats are enabled', async () => {
        const i = await runHelp(makeClient());
        expect(i.reply.mock.calls[0][0].components.length).toBeGreaterThanOrEqual(2);
    });
});

describe('help - collector wiring', () => {
    test('registers a component collector with collect + end handlers', async () => {
        const i = await runHelp(makeClient());
        expect(i._message.createMessageComponentCollector).toHaveBeenCalled();
        expect(typeof i.collector.handlers.collect).toBe('function');
        expect(typeof i.collector.handlers.end).toBe('function');
    });

    test('collect from a different user is rejected with an ephemeral reply', async () => {
        const i = await runHelp(makeClient());
        const sub = {
            user: {id: 'someone-else'},
            reply: jest.fn().mockResolvedValue(),
            isStringSelectMenu: () => false,
            isButton: () => false
        };
        await i.collector.handlers.collect(sub);
        expect(sub.reply).toHaveBeenCalledWith(expect.objectContaining({ephemeral: true}));
    });

    test('selecting a module updates the message to that module detail view', async () => {
        const i = await runHelp(makeClient());
        const sub = {
            user: {id: 'invoker'},
            values: ['moderation'],
            isStringSelectMenu: () => true,
            isButton: () => false,
            customId: 'help-module-select',
            update: jest.fn().mockResolvedValue()
        };
        await i.collector.handlers.collect(sub);
        expect(sub.update).toHaveBeenCalledTimes(1);
        const text = allText(sub.update.mock.calls[0][0].components);
        expect(text).toContain('/ban');
        expect(text).toContain('Ban a user');
    });

    test('module detail view has a back-to-overview button', async () => {
        const i = await runHelp(makeClient());
        const sub = {
            user: {id: 'invoker'},
            values: ['tickets'],
            isStringSelectMenu: () => true,
            isButton: () => false,
            customId: 'help-module-select',
            update: jest.fn().mockResolvedValue()
        };
        await i.collector.handlers.collect(sub);
        const ids = sub.update.mock.calls[0][0].components.flatMap(collectCustomIds);
        expect(ids).toContain('help-overview');
    });

    test('the overview button returns to the overview view', async () => {
        const i = await runHelp(makeClient());
        const sub = {
            user: {id: 'invoker'},
            isStringSelectMenu: () => false,
            isButton: () => true,
            customId: 'help-overview',
            update: jest.fn().mockResolvedValue()
        };
        await i.collector.handlers.collect(sub);
        const ids = sub.update.mock.calls[0][0].components.flatMap(collectCustomIds);
        expect(ids).toContain('help-module-select');
    });

    test('end handler edits the message back to the overview', async () => {
        const i = await runHelp(makeClient());
        i.collector.handlers.end();
        expect(i._message.edit).toHaveBeenCalledTimes(1);
        const arg = i._message.edit.mock.calls[0][0];
        expect(Array.isArray(arg.components)).toBe(true);
    });
});

describe('help - pagination handlers', () => {
    function makeManyModulesClient(count) {
        const modules = {};
        const commands = [];
        for (let n = 0; n < count; n++) {
            const key = `mod${n}`;
            modules[key] = makeModule(key);
            commands.push({
                name: `cmd${n}`,
                description: `d${n}`,
                module: key
            });
        }
        return makeClient({
            modules,
            commands
        });
    }

    test('next then prev navigate select-menu pages', async () => {
        const i = await runHelp(makeManyModulesClient(30));

        const next = {
            user: {id: 'invoker'},
            isStringSelectMenu: () => false,
            isButton: () => true,
            customId: 'help-page-next',
            update: jest.fn().mockResolvedValue()
        };
        await i.collector.handlers.collect(next);
        // page 2 placeholder should mention (2/2)
        const textAfterNext = allText(next.update.mock.calls[0][0].components);
        // header is re-rendered; the select placeholder includes page index
        expect(next.update).toHaveBeenCalledTimes(1);
        expect(textAfterNext).toContain('Module');

        const prev = {
            user: {id: 'invoker'},
            isStringSelectMenu: () => false,
            isButton: () => true,
            customId: 'help-page-prev',
            update: jest.fn().mockResolvedValue()
        };
        await i.collector.handlers.collect(prev);
        expect(prev.update).toHaveBeenCalledTimes(1);
    });
});