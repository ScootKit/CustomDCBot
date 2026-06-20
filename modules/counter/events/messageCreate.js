const {localize} = require('../../../src/functions/localize');
const {embedType} = require('../../../src/functions/helpers');
let Formula;

const invalidMessages = new Map();

module.exports.run = async function (client, msg) {
    if (!client.botReadyAt) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (!msg.member) return;
    if (msg.author.bot) return;

    const moduleConfig = client.configurations['counter']['config'];
    if (!moduleConfig.channels.includes(msg.channel.id)) return;
    const object = await client.models['counter']['CountChannel'].findOne({
        where: {
            channelID: msg.channel.id
        }
    });
    if (!object) return;

    const parsedNumber = await parseMessageNumber(msg.content, client);
    if (!parsedNumber) return wrongMessage(localize('counter', 'not-a-number'));
    if (object.lastCountedUser === msg.author.id && moduleConfig.onlyOneMessagePerUser) return wrongMessage(localize('counter', 'only-one-message-per-person'));
    if (parseInt(object.currentNumber) + 1 !== parsedNumber) {
        if (parseInt(object.currentNumber) !== parsedNumber && moduleConfig.restartOnWrongCount) {
            object.currentNumber = 0;
            object.lastCountedUser = null;
            object.userCounts = {};
            await object.save();
            invalidMessages.set(msg.author.id, (invalidMessages.get(msg.author.id) || 0) + 1);
            return msg.reply(embedType(moduleConfig.restartOnWrongCountMessage, {
                '%i%': 1,
                '%mention%': msg.author.toString()
            }));
        }
        return wrongMessage(localize('counter', 'not-the-next-number', {n: parseInt(object.currentNumber) + 1}), true);
    }

    object.currentNumber++;
    object.lastCountedUser = msg.author.id;
    const userCounts = object.userCounts;
    object.userCounts = {};
    if (!userCounts[msg.author.id]) userCounts[msg.author.id] = 0;
    userCounts[msg.author.id]++;
    object.userCounts = userCounts;
    await object.save();
    const benefits = client.configurations['counter']['milestones'];
    for (const benefit of benefits.filter(b => parseInt(b.userMessageCount) === userCounts[msg.author.id])) {
        if (benefit.giveRoles.length !== 0) await msg.member.roles.add(benefit.giveRoles);
        if (benefit.sendMessage) {
            const ben = await msg.reply(embedType(benefit.sendMessage, {
                '%mention%': msg.author.toString(),
                '%milestone%': userCounts[msg.author.id]
            }));
            setTimeout(() => {
                ben.delete();
            }, 10000);
        }
    }

    let reactions;
    if (moduleConfig.enableEasterEggs) {
        if (parsedNumber === 67) reactions = [await msg.react('🤲')];
        else if (parsedNumber === 42) reactions = [await msg.react('❓')];
        else if (parsedNumber === 420) reactions = [await msg.react('🚬')];
        else if (parsedNumber === 100) reactions = [await msg.react('💯')];
        else if (parsedNumber === 110) reactions = [await msg.react('🚓')];
        else if (parsedNumber === 112 || parsedNumber === 911) reactions = [await msg.react('🚑'), await msg.react('🚒')];
        else if (parsedNumber === 69) reactions = [await msg.react('🇳'), await msg.react('🇮'), await msg.react('🇨'), await msg.react('🇪')];
        else reactions = [await msg.react(moduleConfig['success-reaction'])];
    } else {
        reactions = [await msg.react(moduleConfig['success-reaction'])];
    }

    if (moduleConfig.removeReactions) setTimeout(async () => {
        for (const reaction of reactions) await reaction.remove();
    }, 5000);
    if (moduleConfig.channelDescription) await msg.channel.setTopic(moduleConfig.channelDescription.split('%x%').join(object.currentNumber + 1), '[counter] ' + localize('counter', 'channel-topic-change-reason'));

    /**
     * Tells the user that they did something wrong
     * @private
     * @param {String} reason Reason for their warning
     * @param {Boolean} skipStrike If enabled, the user won't receive a strike
     * @return {Promise<void>}
     */
    async function wrongMessage(reason, skipStrike = false) {
        const answer = await msg.reply(embedType(moduleConfig['wrong-input-message'], {'%err%': reason}));
        setTimeout(async () => {
            await answer.delete();
            await msg.delete();
        }, 8000);
        if (!skipStrike || parseInt(moduleConfig.strikeAmount) === 0) return;
        invalidMessages.set(msg.author.id, (invalidMessages.get(msg.author.id) || 0) + 1);
        if (invalidMessages.get(msg.author.id) >= parseInt(moduleConfig.strikeAmount)) {
            if (moduleConfig.giveRoleInsteadOfPermissionRemoval) await msg.member.roles.add(moduleConfig.strikeRole, '[counter] ' + localize('counter', 'restriction-audit-log'));
            else await msg.channel.permissionOverwrites.create(msg.author, {
                SEND_MESSAGES: false
            }, {reason: '[counter] ' + localize('counter', 'restriction-audit-log')});
            const ban = await answer.reply(embedType(moduleConfig.strikeMessage, {'%mention%': msg.author.toString()}));
            setTimeout(async () => {
                await ban.delete();
            }, 8000);
        }
    }
};

async function parseMessageNumber(content, client) {
    if (client.configurations['counter']['config'].allowCharactersInMessage) content = content.replace(/[^\d\+\-\*\+()\/\.^]/g, '');
    if (client.configurations['counter']['config'].allowMaths) {
        if (!Formula) Formula = (await import('fparser')).default;
        try {
            const math = new Formula(content);
            content = math.evaluate({});
        } catch (e) {

        }
    }

    if (!parseInt(content)) return null;

    return parseInt(content);
}

module.exports.countingGameParseContent = parseMessageNumber;