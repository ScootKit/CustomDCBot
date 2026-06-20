/**
 * The bot client. Extends [discord.js's Client](https://discord.js.org/#/docs/main/stable/class/Client). This file only exists for documentation-purposes and is intended to be used in any other way.
 */
class Client {
    constructor() {
        /**
         * Timestamp on which the bot is ready
         * @type {Date}
         */
        this.botReadyAt = null;
        /**
         * [TextChannel](https://discord.js.org/#/docs/main/stable/class/TextChannel) which should be used as default log-channel and in which some basic information gets send. ⚠️️ In some cases this value is `null` so always catch or check the value before any calls on this property.
         * @type {TextChannel}
         */
        this.logChannel = null;
        /**
         * Object of all models, mapped by module
         * @type {Object}
         */
        this.models = null;
        /**
         * Content of the `strings.json` file
         * @type {Object}
         */
        this.strings = null;
        /**
         * Content of the `modules.json` file.
         * @type {Object}
         */
        this.moduleConf = null;
        /**
         * Object of every module
         * @type {Object}
         */
        this.modules = null;
        /**
         * [Collection](https://discord.js.org/#/docs/collection/main/class/Collection) of every registered command
         * @type {Collection}
         */
        this.commands = null;
        /**
         * [Collection](https://discord.js.org/#/docs/collection/main/class/Collection) of every registered command alias
         * @type {Collection}
         */
        this.aliases = null;
        /**
         * [Collection](https://discord.js.org/#/docs/collection/main/class/Collection) of every registered events
         * @type {Collection}
         */
        this.events = null;
        /**
         * Array of [Intervals](https://developer.mozilla.org/en-US/docs/Web/API/setInterval) which get cleared on config-reload to make the live of module-developers easier
         * @type {Array}
         */
        this.intervals = [];
        /**
         * Array of [Jobs](https://github.com/node-schedule/node-schedule#handle-jobs-and-job-invocations) which get canceled on config-reload to make the live of module-developers easier
         * @type {Array}
         */
        this.jobs = [];
        /**
         * ID of the guild the bot should run on
         * @type {String}
         */
        this.guildID = null;
        /**
         * The [guild](https://discord.js.org/#/docs/main/stable/class/Guild) the bot should run on
         * @type {Guild}
         */
        this.guild = null;
        /**
         * Content of `config.json`
         * @type {Object}
         */
        this.config = null;
        /**
         * Path to the configuration-directory
         * @type {Path}
         */
        this.configDir = null;
        /**
         * Path to the data-directory
         * @type {Path}
         */
        this.dataDir = null;
        /**
         * Object containing every configuration, mapped by module
         * @type {Object}
         */
        this.configurations = null;
        /**
         * Logger
         * @type {Logger}
         */
        this.logger = null;
    }
}