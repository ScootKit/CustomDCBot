const {updateLeaderBoard} = require('../leaderboardChannel');
const {disableModule} = require('../../../src/functions/helpers');
const {localize} = require('../../../src/functions/localize');


module.exports.run = async function (client) {
    if (client.configurations['levels']['config']['customLevelCurve']) {
        const Formula = (await import('fparser')).default;
        let customFormula = null;
        try {
            customFormula = new Formula(client.configurations['levels']['config']['customLevelCurve']);
        } catch (e) {
            return disableModule('levels', localize('levels', 'invalid-custom-formula'));
        }
        if (customFormula && (customFormula.getVariables().length !== 1 || customFormula.getVariables()[0] !== 'x')) return disableModule('levels', localize('levels', 'invalid-custom-formula'));
        if (customFormula) client.configurations['levels']['config'].customLevelCurveParsed = customFormula;
    }
    if (!client.configurations['levels']['config']['leaderboard-channel']) return;
    await updateLeaderBoard(client, true);
    const interval = setInterval(() => {
        updateLeaderBoard(client);
    }, 300042);
    client.intervals.push(interval);
};