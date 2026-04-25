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
    if (member.roles.cache.some(r => moduleConfig.blacklistedRoles.some(br => String(br) === r.id))) return;
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
        const cachedXp = user.xp;
        const cachedLevel = user.level;
        // Sanity-check the stored values before entering the loop. Out-of-range values
        // (NaN, Infinity, absurdly large XP, negative level) indicate a corrupted row
        // and can make the level-up loop run effectively forever.
        if (
            !Number.isFinite(cachedXp) || !Number.isFinite(cachedLevel) ||
            cachedXp < 0 || cachedLevel < 0 ||
            cachedXp > 1e12 || cachedLevel > 1e6
        ) {
            client.logger.error(`[levels] skipping level-up for user ${member.user.id}: corrupted values (xp=${cachedXp}, level=${cachedLevel})`);
            return;
        }
        let i = 1;
        let lastRequired = -Infinity;
        while (i <= 1000) {
            const required = calculateLevelXP(client, cachedLevel + i);
            if (!Number.isFinite(required) || required <= lastRequired) {
                client.logger.error(`[levels] level curve returned non-monotonic or non-finite value at level ${cachedLevel + i} (got ${required}); aborting level-up for user ${member.user.id}`);
                return;
            }
            if (cachedXp < required) break;
            lastRequired = required;
            i++;
        }
        if (i > 1000) {
            client.logger.error(`[levels] level-up loop exceeded 1000 iterations for user ${member.user.id} (xp=${cachedXp}, level=${cachedLevel}); skipping`);
            return;
        }
        currentlyLevelingUp.add(member.user.id);
        user.level = user.level + (i - 1);
        const levelUpChannel = client.channels.cache.find(c => c.id === moduleConfig.level_up_channel_id && c.type === ChannelType.GuildText);

        const calculatedLevel = user.level - (client.configurations['levels']['config'].startFromZero ? 1 : 0);
        const isRewardMessage = !!moduleConfig.reward_roles[calculatedLevel.toString()];
        const specialMessage = client.configurations['levels']['special-levelup-messages'].find(m => m.level === calculatedLevel);
        const randomMessages = client.configurations['levels']['random-levelup-messages'].filter(m => m.type === (isRewardMessage ? 'with-reward' : 'normal'));

        let messageToSend = moduleStrings.level_up_message;
        if (isRewardMessage) messageToSend = moduleStrings.level_up_message_with_reward;

        if (moduleConfig.randomMessages) {
            if (moduleConfig.randomMessages.length === 0) client.warn('[levels] ' + localize('levels', 'random-messages-enabled-but-non-configured'));
            else if (randomMessages.length !== 0) messageToSend = randomElementFromArray(randomMessages).message;
        }

        if (isRewardMessage) {
            if (moduleConfig.onlyTopLevelRole) {
                for (const role of Object.values(moduleConfig.reward_roles)) {
                    if (member.roles.cache.has(role)) await member.roles.remove(role, '[levels] ' + localize('levels', 'granted-rewards-audit-log')).catch();
                }
            }
            await member.roles.add(moduleConfig.reward_roles[calculatedLevel.toString()], '[levels]' + localize('levels', 'granted-rewards-audit-log')).catch();
        }
        if (specialMessage) messageToSend = specialMessage.message;

        await sendLevelUpMessage(await embedTypeV2(messageToSend, {
            '%mention%': `<@${member.user.id}>`,
            '%avatarURL%': member.user.avatarURL() || member.user.defaultAvatarURL,
            '%username%': member.user.username,
            '%newLevel%': displayLevel(user.level, client),
            '%role%': isRewardMessage ? `<@&${moduleConfig.reward_roles[calculatedLevel.toString()]}>` : localize('levels', 'no-role'),
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
    if (!msg.member) return;
    if (cooldown.has(msg.author.id)) return;

    const moduleConfig = client.configurations['levels']['config'];

    if (msg.content.includes(client.config.prefix)) return;
    if (moduleConfig.blacklisted_channels.includes(msg.channel.id) || moduleConfig.blacklisted_channels.includes(msg.channel.parentId) || moduleConfig.blacklisted_channels.includes(msg.channel.parent?.parentId)) return;
    if (msg.member.roles.cache.some(r => moduleConfig.blacklistedRoles.some(br => String(br) === r.id))) return;
    let xp = randomIntFromInterval(moduleConfig['min-xp'], moduleConfig['max-xp']);

    await grantXPAndLevelUP(client, msg.member, xp, 'message', msg.channel, msg);

    cooldown.add(msg.author.id);
    registerNeededEdit();
    setTimeout(() => {
        cooldown.delete(msg.author.id);
    }, moduleConfig.cooldown);
};
