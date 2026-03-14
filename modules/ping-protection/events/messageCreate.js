const { 
    processPing,
    sendPingWarning
} = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');
const { randomElementFromArray } = require('../../../src/functions/helpers'); 

// Tracks the last meme for duplicates + counts for grind message
const lastMemeMap = new Map();
const selfPingCountMap = new Map();

// Handles messages
module.exports.run = async function (client, message) {
    if (!client.botReadyAt) return;
    if (!message.guild) return;
    if (message.guild.id !== client.guildID) return;

    const config = client.configurations['ping-protection']['configuration'];

    if (message.author.bot) return;

    if (config.ignoredChannels.includes(message.channel.id)) return;
    if (config.ignoredUsers.includes(message.author.id)) return;
    if (message.member.roles.cache.some(role => config.ignoredRoles.includes(role.id))) return;

    // Check for protected pings
    const pingedProtectedRole = message.mentions.roles.some(role => config.protectedRoles.includes(role.id));
    const protectedMentions = new Set();
    const mentionedUsers = message.mentions.users;

    if (mentionedUsers.size > 0) {
        mentionedUsers.forEach(user => {
            if (config.protectedUsers.includes(user.id)) {
                protectedMentions.add(user.id);
            }
            else if (config.protectAllUsersWithProtectedRole) {
                const member = message.mentions.members.get(user.id);
                if (member && member.roles.cache.some(r => config.protectedRoles.includes(r.id))) {
                    protectedMentions.add(user.id);
                }
            }
        });
    }

    // Handles reply pings
    if (config.allowReplyPings && message.mentions.repliedUser) {
        const repliedId = message.mentions.repliedUser.id;
        
        if (protectedMentions.has(repliedId)) {
            const manualMentionRegex = new RegExp(`<@!?${repliedId}>`);
            const isManualPing = manualMentionRegex.test(message.content);

            if (!isManualPing) {
                protectedMentions.delete(repliedId);
            }
        }
    }

    // Determines if any protected entities were pinged
    const pingedProtectedUser = protectedMentions.size > 0;

    if (!pingedProtectedRole && !pingedProtectedUser) return;
    
    let target = null;
    if (pingedProtectedUser) {
        const firstId = protectedMentions.values().next().value;
        target = message.mentions.users.get(firstId);
    } else if (pingedProtectedRole) {
        target = message.mentions.roles.find(r => config.protectedRoles.includes(r.id));
    }

    if (!target) return; 

    // Funny easter egg when they ping themselves
    if (target.id === message.author.id && config.selfPingConfiguration === "Ignored") return;
    if (target.id === message.author.id && config.selfPingConfiguration === "Get fun easter eggs when pinging themselves") {
            const secretChance = 0.01; // Secret for a reason.. (1% chance)
            const standardMemes = [
                localize('ping-protection', 'meme-why'),
                localize('ping-protection', 'meme-played'),
                localize('ping-protection', 'meme-spider')
            ];
            const secretMeme = localize('ping-protection', 'meme-rick');
            const currentCount = (selfPingCountMap.get(message.author.id) || 0) + 1;
            selfPingCountMap.set(message.author.id, currentCount);

            setTimeout(() => {
                selfPingCountMap.delete(message.author.id);
            }, 300000);

            const roll = Math.random();
            let content = '';

            if (roll < secretChance) {
                content = secretMeme;
                lastMemeMap.set(message.author.id, -1);
                selfPingCountMap.delete(message.author.id);
            } else if (currentCount === 5) {
                content = localize('ping-protection', 'meme-grind');
            } else {
                const lastIndex = lastMemeMap.get(message.author.id);

                let possibleMemes = standardMemes.map((_, index) => index);
                if (lastIndex !== undefined && lastIndex !== -1 && standardMemes.length > 1) {
                    possibleMemes = possibleMemes.filter(i => i !== lastIndex);
                }

                const randomIndex = randomElementFromArray(possibleMemes);
                content = standardMemes[randomIndex];
                lastMemeMap.set(message.author.id, randomIndex);
            }
            await message.reply({ content: content }).catch(() => {});
            return; 
    }

    await sendPingWarning(client, message, target, config);

    const isRole = !target.username;
    let memberToPunish = message.member;
    if (!memberToPunish) {
        try { 
            memberToPunish = await message.guild.members.fetch(message.author.id); 
        } catch (e) {return;}
    }

    await processPing(
        client, 
        message.author.id, 
        target.id, 
        isRole, 
        message.url,
        message.channel, 
        memberToPunish
    );
};