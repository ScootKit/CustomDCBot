# Database Models

The bot uses [Sequelize](https://sequelize.org/) for persistence. The default driver is SQLite (`sqlite3` package), but
any Sequelize-supported database works. Each module declares its own models in `models-dir` (typically `models/`).

## Defining a model

A model file exports a class extending `Model` with a static `init(sequelize)` method:

```js
// modules/welcomer/models/User.js
const {DataTypes, Model} = require('sequelize');

module.exports = class WelcomerUser extends Model {
    static init(sequelize) {
        return super.init({
            id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                primaryKey: true
            },
            userID: DataTypes.STRING,
            channelID: DataTypes.STRING,
            messageID: DataTypes.STRING,
            timestamp: DataTypes.DATE
        }, {
            tableName: 'welcomer_User',
            timestamps: true,
            sequelize
        });
    }
};
```

The loader calls `init(sequelize)` for you and registers the model under `client.models[<moduleName>][<filename>]`. The
filename without `.js` becomes the key - `User.js` → `client.models['welcomer']['User']`.

### Conventions

- **`tableName`**: prefix with the module name, e.g. `welcomer_User`, to avoid collisions across modules.
- **`timestamps: true`** adds `createdAt` and `updatedAt` automatically. Skip if you don't need them.
- **Primary key**: an auto-incrementing `id` is the simplest choice. Use a composite key only when you need it.
- **Class name**: doesn't have to match the filename, but matching keeps stack traces readable. Prefix with the module
  if you have multiple modules with similarly-named models (e.g. `WelcomerUser` not just `User`).

## Using models in handlers

Models are available on `client.models` after the bot starts:

```js
// modules/welcomer/events/guildMemberAdd.js
module.exports.run = async (client, member) => {
    const User = client.models['welcomer']['User'];
    await User.create({
        userID: member.id,
        channelID: '...',
        messageID: '...',
        timestamp: new Date()
    });
};
```

All standard Sequelize methods are available: `findOne`, `findAll`, `findOrCreate`, `update`, `destroy`, `count`,
`bulkCreate`, etc.

## Migrations

The bot calls `sequelize.sync()` at startup, which creates missing **tables**. **It does not add columns to existing
tables, nor modify or remove existing columns.** So whenever you add, rename, change, or drop a field on an existing
model, ship a migration alongside it so existing installs pick up the schema change.

Migrations are file-based and run automatically on boot by an [Umzug](https://github.com/sequelize/umzug)-based runner -
you drop a file into your module's `migrations/` directory and the runner discovers it, applies it once, tracks it, and
backs up the affected tables first. See [migration.md](./migration.md) for the full guide.

## Associations

Define associations from the module's `botReady` handler, after every model has been initialized:

```js
// modules/example/events/botReady.js
module.exports.run = (client) => {
    const A = client.models['example']['A'];
    const B = client.models['example']['B'];
    A.hasMany(B, {foreignKey: 'aId'});
    B.belongsTo(A, {foreignKey: 'aId'});
};
module.exports.ignoreBotReadyCheck = true;
```

## Performance notes

- Use `attributes: ['col1', 'col2']` to limit returned columns on hot paths.
- Index columns you query on with `indexes: [{fields: ['userID']}]` in the second argument of `super.init`.
- Batch inserts with `bulkCreate` instead of looping `create`.
- For SQLite, write-heavy workloads benefit from `sequelize.transaction()` around batches.