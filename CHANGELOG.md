# Changelog

This changelog contains mostly API-Changes and changes for developers.

## v3.5.0
* Like ten new previously closed-sourced-modules got added
* Locales-Loading now takes place in splitted files, instead of a big `default-locales.json`
* Added documentation about localizable configuration
* Added information about our Developer-Support-Programs (e.g. Bounties, OSS-Developer-Pool)
* Added new branch-protection settings and improved certain aspects of the repository

## v3.4.0
* "Welcomer" can now automatically delete join-messages of users who left the server after joining within 7 days ([#64](https://github.com/SCNetwork/CustomDCBot/pull/64))
* "auto-react" can now reply to mentions of configured users ([#65](https://github.com/SCNetwork/CustomDCBot/pull/65), [#66](https://github.com/SCNetwork/CustomDCBot/pull/66))
* Twitch-Notifications now supports Config-Elements ([#67](https://github.com/SCNetwork/CustomDCBot/pull/67))
* Twitch-Notifications now supports more arguments for messages ([#68](https://github.com/SCNetwork/CustomDCBot/pull/68))
* Fixed the /shop buy command of economy-Module ([#71](https://github.com/SCNetwork/CustomDCBot/pull/71))
* Support for timezone type and skipContent file parameter
* Commands can now optionally be synced globally
* Made auto-delete-module public
* Made tickets-module public
* Several fixes of small bugs in welcomer, levels, birthdays, twitch-notifications and tickets module
* Support for `content` option on config-fields with type `channelID` to allow editing of allowed types 

## v3.3.0
* Bumped and fixed dependencies
* Added code-hunt-module ([#60](https://github.com/SCNetwork/CustomDCBot/pull/60))
* Remove-Feature for status-roles module ([#61](https://github.com/SCNetwork/CustomDCBot/pull/61))
* Added color-me module ([#62](https://github.com/SCNetwork/CustomDCBot/pull/62))
* Added auto react for message authors ([#63](https://github.com/SCNetwork/CustomDCBot/pull/63))
* Added auto react for category-reactions
* Few new improvements, support for `commandsWarnings` config parameter

Contributors: [hfgd123](https://github.com/hfgd123), [scderox](https://github.com/scderox)


## v3.2.0
* Added support for timezone-config-parameter
* Bumped dependencies
* New modules: status-role, massrole
* Optimizations for the economy module

Contributors: [jateute](https://github.com/jateute/), [hfgd123](https://github.com/hfgd123), [scderox](https://github.com/scderox)

## v3.1.1
* Discord released their new way of editing slash-command-permissions ([read their blog](https://discord.com/blog/slash-commands-permissions-discord-apps-bots)), which made  a lot of features basiclly usless:
  * Commands can now only set a `defaultPermission` value
  * Commands can not set a `permission` field anymore, as it can't be synced with Discord's API
  * Removed the `arrayToApplicationCommandPermissions` helper function as it's not needed anymore
  * Removed the auto-generated documentation, as it was never really useful and didn't work
  * Bumped dependencies

## v3.1.0

* Made the bot actually work
* Code-Improvements, Bug-Fixes and clarification
* Added support for new module.json fields
    * `author.scnxOrgID`: Support for SCNX-Organisation-IDs (allows developers to accept donations and will show up to
      users in the dashboard)
    * `openSourceURL`: URL to the Source-Code of a module (licenced under an Open-Source-Licence; will show
      donation-banners in the SCNX Dashboard (if orgID is set) and qualifies (qualified) developers for financial
      support from the Open-Source-Pool of SCNX)
* No Developer-API for modules (apart from mentioned above) should have been changed

## v3.0.0

* Dropped support for message commands
* Module-Database-Models now always get loaded, even if module is not enabled (this allows to enable/disable modules on
  the fly)
* Database-Models can not be nested (because no one did that)
* CLI-Commands, Application-Commands, Events and other relevant data will now always get loaded, even if the module is
  not enabled (this allows to enable/disable modules on the fly)
* Every time an event or CLI-Command gets executed, the bot will check if that module is enabled and will return if not
* Every time application commands need to get synced, the bot will check if the corresponding module is enabled.
  [To ensure the safe performance of all authorized activities](https://soundcloud.com/gamequotes/glados-to-ensure-the-safe)
  , this check will also get executed when a command gets executed.
* Errors in module configuration will only disable the module, not stop the bot.
    * 💡 Errors in the built-in-configuration will still shut down the bot
* Module-Configuration will now only be generated on startup, not if configuration gets reloaded
* Added `disableModule` to helpers.js
* Improved `embedType` function
* `asyncForEach` is now deprecated, will be removed in v3.1.0
* Performance: To reduce the number of event listeners on `command`, every event used by every module will only once
  register an
  event listener. When an event gets invoked, the bot will run every registered module-event. To ensure fast
  reaction-times, this will get done synchronously.

## v2.1.0

* Added new concept of localization
* Updated modules to the newest version, including new features, localization and bug-fixes
* Introduced new helper-functions and database-schemes (including channelLock, DatabaseSchemeVerison)
* Introduced autocomplete

## v2.0.0

* Added new configuration-option `logLevel`
* Added logger (`client.logger`) to allow for more detailed logs (instance
  of [log4js.Logger](https://github.com/log4js-node/log4js-node))
* Added `--pm2-setup`-command-argument to indicate an [pm2](https://pm2.keymetrics.io)-setup
* Switched to discord.js version 1.13 which includes breaking changes
* Reworked some configuration-loading and switched to `jsonfile` as a dependencies
* Configuration of every module is now stored in a global client object: `client.configuration[moduleName]`. Please use
  this instead of using `require` as this method allows users to reload configuration.
* Commands are now slash commands. Old commands are not recommended being used, but can be by changing `commands-dir`
  to `message-commands-dir`. Remember, that in future we may remove this feature.
* It's no longer required to add `module` as a config-parameter for every command
* Added `sendMultipleSiteButtonMessage` to `/src/functions/helpers.js` to create fancy multiple-site-embed-messages
* `embedType()` now returns [MessageOptions](https://discord.js.org/#/docs/main/stable/typedef/MessageOptions)
* `footer` can now be set for each embed individually
* `.eslintrc.js` added - please use this configuration if you create a pullrequest
* Added `client.logChannel` ([TextChannel](https://discord.js.org/#/docs/main/stable/class/TextChannel)) which should be
  used as a default for log-channels and in which some relevant information gets sent. ⚠️ In some cases this value
  is `null` so always catch or check the value before any calls on this property.
* Forgot the prefix of your bot? You can now use @-mentions instead of your prefix
* `mesageCommand.config.args` now only (!) accepts an integer which represents how many arguments are at least needed
* Slash-Commands are now available and should be used as much as possible
* Errors in the executing of a command will nun result in a message to the user