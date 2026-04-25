# Events

Event handlers live in a module's `events-dir` (typically `events/`). The filename - without the `.js` extension - is
the event name. Discord.js events, custom client events, and submodule events are all handled the same way.

## Handler shape

```js
// modules/example/events/messageCreate.js
module.exports.run = async (client, message) => {
    if (message.author.bot) return;
    // ...
};
```

A handler exports `run`. The bot calls it with `(client, ...args)` where `args` are whatever the underlying event emits.
For `messageCreate` that's a `Message`; for `guildMemberAdd` that's a `GuildMember`; for `voiceStateUpdate` that's
`(oldState, newState)`.

The filename `messageCreate.js` registers a listener for the `messageCreate` event. You can have one file per event per
module - multiple modules can listen to the same event, and they will all run.

## Lifecycle flags

Three optional exports control when your handler runs:

```js
module.exports.run = async (client, ...args) => { /* ... */ };
module.exports.ignoreBotReadyCheck = true;   // run before bot is fully ready (rare - usually leave false)
module.exports.allowPartial = true;          // accept partial Discord structures (e.g. uncached messages)
```

Default behavior:

- **`botReadyAt` gate**: handlers are skipped silently until `client.botReadyAt` is set (i.e. until config is loaded and
  the guild is fetched). This prevents your code from running against half-initialized state. Set
  `ignoreBotReadyCheck = true` only if you need to react to events during startup itself.
- **Partial gate**: if any argument is a partial structure (for example, a `messageDelete` for an uncached message), the
  handler is skipped unless `allowPartial = true`. Set this when you can handle partials gracefully - for example, by
  checking `if (message.partial) return;` early.

## Errors

Handler errors are caught by the loader and logged via `client.logger.error`. If Sentry is configured (SCNX builds), the
error is also reported. You don't need a top-level try/catch for safety - but you should still catch errors at
meaningful boundaries to log useful context.

## Custom client events

The bot emits its own events. Listen to them like any Discord event by naming your file accordingly:

| Event          | When it fires                                                                                                                                | File name         |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| `botReady`     | After config and commands have loaded, the guild has been fetched, and the bot is fully online.                                              | `botReady.js`     |
| `configReload` | After `config.json` and module configs have been (re-)loaded - including via `/reload`. Use this to invalidate caches that depend on config. | `configReload.js` |

Example: invalidate a cached compiled formula when the user edits the formula in their config:

```js
// modules/levels/events/configReload.js
module.exports.run = (client) => {
    client.cache = client.cache || {};
    delete client.cache.levelFormula;
};
module.exports.ignoreBotReadyCheck = true;
```

## Common Discord events used in this codebase

| Event               | Args                                             | Typical use                                                                                                                    |
|---------------------|--------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `messageCreate`     | `(message)`                                      | Reactions, counter modules, AFK pings.                                                                                         |
| `messageDelete`     | `(message)` (often partial - set `allowPartial`) | Anti-ghostping, sticky messages.                                                                                               |
| `messageUpdate`     | `(oldMessage, newMessage)`                       | Edit logging, anti-ghostping.                                                                                                  |
| `guildMemberAdd`    | `(member)`                                       | Welcomers, auto-roles, captcha.                                                                                                |
| `guildMemberRemove` | `(member)`                                       | Goodbye messages, cleanup.                                                                                                     |
| `guildMemberUpdate` | `(oldMember, newMember)`                         | Boost detection, role-driven side effects.                                                                                     |
| `interactionCreate` | `(interaction)`                                  | Button/select-menu/modal handlers within a module. (Slash commands are handled separately - see [commands.md](./commands.md).) |
| `voiceStateUpdate`  | `(oldState, newState)`                           | VC pings, temp channels, channel-stats.                                                                                        |
| `channelDelete`     | `(channel)`                                      | Cleanup of channel-bound config.                                                                                               |

For the full list of Discord.js events, see
the [discord.js docs](https://discord.js.org/docs/packages/discord.js/14.26.2/Client:Class).

## Module-disabled handling

Handlers from a disabled module are not registered. If your handler depends on shared state from another module, check
`client.modules['<other-module>'].enabled` defensively rather than assuming the model exists.