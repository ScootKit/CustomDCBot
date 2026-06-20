const fs = require('fs');
const path = require('path');

function src(rel) {
    return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

describe('encrypted columns are declared TEXT', () => {
    const cases = [
        ['modules/suggestions/models/Suggestion.js', ['suggestion', 'adminAnswer']],
        ['modules/polls/models/Poll.js', ['description', 'options']],
        ['modules/quiz/models/Quiz.js', ['description', 'headline']],
        ['modules/reminders/models/Reminder.js', ['reminderText']],
        ['modules/nicknames/models/User.js', ['nickname']],
        ['modules/ping-protection/models/ModerationLog.js', ['reason']],
        ['modules/staff-management-system/models/StaffProfile.js', ['customNickname', 'customIntro']],
        ['src/models/ChannelLock.js', ['lockReason']]
    ];
    test.each(cases)('%s fields are TEXT', (file, fields) => {
        const code = src(file);
        for (const f of fields) {
            const re = new RegExp(`${f}\\s*:\\s*(?:\\{[^}]*type\\s*:\\s*)?DataTypes\\.TEXT`);
            expect(code).toMatch(re);
        }
    });
});
