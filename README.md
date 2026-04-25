# Custom-Bot v3

Create your own Discord bot - fully customizable and modular. This bot is for advanced JS users with experience in
JavaScript, discord.js, and JSON configuration.

## Don't want to self-host? Use SCNX (free)

This repository is the **DIY path**: clone, configure JSON files by hand, run a Node process, manage uptime yourself.
If that doesn't sound fun, the same bot is available as a fully managed service at **[scnx.xyz](https://scnx.xyz)**.

* **Free plan** - no credit card required. Hosting is ad-supported: watch one short ad in the dashboard every 7 days
  to keep the bot running. Skip a week and the bot pauses until you log in.
* **Paid plans** start at **€4.99 / month** - no ads, higher limits, and access to premium modules and tiers.

What you get with the hosted version that you do **not** get here:

* **Zero setup.** Invite the bot, log in to the [dashboard](https://scnx.app), pick your modules, done. No Node, no
  JSON, no server.
* **Hosted for you.** We run the bot so you don't have to keep a Node process alive. Restarts and updates are handled
  on our side; Discord-side outages are still Discord's problem, but you're not on the hook for the rest. The free
  plan keeps running as long as you watch the weekly ad; paid plans drop the ad requirement.
* **Visual editors.** Drag-and-drop embed editor, point-and-click configuration, live previews. No more hand-writing
  JSON for every welcome message.
* **Custom slash commands.** Build commands in the dashboard with no code.
* **Send and edit messages anywhere.** Rich message editor for any channel, any time.
* **AI features.** AI chat channels, AI-generated images, and other LLM-backed modules - configured from the dashboard,
  no API keys to manage.
* **Human-readable error reports.** When something breaks, you see what and why - in your language - in your dashboard.
* **More modules.** Several modules (anti-nuke, applications, giveaways, advanced logging, RSS / Twitter / YouTube /
  TikTok integrations, and more) are exclusive to the hosted version.
* **Translated UI.** Dashboard and bot fully translated into 20+ languages.

**[Get started at scnx.xyz](https://scnx.xyz)** - the free plan covers most communities; upgrade only if you outgrow
it.

### Running professional customer support on Discord?

The OSS `tickets` module here is fine for small communities, but if you're running **paid customer support** through
Discord - ticket assignments, estimated wait times, voice support, escalation, analytics - SCNX ships a **separate,
dedicated support bot** with a feature set built for that use case. It's a different (paid) product, not a module of
this
bot. See [scnx.xyz](https://scnx.xyz/support-bot) for details.

> **Heads up on support.** Our customer support team only handles the SCNX hosted version. Tickets, live help, and
> account assistance all go through scnx.app. The OSS version in this repo is community-supported - GitHub issues
> only, best-effort, no SLA.

## Why two versions?

You might wonder why the same bot exists in two flavors. Short version:

* **OSS (this repo).** The base bot, modular core, and a curated set of modules that work standalone. Good for
  self-hosters, learners, and people who want to fork. Released under [BUSL-1.1](#license---read-before-using).
* **SCNX (hosted).** Everything in OSS, plus the dashboard, several integration modules (AI features, anti-nuke,
  giveaways, the social-platform notifiers, etc.), the visual editors, the customer support, and the managed
  infrastructure.

We split it this way because the dashboard, infra, and several modules cost money to build and run. Giving them away
for free would mean we couldn't pay the people who build them. Keeping a strong OSS core (with a non-compete clause via
BUSL) lets us be transparent about how the bot works, accept community contributions, and let advanced users self-host

- without subsidizing competitors who would just rebrand and resell our work.

If you want the rebrand-and-resell freedom that an MIT/Apache license would give you, the [LICENSE](LICENSE) explains
how to negotiate commercial terms. For everyone else, the [Additional Use Grant](LICENSE) is broad enough to cover
the use cases people actually have: run the bot in your own community, modify it, contribute back, learn from it.

## License - read before using

> **This is NOT MIT, Apache, or any other permissive license.** It is the
> [Business Source License 1.1](LICENSE) (BUSL-1.1, the same license used by MariaDB, CockroachDB, and Sentry). Read
> the full [LICENSE](LICENSE) before deploying anything based on this code.

### What you can do

* **Self-host for your own community.** Run this bot on your own server, in your own Discord guild, for your own
  members. No fees, no permission needed.
* **Modify and contribute.** Fork the repo, change the code, build your own modules. Pull requests welcome.
* **Learn from it.** Read the source, copy patterns into unrelated projects, write tutorials.

### What you CANNOT do

* **You may NOT offer this bot - or any modified version, fork, or derivative - as a hosted, managed, or embedded
  service to third parties in a way that competes with [scnx.app](https://scnx.app).** That includes selling,
  reselling, "free with ads," white-labeling, or running it for paying customers. This is the explicit "Additional Use
  Grant" carve-out in the license, and we enforce it.
* **You may NOT relicense or sublicense this code** under MIT, Apache, GPL, or anything else. The license travels with
  the code.

### What you MUST do if you publish modifications

* **Publish your source.** Any modified or derivative work distributed to third parties must be made available under
  this same license.
* **Document your changes.** State what you changed and when.
* **Carry the license.** Display BUSL-1.1 prominently on every copy or fork.

### When does it become MIT?

The license auto-converts to **MIT License** eight years after a given version is published (or four years after
its first public distribution, whichever comes first). After that date, that specific version is fully permissive.
Newer versions stay BUSL until their own clock runs out.

### Need a commercial license?

If your intended use isn't covered by the Additional Use Grant - for example, you want to host this bot for paying
customers - email **oss@scootkit.net** to negotiate commercial terms. Operating outside the license without an
agreement is a violation and we will pursue it.

This summary is not legal advice. The [LICENSE](LICENSE) file is the authoritative document.

## Support development

Development of this bot is funded by [SCNX](https://scnx.xyz) - our hosted version. Every paid SCNX customer keeps the
OSS core moving forward. If you want to help in other ways, [contribute code](.github/CONTRIBUTING.md): bug fixes, new
modules, and documentation improvements are all welcome via pull request.

## Installation

1. Clone this repo
2. Run `npm ci`
3. Run `npm run generate-config`
4. Replace your token in `config/config.json`
5. Start the bot with `npm start`
6. The bot generates `modules.json` and `strings.json` in your `config` directory - see [Configuration](#configuration)
   for details

When reading the code, you may encounter tracking/issue-reporting sections. These are only active in the SCNX version
and are used for bug detection and user-facing diagnostics (users can opt out; we use Sentry SDK with our own Glitchtip
instance). The open-source version does not contact SCNX or share any data.

## Features

* **Modular architecture** - enable, configure, and disable each module independently
* **Highly configurable** - every message, role, channel, and behavior can be customized
* **Custom modules** - add your own modules with commands, events, and database models
* **Auto-generated configs** - every config field has a description and default value

## Configuration

All configuration files live in your `config` folder. Each enabled module gets its own subfolder with config files.
These files are auto-generated with defaults and descriptions.

For embed-capable fields (`allowEmbed: true`), the value can be a plain string or an embed object with: `title`,
`message`, `description`, `color`, `url`, `image`, `thumbnail`, `author`, `fields`, `footer`, `footerImgUrl`. The footer
and timestamp are controlled globally via `strings.json`.

For full details on writing config files, see [developer-docs/configuration.md](developer-docs/configuration.md).

## Developer Documentation

Full guides live in [developer-docs/](developer-docs/) (start with the [index](developer-docs/README.md)). The
short version:

**Module authors - start here:**

| Document                                               | Covers                                                                                                                |
|--------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| [Writing a module](developer-docs/writing-a-module.md) | File layout, `module.json`, lifecycle, end-to-end example                                                             |
| [Events](developer-docs/events.md)                     | Handler shape, `botReadyAt` / `allowPartial` / `ignoreBotReadyCheck` gates, custom `botReady` / `configReload` events |
| [Slash commands](developer-docs/commands.md)           | `config` / `run` / `subcommands` / `autocomplete`, options, permissions, deferring                                    |
| [Database models](developer-docs/database-models.md)   | Sequelize `Model.init` pattern, conventions, `sequelize.sync()` behavior, associations                                |
| [Localization](developer-docs/localization.md)         | Adding strings to `locales/en.json`, using `localize()`, runtime fallback                                             |

**Configuration schema:**

| Document                                                      | Covers                                                                            |
|---------------------------------------------------------------|-----------------------------------------------------------------------------------|
| [Configuration files](developer-docs/configuration.md)        | Schema reference: field types, defaults, `dependsOn`, `elementToggle`, validation |
| [Country localization](developer-docs/config-localization.md) | How user-facing config strings are extracted and translated                       |

**Operations:**

| Document                                 | Covers                               |
|------------------------------------------|--------------------------------------|
| [Migration](developer-docs/migration.md) | Upgrading between major bot versions |

**Message schemas** (canonical reference at docs.scnx.xyz):

* [V2 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v2/) - legacy, parsed when `_schema` is
  absent
* [V3 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v3/) - tag with `"_schema": "v3"`
* [V4 schema](https://docs.scnx.xyz/docs/scnx-api/reference/message-schema-v4/) - tag with `"_schema": "v4"`

## Creating modules

As per the [license](LICENSE), you **must** make every module publicly available under the same license.

Before building a module, create an issue with your suggestion so nobody duplicates work. Submit modules via pull
request.

### Module structure

```
modules/your-module/
  module.json          # Module metadata (required)
  configs/
    config.json        # Configuration schema
  commands/
    your-command.js    # Slash commands
  events/
    botReady.js        # Event handlers
    messageCreate.js
  models/
    YourModel.js       # Sequelize models
```

### module.json

```json
{
  "name": "your-module",
  "humanReadableName": {
    "en": "Your Module",
    "de": "Dein Modul"
  },
  "description": {
    "en": "Short description",
    "de": "Kurze Beschreibung"
  },
  "author": {
    "name": "Your Name",
    "link": "https://your-site.com"
  },
  "commands-dir": "/commands",
  "events-dir": "/events",
  "models-dir": "/models",
  "config-example-files": [
    "configs/config.json"
  ]
}
```

Optional fields: `cli`, `on-load-event`, `tags`, `openSourceURL`, `fa-icon` (set by us - browse and request icons
at https://scnx.app/developers/icons).

### Commands

Export `run`, `config`, and optionally `subcommands`, `beforeSubcommand`, `autoComplete`:

```js
module.exports.run = async function (interaction) { /* ... */
};

module.exports.config = {
    name: 'your-command',
    description: localize('your-module', 'command-description'),
    defaultMemberPermissions: null, // null = everyone, ['Administrator'] = admin only
    options: [] // or async function(client) { return [...]; }
};
```

Use subcommands over separate commands - there's a 100-command limit. Use
`disabled: function(client) { return !condition; }` to conditionally hide commands.

### Events

Export a `run` function:

```js
module.exports.run = async function (client, ...args) { /* ... */
};
```

Use `botReady` instead of discord.js `ready` when you need configs loaded. Remember that `botReady` re-fires on config
reload - clean up intervals by pushing to `client.intervals` or `client.jobs`.

### Models

Use Sequelize models with the standard pattern. See [developer-docs/migration.md](developer-docs/migration.md) for
adding fields to existing models.

### Rules for modules

* Use slash commands with subcommands wherever possible
* Reply with ephemeral messages where it makes sense
* Export functions for cross-module interaction
* Use the newest Discord API features (buttons, selects, modals)
* Process and store only needed user data
* Support localization (see below)
* Follow the [SCNX ToS](https://scootk.it/scnx-tos), [Discord ToS](https://discord.com/tos),
  and [Discord Developer ToS](https://discord.com/developers/docs/legal)

### Localization

Use `localize(module, key, replacements)` from `src/functions/localize.js` for non-user-editable strings. Translations
happen on [Weblate](https://localize.sc-network.net/projects/custombot/locales/).

For user-editable strings in config files (`humanName`, `description`, defaults), use **plain English strings**.
Translations live separately in `config-localizations/<lang>.json` and are extracted by a script - see
[developer-docs/config-localization.md](developer-docs/config-localization.md). The deprecated `{ "en": "...", "de":
"..." }` inline format is rejected by `npm run verify-configs`.

### Helper functions

Check `src/functions/helpers.js` for utilities: `embedType()`, `formatDiscordUserName()`, `parseEmbedColor()`,
`formatDate()`, `truncate()`, and more.

---

Copyright © 2026 ScootKit UG (haftungsbeschränkt). [BUSL-1.1](LICENSE) applies.