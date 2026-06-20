/*
 * Schema test for the reminders Reminder model.
 *
 * sequelize is mocked so init() records the schema. We assert the autoIncrement
 * PK and the columns the scheduler relies on (userID, reminderText, channelID,
 * date), plus the table name / timestamps and loader config.
 */

jest.mock('sequelize', () => {
    const DataTypes = new Proxy({}, {get: (_t, prop) => ({__type: prop})});

    class Model {
        static init(attributes, options) {
            this._attributes = attributes;
            this._options = options;
            return this;
        }
    }

    return {
        DataTypes,
        Model
    };
});

describe('reminders Reminder model', () => {
    test('exposes the scheduling columns with an autoIncrement PK', () => {
        const mod = require('../../modules/reminders/models/Reminder');
        mod.init({});
        const a = mod._attributes;
        expect(a.id.primaryKey).toBe(true);
        expect(a.id.autoIncrement).toBe(true);
        expect(Object.keys(a).sort()).toEqual(['channelID', 'date', 'id', 'reminderText', 'userID']);
        expect(a.date.__type).toBe('DATE');
        expect(mod._options.tableName).toBe('reminders-reminder');
        expect(mod._options.timestamps).toBe(true);
        expect(mod.config).toEqual({
            name: 'Reminder',
            module: 'reminders'
        });
    });
});