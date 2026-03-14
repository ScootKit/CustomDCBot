const {
    truncate,
    formatDate,
    parseEmbedColor
} = require('../functions/helpers');
const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const {localize} = require('../functions/localize');

const SELECT_MENU_MAX = 25;

module.exports.run = async function (interaction) {
    const modules = {};
    for (const command of interaction.client.commands) {
        if (command.module && !interaction.client.modules[command.module].enabled) continue;
        if (typeof command.disabled === 'function' && command.disabled(interaction.client)) continue;
        if (!modules[command.module || 'none']) modules[command.module || 'none'] = [];
        modules[command.module || 'none'].push(command);
    }

    const moduleKeys = Object.keys(modules);
    const allSelectOptions = [];
    for (const mod of moduleKeys) {
        const label = mod === 'none'
            ? interaction.client.strings.helpembed.build_in
            : (interaction.client.modules[mod]['config']['humanReadableName'][interaction.client.locale] ||
                interaction.client.modules[mod]['config']['humanReadableName']['en'] || mod);
        allSelectOptions.push({
            label: truncate(label, 100),
            value: mod,
            description: mod !== 'none'
                ? truncate(interaction.client.modules[mod]['config']['description'][interaction.client.locale] ||
                    interaction.client.modules[mod]['config']['description']['en'] || '', 100)
                : localize('help', 'built-in-description'),
            emoji: mod === 'none' ? '⚙️' : '📦'
        });
    }

    const selectPages = [];
    for (let i = 0; i < allSelectOptions.length; i = i + SELECT_MENU_MAX) {
        selectPages.push(allSelectOptions.slice(i, i + SELECT_MENU_MAX));
    }
    let currentSelectPage = 0;

    /**
     * Build the overview using Components V2
     * @private
     * @param {number} page Current select menu page index
     * @returns {Array} Array of V2 component objects
     */
    function buildOverviewComponents(page) {
        const headerContainer = new ContainerBuilder()
            .setAccentColor(parseEmbedColor('GREEN'));

        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${interaction.client.strings.helpembed.title.replaceAll('%site%', '')}\n${interaction.client.strings.helpembed.description}`)
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(interaction.client.user.displayAvatarURL())
            );
        headerContainer.addSectionComponents(headerSection);
        headerContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        headerContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${localize('help', 'modules-overview')}`));

        let moduleList = '';
        for (const mod of moduleKeys) {
            const label = mod === 'none'
                ? interaction.client.strings.helpembed.build_in
                : (interaction.client.modules[mod]['config']['humanReadableName'][interaction.client.locale] ||
                    interaction.client.modules[mod]['config']['humanReadableName']['en'] || mod);
            const cmdNames = modules[mod].map(c => `\`/${c.name}\``).join(', ');
            moduleList = moduleList + `${mod === 'none' ? '⚙️' : '📦'} **${label}**: ${truncate(cmdNames, 200)}\n`;
        }
        headerContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(moduleList, 4000)));
        headerContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        headerContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${localize('help', 'select-module-hint')}`));

        const placeholder = selectPages.length > 1
            ? localize('help', 'select-module-placeholder') + ` (${page + 1}/${selectPages.length})`
            : localize('help', 'select-module-placeholder');

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help-module-select')
                .setPlaceholder(truncate(placeholder, 150))
                .addOptions(selectPages[page])
        );
        headerContainer.addActionRowComponents(selectRow);

        if (selectPages.length > 1) {
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help-page-prev')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('help-page-next')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= selectPages.length - 1)
            );
            headerContainer.addActionRowComponents(navRow);
        }

        const result = [headerContainer];

        if (!interaction.client.strings['putBotInfoOnLastSite'] || !interaction.client.strings['disableHelpEmbedStats']) {
            const infoContainer = new ContainerBuilder()
                .setAccentColor(parseEmbedColor('BLUE'));

            if (!interaction.client.strings['putBotInfoOnLastSite']) {
                infoContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### ${localize('help', 'bot-info-titel')}\n${localize('help', 'bot-info-description', {g: interaction.guild.name})}`
                ));
            }
            if (!interaction.client.strings['disableHelpEmbedStats']) {
                if (!interaction.client.strings['putBotInfoOnLastSite']) {
                    infoContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
                }
                infoContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### ${localize('help', 'stats-title')}\n${localize('help', 'stats-content', {
                        am: Object.keys(interaction.client.modules).length,
                        rc: interaction.client.commands.length,
                        v: interaction.client.scnxSetup ? interaction.client.scnxData.bot.version : null,
                        si: interaction.client.scnxSetup ? interaction.client.scnxData.bot.instanceID : null,
                        pl: interaction.client.scnxSetup ? localize('scnx', 'plan-' + interaction.client.scnxData.plan) : null,
                        lr: formatDate(interaction.client.readyAt),
                        lR: formatDate(interaction.client.botReadyAt)
                    })}`
                ));
            }
            result.push(infoContainer);
        }

        return result;
    }

    /**
     * Build a module detail view using Components V2
     * @private
     * @param {string} mod Module key
     * @returns {Promise<Array>} Array of V2 component objects
     */
    async function buildModuleComponents(mod) {
        const label = mod === 'none'
            ? interaction.client.strings.helpembed.build_in
            : (interaction.client.modules[mod]['config']['humanReadableName'][interaction.client.locale] ||
                interaction.client.modules[mod]['config']['humanReadableName']['en'] || mod);
        const description = mod !== 'none'
            ? (interaction.client.modules[mod]['config']['description'][interaction.client.locale] ||
                interaction.client.modules[mod]['config']['description']['en'] || '')
            : '';

        const container = new ContainerBuilder()
            .setAccentColor(parseEmbedColor('GREEN'));

        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${mod === 'none' ? '⚙️' : '📦'} ${label}${description ? '\n*' + description + '*' : ''}`)
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(interaction.client.user.displayAvatarURL())
            );
        container.addSectionComponents(headerSection);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        for (let d of modules[mod]) {
            let content = `### \`/${d.name}\`\n${d.description}`;
            d = {...d};
            if (typeof d.options === 'function') d.options = await d.options(interaction.client);
            if ((d.options || []).filter(o => o.type === 'SUB_COMMAND' || o.type === 'SUB_COMMANDS_GROUP').length !== 0) {
                for (const c of d.options) {
                    content = content + formatSubCommand(c, '\n');
                }
            }
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(truncate(content, 4000)));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        const pageForMod = selectPages.findIndex(p => p.some(o => o.value === mod));
        const selectPage = pageForMod !== -1 ? pageForMod : 0;

        const placeholder = selectPages.length > 1
            ? localize('help', 'select-module-placeholder') + ` (${selectPage + 1}/${selectPages.length})`
            : localize('help', 'select-module-placeholder');

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help-module-select')
                .setPlaceholder(truncate(placeholder, 150))
                .addOptions(selectPages[selectPage])
        );
        container.addActionRowComponents(selectRow);

        const navRow = new ActionRowBuilder();
        if (selectPages.length > 1) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('help-page-prev')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(selectPage === 0),
                new ButtonBuilder()
                    .setCustomId('help-page-next')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(selectPage >= selectPages.length - 1)
            );
        }
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('help-overview')
                .setLabel(localize('help', 'back-to-overview'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🏠')
        );
        container.addActionRowComponents(navRow);

        return [container];
    }

    /**
     * Format a subcommand for display
     * @private
     * @param {Object} command Subcommand object
     * @param {String} prefix Line prefix
     * @returns {string}
     */
    function formatSubCommand(command, prefix = '\n') {
        let result = `${prefix}> • \`${command.name}\`: ${command.description}`;
        if (command.type === 'SUB_COMMAND_GROUP' && (command.options || []).filter(o => o.type === 'SUB_COMMAND').length !== 0) {
            for (const c of command.options) {
                result = result + formatSubCommand(c, '\n');
            }
        }
        return result;
    }

    const overviewComponents = buildOverviewComponents(currentSelectPage);
    const m = await interaction.reply({
        components: overviewComponents,
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
    });

    const collector = m.createMessageComponentCollector({time: 120000});
    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) return i.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('helpers', 'you-did-not-run-this-command')
        });

        if (i.isStringSelectMenu() && i.customId === 'help-module-select') {
            const selectedModule = i.values[0];
            const moduleComponents = await buildModuleComponents(selectedModule);
            await i.update({
                components: moduleComponents,
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (i.isButton() && i.customId === 'help-overview') {
            await i.update({
                components: buildOverviewComponents(currentSelectPage),
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (i.isButton() && i.customId === 'help-page-prev') {
            if (currentSelectPage > 0) currentSelectPage--;
            await i.update({
                components: buildOverviewComponents(currentSelectPage),
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (i.isButton() && i.customId === 'help-page-next') {
            if (currentSelectPage < selectPages.length - 1) currentSelectPage++;
            await i.update({
                components: buildOverviewComponents(currentSelectPage),
                flags: MessageFlags.IsComponentsV2
            });
        }
    });

    collector.on('end', () => {
        m.edit({
            components: buildOverviewComponents(currentSelectPage),
            flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
    });
};

module.exports.config = {
    name: 'help',
    description: localize('help', 'command-description')
};