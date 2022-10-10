# Custom-Bot v3

Create your own discord bot - Fully customizable and with a lot of features. This bot is for advanced JS-Users, you
should only use it if you have some experience with Javascript, discord.js and JSON files.

---

## Get your own Custom-Bot completely free and with a modern webinterface and a lot more features!

Go check it out on our [website](https://scnx.xyz) (currently only german; the [dashboard](https://scnx.app) and bot are
fully translated). In addition to the here
available features we offer:

* Free hosting
* Custom-Commands
* Easy-to-use Embed-Editor
* Send and edit messages in specific channels
* Easy-to-use Configuration-Editor
* Human-Readable Issue Reporting - never look at logs again
* and a modern dashboard
* and *a lot* more - for free

[Get started now](https://scnx.xyz) - it's free - forever!

## Please read the [license](LICENSE) if you use this bot.

We really love open-source. Please read the license and follow it.\
In short words: You have to

* Disclose the source (Your source code has made available when using this bot)
* State changes (*every* change to the source code must be documented and published)\

Please read the full [license](LICENSE). This is not legal advice.

You may ask yourself, how this could align with our closed-source-version at [SCNX](https://scnx.xyz), you can find more
information about that in [this issue](https://github.com/SCNetwork/CustomDCBot/issues/13).

## Support development

As mentioned above our business model is to host these bots for servers - it does not really make sense to publish our
product here - but we do it anyway - but we need your support! Feel free to [contribute](.github/CONTRIBUTING.md)
, [get a membership](https://membership.sc-network.net) (also on [Patreon](https://patreon.com/scnetwork)), or
donate [via Creditcard](https://scnx.app/scam) or [PayPal](https://paypal.me/therealscderox). Thank you so much <3

## Need help?

Are you stuck? Please do not ask on our Discord (unless you are using our hosted version), instead ask in
the [discussions-tab](https://github.com/SCNetwork/CustomDCBot/discussions).

## Need something even more custom?

We are happy to give you a quote for individual requirements. Please email `sales@sc-network.net` with your
requirements.

### Table of contents

[Installation](#installation)\
[Features](#features)\
[Configuration](#configuration)\
[Modules](#modules)\
[Add your own module (or API)](#add-your-own-modules)

### Installation

1. Clone this repo
2. Run `npm ci`
3. Run `npm run generate-config`
4. Replace your token in the `config/config.json` file.
5. Start the bot with `npm start`
6. The bot is now generating a `modules.json` and a `strings.json` file inside your `config` directory. You
   can [change](#configuration) them.

When reading thought the code, you may encounter code "tracking" / "issue reporting" parts of the bot.
This part is only enabled in the SCNX-Version and only used to allow users to see (configuration) issues of their bot
and to allow our team to detect bugs more easily (users can opt-out of that if they want to; we use the sentry-sdk for
that, but don't actually send any data to them, instead to our glitchtip instance - the open-source-version does neither
of that).
This open-source-version won't contact SCNX, SC Network and won't share any information with us, don't worry. You
can verify this by looking at the source code, which you should do before executing any code from the internet.

### Features

* Everything is split in different [modules](#modules) - you can enable, configure and disable it how you want
* Highly configurable - The goal with this bot is that you can change *everything*
* Add your own modules
* Easy configuration - Every config field has a description in an example file

### Configuration

You can find all the configuration-files inside your `config` folder. Every **enabled module** will have their own
folder with config-files inside them. **These files are generated automatically**. Every module has slightly different
configuration options. Every module has example files. Inside these files are more information about every configuration
option.  
Some config values also support [embeds](https://discordjs.guide/popular-topics/embeds.html). This is the case
if `allowEmbed` is true.\
You either input a string (normal discord message), or an embed object with the following values:

* `title`: Title of the embed
* `message`: Message outside the embed (optional)
* `description`: Description of the embed (optional)
* `color`: Color of the embed, must be
  a [ColorResolvable](https://discord.js.org/#/docs/main/stable/typedef/ColorResolvable) (optional)
* `url`: URL of the embed (optional)
* `image`: Image of the embed, should be an url (optional)
* `thumbnail`: Thumbnail-Image of the embed, should be an url (optional)
* `author` (optional):
    * `name`: Name of the author
    * `img`: Image of the author, should be an url
* `fields`: Fields of the embed, must be an array
  of [EmbedFieldData](https://discord.js.org/#/docs/main/stable/typedef/EmbedFieldData) (optional)
* `footer`:  Footer value (optional, default: global footer value)
* `footerImgUrl`:  URL to image of the footer (optional, default: global footer value)

The footer of the embed is global and is defined in your global `strings.json` file. The timestamp is set automatically
to the current time.

### Modules

The bot is split in modules. Each module can register their own commands, events and even database models, so they can
do basically anything. Every module can register "example-config-files" witch are files with information about the
config file, so the bot can automatically check configs and do all the boring stuff for you.

### Add your own modules

As per the [License](LICENSE) you *have* to make *every* of your modules publicly available under the same license.
Please read the license for more information.

**Before you make a module**: Please create an issue with your suggestion and claim that you are working on it so nobody
is working on the same thing (;\
Also please read the [Rues for modules](#rules-for-modules).\
**Submit a module**: Simply create a pullrequest, and we will check your module and merge it then (;

#### Rules for modules

Every module should

* Use Slash-Commands wherever possible
* Should provide a file with exported functions which other modules can use to manipulate data or perform actions in
  your module (eg: an economy module should provide a file with exported functions like `User.addToBalance()`)
* Answer with ephemeral messages wherever it makes sense
* Create as few commands as possible (we have a limit to 100 commands in total), so please try to
  use [Sub-Commands](https://discord.com/developers/docs/interactions/application-commands#subcommands-and-subcommand-groups)
  wherever possible (eg: instead of having /ban, /kick, /mute etc, have a /moderate command with sub-commands)
* Use the newest features of the discord api and discord.js (buttons, selects, etc) if possible
* Process and Store only needed user information and data
* Support localization (you don't need to translate everything, you only need to support translations, read
  more [here](#Localization)
* follow our [terms of service](https://sc-net.work/tos), [Discord's Terms of Service](https://discord.com/tos) and
  the [Discord Developer Terms of Service](https://discord.com/developers/docs/legal). A module should not allow users
  to bypass or break the mentioned documents. This includes but is not limited to Nitro-Only-Features.

#### Localization

We'd like to offer SCNX and this bot in as many languages as possible. Because of this, we highly encourage you to use
translationable systems in your module.

* Localizations of not-user-editable strings: Use `localize(key, string, replace = {})` from `src/functions/localize.js`
  to localize strings. Translations of these strings happen
  on [Weblate]()https://localize.sc-network.net/projects/custombot/locales/
    * `key`: Key of the string (usually your module name, check out any files in `locales` to get an idea how this
      works)
    * `string`: Name of the string
    * `replace` (optional, object): Will replace `%<key>` in the source string by `<value>`
* Localizations of configuration-files and user-editable strings: You can specify field-fields like `description`
  , `default` and more in multiple languages. The bot / dashboard will choose the correct one automatically.

#### module.json

Every module has to contain a `module.json` file with the following content:

* `name` of the module. Should be the same as the name of your dictionary.
* `humanReadableName`: English name of the module, shown to users
* `humanReadableName-<lang>`: Replace `<lang>` with any supported language-code (currently: `de`, `en`); Name of the
  module show to users (fallback order: `humanReadableName-<lang>`, `humanReadableName-en`, `humanReadableName`)
* `author`
    * `name`: Name of the author
    * `link`: Link to the author
    * `scnxOrgID`:   [SCNX](https://scnx.xyz)-Organisation-ID of the developer (allows you to accept donations in the
      dashboard and will show up to users in the dashboard)
* `openSourceURL`: URL to the Source-Code of the module licensed under an Open-Source-License (will show
  donation-banners in the SCNX Dashboard (if orgID is set) and qualifies (qualified) developers for financial support
  from the Open-Source-Pool of SCNX)
* `description`: Short description of the module
* `cli` (optional): [CLI-File](#cli-files) of your module
* `commands-dir` (optional): Directory inside your module folder where all
  the [interaction-command-files](#interaction-command) are in
* `on-load-event` (optional): File with exported `onLoad` function in it. Gets executed when your commands got loaded
  successfully; at this point the Client is not logged in yet, so you can't communicate with Discord (yet).
* `events-dir` (optional): Directory inside your module folder where all the [event-files](#events) are in
* `models-dir` (optional): Directory inside your module folder where all the models-files are in
* `config-example-files` (optional, seriously leave this out when you don't have config files): Array
  of [config-files](#example-config-file) inside your module directory.
* `tags` (optional): Array of tags.
* `fa-icon`: Used for matching of icons in our dashboard. We will fill this out for you, please do not set this field.

#### Interaction-Command

Note: Interaction-Commands get loaded after the configuration got checked.\
An interaction-command ("slash command") file has to export the following things:

* `run` (function; provided arguments: `interaction`):
    * Without subcommands: Function that gets triggered if the interactions is being used
    * With subcommands: Optional function that gets triggered after the subcommand functions (if specified) got executed
* `beforeSubcommand` (optional, only if subcommands exit): Function which gets executed before the function in
  subcommands gets executed
* `autoComplete` (only required if any of your options use `autocomplete`): Object of functions, sorted by
  subcommandgroup, subcommand and option name
* `subcommands` (only required if subcommands exist): Object of functions, sorted by subcommandgroup and subcommand
* `help`
* `config` (both for !help and slash-commands)
    * `name`: Name of the command (should be the same name as the file name)
    * `description`: Description of the command
    * `restricted`: Can this command only be run one of the bot operators (e.g. config reloading, change status or ...,
      boolean)
    * `defaultPermission`: Boolean (default: true): If enabled everyone on the guild can use this command and your
      command's permissions can not be synced
    * `options`:
        * [ApplicationCommandOptionData](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandOptionData)
          OR
        * Async function
          returning [ApplicationCommandOptionData](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandOptionData) (
          gets called with `client` as argument)

#### Message-Command

Starting V3, message-commands are no longer supported. Please use [Interaction-Commands](#interaction-command)
instead. Read more in [CHANGELOG.md](CHANGELOG.md).

#### Events

An event file should export the following things:

* `run`: Function that gets triggered if the event gets executed (provided arguments: `client` (discord.js Client) and
  all the arguments that gets past by discord.js for this event)

#### CLI-Files

An CLI-File should export the following things:

* `commands`: Array of the following objects:
    * `command`: Command which should be entered in the CLI
    * `description`: Description of the command
    * `run`: Function which should be executed when the command gets executed. The function gets executed with an object
      of following structure as argument:
        * `input`: The whole input
        * `args`: Array of arguments (split by spaces)
        * `client`: [Client](https://discord.js.org/#/docs/main/stable/class/Client)
        * `cliCommands`: Array of all CLICommands

Note: We might allow users to execute CLI-Commands via the Dashboard in future. This is not supported right now.

#### Config-Elements

Certain configuration may contain an array of multiple objects with different values - these are called "
Config-Elements".

To add a new Config-Element to your configuration
use `node add-config-element-object.js <Path to example config file> <Path to your config-file>`.

#### Example config-file

An example config file should include the following things:

* `filename`: Name of the generated config file
* `humanname-<lang>`: Name of the file, shown to users (fallback order: `humanname-<lang>`, `humanname-en`, `filename`)
* `description-<lang>`: Description of the file, shown to users (fallback order: `humanname-<lang>`, `humanname-en`
  , `No description, but you can configure <name> here`)
* `configElements` (boolean, default: false): If enabled the configuration-file will be an array of an object of the
  content-fields
* `commandsWarnings`: This field is used to indicate, that users need to manually set up the permissions for commands in
  their discord-server-settings
    * `normal`: Array of commands which that can be configured without any limitation in the discord-server-settings
    * `special`: Array of commands that need special configuration in addition to editing the permissions in the
      server-settings
        * `name`: Name of the command
        * `info`: Key by language; Information about the command; used to explain users what exactly they should do
* `content`: Array of content fields:
    * `field_name`: Name of the config field
    * `default-<lang>`: Default value of this field (replace `<lang>` with a supported language code),
      Fallback-Order: `default-<lang>`, `default-en`, `default`
    * `type`: Can be `channelID`, `userID`, `select`, `timezone` (treated as string, please check validity before using), `roleID`
      , `boolean`, `integer`, `array`, `keyed` (codename for an JS-Object)
      or `string`
    * `description-<lang>`: Description of this field (replace `<lang>` with a supported language code),
      Fallback-Order: `description-<lang>`, `description-en`, `description`
    * `humanname-<lang>`: Name of this field show to users (replace `<lang>` with a supported language code),
      Fallback-Order: `humanname-<lang>`, `humanname-en`, `humanname`, `field_name`
    * `allowEmbed` (if type === `array, keyed or string`): Allow the usage of an [embed](#configuration) (Note: Please
      use the build-in function in `src/functions/helpers.js`)
    * `content` (if type === `array`): Type (see `type` above) of every value
    * `content` (if type === `channelID`): Array of
      supported [ChannelType](https://discord.js.org/#/docs/discord.js/13.9.1/typedef/ChannelType)s (
      default: `['GUILD_TEXT', 'GUILD_VOICE', 'GUILD_CATEGORY', 'GUILD_NEWS', 'GUILD_STAGE_VOICE']`). To improve user
      experience, we recommend adding information about supported types into `description`. The bot will verify that the
      channel is inside the bot's guild.
    * `content` (if type === `select`): Array of the possible options
    * `content` (if type === `keyed`):
        * `key`: Type (see `type` above) of the index of every value
        * `value`: Type (see `type` above) of the value of every value
    * `params-<lang>` (if type === `string`, array, optional, replace `<lang>` with supported language code,
      Fallback-Order: `params-<lang>`, `params-en`, `params`)
        * `name`: Name of the parameter (e.g. `%mention%`)
        * `description`: Description of the parameter (e.g. `Mention of the user`)
        * `fieldValue` (only if type === `select`): If set, the parameter can only be used if the value of the field
          is `fieldValue`.
        * `isImage`: If true, users will be able to set this parameter as Image, Author-Icon, Footer-Icon or Thumbnail
          of an embed (only if `allowEmbed` is enabled)
    * `allowNull` (default: `false`, optional): If the value of this field can be empty
    * `disableKeyEdits` (if type === `keyed`): If enabled the user can not edit the keys of the object
    * `elementToggle` (if type === `boolean`): If this option gets turned off, other fields of the config-element / file will not be rendered in the dashboard
    * `dependsOn` (a name of any (other) boolean-field): If the referenced boolean field (the value of this option should be equal to the `field.field_name` of a boolean field) is turned off, the field will be not be rendered in the dashboard

#### `botReady`-Event and Config-Reload

If you plan to use the [ready](https://discord.js.org/#/docs/main/stable/class/Client?scrollTo=e-ready) event of
discord.js to run some action when the client is ready, and you need to load some configuration-files you should use
the `botReady`-event instead. Please remember that this event gets re-emitted on configuration reloading. If you set
callbacks that get executed later or similar please remember to remove them on `configReload`. If you set intervals,
please push the return value to `client.intervals` to get them removed on `configReload` or do it manually.

#### Helper-Functions

The bot includes a lot of functions to make your live easier. Check out the file `src/functions/helpers.js`.

### Support for developers

As we earn some money with hosting your modules for users, we have decided to give you some (remember, we need to pay
for hosting) of this money. Here are the main ways to earn some pocket-cash with developing for SCNX:

* [Open-Source-Developer-Pool](https://faq.scnx.app/open-source-developer-pool/): We give you a monthly amount for each
  paying server using your module
* [Bounties](https://faq.scnx.app/open-source-developer-pool/#bounties): We giv you a small amount of money for merged
  pull-requests and contributions
  We support a lot of payout-methods, learn more [here](https://faq.scnx.app/scnx-referrals-faq/#payout-methods).

© Simon Csaba, 2020-2022

Love ya <3