const {localize} = require('../../../src/functions/localize');
const {
    embedType,
    pufferStringToSize,
    dateToDiscordTimestamp,
    formatDiscordUserName,
    formatNumber,
    parseEmbedColor
} = require('../../../src/functions/helpers');
const {ChannelType, MessageEmbed} = require('discord.js');
const {AgeFromDate} = require('age-calculator');
const {calculateLevelXP, isMaxLevel, displayLevel} = require('../../levels/events/messageCreate');

const legacyChannelType = (type) => {
    const map = {
        [ChannelType.GuildText]: 'GUILD_TEXT',
        [ChannelType.GuildVoice]: 'GUILD_VOICE',
        [ChannelType.GuildCategory]: 'GUILD_CATEGORY',
        [ChannelType.GuildAnnouncement]: 'GUILD_NEWS',
        [ChannelType.GuildStageVoice]: 'GUILD_STAGE_VOICE',
        [ChannelType.PublicThread]: 'PUBLIC_THREAD',
        [ChannelType.PrivateThread]: 'PRIVATE_THREAD',
        [ChannelType.AnnouncementThread]: 'NEWS_THREAD',
        [ChannelType.GuildForum]: 'GUILD_FORUM',
        [ChannelType.GuildMedia]: 'GUILD_MEDIA'
    };
    if (typeof type === 'string') return type;
    return map[type] || (ChannelType[type] ? ChannelType[type].toString().toUpperCase() : type);
};

// THIS IS PAIN. Rewrite it as soon as possible
module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'server': async function (interaction) {
        const moduleStrings = interaction.client.configurations['info-commands']['strings'];
        const embed = new MessageEmbed()
            .setTitle(localize('info-commands', 'information-about-server', {s: interaction.guild.name}))
            .setColor(parseEmbedColor('GOLD'))
            .setThumbnail(interaction.guild.iconURL())
            .setImage(interaction.guild.bannerURL())
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl});
        if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (interaction.guild.afkChannel) embed.addField(moduleStrings.serverinfo.afkChannel, `<#${interaction.guild.afkChannelID}> (${interaction.guild.afkTimeout}s)`, true);
        if (interaction.guild.description) embed.setDescription(interaction.guild.description);
        embed.addField(moduleStrings.serverinfo.id, '`' + interaction.guild.id + '`', true);
        const owner = await interaction.guild.fetchOwner();
        embed.addField(moduleStrings.serverinfo.owner, `<@${owner.id}> \`${owner.id}\``, true);
        embed.addField(moduleStrings.serverinfo.boosts, `${localize('info-commands', 'boostLevel')}: ${localize('boostTier', interaction.guild.premiumTier)}\n${localize('info-commands', 'boostCount')}: ${interaction.guild.premiumSubscriptionCount}`, true);
        embed.addField(moduleStrings.serverinfo.emojiCount, interaction.guild.emojis.cache.size.toString(), true);
        if (interaction.guild.stickers.cache.size !== 0) embed.addField(moduleStrings.serverinfo.stickerCount, interaction.guild.stickers.cache.size.toString(), true);
        embed.addField(moduleStrings.serverinfo.roleCount, interaction.guild.roles.cache.size.toString(), true);
        if (interaction.guild.rulesChannelID) embed.addField(moduleStrings.serverinfo.rulesChannel, `<#${interaction.guild.rulesChannelID}>`, true);
        if (interaction.guild.systemChannelID) embed.addField(moduleStrings.serverinfo.dcSystemChannel, `<#${interaction.guild.systemChannelID}>`, true);
        embed.addField(moduleStrings.serverinfo.verificationLevel, localize('guildVerification', interaction.guild.verificationLevel), true);
        const bans = await interaction.guild.bans.fetch();
        embed.addField(moduleStrings.serverinfo.banCount, bans.size.toString(), true);
        embed.addField(moduleStrings.serverinfo.createdAt, `<t:${(interaction.guild.createdAt.getTime() / 1000).toFixed(0)}:d>`, true);
        const members = interaction.guild.members.cache;
        embed.addField(moduleStrings.serverinfo.members, `\`\`\`| ${localize('info-commands', 'userCount')} | ${localize('info-commands', 'memberCount')} | Online |\n| ${pufferStringToSize(members.size, localize('info-commands', 'userCount').length)} | ${pufferStringToSize(members.filter(m => !m.user.bot).size, localize('info-commands', 'memberCount').length)} | ${pufferStringToSize(members.filter(m => m.presence && (m.presence || {}).status !== 'offline').size, localize('info-commands', 'onlineCount').length)} |\`\`\``);
        embed.addField(moduleStrings.serverinfo.channels, `\`\`\`| ${localize('info-commands', 'textChannel')} | ${localize('info-commands', 'voiceChannel')} | ${localize('info-commands', 'categoryChannel')} | ${localize('info-commands', 'otherChannel')} |\n| ${pufferStringToSize(interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size.toString(), localize('info-commands', 'textChannel').length)} | ${pufferStringToSize(interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size.toString(), localize('info-commands', 'voiceChannel').length)} | ${pufferStringToSize(interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size.toString(), localize('info-commands', 'categoryChannel').length)} | ${pufferStringToSize(interaction.guild.channels.cache.filter(c => c.type !== ChannelType.GuildVoice && c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildCategory).size.toString(), localize('info-commands', 'otherChannel').length)} |\`\`\``);
        let featuresstring = '';
        interaction.guild.features.forEach(f => {
            featuresstring = featuresstring + `${f[0].toUpperCase() + f.toLowerCase().substring(1)}, `;
        });
        if (featuresstring !== '') featuresstring = featuresstring.substring(0, featuresstring.length - 2);
        else featuresstring = moduleStrings.serverinfo.noFeaturesEnabled;
        embed.addField(moduleStrings.serverinfo.features, `\`\`\`${featuresstring}\`\`\``);
        interaction.editReply({embeds: [embed]});
    },
    'channel': async function (interaction) {
        const moduleStrings = interaction.client.configurations['info-commands']['strings'];
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const embed = new MessageEmbed()
            .setTitle(localize('info-commands', 'information-about-channel', {c: channel.name}))
            .addField(moduleStrings.channelInfo.type, localize('channelType', legacyChannelType(channel.type).toString()), true)
            .addField(moduleStrings.channelInfo.id, channel.id, true)
            .addField(moduleStrings.channelInfo.createdAt, `<t:${(channel.createdAt.getTime() / 1000).toFixed(0)}:d>`, true)
            .addField(moduleStrings.channelInfo.name, channel.name, true)
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .setColor(parseEmbedColor('GREEN'));
        if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (channel.parent) embed.addField(moduleStrings.channelInfo.parent, channel.parent.name, true);
        if (channel.position) embed.addField(moduleStrings.channelInfo.position, (channel.position + 1).toString(), true);
        if (channel.topic) embed.setDescription(channel.topic);
        if (channel.isThread && channel.isThread()) {
            if (channel.archiveTimestamp !== channel.createdTimestamp) embed.addField(moduleStrings.channelInfo.threadArchivedAt, `<t:${(channel.archivedAt.getTime() / 1000).toFixed(0)}:d>`, true);
            if (channel.autoArchiveDuration) embed.addField(moduleStrings.channelInfo.threadAutoArchiveDuration, `${channel.autoArchiveDuration}min`, true);
            if (channel.ownerId) embed.addField(moduleStrings.channelInfo.threadOwner, `<@${channel.ownerId}>`, true);
            if (channel.messageCount && channel.messageCount < 50) embed.addField(moduleStrings.channelInfo.threadMessages, channel.messageCount.toString(), true);
            if (channel.memberCount && channel.memberCount < 50) embed.addField(moduleStrings.channelInfo.threadMemberCount, channel.memberCount.toString(), true);
        }
        if (channel.type === ChannelType.GuildStageVoice && channel.stageInstance && !(channel.stageInstance || {}).deleted) {
            embed.addField(moduleStrings.channelInfo.stageInstanceName, channel.stageInstance.topic, true);
            embed.addField(moduleStrings.channelInfo.stageInstancePrivacy, localize('stagePrivacy', channel.stageInstance.privacyLevel.toString()), true);
        }
        if (channel.members && channel.members.size !== 0 && (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)) {
            let memberString = '';
            channel.members.forEach(m => {
                memberString = memberString + `<@${m.user.id}>, `;
            });
            memberString = memberString.substring(0, memberString.length - 2);
            embed.addField(moduleStrings.channelInfo.membersInChannel, memberString);
        }
        interaction.editReply({embeds: [embed]});
    },
    'role': async function (interaction) {
        const moduleStrings = interaction.client.configurations['info-commands']['strings'];
        const role = interaction.options.getRole('role', true);
        const embed = new MessageEmbed()
            .setTitle(localize('info-commands', 'information-about-role', {r: role.name}))
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .addField(moduleStrings.roleInfo.createdAt, `<t:${(role.createdAt.getTime() / 1000).toFixed(0)}:d>`, true)
            .addField(moduleStrings.roleInfo.position, role.position.toString(), true)
            .addField(moduleStrings.roleInfo.id, role.id, true)
            .addField(moduleStrings.roleInfo.name, role.name, true)
            .setColor(role.color || parseEmbedColor('GREEN'));
        if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (role.color) embed.addField(moduleStrings.roleInfo.color, role.hexColor, true);
        if (role.members) {
            embed.addField(moduleStrings.roleInfo.memberWithThisRoleCount, role.members.size.toString(), true);
            if (role.members.size <= 10 && role.members.size !== 0) {
                let memberstring = '';
                role.members.forEach(m => {
                    memberstring = memberstring + `<@${m.id}>, `;
                });
                memberstring = memberstring.substring(0, memberstring.length - 2);
                embed.addField(moduleStrings.roleInfo.memberWithThisRole, memberstring);
            }
        }
        let permissionstring = '';
        if (role.permissions.toArray().includes('ADMINISTRATOR')) permissionstring = 'ADMINISTRATOR';
        else {
            role.permissions.toArray().forEach(p => {
                permissionstring = permissionstring + `${p}, `;
            });
            permissionstring = permissionstring.substring(0, permissionstring.length - 2);
        }
        embed.addField(moduleStrings.roleInfo.permissions, '```' + permissionstring + '```');
        let features = '';
        if (role.hoist) features = features + `• ${localize('info-commands', 'hoisted')}\n`;
        if (role.mentionable) features = features + `• ${localize('info-commands', 'mentionable')}\n`;
        if (role.managed) features = features + `• ${localize('info-commands', 'managed')}\n`;
        embed.setDescription(features);
        interaction.editReply({embeds: [embed]});
    },
    'user': async function (interaction) {
        const moduleStrings = interaction.client.configurations['info-commands']['strings'];
        const member = interaction.options.getMember('user') || interaction.member;
        if (!member) return interaction.reply(embedType(moduleStrings['user_not_found'], {}, {ephemeral: true}));
        let birthday = null;
        let levelUserData = null;
        if (interaction.client.models['birthday']) {
            birthday = await interaction.client.models['birthday']['User'].findOne({
                where: {
                    id: member.user.id
                }
            });
        }
        if (interaction.client.models['levels']) {
            levelUserData = await interaction.client.models['levels']['User'].findOne({
                where: {
                    userID: member.user.id
                }
            });
        }

        const embed = new MessageEmbed()
            .setTitle(localize('info-commands', 'information-about-user', {u: formatDiscordUserName(member.user)}))
            .setColor(member.displayColor || parseEmbedColor('GREEN'))
            .setThumbnail(member.user.avatarURL({forceStatic: false}))
            .setFooter({text: interaction.client.strings.footer, iconURL: interaction.client.strings.footerImgUrl})
            .addField(moduleStrings.userinfo.tag, formatDiscordUserName(member.user), true)
            .addField(moduleStrings.userinfo.id, member.user.id, true)
            .addField(moduleStrings.userinfo.createdAt, `<t:${(member.user.createdAt.getTime() / 1000).toFixed(0)}:d> (<t:${(member.user.createdAt.getTime() / 1000).toFixed(0)}:R>)`, true)
            .addField(moduleStrings.userinfo.joinedAt, `<t:${(member.joinedAt.getTime() / 1000).toFixed(0)}:d> (<t:${(member.joinedAt.getTime() / 1000).toFixed(0)}:R>)`, true);
        if (!interaction.client.strings.disableFooterTimestamp) embed.setTimestamp();
        if (member.user.presence) embed.addField(moduleStrings.userinfo.currentStatus, member.user.presence.status, true);
        if (member.nickname) embed.addField(moduleStrings.userinfo.nickname, member.nickname, true);
        if (member.premiumSince) embed.addField(moduleStrings.userinfo.boosterSince, dateToDiscordTimestamp(member.premiumSince), true);
        if (member.displayColor) embed.addField(moduleStrings.userinfo.displayColor, member.displayHexColor, true);
        if (member.voice.channel) embed.addField(moduleStrings.userinfo.currentVoiceChannel, member.voice.channel.toString(), true);
        if (member.roles.highest) embed.addField(moduleStrings.userinfo.highestRole, `<@&${member.roles.highest.id}>`, true);
        if (member.roles.hoist) embed.addField(moduleStrings.userinfo.hoistRole, `<@&${member.roles.hoist.id}>`, true);
        if (birthday) {
            let dateString = `${birthday.day}.${birthday.month}${birthday.year ? `.${birthday.year}` : ''}`;
            if (birthday.year) {
                const age = new AgeFromDate(new Date(birthday.year, birthday.month - 1, birthday.day)).age;
                dateString = `[${dateString}](https://scnx.xyz/${interaction.client.locale === 'de' ? 'de/' : ''}custom-bot/age-calculator?age=${age} "${localize('birthdays', 'age-hover', {a: age})}")`;
            }
            embed.addField(moduleStrings.userinfo.birthday, dateString, true);
        }
        if (levelUserData) {
            embed.addField(moduleStrings.userinfo.xp, `${formatNumber(isMaxLevel(levelUserData.level, interaction.client) ? calculateLevelXP(interaction.client, interaction.client.configurations['levels']['config'].maximumLevel) : levelUserData.xp)}/${isMaxLevel(levelUserData.level, interaction.client) ? '∞' : formatNumber(calculateLevelXP(interaction.client, levelUserData.level))}`, true);
            embed.addField(moduleStrings.userinfo.level, displayLevel(levelUserData.level, interaction.client), true);
            embed.addField(moduleStrings.userinfo.messages, levelUserData.messages.toString(), true);
        }
        let permstring = '';
        member.permissions.toArray().forEach(p => {
            if (!member.permissions.toArray().includes('ADMINISTRATOR')) permstring = permstring + `${p}, `;
        });
        if (member.permissions.toArray().includes('ADMINISTRATOR')) permstring = 'ADMINISTRATOR  ';
        if (permstring !== '') permstring = permstring.substring(0, permstring.length - 2);
        else permstring = moduleStrings.userinfo.noPermissions;
        embed.addField(moduleStrings.userinfo.permissions, `\`\`\`${permstring}\`\`\``);
        interaction.editReply({
            embeds: [embed],
        });
    }
};

module.exports.config = {
    name: 'info',
    description: localize('info-commands', 'info-command-description'),

    options: [
        {
            type: 'SUB_COMMAND',
            name: 'user',
            description: localize('info-commands', 'command-userinfo-description'),
            options: [
                {
                    type: 'USER',
                    name: 'user',
                    required: false,
                    description: localize('info-commands', 'argument-userinfo-user-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'role',
            description: localize('info-commands', 'command-roleinfo-description'),
            options: [
                {
                    type: 'ROLE',
                    name: 'role',
                    required: true,
                    description: localize('info-commands', 'argument-roleinfo-role-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'channel',
            description: localize('info-commands', 'command-channelinfo-description'),
            options: [
                {
                    type: 'CHANNEL',
                    name: 'channel',
                    required: false,
                    description: localize('info-commands', 'argument-channelinfo-channel-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'server',
            description: localize('info-commands', 'command-serverinfo-description')
        }
    ]
};