const { 
    embedType,
    embedTypeV2,
    formatDiscordUserName,
    archiveDiscordAttachment
} = require('../../../src/functions/helpers');
const cooldowns = new Map();

module.exports.run = async (client, msg) => {
    if (!client.botReadyAt) return;
    if (!msg.content || msg.author.bot || msg.system) return;
    if (!msg.guild || !msg.member) return;
    if (msg.guild.id !== client.guildID) return;
   
    const now = Date.now();
    const cooldownAmount = 5 * 1000;
    if (cooldowns.has(msg.author.id)) {
        const expirationTime = cooldowns.get(msg.author.id) + cooldownAmount;
        if (now < expirationTime) return;
    }
    
    const moduleConfig = client.configurations['message-quotes']['config'] || {};
    
    const blacklistedChannels = moduleConfig.channels || [];
    const blacklistedRoles = moduleConfig.roles || [];
    
    if (blacklistedChannels.includes(msg.channel.id) ||
        blacklistedChannels.includes(msg.channel.parentId) ||
        (msg.channel.parent?.parentId && blacklistedChannels.includes(msg.channel.parent.parentId))) {
        return;
    };
    if (msg.member.roles.cache.some(r => blacklistedRoles.some(br => String(br) === r.id))) return;    
    
    const discordLinkRegex = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;
    const match = msg.content.match(discordLinkRegex);
    if (!match) return;
    
    cooldowns.set(msg.author.id, now);
    
    const [_, guildId, channelId, messageId] = match;
    if (guildId !== msg.guild.id) return;
    
    try {
        const targetChannel = await msg.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) return;
        
        const userPerms = targetChannel.permissionsFor(msg.member);
        if (!userPerms || !userPerms.has('ViewChannel') || !userPerms.has('ReadMessageHistory')) return; 
        
        const botPerms = targetChannel.permissionsFor(msg.guild.members.me);
        if (!botPerms || !botPerms.has('ViewChannel') || !botPerms.has('ReadMessageHistory')) return;
        
        const targetMsg = await targetChannel.messages.fetch(messageId).catch(() => null);
        if (!targetMsg) return;
        
        if (moduleConfig.noBots === true && targetMsg.author.bot) return;
        if (moduleConfig.selfQuote === false && targetMsg.author.id === msg.author.id) return;
        
        let files = [];
        const withAttachments = moduleConfig.withAttachments;
        if (withAttachments && targetMsg.attachments.size > 0) {
            let count = 0;
            for (const [_, att] of targetMsg.attachments) {
                if (count >= 3) break;
                if (att.size > 8 * 1024 * 1024) continue;
                
                files.push({
                    attachment: att.url,
                    name: att.name ?? 'attachment'
                });
                count++;
            }
        }
        
        let finalImage = '';
        const firstAttachment = targetMsg.attachments.first();
        if (firstAttachment) {
            finalImage = await archiveDiscordAttachment(client, firstAttachment.url, {
            displayName: `Quote by ${formatDiscordUserName(targetMsg.author)} in #${targetChannel.name}`.slice(0, 100),
            tags: ['message-quotes'],
            uploaderDiscordID: targetMsg.author.id
        });
        } else {
            const imgMatch = targetMsg.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)/i);
            if (imgMatch) finalImage = imgMatch[0];
        }
        
        const userAvatar = targetMsg.author.displayAvatarURL();
        const unixSeconds = Math.floor(targetMsg.createdTimestamp / 1000);
        const displayContent = targetMsg.content ||
            (targetMsg.attachments.size > 0 ? '*[Attachment]*' : '') ||
            (targetMsg.stickers?.size > 0 ? '*[Sticker]*' : '*[None]*');
        
        const quoteMsg = await embedTypeV2(moduleConfig.message, {
           '%userID%': targetMsg.author.id,
           '%userName%': formatDiscordUserName(targetMsg.author),
           '%displayName%': targetMsg.member?.displayName || targetMsg.author.username,
           '%userAvatar%': userAvatar,
           '%channelID%': targetChannel.id,
           '%channelName%': targetChannel.name,
           '%link%': match[0],
           '%image%': finalImage,
           '%timestamp%': `<t:${unixSeconds}:R>`,
           '%content%': displayContent
        });
        
        let finalFiles = quoteMsg.files && Array.isArray(quoteMsg.files) ? [...quoteMsg.files] : [];
        if (files.length > 0) {
            finalFiles = finalFiles.concat(files);
        }
        
        const sendOptions = {
            ...quoteMsg,
            files: finalFiles.length > 0 ? finalFiles : undefined,
            allowedMentions: { parse: [], repliedUser: false }
        };
        
        if (moduleConfig.asReply === true && moduleConfig.deleteOrigin !== true) {
            await msg.reply(sendOptions);
        } else {
            await msg.channel.send(sendOptions);
        }
        
        if (moduleConfig.deleteOrigin === true) {
            const currentChannelPerms = msg.channel.permissionsFor(msg.guild.members.me);
            if (currentChannelPerms && currentChannelPerms.has('ManageMessages')) {
                await msg.delete().catch(() => null);
            } else {
                client.logger.warn(`[Message-Quotes] Messages cannot deleted, missing Permission: ManageMessages`);
            }
        }
    } catch(error) {
        client.logger.error('[Message-Quotes]' + error);
    }
};
