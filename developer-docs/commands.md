# Commands

Commands live in a module's `commands-dir` (typically `commands/`). Each `.js` file is one command. The bot collects
all command files and syncs them with Discord at startup.

Two kinds exist: **slash commands**, invoked by typing `/name`, and **context-menu commands**, invoked by
right-clicking a user or a message. Everything below describes slash commands unless stated otherwise; see
[Context-menu commands](#context-menu-commands) for the differences.

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

## Context-menu commands

A context-menu command is one a user reaches by right-clicking a **user** or a **message** and picking it under
*Apps*. It takes no options - the thing that was right-clicked is the entire input.

```js
// modules/levels/commands/view-profile.js
const {localize} = require('../../../src/functions/localize');
const {sendProfile} = require('./profile');

module.exports.config = {
    name: 'View Level Profile',
    type: 'USER',
    contextMenu: true,
    description: localize('levels', 'profile-context-description')
};

module.exports.run = async function (interaction) {
    const member = interaction.targetMember ?? await interaction.guild.members.fetch(interaction.targetUser.id);
    return sendProfile(interaction, member);
};
```

- **`type`** - `'USER'` or `'MESSAGE'`. Required, and the whole command sync fails without it.
- **`contextMenu: true`** - marks the file as a context command.
- **`name`** - unlike a slash command, it may use capitals and spaces. Maximum 32 characters.
- **`description`** - used for `/help` only. Discord forbids a description on context commands, so it is stripped
  before registration. Declare it anyway.
- **`options`** - not allowed. They are stripped before registration.
- **`defaultMemberPermissions`** - works exactly as for slash commands.

Read the target off the interaction:

| `type`      | Available on `interaction`                                      |
|-------------|-----------------------------------------------------------------|
| `'USER'`    | `targetUser`, and `targetMember` when the user is in the guild   |
| `'MESSAGE'` | `targetMessage`                                                  |

`targetMember` is null when the member is not cached, so fall back to `guild.members.fetch()` as above.

### Sharing logic with a slash command

Most context commands are a thin wrapper over an existing slash command. Export the shared core from the slash
command file and call it from both, so the two render identically:

```js
// in the slash command file
module.exports.sendProfile = sendProfile;
```

Where the slash command reads an option, hand its `run()` a proxy that supplies the context target instead:

```js
const proxy = Object.create(interaction);
proxy.options = {getUser: () => interaction.targetUser};
return runHug(proxy);
```

### Registration limits

Discord allows **15 USER and 15 MESSAGE context commands per bot** (against 100 slash commands). Across all modules
this bot ships more than that, so if too many are enabled at once the extras are skipped and logged:

```
Skipping 4 USER context command(s): Discord allows at most 15 per bot. Not registered: welcomer/Assign Join Roles, ...
```

Which ones survive depends on module load order. Two context commands of the same type may not share a name; the
later one is skipped with a warning.

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

Commands are registered as **guild commands** for the guild configured in `config/config.json`, which is what you want
during development: guild commands appear within seconds. Setting `syncCommandGlobally: true` registers them globally
instead - they then also show up on other servers (where they will not work), and Discord can take up to two hours to
propagate the change. Reloading happens automatically at startup; to force a re-sync without restarting, run `/reload`.