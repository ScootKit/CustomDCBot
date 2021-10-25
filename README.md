# Custom-Bot v2

Create your own discord bot - Fully customizable and with a lot of features. This bot is for advanced JS-Users, you
should only use it if you have some experience with Javascript, discord.js and JSON files.

---

## Get your own Custom-Bot completely free and with a modern webinterface and a lot more features!

Go check it out on our [website](https://partner.sc-netzwerk.de) (currently only german). In addition to the here
available features we offer:

* Free hosting
* Custom-Commands
* Music (currently not availible)
* Temp-Channels
* Scheduled messages
* Info-Commands
* Embed-Messages
* and *a lot* more - for free

[Get started now](https://scnx.xyz) - it's free - forever!

## Please read the [license](LICENSE) if you use this bot.

We really love open-source. Please read the license and follow it.\
In short words: You have to

* Disclose the source (Your source code has made available when using this bot)
* State changes (*every* change to the source code must be documented and published)

Please read the full [license](LICENSE). This is not legal advice.

## Support development

As mentioned above our business model is to host these bots for servers - it does not really make sense to publish our
product here - but we do it anyway - but we need your support! Feel free to [contribute](.github/CONTRIBUTING.md)
, [donate on Patreon](https://patreon.com/scnetwork)
or on [any other platform](https://github.com/SCNetwork/CustomDCBot?sponsor=1). Thank you so much <3

## Please read this issue before continuing.

This repo does not get any new modules or features
currently. [Learn more](https://github.com/SCNetwork/CustomDCBot/issues/13).

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
Also please read the [Rules for modules](#rules-for-modules).\
**Submit a module**: Simply create a pullrequest, and we will check your module and merge it then (;

#### Rules for modules

Every module should

* Use Slash-Commands wherever possible
* Should provide a file with exported functions which other modules can use to manipulate data or perform actions in
  your module (eg: an economy module should provide a file with exported functions like `User.addToBalance()`)
* Answer with ephemeral messages wherever it makes sense
* create as few commands as possible (we have a limit to 100 commands in total), so please try to
  use [Sub-Commands](https://discord.com/developers/docs/interactions/application-commands#subcommands-and-subcommand-groups)
  wherever possible (eg: instead of having /ban, /kick, /mute etc, have a /moderate command with sub-commands)
* Use the newest features of the discord api and discord.js (buttons, selects, etc) if possible and useful
* process only needed user information and data
* follow our [terms of service](https://sc-net.work/tos), [Discord's Terms of Service](https://discord.com/tos) and
  the [Discord Developer Terms of Service](https://discord.com/developers/docs/legal). A module should not allow users
  to bypass or break the mentioned documents. This includes but is not limited to Nitro-Only-Features.

#### module.json

Every module has to contain a `module.json` file with the following content:

* `name` of the module. Should be the same as the name of your dictionary.
* `author`
    * `name`: Name of the author
    * `link`: Link to the author
* `description`: Short description of the module
* `cli` (optional): [CLI-File](#cli-files) of your module
* `commands-dir` (optional): Directory inside your module folder where all
  the [interaction-command-files](#interaction-command) are in
* `message-commands-dir` (optional, not recommended if not necessary): Directory inside your module folder where all
  the [message-command-files](#message-command) are in
* `on-load-event` (optional): File with exported `onLoad` function in it. Gets executed when your commands got loaded
  successfully; at this point the Client is not logged in yet, so you can't communicate with Discord (yet).
* `events-dir` (optional): Directory inside your module folder where all the [event-files](#events) are in
* `models-dir` (optional): Directory inside your module folder where all the models-files are in
* `config-example-files` (optional, seriously leave this out when you don't have config files): Array
  of [config-files](#example-config-file) inside your module directory.

#### Interaction-Command

Note: Interaction-Commands get loaded after the configuration got checked.\
An interaction-command ("slash command") file has to export the following things:

* `run` (function; provided arguments: `interaction`):
    * Without subcommands: Function that gets triggered if the interactions is being used
    * With subcommands: Optional function that gets triggered after the subcommand functions (if specified) got executed
* `beforeSubcommand` (optional, only if subcommands exit): Function which gets executed before the function in
  subcommands gets executed
* `subcommands` (only required if subcommands exist): Object of functions, sorted by subcommandgroup and subcommand
* `help`
* `config` (both for !help and slash-commands)
    * `name`: Name of the command (should be the same name as the file name)
    * `description`: Description of the command
    * `restricted`: Can this command only be run one of the bot operators (e.g. config reloading, change status or ...,
      boolean)
    * `permissions`:
        * Array
          of [ApplicationCommandPermissions](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissions)
          OR
        * Async function
          returning [ApplicationCommandPermissions](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandPermissions) (
          gets called with `client` as argument. Commands are not synced at this point, but configuration is checked)
    * `defaultPermission`: Boolean (default: true): If enabled everyone on the guild can use this command
    * `options`:
        * [ApplicationCommandOptionData](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandOptionData)
          OR
        * Async function
          returning [ApplicationCommandOptionData](https://discord.js.org/#/docs/main/stable/typedef/ApplicationCommandOptionData) (
          gets called with `client` as argument)

#### Message-Command

A message-command file has to export the following things:

* `run`: Function that gets triggered if the command gets executed (provided arguments: `client` (discord.js Client)
  , `msg` (MessageObject),
  `args` (Array of arguments))
* `help`
    * `name`: Name of the command (should be the same name as the file name)
    * `description`: Description of the command
    * `aliases`: Array of all aliases. Should contain the value of `name`.
* `config`
    * `args`: How many arguments does this command *at least* need?
    * `restricted`: Can this command only be run one of the bot operators (e.g. config reloading, change status or ...,
      boolean)

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

Note: All you CLI-Commands can also get executed via the API.

#### Example config-file

An example config file should include the following things:

* `filename`: Name of the generated config file
* `configElements` (boolean, default: false): If enabled the configuration-file will be an array of an object of the
  content-fields
* `content`: Array of content fields:
    * `field_name`: Name of the config field
    * `default`: Default value
    * `type`: Can be `channelID`, `select`, `roleID`, `boolean`, `integer`, `array`, `keyed` (codename for an JS-Object)
      or `string`
    * `description`: Short description of this field
    * `allowEmbed` (if type === `array, keyed or string`): Allow the usage of an [embed](#configuration) (Note: Please
      use the build-in function in `src/functions/helpers.js`)
    * `content` (if type === `array`): Type (see `type` above) of every value
    * `content` (if type === `select`): Array of the possible options
    * `content` (if type === `keyed`):
        * `key`: Type (see `type` above) of the index of every value
        * `value`: Type (see `type` above) of the value of every value
    * `params` (if type === `string`, array, optional)
        * `name`: Name of the parameter (e.g. `%mention%`)
        * `description`: Description of the parameter (e.g. `Mention of the user`)
        * `fieldValue` (only if type === `select`): If set, the parameter can only be used if the value of the field
          is `fieldValue`.
    * `allowNull` (default: `false`, optional): If the value of this field can be empty
    * `disableKeyEdits` (if type === `keyed`): If enabled the user is not allowed to change the keys of this element

#### `botReady`-Event and Config-Reload

If you plan to use the [ready](https://discord.js.org/#/docs/main/stable/class/Client?scrollTo=e-ready) event of
discord.js to run some action when the client is ready, and you need to load some configuration-files you should use
the `botReady`-event instead. Please remember that this event gets re-emitted on configuration reloading. If you set
callbacks that get executed later or similar please remember to remove them on `configReload`. If you set intervals,
please push the return value to `client.intervals` to get them removed on `configReload` or do it manually.

#### Helper-Functions

The bot includes a lot of functions to make your live easier. Please open
the [DevDoc](https://custombot-devdocs.sc-network.net/) to see all of them.

© Simon Csaba, 2020-2021

Love ya <3
