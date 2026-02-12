const {Op} = require('sequelize');

async function getLinkedGroup(client, userID) {
    const record = await client.models['moderation']['LinkedAccount'].findOne({
        where: {userID}
    });
    if (!record) return null;
    const mainID = record.mainID || record.userID;
    const entries = await client.models['moderation']['LinkedAccount'].findAll({
        where: {mainID}
    });
    const userIDs = entries.map(e => e.userID);
    return {mainID, userIDs, entries};
}

async function linkAccounts(client, mainID, userIDs, linkedBy) {
    const now = new Date();
    const model = client.models['moderation']['LinkedAccount'];
    const inputIDs = new Set([mainID, ...(userIDs || [])]);
    const inputList = Array.from(inputIDs);
    if (inputList.length === 0) return;

    const existing = await model.findAll({
        where: {userID: {[Op.in]: inputList}}
    });
    const existingMainIDs = new Set();
    for (const entry of existing) {
        existingMainIDs.add(entry.mainID || entry.userID);
    }

    const groupIDs = new Set(inputIDs);
    if (existingMainIDs.size > 0) {
        const mainList = Array.from(existingMainIDs);
        const groupEntries = await model.findAll({
            where: {mainID: {[Op.in]: mainList}}
        });
        for (const entry of groupEntries) groupIDs.add(entry.userID);
    }

    let canonicalMainID = mainID;
    const preferred = existing.find(entry => entry.userID === mainID);
    if (preferred) canonicalMainID = preferred.mainID || preferred.userID;
    else if (existing.length > 0) canonicalMainID = existing[0].mainID || existing[0].userID;

    if (!groupIDs.has(canonicalMainID)) {
        const first = groupIDs.values().next().value;
        if (first) canonicalMainID = first;
    }

    const upserts = [];
    for (const userID of groupIDs) {
        upserts.push(model.upsert({
            userID,
            mainID: canonicalMainID,
            linkedBy,
            linkedAt: now
        }));
    }
    await Promise.all(upserts);
}

async function unlinkAccount(client, userID) {
    await client.models['moderation']['LinkedAccount'].destroy({
        where: {userID}
    });
}

async function unlinkGroup(client, mainID) {
    await client.models['moderation']['LinkedAccount'].destroy({
        where: {mainID}
    });
}

module.exports = {
    getLinkedGroup,
    linkAccounts,
    unlinkAccount,
    unlinkGroup
};
