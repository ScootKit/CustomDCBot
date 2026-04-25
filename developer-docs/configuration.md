# Module Configuration Files

This guide explains how to write `config.json`, `streamers.json`, etc. - the JSON files in `modules/<name>/configs/`that
define a module's settings. The bot reads these to render config editors, validate values, and provide defaults.

> **Format change.** As of bot v3, config files use **plain English strings** for `humanName`, `description`, defaults,
> etc. The old `{en: "...", de: "..."}` inline-localization format is no longer supported and `npm run verify-configs`will
> reject it. Translations now live in `config-localizations/<lang>.json` and are extracted by a separate script.
> See [config-localization.md](./config-localization.md).

Selected developers can preview how their configuration files render in the SCNX dashboard
at https://scnx.app/developers/configuration after approval. The OSS bot reads the same files - dashboard preview is
optional.

## File structure

Every config file has the same top-level shape:

```json
{
  "filename": "config.json",
  "humanName": "Configuration",
  "description": "Adjust messages and permissions here.",
  "content": []
}
```

| Field         | Required | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| `filename`    | Yes      | The generated config filename (must match the file's actual name). |
| `humanName`   | Yes      | Display name shown in the dashboard.                               |
| `description` | Yes      | One-line description shown in the dashboard.                       |
| `content`     | Yes      | Array of field definitions (see below).                            |

Optional top-level keys: `categories`, `commandsWarnings`, `configElements`, `configElementName`, `warningBanner`,
`hidden`, `skipContentCheck`. Each is documented in its own section below.

## Field definitions

Each entry in the `content` array defines one configuration field:

```json
{
  "name": "staffRoles",
  "humanName": "Staff Roles",
  "description": "Roles that can manage this module.",
  "type": "array",
  "content": "roleID",
  "default": []
}
```

### Required field properties

| Property      | Description                                                       |
|---------------|-------------------------------------------------------------------|
| `name`        | Internal key used in code (`moduleConfig.staffRoles`). camelCase. |
| `type`        | Data type. See [Field types](#field-types) for the full list.     |
| `humanName`   | Display name shown in the dashboard.                              |
| `description` | Sentence explaining what the field does.                          |
| `default`     | Default value. Must match the declared `type`.                    |

### Optional field properties

| Property          | Applies to                                                               | Description                                                                                                                                                  |
|-------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `category`        | All types                                                                | Groups the field under a UI tab (see [Categories](#categories)).                                                                                             |
| `dependsOn`       | All types                                                                | Only show this field when another named field is truthy.                                                                                                     |
| `dependsOnNot`    | All types                                                                | Only show this field when another named field is falsy. (Opposite of `dependsOn`.)                                                                           |
| `allowNull`       | `channelID`, `roleID`, `userID`, `guildID`, `integer`, `float`, `string` | Allow the field to be empty (`""` or `null`) without failing validation.                                                                                     |
| `allowEmbed`      | `string`                                                                 | Allow the user to configure an embed object instead of plain text.                                                                                           |
| `params`          | `string` (with `allowEmbed`)                                             | Document available `%placeholder%` variables (see [Parameters](#parameters)).                                                                                |
| `content`         | `array`, `keyed`, `select`, `channelID`                                  | Sub-type, options, or allowed channel types (meaning depends on parent type). For `channelID`, an array of channel-type identifiers (see `channelID` below). |
| `maxValue`        | `integer`, `float`                                                       | Maximum allowed numeric value.                                                                                                                               |
| `minValue`        | `integer`, `float`                                                       | Minimum allowed numeric value.                                                                                                                               |
| `maxLength`       | `array`, `string`                                                        | Maximum number of items (array) or characters (string).                                                                                                      |
| `disableKeyEdits` | `keyed`                                                                  | Prevent users from adding/removing keys; only existing values are editable.                                                                                  |
| `optional`        | `string`                                                                 | Field can be skipped without being explicitly null.                                                                                                          |
| `links`           | All types                                                                | Help links shown next to the field. Format: `[{"label": "...", "url": "..."}]`.                                                                              |
| `hidden`          | All types                                                                | Hide the field from the dashboard UI. The value is still loaded - useful for migration shims.                                                                |
| `elementToggle`   | `boolean` (inside `configElements: true`)                                | Marks this field as the per-element enable toggle. **Only one allowed per file.**                                                                            |

## Field types

The verifier accepts these `type` values:

`string`, `emoji`, `imgURL`, `timezone`, `boolean`, `integer`, `float`, `channelID`, `roleID`, `userID`, `guildID`,
`array`, `keyed`, `select`.

### `string`

A text field. Set `allowEmbed: true` to also accept an embed object.

```json
{
  "name": "welcomeMessage",
  "humanName": "Welcome message",
  "description": "Sent in the welcome channel when someone joins.",
  "type": "string",
  "allowEmbed": true,
  "default": {
    "title": "Welcome!",
    "description": "Hello %user%"
  },
  "params": [
    {"name": "user", "description": "Mention of the new member."}
  ]
}
```

When `allowEmbed` is true, the value can be a plain string or an embed object. Embed schemas v2/v3/v4 are all
supported - tag v3/v4 explicitly with `"_schema": "v3"` (or `"v4"`).
Reference: [v2](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v2/), [v3](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v3/), [v4](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v4/).

### `emoji`

Unicode or custom Discord emoji.

```json
{
  "name": "starEmoji",
  "humanName": "Star emoji",
  "description": "Emoji used for the starboard reaction.",
  "type": "emoji",
  "default": "⭐"
}
```

### `imgURL`

A URL pointing at an image. Treated as a string at runtime, but the dashboard renders an image picker.

```json
{
  "name": "logo",
  "humanName": "Logo",
  "description": "URL of the server logo (used in welcome embeds).",
  "type": "imgURL",
  "default": ""
}
```

### `timezone`

A timezone name like `Europe/Berlin`. Stored as a string; validate with a library (e.g. `Intl.DateTimeFormat`) before
using.

```json
{
  "name": "guildTimezone",
  "humanName": "Server timezone",
  "description": "Used for daily reset jobs and date formatting.",
  "type": "timezone",
  "default": "UTC"
}
```

### `boolean`

```json
{
  "name": "enabled",
  "humanName": "Enabled",
  "description": "Toggle the module on or off.",
  "type": "boolean",
  "default": false
}
```

### `integer` / `float`

Numeric fields. Use `minValue` and `maxValue` to constrain the range.

```json
{
  "name": "cooldownSeconds",
  "humanName": "Cooldown (seconds)",
  "description": "Minimum time between uses.",
  "type": "integer",
  "default": 60,
  "minValue": 0,
  "maxValue": 3600
}
```

### `channelID`

A channel picker. Use `content` to restrict to specific channel kinds. Without `content`, all common types are accepted.

```json
{
  "name": "logChannel",
  "humanName": "Log channel",
  "description": "Channel for log messages.",
  "type": "channelID",
  "content": ["GUILD_TEXT", "GUILD_NEWS"],
  "default": "",
  "allowNull": true
}
```

Valid channel-type identifiers: `GUILD_TEXT`, `GUILD_VOICE`, `GUILD_CATEGORY`, `GUILD_NEWS` (announcement channels),
`GUILD_STAGE_VOICE`, `GUILD_FORUM`, `GUILD_MEDIA`, `GUILD_NEWS_THREAD`, `GUILD_PUBLIC_THREAD`, `GUILD_PRIVATE_THREAD`.

### `roleID`

A role picker.

```json
{
  "name": "moderatorRole",
  "humanName": "Moderator role",
  "description": "Role granted access to moderation commands.",
  "type": "roleID",
  "default": ""
}
```

### `userID`

A user picker.

```json
{
  "name": "owner",
  "humanName": "Bot owner",
  "description": "User who receives critical alerts.",
  "type": "userID",
  "default": ""
}
```

### `guildID`

A Discord guild ID. Use this for cross-guild references (e.g. emoji from another server).

```json
{
  "name": "emojiGuild",
  "humanName": "Emoji guild",
  "description": "Server where custom emojis are stored.",
  "type": "guildID",
  "default": ""
}
```

### `array`

A list of values. The `content` property defines the type of each item.

```json
{
  "name": "adminRoles",
  "humanName": "Admin roles",
  "description": "Roles allowed to use admin commands.",
  "type": "array",
  "content": "roleID",
  "default": []
}
```

Valid `content` values: any scalar type (`roleID`, `channelID`, `userID`, `guildID`, `string`, `integer`, `emoji`, ...).
Use `maxLength` to limit the number of items.

### `select`

A dropdown. The `content` property defines the options.

**Simple string options** (the stored value equals the displayed label):

```json
{
  "name": "streakPeriod",
  "humanName": "Streak period",
  "description": "How often streak progress resets.",
  "type": "select",
  "content": ["daily", "weekly", "monthly"],
  "default": "daily"
}
```

**Labeled options** (stored value differs from the label):

```json
{
  "name": "curveType",
  "humanName": "XP curve",
  "description": "Formula used to calculate level requirements.",
  "type": "select",
  "content": [
    {"value": "LINEAR", "displayName": "Linear (default)"},
    {"value": "EXPONENTIAL", "displayName": "Exponential"},
    {"value": "CUSTOM", "displayName": "Custom formula"}
  ],
  "default": "LINEAR"
}
```

### `keyed`

A key/value map. The `content` property defines the key and value types.

```json
{
  "name": "rewardRoles",
  "humanName": "Level reward roles",
  "description": "Roles granted at specific levels.",
  "type": "keyed",
  "content": {"key": "integer", "value": "roleID"},
  "default": {}
}
```

Common combinations:

| Key type    | Value type | Use case                             |
|-------------|------------|--------------------------------------|
| `integer`   | `roleID`   | Level reward roles, milestone roles. |
| `roleID`    | `float`    | XP multiplier per role.              |
| `channelID` | `float`    | XP multiplier per channel.           |
| `channelID` | `string`   | Auto-react emojis per channel.       |
| `roleID`    | `string`   | Descriptions per role.               |

Use `disableKeyEdits: true` when the keys are fixed and users should only edit values.

## Categories

Categories group fields into tabs in the dashboard. Without categories, all fields appear in a single list.

```json
{
  "categories": [
    {"id": "general",  "icon": "fas fa-gears",       "displayName": "General"},
    {"id": "messages", "icon": "fas fa-comment",     "displayName": "Messages"},
    {"id": "roles",    "icon": "fas fa-user-shield", "displayName": "Roles & Permissions"}
  ],
  "content": [
    {
      "name": "staffRoles",
      "humanName": "Staff roles",
      "description": "Roles that can manage this module.",
      "type": "array",
      "content": "roleID",
      "category": "roles",
      "default": []
    }
  ]
}
```

| Property      | Description                                                                       |
|---------------|-----------------------------------------------------------------------------------|
| `id`          | Internal identifier referenced by fields via `category: "<id>"`.                  |
| `icon`        | FontAwesome class. Browse and request icons at https://scnx.app/developers/icons. |
| `displayName` | Tab label.                                                                        |

Fields without a `category` appear in an uncategorized section. Use categories when your config has 7+ fields or
distinct logical groups; below that, a flat list is cleaner.

## Conditional fields

Use `dependsOn` to show a field only when another field is truthy:

```json
[
  {"name": "enableCooldown", "humanName": "Enable cooldown", "description": "...", "type": "boolean", "default": false},
  {"name": "cooldownDuration", "humanName": "Cooldown (seconds)", "description": "...", "type": "integer", "default": 60, "dependsOn": "enableCooldown"}
]
```

`dependsOn` works with:

- **Boolean fields** - shown when the boolean is `true`.
- **Select fields** - shown when the select is not `""` or `"none"`.

`dependsOnNot` is the inverse - show the field when the named field is falsy.

You can chain dependencies: A enables B which enables C.

## Parameters

For `string` fields with `allowEmbed: true`, document available `%placeholder%` variables with `params`:

```json
{
  "name": "endMessage",
  "humanName": "End message",
  "description": "Posted when the game ends.",
  "type": "string",
  "allowEmbed": true,
  "default": "Congrats %winner%, the number was %number%!",
  "params": [
    {"name": "winner", "description": "Mention of the winner."},
    {"name": "number", "description": "The winning number."}
  ]
}
```

In code, use `embedType()` from `src/functions/helpers.js` to substitute placeholders:

```js
const {embedType} = require('../../../src/functions/helpers');

channel.send(embedType(moduleConfig.endMessage, {
    '%winner%': member.toString(),
    '%number%': game.number
}));
```

Param entries can also have:

- `isImage: true` - the user can route this param into an embed `image`, `thumbnail`, `author.img`, or `footerImgUrl`
  slot.
- `fieldValue: "<select-value>"` - on a parent `select` field, the param is only available when the select equals this
  value.

## Config elements

For configs where users create multiple instances of the same schema (ticket categories, team list entries, streamer
entries, ...), set `configElements: true` at the top level:

```json
{
  "filename": "categories.json",
  "humanName": "Ticket categories",
  "description": "One entry per ticket category.",
  "configElements": true,
  "configElementName": {"one": "Ticket Category", "more": "Ticket Categories"},
  "content": [
    {"name": "channelID", "humanName": "Channel", "description": "Where new tickets are opened.", "type": "channelID", "default": ""},
    {"name": "enabled",   "humanName": "Enabled", "description": "Toggle this category.", "type": "boolean", "default": true, "elementToggle": true},
    {"name": "message",   "humanName": "Initial message", "description": "Sent when a ticket is created.", "type": "string", "allowEmbed": true, "default": "Hello!"}
  ]
}
```

| Property            | Description                                                                            |
|---------------------|----------------------------------------------------------------------------------------|
| `configElements`    | `true` to enable multi-element mode. The stored value is an array of objects.          |
| `configElementName` | Singular/plural labels for the dashboard. `{one: "...", more: "..."}`.                 |
| `elementToggle`     | On a single boolean field inside `content`, marks it as the per-element on/off toggle. |

Add a new element from the CLI: `node add-config-element-object.js <path-to-example-config> <path-to-config>`.

## Commands warnings

Use `commandsWarnings` to tell users which slash commands need manual permission setup in their server settings:

```json
{
  "commandsWarnings": {
    "normal": ["/manage-levels"],
    "special": [
      {"name": "/moderate", "info": "Each moderator needs explicit permission for this command in server settings."}
    ]
  }
}
```

- `normal` - simple list of command names that need permission configuration.
- `special` - commands that need additional explanation beyond just setting permissions.

## Other top-level properties

| Property           | Description                                                                                |
|--------------------|--------------------------------------------------------------------------------------------|
| `warningBanner`    | Warning banner shown prominently at the top of the dashboard config page.                  |
| `hidden`           | `true` to hide the entire file from the dashboard UI. Useful for credentials-only configs. |
| `skipContentCheck` | `true` to skip default-value normalization for this file. Use when the schema is dynamic.  |

## Validating

Run `npm run verify-configs` to check every config file in the repo against this schema. CI runs the same script on
every PR via `.github/workflows/verify-configs.yml`. The script catches:

- Missing required properties (`name`, `type`, `default`).
- Type mismatches between `type` and `default`.
- Unknown `type` values.
- `dependsOn` / `dependsOnNot` referencing non-existent fields.
- Multiple `elementToggle` fields in the same file.
- Duplicate field names.
- Defaults still using the deprecated localized format.
- Embed defaults that look like v3 messages but are missing `"_schema": "v3"`.

## Full example

```json
{
  "filename": "config.json",
  "humanName": "Configuration",
  "description": "Configure the example module.",
  "commandsWarnings": {
    "normal": [
      "/example"
    ]
  },
  "categories": [
    {
      "id": "general",
      "icon": "fas fa-gears",
      "displayName": "General"
    },
    {
      "id": "messages",
      "icon": "fas fa-comment",
      "displayName": "Messages"
    }
  ],
  "content": [
    {
      "name": "enabled",
      "humanName": "Enable module?",
      "description": "Toggle this module on or off.",
      "type": "boolean",
      "category": "general",
      "default": false
    },
    {
      "name": "logChannel",
      "humanName": "Log channel",
      "description": "Channel for log messages. Leave empty to disable.",
      "type": "channelID",
      "content": [
        "GUILD_TEXT"
      ],
      "category": "general",
      "allowNull": true,
      "dependsOn": "enabled",
      "default": ""
    },
    {
      "name": "notificationMessage",
      "humanName": "Notification message",
      "description": "Sent when a user triggers the module.",
      "type": "string",
      "allowEmbed": true,
      "category": "messages",
      "dependsOn": "enabled",
      "default": {
        "title": "Notification",
        "description": "Hello %user%!"
      },
      "params": [
        {
          "name": "user",
          "description": "Mention of the user."
        }
      ]
    }
  ]
}
```

## Accessing config values in code

Config values are available at runtime via `client.configurations`:

```js
const moduleConfig = client.configurations['your-module']['config'];
const logChannel = moduleConfig.logChannel;
const isEnabled = moduleConfig.enabled;
```

The key under `client.configurations[moduleName]` is the config filename without `.json`. `configs/config.json` becomes
`client.configurations['your-module']['config']`; `configs/streamers.json` becomes
`client.configurations['your-module']['streamers']`.