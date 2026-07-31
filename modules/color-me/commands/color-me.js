const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
const {embedType, dateToDiscordTimestamp} = require('../../../src/functions/helpers');
const { Constants } = require('discord.js');

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'manage': async function (interaction) {
        let roleIcon;
        let iconW = true;
        let colorfulW = true;
        if (interaction.options.getAttachment('icon') !== null) {
            if (client.guild.features.includes('ROLE_ICONS')) {
                roleIcon = interaction.options.getAttachment('icon').url;
            } else {
                roleIcon = null;
                iconW = false;
            }
        }
        const moduleConf = interaction.client.configurations['color-me']['config'];
        const moduleStrings = interaction.client.configurations['color-me']['strings'];
        const moduleModel = interaction.client.models['color-me']['Role'];

        const multiColor = client.guild.features.includes('ENHANCED_ROLE_COLORS') && moduleConf['allowEnhancedRoleColors'];
        if (!multiColor && (interaction.options.getString('secondary-color') !== null || interaction.options.getBoolean('holographic'))) {
            colorfulW = false;
        }

        const pos = moduleConf.rolePosition
            ? interaction.guild.roles.resolve(moduleConf.rolePosition).position
            : 0;

        const {
            allowed,
            cooldownModel
        } = await cooldown(moduleConf['updateCooldown'] * 3600000, interaction.user.id);
        if (!allowed) {
            await interaction.editReply(embedType(moduleStrings['cooldown'], {
                '%cooldown%': dateToDiscordTimestamp(new Date(cooldownModel.timestamp.getTime() + moduleConf['updateCooldown'] * 3600000), 'R')
            }));
            return;
        }

        let role = await moduleModel.findOne({
            attributes: ['roleID'],
            raw: true,
            where: {
                userID: interaction.user.id
            }
        });
        const {
            roleColor: primaryColor,
            cancel
        } = await color(interaction.options.getString('primary-color'), interaction, moduleStrings);

        let secondaryColor, cancelSec;
        if (multiColor) {
            let {
                roleColor: secondaryColorTemp,
                cancel: cancelSecTemp
            } = await color(interaction.options.getString('secondary-color'), interaction, moduleStrings);
            secondaryColor = secondaryColorTemp;
            cancelSec = cancelSecTemp;
        } else {
            secondaryColor = null;
        }
        if (cancel || cancelSec) return;
        const isHolographic = interaction.options.getBoolean('holographic') && multiColor;
        if (role) {
            role = role.roleID;
            if (interaction.guild.roles.cache.find(r => r.id === role)) {
                role = interaction.guild.roles.resolve(role);
                await role.edit(
                    {
                        name: interaction.options.getString('name'),
                        colors: isHolographic ? {
                            primaryColor: Constants.HolographicStyle.Primary,
                            secondaryColor: Constants.HolographicStyle.Secondary,
                            tertiaryColor: Constants.HolographicStyle.Tertiary
                        } : {
                            primaryColor: primaryColor,
                            secondaryColor: secondaryColor
                        },
                        icon: roleIcon,
                        reason: localize('color-me', 'edit-log-reason', {
                            user: interaction.user.username
                        })
                    }
                );
                await moduleModel.update({
                    userID: interaction.user.id,
                    roleID: role.id,
                    name: role.name,
                    primaryColor: role.colors.primaryColor,
                    secondaryColor: role.colors.secondaryColor,
                    holo: !!role.colors.tertiaryColor,
                    timestamp: new Date()
                }, {
                    where: {
                        userID: interaction.user.id
                    }
                });
                if (iconW && colorfulW) {
                    await interaction.editReply(embedType(moduleStrings['updated'], {}));
                } else {
                    await interaction.editReply(embedType(moduleStrings['updatedLimited'], {}));
                }
            } else {
                if (interaction.guild.roles.cache.size >= 250) {
                    await interaction.editReply(embedType(moduleStrings['roleLimit'], {}));
                    return;
                }
                role = await interaction.guild.roles.create(
                    {
                        name: interaction.options.getString('name'),
                        colors: isHolographic ? {
                            primaryColor: Constants.HolographicStyle.Primary,
                            secondaryColor: Constants.HolographicStyle.Secondary,
                            tertiaryColor: Constants.HolographicStyle.Tertiary
                        } : {
                            primaryColor: primaryColor,
                            secondaryColor: secondaryColor
                        },
                        icon: roleIcon,
                        hoist: moduleConf.listRoles,
                        permissions: '',
                        position: pos,
                        mentionable: false,
                        reason: localize('color-me', 'create-log-reason', {
                            user: interaction.user.username
                        })
                    });
                await moduleModel.update({
                    userID: interaction.user.id,
                    roleID: role.id,
                    name: role.name,
                    primaryColor: role.colors.primaryColor,
                    secondaryColor: role.colors.secondaryColor,
                    holo: !!role.colors.tertiaryColor,
                    timestamp: new Date()
                }, {
                    where: {
                        userID: interaction.user.id
                    }
                });
                if (!interaction.member.roles.cache.has(role)) {
                    await interaction.member.roles.add(role);
                }
                if (iconW && colorfulW) {
                    await interaction.editReply(embedType(moduleStrings['updated'], {}));
                } else {
                    await interaction.editReply(embedType(moduleStrings['updatedLimited'], {}));
                }
            }
        } else {
            try {
                role = await interaction.guild.roles.create(
                    {
                        name: interaction.options.getString('name'),
                        colors: isHolographic ? {
                            primaryColor: Constants.HolographicStyle.Primary,
                            secondaryColor: Constants.HolographicStyle.Secondary,
                            tertiaryColor: Constants.HolographicStyle.Tertiary
                        } : {
                            primaryColor: primaryColor,
                            secondaryColor: secondaryColor
                        },
                        icon: roleIcon,
                        hoist: moduleConf.listRoles,
                        permissions: '',
                        position: pos,
                        mentionable: false,
                        reason: localize('color-me', 'create-log-reason', {
                            user: interaction.user.username
                        })
                    }
                );
                await moduleModel.create({
                    userID: interaction.user.id,
                    roleID: role.id,
                    name: role.name,
                    primaryColor: role.colors.primaryColor,
                    secondaryColor: role.colors.secondaryColor,
                    holo: !!role.colors.tertiaryColor,
                    timestamp: new Date()
                });
                await interaction.member.roles.add(role);
                if (iconW && colorfulW) {
                    await interaction.editReply(embedType(moduleStrings['created'], {}));
                } else {
                    await interaction.editReply(embedType(moduleStrings['createdNoIcon'], {}));
                }
            } catch (e) {
                if (e && e.code === 30005) {
                    await interaction.editReply(embedType(moduleStrings['roleLimit'], {}));
                    return;
                }
                client.logger.error(`color-me: failed to create role for user ${interaction.user.id} in guild ${interaction.guild.id}: ${e && e.stack ? e.stack : e}`);
                throw e;
            }

        }
    },


    'remove': async function (interaction) {
        const moduleStrings = interaction.client.configurations['color-me']['strings'];
        const moduleModel = interaction.client.models['color-me']['Role'];
        let role = await moduleModel.findOne({
            attributes: ['roleID'],
            raw: true,
            where: {
                userID: interaction.member.id
            }
        });
        if (role) {
            role = role.roleID;
            if (interaction.guild.roles.cache.find(r => r.id === role)) {
                role = interaction.guild.roles.resolve(role);
                await role.delete(localize('color-me', 'delete-manual-log-reason', {
                    user: interaction.member.user.username
                }));
                await interaction.editReply(await embedType(moduleStrings['removed'], {}));
            }
        }
    }
};

module.exports.config = {
    name: 'color-me',
    description: localize('color-me', 'command-description'),
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'manage',
            description: localize('color-me', 'manage-subcommand-description'),
            options: [
                {
                    type: 'STRING',
                    required: true,
                    name: 'name',
                    description: localize('color-me', 'name-option-description')
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'primary-color',
                    description: localize('color-me', 'primary-color-option-description')
                },
                {
                    type: 'STRING',
                    required: false,
                    name: 'secondary-color',
                    description: localize('color-me', 'secondary-color-option-description')
                },
                {
                    type: 'BOOLEAN',
                    required: false,
                    name: 'holographic',
                    description: localize('color-me', 'holographic-option-description')
                },
                {
                    type: 'ATTACHMENT',
                    required: false,
                    name: 'icon',
                    description: localize('color-me', 'icon-option-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'remove',
            description: localize('color-me', 'remove-subcommand-description'),
            options: [
                {
                    type: 'BOOLEAN',
                    required: true,
                    name: 'confirm',
                    description: localize('color-me', 'confirm-option-remove-description')
                }
            ]
        }
    ]
};

/**
 * Gets a color from the String of a command option
 * @returns {Promise<{roleColor: string|number, cancel: boolean}>}
 */
async function color(colorString, interaction, moduleStrings) {
    if (colorString) {
        let roleColor = colorString;
        if (!roleColor.startsWith('#')) {
            roleColor = '#' + roleColor;
        }
        if (!(/^#[0-9A-F]{6}$/i).test(roleColor)) {
            await interaction.editReply(embedType(moduleStrings['invalidColor'], {}));
            return {
                roleColor,
                cancel: true
            };
        }
        return {
            roleColor,
            cancel: false
        };
    }
    return {
        roleColor: 0x000000,
        cancel: false
    };
}

// Exported for unit testing of the color-validation logic.
module.exports.color = color;

/**
 ** Function to handle the cooldown stuff
 * @private
 * @param {number} duration The duration of the cooldown (in ms)
 * @param {string} userId Id of the User
 * @returns {Promise<{allowed: boolean, cooldownModel: object|null}>}
 */
async function cooldown(duration, userId) {
    const model = client.models['color-me']['Role'];
    const cooldownModel = await model.findOne({
        where: {
            userID: userId
        }
    });
    if (cooldownModel && cooldownModel.timestamp) {
        return {
            allowed: cooldownModel.timestamp.getTime() + duration <= Date.now(),
            cooldownModel
        };
    }
    return {
        allowed: true,
        cooldownModel: null
    };
}