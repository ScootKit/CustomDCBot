# Localization

The bot has two separate localization systems. Don't confuse them:

| System             | Purpose                                                                                      | Lives in                                   | Authored where                                                                          |
|--------------------|----------------------------------------------------------------------------------------------|--------------------------------------------|-----------------------------------------------------------------------------------------|
| **Code strings**   | User-facing strings emitted by event handlers and slash commands (`localize()` calls in JS). | `locales/en.json`, `locales/de.json`, etc. | Hand-edited by developers.                                                              |
| **Config strings** | Field names and descriptions inside config files (`humanName`, `description`).               | `config-localizations/en.json`, etc.       | Generated from inline strings - see [config-localization.md](./config-localization.md). |

This guide covers **code strings**. For config strings, see [config-localization.md](./config-localization.md).

## Adding a string

Strings are namespaced by module. Open `locales/en.json` and add a top-level key matching your module name (or extend an
existing one):

```json
{
  "hello-world": {
    "welcome": "Welcome %u to the server!",
    "channel-not-found": "Configured welcome channel %c does not exist."
  }
}
```

Then call `localize(namespace, key, params?)`:

```js
const {localize} = require('../../../src/functions/localize');

await channel.send(localize('hello-world', 'welcome', {u: member.toString()}));
client.logger.error(localize('hello-world', 'channel-not-found', {c: channelID}));
```

`%u` and `%c` are placeholders - `localize()` substitutes them from the third argument (`{u: ..., c: ...}`).
Placeholders are arbitrary single-letter or short identifiers; pick whatever reads well in the source string.

## Other languages

This repository ships only `en.json` actively maintained. Translations for German, French, etc. exist in
`locales/<lang>.json` and are managed externally via Weblate. **Do not edit non-English locale files in this repository.
** Add new keys only to `en.json`; translations will follow.

## Behavior at runtime

`client.locale` is set from `--lang=<code>` on the command line, defaulting to `en`. `localize()` looks up
`client.locale` first; if the key is missing, it falls back to `en`; if still missing, it returns the key itself so
missing translations are visible rather than silently empty.

## Common mistakes

- **Don't hard-code English strings in code.** Even one-off log messages should go through `localize()` so
  other-language operators get readable logs.
- **Don't reuse a key across namespaces.** `localize('moderation', 'banned')` and `localize('admin-tools', 'banned')`
  are independent - translators see them in separate contexts.
- **Don't dynamically build the namespace or key from user input.** That breaks translation tooling and creates
  security/typo footguns.
- **Don't add keys for modules other than your own.** Each module owns its namespace.

## Validation

`npm run verify-configs` validates config schemas but does not currently lint `locales/*.json` for missing keys. If you
reference a key that doesn't exist, `localize()` returns the literal `<namespace>.<key>` string at runtime - easy to
spot in logs, but won't fail CI.