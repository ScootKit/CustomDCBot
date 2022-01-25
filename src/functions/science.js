/*

THIS FILE IS NOT REALLY NEEDED.

We use this file to hook into different parts of the sytem to share some telementry-data with SCNX. This WON'T happen in the open-source-version, don't worry. Users using SCNX can opt out any time.

 */

module.exports.trackCommand = async function (interaction) {

};

module.exports.trackMessageComponent = async function (interaction) {
};

module.exports.trackStart = async function (client) {
};

module.exports.trackConfigError = async function (client, error) {
};

module.exports.trackError = async function (client, data) {

};

module.exports.sendFeedback = async function (client, feedbackData) {

};