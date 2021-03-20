# Custom-Bot

Create your own discord bot - Fully customizable and with a lot of features. This bot is for advanced JS-Users, you should only
use it if you have some experience with Javascript, discord.js and JSON files. 

---

## Get your own Custom-Bot completely free and with a modern webinterface!
Go check it out on our [website](https://partner.sc-netzwerk.de) (currently only german).

## Please read the [license](LICENSE) if you use this bot. 
We really love open-source. Please read the license and follow it.\
In short words: You have to
* Disclose the source (Your source code has made available when using this bot)
* State changes (*every* change to the source code must be documented and published)\

Please read the full [license](LICENSE). This is not legal advice. 
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
6. The bot is now generating a `modules.json` and a `strings.json` file inside your `config` directory. You can [change](#configuration) them.

### Features 
* Everything is split in different [modules](#modules) - you can enable, configure and disable it how you want
* Highly configurable - The goal with this bot is that you can change *everything*
* Add your own modules
* Easy configuration - Every config field has a description in an example file

### Configuration
You can find all the configuration-files inside your `config` folder. Every **enabled module** will have their
own folder with config-files inside them. **These files are generated automatically**. Every module has slightly different 
configuration options. Every module has example files. Inside these files are more information about every configuration option.  
Some config values also support [embeds](https://discordjs.guide/popular-topics/embeds.html). This is the case if `allowEmbed` is true.\
You either input a string (normal discord message), or an embed object with the following values:
* `title`: Title of the embed
* `message`: Message outside the embed (optional)  
* `description`: Description of the embed (optional)
* `color`: Color of the embed, must be a [ColorResolvable](https://discord.js.org/#/docs/main/stable/typedef/ColorResolvable) (optional)
* `url`: URL of the embed (optional)
* `image`: Image of the embed, should be an url (optional)
* `thumbnail`: Thumbnail-Image of the embed, should be an url (optional)
* `author` (optional): 
  * `name`: Name of the author
  * `img`: Image of the author, should be an url
* `fields`: Fields of the embed, must be an array of [EmbedFieldData](https://discord.js.org/#/docs/main/stable/typedef/EmbedFieldData) (optional)

The footer of the embed is global and is defined in your global `strings.json` file. The timestamp is set automatically to the current time.

### Modules
The bot is split in modules. Each module can register their own commands, events and even database models, 
so they can do basically anything. Every module can register "example-config-files" witch are files with information about the config file, so
the bot can automatically check configs and do all the boring stuff for you. 

### Add your own modules
As per the [License](LICENSE) you *have* to make *every* of your modules publicly available under the same license. Please read the license for more information. 

**Before you make a module**: Please create an issue with your suggestion and claim that you are working on it so nobody is working on the same thing (;\
**Submit a module**: Simply create a pullrequest, and we will check your module and merge it then (;

Every module has to contain a `module.json` file with the following content:
* `name` of the module. Should be the same as the name of your dictionary. 
* `author`
    * `name`: Name of the author
    * `link`: Link to the author
* `description`: Short description of the module
* `commands-dir` (optional): Directory inside your module folder where all the command-files are in
* `on-load-event` (optional): File with exported `onLoad` function in it. Gets executed when your config got checked successfully. 
* `events-dir` (optional): Directory inside your module folder where all the event-files are in
* `models-dir` (optional): Directory inside your module folder where all the models-files are in
* `config-example-files` (optional, seriously leave this out when you don't have config files): Array of config-files inside your module directory.

A command file has to export the following things:
* `run`: Function that gets triggered if the command gets executed (provided arguments: `client` (discord.js Client), `msg` (MessageObject), 
  `args` (Array of arguments))
* `help`
    * `name`: Name of the command (should be the same name as the file name)
    * `description`: Description of the command
    * `module`: Name of your module
    * `aliases`: Array of all aliases. Should contain the value of `name`.
* `config`
    * `args`: Does this command need arguments? (boolean)
    * `restricted`: Can this command only be run by the bot owner (e.g. change status or something IDK, boolean) 

An event file should export the following things:
* `run`: Function that gets triggered if the event gets executed (provided arguments: `client` (discord.js Client) and all the arguments that gets past by discord.js for this event)

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
  * `allowEmbed` (if type === `array, keyed or string`): Allow the usage of an [embed](#configuration) (Note: Please use
    the build-in function in `src/functions/helpers.js`)
  * `content` (if type === `array`): Type (see `type` above) of every value
  * `content` (if type === `select`): Array of the possible options
  * `content` (if type === `keyed`):
    * `key`: Type (see `type` above) of the index of every value
    * `value`: Type (see `type` above) of the value of every value
  * `params` (if type === `string`, array, optional)
    * `name`: Name of the parameter (e.g. `%mention%`)
    * `description`: Description of the parameter (e.g. `Mention of the user`)
  * `allowNull` (default: `false`, optional): If the value of this field can be empty
  * `disableKeyEdits` (if type === `keyed`): If enabled the user is not allowed to change the keys of this element

© Simon Csaba, 2020

Love ya <3