/*
 * The registry of columns protected by the secure-storage layer. These columns are declared TEXT and
 * the hooks (de)serialize their JSON/int values into that text. On the managed backend the same
 * columns are additionally encrypted at rest; locally the encryption is a no-op.
 *
 *   module : module folder name, or null for a core model under src/models/
 *   model  : the registration key (config.name) under client.models[module][key]
 *   file   : model filename without extension, when it differs from `model`
 *   name   : the live Sequelize model.name; pinned so an accidental class rename fails a test
 *   fields : { fieldName: 'string' | 'json' | 'int' } drives the (de)serialization
 */
const VALID_TYPES = ['string', 'json', 'int'];

const ENCRYPTED_FIELDS = [
    {
        module: 'suggestions',
        model: 'Suggestion',
        name: 'Suggestion',
        fields: {suggestion: 'string', adminAnswer: 'json'}
    },
    {module: 'polls', model: 'Poll', name: 'Poll', fields: {description: 'string', options: 'json'}},
    {
        module: 'quiz',
        model: 'QuizList',
        file: 'Quiz',
        name: 'QuizList',
        fields: {description: 'string', headline: 'string'}
    },
    {module: 'reminders', model: 'Reminder', name: 'RemindersReminder', fields: {reminderText: 'string'}},
    {module: 'nicknames', model: 'User', name: 'User', fields: {nickname: 'json'}},
    {module: 'afk-system', model: 'AFKUser', file: 'User', name: 'AFKUser', fields: {afkMessage: 'string'}},
    {
        module: 'ping-protection',
        model: 'ModerationLog',
        name: 'PingProtectionModerationLog',
        fields: {reason: 'string'}
    },
    {
        module: 'staff-management-system',
        model: 'Infraction',
        name: 'StaffManagementInfraction',
        fields: {reason: 'string'}
    },
    {
        module: 'staff-management-system',
        model: 'LoaRequest',
        name: 'StaffManagementLoaRequest',
        fields: {reason: 'string', rejectionReason: 'string'}
    },
    {
        module: 'staff-management-system',
        model: 'Promotion',
        name: 'StaffManagementPromotion',
        fields: {reason: 'string'}
    },
    {
        module: 'staff-management-system',
        model: 'StaffProfile',
        name: 'StaffManagementProfile',
        fields: {customIntro: 'string', customNickname: 'string'}
    },
    {
        module: 'staff-management-system',
        model: 'StaffReview',
        name: 'StaffManagementReview',
        fields: {comment: 'string'}
    },
    {module: null, model: 'ChannelLock', name: 'ChannelLock', fields: {lockReason: 'string'}}
];

function resolveModel(models, entry) {
    if (!models) return null;
    if (entry.module) return (models[entry.module] || {})[entry.model];
    return models[entry.model];
}

module.exports = {ENCRYPTED_FIELDS, resolveModel, VALID_TYPES};