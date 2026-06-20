/*
 * Schema tests for the levels sequelize models (User, LiveLeaderboard).
 * sequelize is mocked so Model.init captures attributes/options. Asserts the
 * table names, the userID/channelID primary keys, the level default of 1, and
 * the daily-counter columns (default 0, NOT NULL) plus the nullable reset date -
 * the constraints the daily-reset logic in messageCreate relies on.
 */
jest.mock('sequelize', () => {
    const captured = [];

    class Model {
        static init(attrs, opts) {
            captured.push({
                attrs,
                opts
            });
            return {
                attrs,
                opts
            };
        }
    }

    const DataTypes = new Proxy({}, {get: (_t, p) => String(p)});
    return {
        Model,
        DataTypes,
        __captured: captured
    };
});

const seq = require('sequelize');

function initModel(model) {
    seq.__captured.length = 0;
    model.init({});
    return seq.__captured[0];
}

describe('levels User model', () => {
    const User = require('../../modules/levels/models/User');
    const {
        attrs,
        opts
    } = initModel(User);

    test('stored in the levels_users table with timestamps', () => {
        expect(opts.tableName).toBe('levels_users');
        expect(opts.timestamps).toBe(true);
    });
    test('userID is the string primary key', () => {
        expect(attrs.userID.type).toBe('STRING');
        expect(attrs.userID.primaryKey).toBe(true);
    });
    test('level defaults to 1', () => {
        expect(attrs.level.type).toBe('INTEGER');
        expect(attrs.level.defaultValue).toBe(1);
    });
    test('daily counters default to 0 and are NOT NULL', () => {
        expect(attrs.dailyMessages.defaultValue).toBe(0);
        expect(attrs.dailyMessages.allowNull).toBe(false);
        expect(attrs.dailyVoiceSeconds.defaultValue).toBe(0);
        expect(attrs.dailyVoiceSeconds.allowNull).toBe(false);
    });
    test('dailyResetDate is a nullable string', () => {
        expect(attrs.dailyResetDate.type).toBe('STRING');
        expect(attrs.dailyResetDate.allowNull).toBe(true);
    });
    test('exports loader config', () => {
        expect(User.config).toEqual({
            name: 'User',
            module: 'levels'
        });
    });
});

describe('levels LiveLeaderboard model', () => {
    const LiveLeaderboard = require('../../modules/levels/models/LiveLeaderboard');
    const {
        attrs,
        opts
    } = initModel(LiveLeaderboard);

    test('stored in the levels_liveleaderboard table', () => {
        expect(opts.tableName).toBe('levels_liveleaderboard');
    });
    test('channelID is the string primary key, messageID a plain string', () => {
        expect(attrs.channelID.primaryKey).toBe(true);
        expect(attrs.messageID).toBe('STRING');
    });
    test('exports loader config', () => {
        expect(LiveLeaderboard.config).toEqual({
            name: 'LiveLeaderboard',
            module: 'levels'
        });
    });
});