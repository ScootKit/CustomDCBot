const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
const {embedType, dateToDiscordTimestamp} = require('../../../src/functions/helpers');

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'manage': async function (interaction) {
        let roleIcon;
        let iconW = true;
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
        if (role) {
            role = role.roleID;
            const {
                roleColor,
                cancel
            } = await color(interaction, moduleStrings);
            if (cancel) return;
            if (interaction.guild.roles.cache.find(r => r.id === role)) {
                role = interaction.guild.roles.resolve(role);
                role.edit(
                    {
                        name: interaction.options.getString('name'),
                        color: roleColor,
                        icon: roleIcon,
                        reason: localize('color-me', 'edit-log-reason', {
                            user: interaction.user.username
                        })
                    }
                );
                if (iconW) {
                    await interaction.editReply(embedType(moduleStrings['updated'], {}));
                } else {
                    await interaction.editReply(embedType(moduleStrings['updatedNoIcon'], {}));
                }
            } else {
                if (interaction.guild.roles.cache.size >= 250) {
                    await interaction.editReply(embedType(moduleStrings['roleLimit'], {}));
                    return;
                }
                role = await interaction.guild.roles.create(
                    {
                        name: interaction.options.getString('name'),
                        color: roleColor,
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
                await moduleModel.update({
                    userID: interaction.user.id,
                    roleID: role.id,
                    name: role.name,
                    color: role.hexColor,
                    timestamp: new Date()
                }, {
                    where: {
                        userID: interaction.user.id
                    }
                });
                if (!interaction.member.roles.cache.has(role)) {
                    await interaction.member.roles.add(role);
                }
                if (iconW) {
                    await interaction.editReply(embedType(moduleStrings['updated'], {}));
                } else {
                    await interaction.editReply(embedType(moduleStrings['updatedNoIcon'], {}));
                }
            }
        } else {
            const {
                roleColor,
                cancel
            } = await color(interaction, moduleStrings);
            if (cancel) return;
            try {
                role = await interaction.guild.roles.create(
                    {
                        name: interaction.options.getString('name'),
                        color: roleColor,
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
                    color: role.hexColor,
                    timestamp: new Date()
                });
                await interaction.member.roles.add(role);
                if (iconW) {
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
                role.delete(localize('color-me', 'delete-manual-log-reason', {
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
                    name: 'color',
                    description: localize('color-me', 'color-option-description')
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
async function color(interaction, moduleStrings) {
    if (interaction.options.getString('color')) {
        let roleColor = interaction.options.getString('color');
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
        roleColor: 0xF1C40F,
        cancel: false
    };
}

// Exported for unit testing of the colour-validation logic.
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