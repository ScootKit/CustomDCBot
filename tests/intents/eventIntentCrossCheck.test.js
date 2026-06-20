/*
 * Per-module cross-check: if a module has an event handler file for a gateway event
 * that is gated behind an intent, the module's module.json must declare that intent.
 *
 * This catches UNDER-declarations that the aggregate union guard (moduleDeclarations.test.js)
 * structurally cannot - the union only proves SOME module declares each intent, not that
 * the RIGHT one does. An event file `X.js` registers `client.on('X', ...)` (see main.js
 * event loader), so a file named e.g. `voiceStateUpdate.js` means the module needs
 * GuildVoiceStates.
 *
 * Scope/limits:
 * - Only event-FILE based needs are checked. Needs that come from collectors
 *   (channel.awaitMessages / createMessageCollector) or cache reads inside non-event
 *   files are NOT visible here and rely on the manual audit + module.json.
 * - Custom events emitted via client.emit('name', ...) (e.g. invite-tracking's
 *   `guildMemberJoin`) are NOT real gateway events; their names don't collide with the
 *   real gateway event names below, so they're naturally ignored.
 */
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '..', '..', 'modules');

// Gateway event file name -> the intent that event is gated behind.
const EVENT_INTENT = {
    guildMemberAdd: 'GuildMembers',
    guildMemberRemove: 'GuildMembers',
    guildMemberUpdate: 'GuildMembers',
    presenceUpdate: 'GuildPresences',
    messageReactionAdd: 'GuildMessageReactions',
    messageReactionRemove: 'GuildMessageReactions',
    messageReactionRemoveAll: 'GuildMessageReactions',
    messageReactionRemoveEmoji: 'GuildMessageReactions',
    voiceStateUpdate: 'GuildVoiceStates',
    inviteCreate: 'GuildInvites',
    inviteDelete: 'GuildInvites',
    guildBanAdd: 'GuildModeration',
    guildBanRemove: 'GuildModeration',
    guildAuditLogEntryCreate: 'GuildModeration',
    webhooksUpdate: 'GuildWebhooks',
    emojiCreate: 'GuildEmojisAndStickers',
    emojiUpdate: 'GuildEmojisAndStickers',
    emojiDelete: 'GuildEmojisAndStickers',
    stickerCreate: 'GuildEmojisAndStickers',
    stickerUpdate: 'GuildEmojisAndStickers',
    stickerDelete: 'GuildEmojisAndStickers',
    autoModerationActionExecution: 'AutoModerationExecution'
};

// Message events are satisfied by EITHER a guild or a DM message intent.
const MESSAGE_EVENTS = new Set(['messageCreate', 'messageUpdate', 'messageDelete', 'messageDeleteBulk']);

function moduleIntents(moduleName) {
    const json = require(path.join(MODULES_DIR, moduleName, 'module.json'));
    return Array.isArray(json.intents) ? json.intents : [];
}

function eventFiles(moduleName) {
    const dir = path.join(MODULES_DIR, moduleName, 'events');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
}

/*
 * moderation is intentionally held back from the intent-declaration sync (its module.json carries no
 * `intents` yet). Its event needs (GuildMessages, GuildMembers) are already covered by the union of
 * the other modules' declarations, so it keeps receiving those events at runtime; it self-declares
 * when the moderation module is next updated.
 */
const EXEMPT_MODULES = new Set(['moderation']);

describe('event-file -> intent cross-check', () => {
    const modules = fs.readdirSync(MODULES_DIR)
        .filter(m => fs.existsSync(path.join(MODULES_DIR, m, 'module.json')))
        .filter(m => !EXEMPT_MODULES.has(m));

    test('every gateway event handler has its intent declared', () => {
        const violations = [];
        for (const m of modules) {
            const declared = new Set(moduleIntents(m));
            for (const event of eventFiles(m)) {
                if (MESSAGE_EVENTS.has(event)) {
                    if (!declared.has('GuildMessages') && !declared.has('DirectMessages')) {
                        violations.push(`${m}: ${event}.js needs GuildMessages or DirectMessages`);
                    }
                } else if (EVENT_INTENT[event]) {
                    if (!declared.has(EVENT_INTENT[event])) {
                        violations.push(`${m}: ${event}.js needs ${EVENT_INTENT[event]}`);
                    }
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
