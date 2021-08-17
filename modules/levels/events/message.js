const {embedType} = require('../../../src/functions/helpers');
const cooldown = new Set();

exports.run = async (client, msg) => {
    const {confDir} = require('./../../../main');
    const moduleConfig = require(`${confDir}/levels/config.json`);
    if (msg.author.bot) return;
    if (msg.guild.id !== client.guildID) return;
    if (msg.content.includes(client.config.prefix)) return;
    if (moduleConfig.blacklisted_channels.includes(msg.channel.id)) return;
    const xp = randomIntFromInterval(moduleConfig['min-xp'], moduleConfig['max-xp']);
    let user = await client.models['levels']['User'].findOne({
        where: {
            userID: msg.author.id
        }
    });
    if (!user) {
        user = await client.models['levels']['User'].create({
            userID: msg.author.id,
            messages: 0,
            xp: 0
        });
    }
    user.messages = user.messages + 1;
    const nextLevelXp = user.level * 750 + ((user.level - 1) * 500);
    user.xp = user.xp + xp;
    if (nextLevelXp <= user.xp) {
        user.level = user.level + 1;
        const channel = client.channels.cache.find(c => c.id === moduleConfig.level_up_channel_id);
        if (moduleConfig.reward_roles[user.level.toString()]) {
            const role = msg.guild.roles.cache.find(r => r.id === moduleConfig.reward_roles[user.level.toString()]);
            if (!role) return channel.send(...embedType(`${moduleConfig.level_up_message}\n\nError: Role with ID "${moduleConfig.reward_roles[user.level]}" could not be found.`, {
                '%mention%': `<@${msg.author.id}>`,
                '%newLevel%': user.level,
                '%tag%': msg.author.tag
            }));
            await msg.member.roles.add(role);
            if (channel) channel.send(...embedType(moduleConfig.level_up_message_with_reward, {
                '%mention%': `<@${msg.author.id}>`,
                '%newLevel%': user.level,
                '%role%': role.name,
                '%tag%': msg.author.tag
            }));
            else msg.channel.send(...embedType(moduleConfig.level_up_message_with_reward, {
                '%mention%': `<@${msg.author.id}>`,
                '%newLevel%': user.level,
                '%role%': role.name,
                '%tag%': msg.author.tag
            }));
        } else if (channel) channel.send(...embedType(moduleConfig.level_up_message, {
            '%mention%': `<@${msg.author.id}>`,
            '%newLevel%': user.level,
            '%tag%': msg.author.tag
        }));
        else msg.channel.send(...embedType(moduleConfig.level_up_message, {
            '%mention%': `<@${msg.author.id}>`,
            '%newLevel%': user.level,
            '%tag%': msg.author.tag
        }));
    }
    cooldown.add(msg.author.id);
    setTimeout(() => {
        cooldown.delete(msg.author.id);
    }, moduleConfig.cooldown);
    await user.save();
};

function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}