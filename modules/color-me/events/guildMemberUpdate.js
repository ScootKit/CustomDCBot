const {localize} = require('../../../src/functions/localize');
const {Constants} = require('discord.js');
let pos;

module.exports.run = async function (client, oldGuildMember, newGuildMember) {

    if (!client.botReadyAt) return;
    if (newGuildMember.guild.id !== client.guild.id) return;

    const moduleConf = client.configurations['color-me']['config'];
    if (moduleConf.rolePosition) {
        pos = newGuildMember.guild.roles.resolve(moduleConf.rolePosition).position;
    } else {
        pos = 0;
    }

    if (moduleConf.removeOnUnboost) {
        if (oldGuildMember.premiumSince && !newGuildMember.premiumSince) {
            let role = await client.models['color-me']['Role'].findOne({
                attributes: ['roleID'],
                raw: true,
                where: {
                    userID: newGuildMember.id
                }
            });
            if (role) {
                role = role.roleID;
                if (newGuildMember.guild.roles.cache.find(r => r.id === role)) {
                    role = newGuildMember.guild.roles.resolve(role);
                    role.delete(localize('color-me', 'delete-unboost-log-reason', {
                        user: newGuildMember.user.username
                    }));
                }
            }
        }
    }
    if (moduleConf.recreateRole) {
        if (!oldGuildMember.premiumSince && newGuildMember.premiumSince) {
            const data = await client.models['color-me']['Role'].findOne({
                attributes: ['roleID', 'name', 'primaryColor', 'secondaryColor', 'holo'],
                raw: true,
                where: {
                    userID: newGuildMember.id
                }
            });
            if (data) {
                let role = data.roleID;
                const name = data.name;
                const primaryColor = data.primaryColor;
                const secondaryColor = data.secondaryColor;
                const isHolographic = data.holo && client.guild.features.includes('ENHANCED_ROLE_COLORS');
                if (!newGuildMember.guild.roles.cache.find(r => r.id === role)) {
                    role = await client.guild.roles.create(
                        {
                            name: name,
                            colors: isHolographic ? {
                                primaryColor: Constants.HolographicStyle.Primary,
                                secondaryColor: Constants.HolographicStyle.Secondary,
                                tertiaryColor: Constants.HolographicStyle.Tertiary
                            } : {
                                primaryColor: primaryColor,
                                secondaryColor: client.guild.features.includes('ENHANCED_ROLE_COLORS') ? secondaryColor : null
                            },
                            hoist: moduleConf.listRoles,
                            position: pos,
                            permissions: '',
                            mentionable: false,
                            reason: localize('color-me', 'create-log-reason', {
                                user: newGuildMember.user.username
                            })
                        }
                    );
                    await client.models['color-me']['Role'].update({
                        roleID: role.id
                    }, {
                        where: {
                            userID: newGuildMember.user.id
                        }
                    });
                }
            }
        }
    }
};