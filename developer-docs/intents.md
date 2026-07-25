# Gateway Intents

Discord only sends a bot the events it asks for. The bot computes the gateway intents it needs at startup from the
**enabled modules**, so a server running three modules does not connect with the intent set of forty.

Modules declare what they need in `module.json`; the operator decides in `config/config.json` which *privileged*
intents the bot may request at all.

## Declaring intents in `module.json`

```json
{
  "name": "team-list",
  "intents": [
    "GuildMembers",
    "GuildPresences"
  ],
  "optionalIntents": [
    "GuildPresences"
  ],
  "intentReasons": {
    "GuildMembers": "Reads the member list to render which members hold each configured team role.",
    "GuildPresences": "Shows an online/offline dot next to each listed member."
  }
}
```

| Field             | Purpose                                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------------|
| `intents`         | Every gateway intent the module needs. Names are `GatewayIntentBits` keys (`GuildMembers`, `GuildMessages`, ...). |
| `optionalIntents` | Subset of `intents` the module can run **without**, losing only a secondary feature. Privileged intents only. |
| `intentReasons`   | `{intent: "why"}`. Used to justify a privileged-intent request to Discord and to explain it to operators.  |

Declare `intents: []` if the module needs nothing beyond the base set. `Guilds` is always requested.

**Pairing rule:** `MessageContent` is useless without a message intent, so if your module declares `MessageContent`
but neither `GuildMessages` nor `DirectMessages`, `GuildMessages` is added automatically and a warning is logged.

## Required vs optional

The distinction only matters for Discord's three **privileged** intents: `GuildMembers`, `GuildPresences` and
`MessageContent`.

- **Required** (in `intents`, not in `optionalIntents`) - the module cannot work without it.
- **Optional** (also listed in `optionalIntents`) - the module still works, minus one feature.

`status-roles` requires `GuildPresences`: with no presence data it has nothing to react to. `team-list` only wants it
for the status dot beside each name, so it lists it as optional and renders the list without dots instead.

Pick optional when the module has a sensible degraded mode, and then **write the code to degrade**. A count built
from an empty cache is wrong data, which is worse than absent data:

```js
const presencesActive = (client._activeIntents || []).includes('GuildPresences');
const online = presencesActive ? members.filter(m => m.presence).size : 'N/A';
```

`src/functions/helpers.js` provides `memberCountOrFallback(guild)` and `onlineCountOrNull(client, guild)` for the two
most common cases.

## The operator allowlist

Large bots cannot always obtain every privileged intent from Discord. Operators list the ones they were granted in
`config/config.json`:

```json
{
  "allowedPrivilegedIntents": ["GuildMembers", "MessageContent"]
}
```

An **empty array, a missing field, or a list containing no valid names means all three are allowed** - the default,
and the upgrade path for existing installs. Invalid entries are ignored with a warning.

When a privileged intent is not allowed:

| The module...                        | Result                                                                    |
|--------------------------------------|---------------------------------------------------------------------------|
| **requires** it                      | Disabled entirely. It contributes no intents and its config is not checked. |
| lists it in **`optionalIntents`**    | Stays enabled, degraded. The intent is simply not requested.               |

Disabled modules keep `userEnabled: true`, so nothing is lost in `modules.json` - re-granting the intent and
restarting brings them back.

## Changing intents at runtime

Intents are fixed for the lifetime of a gateway connection. Enabling a module that needs an intent the bot did not
connect with logs a warning and requires a restart; the module's features stay inert until then. The same applies in
reverse when an intent is removed from the allowlist while it is still live on the connection.

## Reference

- `src/functions/intents.js` - computes the intent set, applies the allowlist.
- `src/functions/configuration.js` - `applyIntentDisables()` disables modules whose required intents were denied.
- `client._activeIntents` - the intent names the running client actually connected with.
