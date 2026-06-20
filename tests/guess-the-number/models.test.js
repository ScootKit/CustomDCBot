/*
 * Schema tests for the guess-the-number Channel and User models. Stubs
 * Model.init to inspect the attribute maps + options: table names, the
 * autoincrement Channel PK and its guessCount/0 default, the User string PK with
 * wins/0 + totalGuesses/0 defaults, and the module/name config exports.
 */
const {Model} = require('sequelize');

function loadModel(relPath) {
    const original = Model.init;
    Model.init = function (attributes, options) {
        return {
            attributes,
            options
        };
    };
    try {
        const abs = require.resolve(relPath);
        delete require.cache[abs];
        const mod = require(relPath);
        const {
            attributes,
            options
        } = mod.init({}); // fake sequelize
        return {
            mod,
            attributes,
            options
        };
    } finally {
        Model.init = original;
    }
}

test('Channel model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/guess-the-number/models/Channel');
    expect(options.tableName).toBe('guess_the_number_Channel');
    expect(attributes.id.autoIncrement).toBe(true);
    expect(attributes.guessCount.defaultValue).toBe(0);
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
        'channelID', 'number', 'min', 'max', 'ownerID', 'winnerID', 'ended'
    ]));
    expect(mod.config).toEqual({
        name: 'Channel',
        module: 'guess-the-number'
    });
});

test('User model', () => {
    const {
        mod,
        attributes,
        options
    } = loadModel('../../modules/guess-the-number/models/User');
    expect(options.tableName).toBe('guess_the_number_Users');
    expect(attributes.userID.primaryKey).toBe(true);
    expect(attributes.wins.defaultValue).toBe(0);
    expect(attributes.totalGuesses.defaultValue).toBe(0);
    expect(mod.config.name).toBe('User');
});