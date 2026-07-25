/**
 * Command-type resolution and the registration rules Discord enforces on application commands.
 * @module CommandTypes
 */
const {ApplicationCommandType} = require('discord.js');

// Discord's per-application registration caps for context-menu commands.
const USER_LIMIT = 15;
const MESSAGE_LIMIT = 15;

/**
 * Resolves a module's declared `type` to the numeric ApplicationCommandType the REST API requires.
 * Accepts any casing ('USER'/'User'/'user'), maps the 'slash' alias modules declare to ChatInput
 * (the enum member is named ChatInput, not Slash), defaults a missing type to ChatInput and passes
 * an already-numeric type through. Sending a string type, or defaulting a context command to
 * ChatInput, is a 400 that aborts the whole command sync, so this must never return a string for a
 * known type.
 * @param {String|Number} type Declared command type
 * @returns {Number|String} Numeric ApplicationCommandType, or the input for an unknown type
 */
function resolveCommandType(type) {
    if (!type) return ApplicationCommandType.ChatInput;
    if (typeof type !== 'string') return type;
    const upper = type.toUpperCase();
    if (upper === 'SLASH' || upper === 'CHAT_INPUT' || upper === 'CHATINPUT') return ApplicationCommandType.ChatInput;
    const pascal = upper.charAt(0) + upper.slice(1).toLowerCase();
    return ApplicationCommandType[pascal] || type;
}

/**
 * The context-menu kind of an already-normalized command, or null for a slash command.
 * @param {Object} command Command carrying a numeric `type`
 * @returns {String|null} 'USER', 'MESSAGE' or null
 */
function contextTypeOf(command) {
    if (command.type === ApplicationCommandType.User) return 'USER';
    if (command.type === ApplicationCommandType.Message) return 'MESSAGE';
    return null;
}

/**
 * Splits normalized commands into the slash and context sets that can actually be registered.
 *
 * Context commands are shaped and bounded here because Discord rejects the whole sync otherwise:
 * `description` and `options` are not allowed on USER/MESSAGE commands, duplicate names within a
 * type are a 400, and each type is capped. Anything over the cap or colliding is reported rather
 * than silently discarded, so the caller can log it. Slash commands pass through untouched.
 * @param {Object[]} commands Normalized commands (numeric `type`)
 * @returns {{slash: Object[], context: Object[], dropped: Object[], collisions: Object[]}}
 */
function partitionCommands(commands) {
    const slash = [];
    const context = [];
    const dropped = [];
    const collisions = [];
    const counts = {
        USER: 0,
        MESSAGE: 0
    };
    const limits = {
        USER: USER_LIMIT,
        MESSAGE: MESSAGE_LIMIT
    };
    const seen = new Set();

    for (const command of commands) {
        const type = contextTypeOf(command);
        if (!type) {
            slash.push(command);
            continue;
        }
        const key = `${type}:${command.name.toLowerCase()}`;
        if (seen.has(key)) {
            collisions.push({
                name: command.name,
                module: command.module,
                type
            });
            continue;
        }
        if (counts[type] >= limits[type]) {
            dropped.push({
                name: command.name,
                module: command.module,
                type
            });
            continue;
        }
        seen.add(key);
        counts[type]++;
        const resolved = {...command};
        delete resolved.description;
        delete resolved.options;
        context.push(resolved);
    }

    return {
        slash,
        context,
        dropped,
        collisions
    };
}

module.exports = {
    USER_LIMIT,
    MESSAGE_LIMIT,
    resolveCommandType,
    contextTypeOf,
    partitionCommands
};
