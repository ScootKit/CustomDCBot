const {localize} = require('../../../src/functions/localize');
const {client} = require('../../../main');
let roleColor;

module.exports.beforeSubcommand = async function (interaction) {
    await interaction.deferReply({ephemeral: true});
};

module.exports.subcommands = {
    'manage': async function (interaction) {
        const moduleConf = interaction.client.configurations['color-me']['config'];
        const moduleStrings = interaction.client.configurations['color-me']['strings'];
        if (await cooldown(moduleConf['updateCooldown'] * 3600000, interaction.user.id)) {
            let role = await interaction.client.models['color-me']['Role'].findOne({
                attributes: ['roleID'],
                raw: true,
                where: {
                    userID: interaction.user.id
                }
            });
            if (role) {
                role = role.roleID;
                color(interaction);
                if (interaction.guild.roles.cache.find(r => r.id === role)) {
                    role = interaction.guild.roles.resolve(role);
                    role.edit(
                        {
                            name: interaction.options.getString('name'),
                            color: roleColor,
                            reason: localize('color-me', 'edit-log-reason', {
                                user: interaction.user.username
                            })
                        }
                    );
                    await interaction.editReply(moduleStrings.updated);
                } else {
                    if (interaction.guild.roles.cache.size < 250) {

                        role = await interaction.guild.roles.create(
                            {
                                name: interaction.options.getString('name'),
                                color: roleColor,
                                hoist: moduleConf.listRoles,
                                permissions: '',
                                position: 0,
                                mentionable: false,
                                reason: localize('color-me', 'create-log-reason', {
                                    user: interaction.user.username
                                })
                            }
                        );
                    } else {
                        await interaction.editReply(moduleStrings.roleLimit);
                    }
                    await interaction.client.models['color-me']['Role'].update({
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
                    await interaction.editReply(moduleStrings.updated);
                }
            } else {
                color(interaction);
                try {
                    role = await interaction.guild.roles.create(
                        {
                            name: interaction.options.getString('name'),
                            color: roleColor,
                            hoist: moduleConf.listRoles,
                            permissions: '',
                            position: 0,
                            mentionable: false,
                            reason: localize('color-me', 'create-log-reason', {
                                user: interaction.user.username
                            })
                        }
                    );
                    await interaction.client.models['color-me']['Role'].create({
                        userID: interaction.user.id,
                        roleID: role.id,
                        name: role.name,
                        color: role.hexColor,
                        timestamp: new Date()
                    });
                    await interaction.member.roles.add(role);
                    await interaction.editReply(moduleStrings.created);
                } catch (e) {
                    await interaction.editReply(moduleStrings.roleLimit);
                }

            }
        } else {
            await interaction.editReply(moduleStrings.cooldown);
        }
    },


    'remove': async function (interaction) {
        const moduleStrings = interaction.client.configurations['color-me']['strings'];
        let role = await interaction.client.models['color-me']['Role'].findOne({
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
                await interaction.editReply(moduleStrings.removed);
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
 */
function color(interaction) {
    if (interaction.options.getString('color')) {
        roleColor = interaction.options.getString('color');
        if (!roleColor.startsWith('#')) {
            roleColor = '#' + roleColor;
        }
    } else {
        roleColor = 'DEFAULT';
    }
}

/**
 * Function to handle the cooldown stuff
 * @private
 * @param {integer} duration The duration of the cooldown (in ms)
 * @param {userId} userId Id of the User
 * @returns {Promise<boolean>}
 */
async function cooldown (duration, userId) {
    const model = client.models['color-me']['Role'];
    const cooldownModel = await model.findOne({
        where: {
            userId: userId
        }
    });
    if (cooldownModel) {
        // check cooldown duration
        return cooldownModel.timestamp.getTime() + duration <= Date.now();
    } else {
        return true;
    }
}