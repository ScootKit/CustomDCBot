/*
 * Tests for src/functions/commandTypes.js — the command registration rules Discord enforces:
 *   - resolveCommandType maps a module's declared `type` string to the numeric enum. Sending a
 *     string type, or defaulting a context command to ChatInput, is a 400 that aborts the whole sync.
 *   - partitionCommands splits slash from context commands, strips the fields Discord forbids on
 *     USER/MESSAGE, and enforces the per-type registration caps.
 */
const {ApplicationCommandType} = require('discord.js');
const {
    USER_LIMIT,
    MESSAGE_LIMIT,
    resolveCommandType,
    contextTypeOf,
    partitionCommands
} = require('../../src/functions/commandTypes');

// Discord's CHAT_INPUT name rule; context-menu names are exempt (mixed case + spaces allowed).
const CHAT_INPUT_NAME = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

describe('resolveCommandType', () => {
    test('a missing type defaults to ChatInput', () => {
        expect(resolveCommandType(undefined)).toBe(ApplicationCommandType.ChatInput);
        expect(resolveCommandType(null)).toBe(ApplicationCommandType.ChatInput);
        expect(resolveCommandType('')).toBe(ApplicationCommandType.ChatInput);
    });

    test('resolves the ALL-CAPS forms modules actually declare', () => {
        expect(resolveCommandType('USER')).toBe(ApplicationCommandType.User);
        expect(resolveCommandType('MESSAGE')).toBe(ApplicationCommandType.Message);
    });

    test('is case-insensitive', () => {
        for (const t of ['user', 'User', 'uSeR']) expect(resolveCommandType(t)).toBe(ApplicationCommandType.User);
        for (const t of ['message', 'Message']) expect(resolveCommandType(t)).toBe(ApplicationCommandType.Message);
    });

    test('maps the slash aliases to ChatInput (the enum member is named ChatInput, not Slash)', () => {
        for (const t of ['SLASH', 'slash', 'CHAT_INPUT', 'ChatInput', 'CHATINPUT']) {
            expect(resolveCommandType(t)).toBe(ApplicationCommandType.ChatInput);
        }
    });

    test('passes an already-numeric type through unchanged', () => {
        expect(resolveCommandType(ApplicationCommandType.User)).toBe(ApplicationCommandType.User);
        expect(resolveCommandType(ApplicationCommandType.ChatInput)).toBe(ApplicationCommandType.ChatInput);
    });

    test('an unknown type string is returned unchanged (caller/Discord surfaces it)', () => {
        expect(resolveCommandType('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    });

    test('never returns a string for a known type', () => {
        for (const t of ['USER', 'MESSAGE', 'SLASH', 'CHAT_INPUT']) {
            expect(typeof resolveCommandType(t)).toBe('number');
        }
    });
});

describe('contextTypeOf', () => {
    test('classifies normalized commands by their numeric type', () => {
        expect(contextTypeOf({type: ApplicationCommandType.User})).toBe('USER');
        expect(contextTypeOf({type: ApplicationCommandType.Message})).toBe('MESSAGE');
        expect(contextTypeOf({type: ApplicationCommandType.ChatInput})).toBeNull();
        expect(contextTypeOf({})).toBeNull();
    });
});

describe('partitionCommands', () => {
    const ctx = (name, type) => ({
        name,
        type,
        description: 'a description',
        options: [{name: 'opt'}],
        module: 'm'
    });

    test('separates slash from context commands', () => {
        const {slash, context} = partitionCommands([
            {
                name: 'ping',
                type: ApplicationCommandType.ChatInput,
                description: 'd'
            },
            ctx('View Level Profile', ApplicationCommandType.User)
        ]);
        expect(slash.map(c => c.name)).toEqual(['ping']);
        expect(context.map(c => c.name)).toEqual(['View Level Profile']);
    });

    test('strips description and options from context commands (Discord forbids both)', () => {
        const {context} = partitionCommands([ctx('Close Ticket', ApplicationCommandType.Message)]);
        expect(context[0]).not.toHaveProperty('description');
        expect(context[0]).not.toHaveProperty('options');
        expect(context[0].name).toBe('Close Ticket');
        expect(context[0].type).toBe(ApplicationCommandType.Message);
    });

    test('leaves slash commands untouched', () => {
        const command = {
            name: 'ping',
            type: ApplicationCommandType.ChatInput,
            description: 'd',
            options: [{name: 'o'}]
        };
        const {slash} = partitionCommands([command]);
        expect(slash[0]).toEqual(command);
    });

    test('caps USER context commands at the Discord limit and reports the rest', () => {
        const input = Array.from({length: USER_LIMIT + 4}, (_, i) => ctx(`User Cmd ${i}`, ApplicationCommandType.User));
        const {context, dropped} = partitionCommands(input);
        expect(context).toHaveLength(USER_LIMIT);
        expect(dropped).toHaveLength(4);
        expect(dropped.every(d => d.type === 'USER')).toBe(true);
    });

    test('caps MESSAGE context commands independently of USER', () => {
        const input = [
            ...Array.from({length: MESSAGE_LIMIT + 2}, (_, i) => ctx(`Msg Cmd ${i}`, ApplicationCommandType.Message)),
            ...Array.from({length: 3}, (_, i) => ctx(`User Cmd ${i}`, ApplicationCommandType.User))
        ];
        const {context, dropped} = partitionCommands(input);
        expect(context.filter(c => c.type === ApplicationCommandType.Message)).toHaveLength(MESSAGE_LIMIT);
        expect(context.filter(c => c.type === ApplicationCommandType.User)).toHaveLength(3);
        expect(dropped).toHaveLength(2);
    });

    test('slash commands are never capped by the context limits', () => {
        const input = Array.from({length: USER_LIMIT + 10}, (_, i) => ({
            name: `cmd-${i}`,
            type: ApplicationCommandType.ChatInput,
            description: 'd'
        }));
        const {slash, dropped} = partitionCommands(input);
        expect(slash).toHaveLength(USER_LIMIT + 10);
        expect(dropped).toEqual([]);
    });

    test('drops a duplicate context name for the same type (Discord 400s on duplicates)', () => {
        const {context, collisions} = partitionCommands([
            ctx('Report', ApplicationCommandType.User),
            ctx('report', ApplicationCommandType.User)
        ]);
        expect(context).toHaveLength(1);
        expect(collisions).toHaveLength(1);
        expect(collisions[0].name).toBe('report');
    });

    test('the same name under different context types is not a collision', () => {
        const {context, collisions} = partitionCommands([
            ctx('Report', ApplicationCommandType.User),
            ctx('Report', ApplicationCommandType.Message)
        ]);
        expect(context).toHaveLength(2);
        expect(collisions).toEqual([]);
    });
});

describe('every shipped context command survives the real pipeline', () => {
    const fs = require('fs');
    const path = require('path');
    const modulesDir = path.join(__dirname, '..', '..', 'modules');

    /*
     * Reads each command file's declared config WITHOUT requiring it (the files pull in main.js,
     * which boots the bot). Regression guard for the 50035 incident: a context command that loses
     * its type is submitted as CHAT_INPUT, and its mixed-case, space-containing name then fails
     * Discord's slash-name regex, aborting the entire command sync.
     */
    function declaredConfigs() {
        const out = [];
        for (const moduleName of fs.readdirSync(modulesDir)) {
            const commandsDir = path.join(modulesDir, moduleName, 'commands');
            if (!fs.existsSync(commandsDir)) continue;
            for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
                const src = fs.readFileSync(path.join(commandsDir, file), 'utf8');
                if (!/contextMenu:\s*true/u.test(src)) continue;
                const name = /name:\s*'((?:[^'\\]|\\.)*)'/u.exec(src);
                const type = /type:\s*'([A-Za-z_]+)'/u.exec(src);
                out.push({
                    file: `${moduleName}/${file}`,
                    name: name && name[1],
                    type: type && type[1]
                });
            }
        }
        return out;
    }

    const configs = declaredConfigs();

    test('there is at least one context command to check', () => {
        expect(configs.length).toBeGreaterThan(0);
    });

    test.each(configs.map(c => [c.file, c]))('%s resolves to a context type, never ChatInput', (_file, config) => {
        expect(config.type).toBeTruthy();
        const resolved = resolveCommandType(config.type);
        expect(typeof resolved).toBe('number');
        expect(resolved).not.toBe(ApplicationCommandType.ChatInput);
        expect(contextTypeOf({type: resolved})).not.toBeNull();
    });

    test('context command names would be rejected as slash names (why the type must survive)', () => {
        const wouldFail = configs.filter(c => !CHAT_INPUT_NAME.test(c.name) || c.name !== c.name.toLowerCase());
        expect(wouldFail.length).toBeGreaterThan(0);
    });

    test('every context name is within Discord\'s 32-character limit', () => {
        for (const c of configs) expect(c.name.length).toBeLessThanOrEqual(32);
    });
});
