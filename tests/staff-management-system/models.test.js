/*
 * Schema tests for every staff-management-system sequelize model.
 *
 * Each model's static init() forwards an attribute map + options to
 * Sequelize.Model.init. We mock the sequelize module so init() simply captures
 * those two arguments, letting us assert on the persisted schema without a real
 * database:
 *   - table names + timestamps flags
 *   - primary keys / autoIncrement
 *   - NOT NULL columns, defaults, and the StaffReview 1..5 star validator
 *   - the ActivityCheckResponse unique (activityCheckId,userId) index
 *   - the static module.exports.config (name + module) for the loader
 */

jest.mock('sequelize', () => {
    const DataTypes = new Proxy({}, {
        get: (_t, prop) => {
            // STRING is callable (e.g. STRING(1024)) and also usable as a token.
            const token = {__type: prop};
            const fn = (...args) => ({
                __type: prop,
                args
            });
            fn.__type = prop;
            return typeof prop === 'string' ? fn : token;
        }
    });

    class Model {
        static init(attributes, options) {
            this._attributes = attributes;
            this._options = options;
            return this;
        }
    }

    return {
        DataTypes,
        Model,
        Op: {}
    };
});

function load(name) {
    const mod = require(`../../modules/staff-management-system/models/${name}`);
    const fakeSequelize = {};
    mod.init(fakeSequelize);
    return {
        attributes: mod._attributes,
        options: mod._options,
        config: mod.config
    };
}

describe('staff-management-system models', () => {
    test('Infraction: caseId PK autoIncrement, NOT NULL columns, active default', () => {
        const {
            attributes,
            options,
            config
        } = load('Infraction');
        expect(attributes.caseId.primaryKey).toBe(true);
        expect(attributes.caseId.autoIncrement).toBe(true);
        expect(attributes.userId.allowNull).toBe(false);
        expect(attributes.issuerId.allowNull).toBe(false);
        expect(attributes.type.allowNull).toBe(false);
        expect(attributes.active.defaultValue).toBe(true);
        expect(options.tableName).toBe('staff_management_infractions');
        expect(options.timestamps).toBe(true);
        expect(config).toEqual({
            name: 'Infraction',
            module: 'staff-management-system'
        });
    });

    test('StaffReview: stars validated to the 1..5 range', () => {
        const {
            attributes,
            config
        } = load('StaffReview');
        expect(attributes.stars.allowNull).toBe(false);
        expect(attributes.stars.validate).toEqual({
            min: 1,
            max: 5
        });
        expect(config.name).toBe('StaffReview');
    });

    test('StaffProfile: userId PK and sensible duty/status defaults', () => {
        const {
            attributes,
            options
        } = load('StaffProfile');
        expect(attributes.userId.primaryKey).toBe(true);
        expect(attributes.points.defaultValue).toBe(0);
        expect(attributes.onDuty.defaultValue).toBe(false);
        expect(attributes.activityStatus.defaultValue).toBe('ACTIVE');
        expect(attributes.isSuspended.defaultValue).toBe(false);
        expect(attributes.onBreak.defaultValue).toBe(false);
        expect(options.tableName).toBe('staff_management_profiles');
    });

    test('LoaRequest: required reason/dates, PENDING default status', () => {
        const {attributes} = load('LoaRequest');
        expect(attributes.reason.allowNull).toBe(false);
        expect(attributes.startDate.allowNull).toBe(false);
        expect(attributes.endDate.allowNull).toBe(false);
        expect(attributes.status.defaultValue).toBe('PENDING');
        expect(attributes.approverId.allowNull).toBe(true);
    });

    test('Promotion: newRole required, reason optional', () => {
        const {
            attributes,
            options
        } = load('Promotion');
        expect(attributes.newRole.allowNull).toBe(false);
        expect(attributes.reason.allowNull).toBe(true);
        expect(options.tableName).toBe('staff_management_promotions');
    });

    test('ActivityCheck: ACTIVE default status, isAutomated default false', () => {
        const {attributes} = load('ActivityCheck');
        expect(attributes.messageId.allowNull).toBe(false);
        expect(attributes.status.defaultValue).toBe('ACTIVE');
        expect(attributes.respondedUsers.defaultValue).toBe('[]');
        expect(attributes.isAutomated.defaultValue).toBe(false);
    });

    test('ActivityCheckResponse: unique (activityCheckId,userId) index', () => {
        const {
            attributes,
            options
        } = load('ActivityCheckResponse');
        expect(attributes.activityCheckId.allowNull).toBe(false);
        expect(attributes.userId.allowNull).toBe(false);
        expect(options.indexes).toEqual([{
            unique: true,
            fields: ['activityCheckId', 'userId']
        }]);
    });

    test('StaffShift: type defaults to Staff, breakCount defaults to 0', () => {
        const {
            attributes,
            options
        } = load('StaffShift');
        expect(attributes.startTime.allowNull).toBe(false);
        expect(attributes.endTime.allowNull).toBe(true);
        expect(attributes.type.defaultValue).toBe('Staff');
        expect(attributes.breakCount.defaultValue).toBe(0);
        expect(options.tableName).toBe('staff_management_shifts');
    });
});