const {
    embedType,
    randomIntFromInterval,
    randomElementFromArray,
    embedTypeV2, formatDiscordUserName, formatNumber
} = require('../../../src/functions/helpers');
const {ChannelType} = require('discord.js');

const curves = {
    'EXPONENTIAL': (level) => level * 750 + ((level - 1) * 500),
    'LINEAR': (level) => level * 750,
    'EXPONENTIATION': (level) => 350 * (level - 1) ** 2,
    'CUSTOM': (level) => {
        const customFormula = client.configurations['levels']['config'].customLevelCurveParsed;
        if (!customFormula) {
            console.error(localize('levels', 'no-custom-formula'));
            return curves['EXPONENTIAL'](level);
        }
        return customFormula.evaluate({x: level});
    }
};

function calculateLevelXP(client, level) {
    return curves[client.configurations['levels']['config'].curveType](level, client);
}

module.exports.calculateLevelXP = calculateLevelXP;

function isMaxLevel(level, client) {
    if (!client.configurations['levels']['config'].maximumLevelEnabled) return false;
    return level - (client.configurations['levels']['config'].startFromZero ? 1 : 0) >= client.configurations['levels']['config'].maximumLevel;
}

module.exports.isMaxLevel = isMaxLevel;


function displayLevel(level, client) {
    const displayLevel = level - (client.configurations['levels']['config'].startFromZero ? 1 : 0);
    if (isMaxLevel(level, client)) return formatNumber(client.configurations['levels']['config'].maximumLevel);
    return formatNumber(displayLevel);
}

module.exports.displayLevel = displayLevel;

const {registerNeededEdit} = require('../leaderboardChannel');
const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
const {getReplaceableRewardRoleIds, getRewardForLevel} = require('../rewards');
const cooldown = new Set();
let currentlyLevelingUp = new Set();

function getMemberRoleFactor(member) {
    let roleFactor = 1;
    for (const role of member.roles.cache.filter(f => member.client.configurations['levels']['config']['multiplication_roles'][f.id]).values()) {
        roleFactor = roleFactor * parseFloat(member.client.configurations['levels']['config']['multiplication_roles'][role.id]);
    }
    return roleFactor;
}

module.exports.getMemberRoleFactor = getMemberRoleFactor;

async function grantXPAndLevelUP(client, member, xp, xpType, channel, msg = null) {
    const moduleConfig = client.configurations['levels']['config'];
    const moduleStrings = client.configurations['levels']['strings'];

    let user = await client.models['levels']['User'].findOne({
        where: {
            userID: member.user.id
        }
    });
    if (!user) {
        user = await client.models['levels']['User'].create({
            userID: member.user.id,
            messages: 0,
            xp: 0
        });
    }

    if (isMaxLevel(user.level, client)) return;
    if (xpType === 'message') user.messages = user.messages + 1;


    const nextLevelXp = calculateLevelXP(client, user.level + 1);

    xp = xp * getMemberRoleFactor(member);
    if (moduleConfig['multiplication_channels'][channel.id]) xp = xp * parseFloat(moduleConfig['multiplication_channels'][channel.id]);
    user.xp = user.xp + xp;
    await user.save();

    if (nextLevelXp <= user.xp && !currentlyLevelingUp.has(member.user.id)) {
        let i = 1;
        while (user.xp >= calculateLevelXP(client, user.level + i)) i++;
        currentlyLevelingUp.add(member.user.id);
        user.level = user.level + (i - 1);
        const levelUpChannel = client.channels.cache.find(c => c.id === moduleConfig.level_up_channel_id && c.type === ChannelType.GuildText);

        const calculatedLevel = user.level - (client.configurations['levels']['config'].startFromZero ? 1 : 0);
        const rewardConfig = getRewardForLevel(client, calculatedLevel);
        const isRewardMessage = !!rewardConfig;
        const specialMessage = client.configurations['levels']['special-levelup-messages'].find(m => m.level === calculatedLevel);
        const randomMessages = client.configurations['levels']['random-levelup-messages'].filter(m => m.type === (isRewardMessage ? 'with-reward' : 'normal'));

        let messageToSend = moduleStrings.level_up_message;
        if (isRewardMessage) messageToSend = moduleStrings.level_up_message_with_reward;

        if (moduleConfig.randomMessages) {
            if (moduleConfig.randomMessages.length === 0) client.warn('[levels] ' + localize('levels', 'random-messages-enabled-but-non-configured'));
            else if (randomMessages.length !== 0) messageToSend = randomElementFromArray(randomMessages).message;
        }

        if (rewardConfig) {
            if (rewardConfig.replacePrevious) {
                for (const role of getReplaceableRewardRoleIds(client)) {
                    if (member.roles.cache.has(role)) {
                        await member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
                    }
                }
            }
            await member.roles.add(rewardConfig.roles, '[levels]' + localize('levels', 'granted-rewards-audit-log')).catch();
        }
        if (specialMessage) messageToSend = specialMessage.message;

        await sendLevelUpMessage(await embedTypeV2(messageToSend, {
            '%mention%': `<@${member.user.id}>`,
            '%avatarURL%': member.user.avatarURL() || member.user.defaultAvatarURL,
            '%username%': member.user.username,
            '%newLevel%': displayLevel(user.level, client),
            '%role%': rewardConfig ? rewardConfig.roles.map(r => `<@&${r}>`).join(', ') : localize('levels', 'no-role'),
            '%tag%': formatDiscordUserName(member.user)
        }, {allowedMentions: {parse: ['users']}}));
        await user.save();
        currentlyLevelingUp.delete(member.user.id);

        /**
         * Sends the level up messages
         * @private
         * @param {Object} content Content of the message
         */
        async function sendLevelUpMessage(content) {
            if (moduleConfig.levelUpMessagesConditions === 'none' || (moduleConfig.levelUpMessagesConditions === 'only-role-rewards' && !isRewardMessage)) return;
            if (levelUpChannel) await levelUpChannel.send(content);
            else {
                if (msg) await msg.reply(content);
                else channel.send(content);
            }
        }
    }
}

module.exports.grantXPAndLevelUP = grantXPAndLevelUP;

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (msg.author.bot || msg.system) return;
    if (!msg.guild) return;
    if (msg.guild.id !== client.guildID) return;
    if (cooldown.has(msg.author.id)) return;

    const moduleConfig = client.configurations['levels']['config'];

    if (msg.content.includes(client.config.prefix)) return;
    if (moduleConfig.blacklisted_channels.includes(msg.channel.id) || moduleConfig.blacklisted_channels.includes(msg.channel.parentId) || moduleConfig.blacklisted_channels.includes(msg.channel.parent?.parentId)) return;
    if (msg.member.roles.cache.filter(r => moduleConfig.blacklistedRoles.includes(r.id)).size !== 0) return;
    let xp = randomIntFromInterval(moduleConfig['min-xp'], moduleConfig['max-xp']);

    await grantXPAndLevelUP(client, msg.member, xp, 'message', msg.channel, msg);

    cooldown.add(msg.author.id);
    registerNeededEdit();
    setTimeout(() => {
        cooldown.delete(msg.author.id);
    }, moduleConfig.cooldown);
};
