# Slash Commands

Commands live in a module's `commands-dir` (typically `commands/`). Each `.js` file is one slash command. The bot
collects all command files and syncs them with Discord at startup.

## Minimum command

```js
// modules/example/commands/ping.js
module.exports.config = {
    name: 'ping',
    description: 'Replies with pong.'
};

module.exports.run = async (interaction) => {
    await interaction.reply({content: 'Pong!', ephemeral: true});
};
```

Two exports:

- **`config`** - the slash command definition Discord registers. `name`, `description`, optional `options`, optional
  `defaultMemberPermissions`.
- **`run`** - async function called when a user invokes the command. Receives the `ChatInputCommandInteraction`.

## Options

```js
const {ChannelType} = require('discord.js');

module.exports.config = {
    name: 'archive',
    description: 'Archive a channel.',
    options: [
        {
            type: 'CHANNEL',
            name: 'channel',
            description: 'Channel to archive.',
            required: true,
            channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
        },
        {
            type: 'STRING',
            name: 'reason',
            description: 'Why are you archiving it?',
            required: false
        }
    ]
};
```

Supported `type` strings: `STRING`, `INTEGER`, `BOOLEAN`, `USER`, `CHANNEL`, `ROLE`, `MENTIONABLE`, `NUMBER`,
`ATTACHMENT`, `SUB_COMMAND`, `SUB_COMMAND_GROUP`. (These are mapped to `ApplicationCommandOptionType` internally.)

Read option values inside `run` with `interaction.options.getString('reason')`, `getChannel('channel', true)`,
`getInteger(...)`, etc.

## Subcommands

Use `SUB_COMMAND` options and export a `subcommands` map keyed by subcommand name:

```js
module.exports.subcommands = {
    'add': async (interaction) => { /* ... */ },
    'remove': async (interaction) => { /* ... */ },
    'list': async (interaction) => { /* ... */ }
};

module.exports.config = {
    name: 'role',
    description: 'Manage self-assignable roles.',
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'add',
            description: 'Add a role.',
            options: [{type: 'ROLE', name: 'role', description: 'Role to add.', required: true}]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: 'Remove a role.',
            options: [{type: 'ROLE', name: 'role', description: 'Role to remove.', required: true}]
        },
        {
            type: 'SUB_COMMAND',
            name: 'list',
            description: 'List configured roles.'
        }
    ]
};
```

When `subcommands` is exported, the loader dispatches to the matching key automatically - you don't need a top-level
`run`. (You may still export `run` as a fallback for commands that have both subcommands and a no-subcommand
invocation.)

## Autocomplete

For `STRING` / `INTEGER` / `NUMBER` options with `autocomplete: true`, export an `autocomplete` function:

```js
module.exports.config = {
    name: 'play',
    description: 'Play a sound.',
    options: [
        {
            type: 'STRING',
            name: 'sound',
            description: 'Which sound to play.',
            required: true,
            autocomplete: true
        }
    ]
};

module.exports.autocomplete = async (interaction) => {
    const focused = interaction.options.getFocused();
    const sounds = client.configurations['sounds']['catalog']
        .filter(s => s.name.toLowerCase().includes(focused.toLowerCase()))
        .slice(0, 25);
    await interaction.respond(sounds.map(s => ({name: s.name, value: s.id})));
};
```

## Permissions

Restrict who can use a command at the Discord level with `defaultMemberPermissions`:

```js
const {PermissionFlagsBits} = require('discord.js');

module.exports.config = {
    name: 'kick',
    description: 'Kick a member.',
    defaultMemberPermissions: PermissionFlagsBits.KickMembers.toString(),
    options: [/* ... */]
};
```

For finer-grained checks (role-based, configurable per-server), do the check inside `run`:

```js
module.exports.run = async (interaction) => {
    const staffRoles = interaction.client.configurations['my-module']['config']['staffRoles'];
    if (!interaction.member.roles.cache.some(r => staffRoles.includes(r.id))) {
        return interaction.reply({content: '⚠️ Staff only.', ephemeral: true});
    }
    // ...
};
```

## Localization

Use `localize()` for both descriptions and replies - see [localization.md](./localization.md). Descriptions are
evaluated at command registration time, so they always render in `client.locale`:

```js
const {localize} = require('../../../src/functions/localize');

module.exports.config = {
    name: 'help',
    description: localize('help', 'command-description')
};
```

## Defer when slow

Discord requires a response within 3 seconds. If your command does anything slow (database lookups, API calls, file
I/O), defer immediately:

```js
module.exports.run = async (interaction) => {
    await interaction.deferReply({ephemeral: true});
    const result = await someSlowThing();
    await interaction.editReply({content: result});
};
```

## Where commands are registered

Commands are registered as **guild commands** for the guild configured in `config/config.json`. Global registration is
not supported - this bot is single-guild by design. Reloading happens automatically at startup; new commands appear
within seconds. To force a re-sync without restart, run `/reload`.