# Writing a Module

A module is a self-contained folder under `modules/` that bundles together event handlers, slash commands, database
models, and configuration. The bot discovers and loads modules at startup based on each folder's `module.json`.

## Minimum file layout

```
modules/
  hello-world/
    module.json            # required - describes the module
    events/                # optional - Discord & custom event handlers
      messageCreate.js
    commands/              # optional - slash commands
      hello.js
    models/                # optional - Sequelize models
      Greeting.js
    configs/               # optional - user-editable config files
      config.json
```

Only `module.json` is mandatory. Everything else is opt-in via the matching `module.json` field.

## `module.json` reference

```json
{
  "name": "hello-world",
  "humanReadableName": "Hello World",
  "description": "Greets new members.",
  "fa-icon": "fas fa-hand-wave",
  "author": {
    "name": "Your Name",
    "link": "https://github.com/your-handle"
  },
  "openSourceURL": "https://github.com/ScootKit/CustomDCBot/tree/main/modules/hello-world",
  "tags": [
    "fun"
  ],
  "events-dir": "/events",
  "commands-dir": "/commands",
  "models-dir": "/models",
  "config-example-files": [
    "configs/config.json"
  ]
}
```

| Field                  | Required | Purpose                                                                                                      |
|------------------------|----------|--------------------------------------------------------------------------------------------------------------|
| `name`                 | Yes      | Internal id. Must match the folder name. Used as the namespace for `localize()` and `client.configurations`. |
| `humanReadableName`    | Yes      | Display name shown in dashboards and `/help`.                                                                |
| `description`          | Yes      | One-line summary.                                                                                            |
| `fa-icon`              | No       | FontAwesome class. Browse the supported set at https://scnx.app/developers/icons.                            |
| `author`               | No       | `{name, link}` shown in `/help`. `scnxOrgID` is dashboard-specific and ignored otherwise.                    |
| `openSourceURL`        | No       | Link to source in `/help`.                                                                                   |
| `tags`                 | No       | Used by the dashboard to group modules. Free-form strings.                                                   |
| `events-dir`           | No       | Folder (relative to the module) scanned for event handlers. Convention: `/events`.                           |
| `commands-dir`         | No       | Folder scanned for slash commands. Convention: `/commands`.                                                  |
| `models-dir`           | No       | Folder scanned for Sequelize models. Convention: `/models`.                                                  |
| `config-example-files` | No       | Paths (relative to the module) of config schema files. See [configuration.md](./configuration.md).           |

If you omit a `*-dir` key, that subsystem is skipped - there's no default. A module with only events doesn't need
`commands-dir`.

## Lifecycle

Bot startup, in order:

1. Read `config/config.json` (the user's main config).
2. Discover modules - read each `module.json`, mark enabled/disabled.
3. Load core models, then each module's models (`models-dir`).
4. Load and validate each module's `config-example-files` against the user's actual config files in
   `config/<module-name>/`.
5. Fire `client.emit('configReload')`.
6. Load core events, then each module's events (`events-dir`).
7. Connect to Discord, fetch the configured guild.
8. Load core commands, then each module's commands (`commands-dir`); sync slash commands with Discord.
9. Set `client.botReadyAt = new Date()` and fire `client.emit('botReady')`.

After `botReadyAt` is set, queued events start firing. Until then, handlers without `ignoreBotReadyCheck = true` are
silently skipped - see [events.md](./events.md).

## Accessing module state at runtime

Inside any handler, the `client` object exposes everything the loader registered:

```js
client.configurations['hello-world']['config']   // parsed configs/config.json
client.models['hello-world']['Greeting']         // Sequelize model class
client.modules['hello-world']                    // {enabled, events: [...], ...}
client.guild                                     // the configured guild (set after botReady)
client.logger                                    // log4js logger - use this, not console
```

`client.configurations[<moduleName>][<fileBasename>]` is keyed by the config filename without `.json`.
`configs/config.json` becomes `client.configurations['hello-world']['config']`; `configs/streamers.json` becomes
`client.configurations['hello-world']['streamers']`.

## A complete minimal module

```
modules/hello-world/
├── module.json
├── configs/config.json
└── events/guildMemberAdd.js
```

`module.json`:

```json
{
  "name": "hello-world",
  "humanReadableName": "Hello World",
  "description": "Welcome message in a configured channel.",
  "events-dir": "/events",
  "config-example-files": [
    "configs/config.json"
  ]
}
```

`configs/config.json`:

```json
{
  "filename": "config.json",
  "humanName": "Configuration",
  "description": "Where to send the welcome message.",
  "content": [
    {
      "name": "channel",
      "humanName": "Welcome channel",
      "description": "Channel new members are greeted in.",
      "type": "channelID",
      "default": ""
    }
  ]
}
```

`events/guildMemberAdd.js`:

```js
const {localize} = require('../../../src/functions/localize');

module.exports.run = async (client, member) => {
    const {channel: channelID} = client.configurations['hello-world']['config'];
    if (!channelID) return;
    const channel = await client.channels.fetch(channelID).catch(() => null);
    if (!channel) return;
    await channel.send(localize('hello-world', 'welcome', {u: member.toString()}));
};
```

`locales/en.json` (add a top-level key):

```json
"hello-world": {
"welcome": "Welcome %u to the server!"
}
```

That's a working module. Run `npm run verify-configs` to confirm the config schema is valid, then start the bot with
`npm start`.

## What to read next

- [Events](./events.md) for handler patterns and the lifecycle gates that decide when your code runs.
- [Slash commands](./commands.md) when your module needs user-invokable commands.
- [Database models](./database-models.md) for persistent state.
- [Localization](./localization.md) for adding user-facing strings.
- [Configuration files](./configuration.md) for the full config schema reference.