/**
 * Functions to make your live easier
 * @module Helpers
 */

const {
    ChannelType,
    ComponentType,
    MessageEmbed,
    MessageAttachment,
    PermissionFlagsBits,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    FileBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const {localize} = require('./localize');
const {PrivatebinClient} = require('@pixelfactory/privatebin');
const privatebin = new PrivatebinClient('https://paste.scootkit.com');
const isoCrypto = require('isomorphic-webcrypto');
const {encode} = require('bs58');
const crypto = require('crypto');
const {client} = require('../../main');

/**
 * Will loop asynchrony through every object in the array
 * @deprecated Since version v3.0.0. Will be deleted in v3.1.0. Use for(const value of array) instead.
 * @param  {Array} array Array of objects
 * @param  {function(object, number, array)} callback Function that gets executed on every array (object, index in the array, array)
 * @return {Promise}
 */
module.exports.asyncForEach = async function (array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
};

/**
 * Formates a Discord username (either #tag or username)
 * @param {User} userData User to format
 * @returns {string}
 */
function formatDiscordUserName(userData) {
    if (userData.discriminator === '0') return ((client.strings || {addAtToUsernames: false}).addAtToUsernames ? '@' : '') + userData.username;
    return userData.tag || (userData.username + '#' + userData.discriminator);
}

module.exports.formatDiscordUserName = formatDiscordUserName;

/**
 * Safely sets footer on an embed, handling null/undefined values
 * @param {MessageEmbed} embed Embed to set footer on
 * @param {Client} client Discord client instance
 * @param {String} customText Optional custom footer text (overrides client.strings.footer)
 * @param {String} customIconURL Optional custom footer icon URL (overrides client.strings.footerImgUrl)
 * @returns {MessageEmbed} The embed with footer set (if valid values exist)
 */
function safeSetFooter(embed, client, customText = null, customIconURL = null) {
    const footerText = customText || (client.strings && client.strings.footer) || null;
    const footerIconURL = customIconURL || (client.strings && client.strings.footerImgUrl) || null;

    // Only set footer if we have valid text (Discord.js requires text to be non-empty)
    if (footerText && footerText.trim().length > 0) {
        embed.setFooter({
            text: footerText,
            iconURL: footerIconURL
        });
    }

    return embed;
}

module.exports.safeSetFooter = safeSetFooter;

/**
 * Replaces every argument with a string
 * @param {Object<String>} args Arguments to replace
 * @param {String} input Input
 * @param {Boolean} returnNull Allows returning null if input is null
 * @returns {String}
 * @private
 */
function inputReplacer(args, input, returnNull = false) {
    if (returnNull && !input) return null;
    else if (!input) input = '';
    if (typeof args !== 'object') return input;
    for (const arg in args) {
        if (typeof args[arg] !== 'string' && typeof args[arg] !== 'number') args[arg] = '';
        input = (input || '').replaceAll(arg, args[arg]);
    }
    if (returnNull && !input) return null;
    return input;
}

function getGlobalArgs() {
    if (!client || !client.user) return {};
    const guild = client.guild;
    const globalArgs = {
        '%botName%': client.user.displayName || client.user.username,
        '%botID%': client.user.id,
        '%botAvatar%': client.user.displayAvatarURL() || '',
        '%botTag%': client.user.tag,
        '%botMention%': client.user.toString()
    };
    if (guild) {
        globalArgs['%guildName%'] = guild.name;
        globalArgs['%guildID%'] = guild.id;
        globalArgs['%guildIcon%'] = guild.iconURL() || '';
    }
    return globalArgs;
}

module.exports.inputReplacer = inputReplacer;

const colors = {
    'YELLOW': 0xF1C40F,
    'GREEN': 0x2ECC71,
    'GOLD': 0xF1C40F,
    'PURPLE': 0x9B59B6,
    'LUMINOUS_VIVID_PINK': 0xE91E63,
    'FUCHSIA': 0xEB459E,
    'ORANGE': 0xE67E22,
    'DARK_AQUA': 0x11806A,
    'DARK_GREEN': 0x1F8B4C,
    'DARK_BLUE': 0x206694,
    'DARK_VIVID_PINK': 0xAD1457,
    'LIGHT_GREY': 0xBCC0C0,
    'GREYPLE': 0x99AAB5,
    'DARK_BUT_NOT_BLACK': 0x2C2F33,
    'NOT_QUITE_BLACK': 0x23272A,
    'DARK_NAVY': 0x2C3E50,
    'DARK_GOLD': 0xC27C0E,
    'DARK_RED': 0x992D22,
    'DARKER_GREY': 0x7F8C8D,
    'DARK_GREY': 0x979C9F,
    'DARK_ORANGE': 0xA84300,
    'DARK_PURPLE': 0x71368A,
    'GREY': 0x95A5A6,
    'NAVY': 0x34495E,
    'BLURPLE': 0x5865F2,
    'BLUE': 0x3498DB,
    'AQUA': 0x1ABC9C,
    'WHITE': 0xFFFFFF,
    'RED': 0xE74C3C
};

function parseColor(color) {
    if (colors[color]) return colors[color];
    if (typeof color === 'number') return color;
    if (typeof color === 'string') {
        if (color.startsWith('#')) return parseInt(color.replaceAll('#', ''), 16);
        return parseInt(color, 16);
    }
    return color;
}

module.exports.parseEmbedColor = parseColor;

/**
 * Will turn an object or string into embeds
 * @param  {string|array} input Input in the configuration file
 * @param  {Object} args Object of variables to replace
 * @param  {Object} optionsToKeep [BaseMessageOptions](https://discord.js.org/#/docs/main/stable/typedef/BaseMessageOptions) to keep
 * @param {Array<ActionRow>} mergeComponentsRows ActionRows to be merged with custom rows
 * @author Simon Csaba <mail@scderox.de>
 * @return {object} Returns [MessageOptions](https://discord.js.org/#/docs/main/stable/typedef/MessageOptions)
 */
function embedType(input, args = {}, optionsToKeep = {}, mergeComponentsRows = []) {
    args = {...getGlobalArgs(), ...args};
    if (!optionsToKeep.allowedMentions) {
        optionsToKeep.allowedMentions = {parse: ['users', 'roles']};
        if (client.config.disableEveryoneProtection) optionsToKeep.allowedMentions.parse.push('everyone');
    }
    if (typeof input === 'string') {
        optionsToKeep.content = inputReplacer(args, input);
        return optionsToKeep;
    }
    const schemaVersion = input['_schema'] || 'v2';
    if (schemaVersion === 'v2') return embedTypeSchemaV2(input, args, optionsToKeep, mergeComponentsRows);
    if (schemaVersion === 'v4') return embedTypeSchemaV4(input, args, optionsToKeep, mergeComponentsRows);

    optionsToKeep.embeds = [];
    for (const embedData of input.embeds || []) {
        if (client.scnxSetup) embedData.footer = require('./scnx-integration').verifySchemaV3Embed(client, embedData.footer);
        let footer = null;
        if (!embedData.footer?.disabled) {
            const footerText = inputReplacer(args, embedData.footer?.text, true) || (client.strings && client.strings.footer);
            const footerIconURL = embedData.footer?.iconURL || (client.strings && client.strings.footerImgUrl);
            // Only create footer object if we have valid text
            if (footerText && footerText.trim().length > 0) {
                footer = {
                    text: footerText,
                    iconURL: footerIconURL
                };
            }
        }
        const fields = [];

        for (const fieldData of embedData.fields || []) fields.push({
            name: inputReplacer(args, fieldData.name, true) || '\u200B',
            value: inputReplacer(args, fieldData.value, true) || '\u200B',
            inline: fieldData.inline
        });

        const embed = new MessageEmbed({
            title: inputReplacer(args, embedData.title, true),
            description: inputReplacer(args, embedData.description, true),
            color: parseColor(embedData.color),
            thumbnail: embedData.thumbnailURL ? {url: inputReplacer(args, embedData.thumbnailURL)} : null,
            image: embedData.imageURL ? {url: inputReplacer(args, embedData.imageURL)} : null,
            timestamp: (embedData.footer?.hideTime || embedData.footer?.disabled || client.strings.disableFooterTimestamp) ? null : new Date(),
            author: embedData.author?.name ? {
                name: inputReplacer(args, embedData.author.name),
                iconURL: inputReplacer(args, embedData.author.imageURL, null),
                url: inputReplacer(args, embedData.author.url, null)
            } : null,
            footer,
            fields
        });
        optionsToKeep.embeds.push(embed);
    }

    optionsToKeep.files = [...(optionsToKeep.files || [])];
    for (const url of input.attachmentURLs || []) {
        optionsToKeep.files.push({attachment: url});
    }

    if (optionsToKeep.components) optionsToKeep.components = optionsToKeep.components.map(c => (typeof c.toJSON === 'function' ? c.toJSON() : c)); // polyfill for djs migration
    if (!optionsToKeep.components && client.scnxSetup) optionsToKeep.components = require('./scnx-integration').returnSCNXComponents(input, mergeComponentsRows, args);
    if (!optionsToKeep.content) optionsToKeep.content = inputReplacer(args, input['content'], true);

    return optionsToKeep;
}

function embedTypeSchemaV2(input, args = {}, optionsToKeep = {}, mergeComponentsRows = []) {
    if (!optionsToKeep.allowedMentions) {
        optionsToKeep.allowedMentions = {parse: ['users', 'roles']};
        if (client.config.disableEveryoneProtection) optionsToKeep.allowedMentions.parse.push('everyone');
    }
    if (client.scnxSetup) input = require('./scnx-integration').verifyEmbedType(client, input);
    if (input.title || input.description || (input.author || {}).name || input.image) {
        const emb = new MessageEmbed();
        if (input['title']) emb.setTitle(inputReplacer(args, input['title']));
        if (input['description']) emb.setDescription(inputReplacer(args, input['description']));
        if (input['color']) emb.setColor(parseColor(input['color']));
        if (input['url']) emb.setURL(input['url']);
        if ((input['image'] || '').replaceAll(' ', '')) emb.setImage(inputReplacer(args, input['image']));
        if ((input['thumbnail'] || '').replaceAll(' ', '')) emb.setThumbnail(inputReplacer(args, input['thumbnail']));
        if (input['author'] && typeof input['author'] === 'object' && (input['author'] || {}).name) emb.setAuthor({
            name: inputReplacer(args, input['author']['name']),
            iconURL: (input['author']['img'] || '').replaceAll(' ', '') ? inputReplacer(args, input['author']['img']) : null
        });
        if (typeof input['fields'] === 'object') {
            input.fields.forEach(f => {
                emb.addField(inputReplacer(args, f['name']), inputReplacer(args, f['value']), f['inline']);
            });
        }
        if (!client.strings.disableFooterTimestamp && !input.embedTimestamp) emb.setTimestamp();
        if (input.embedTimestamp) emb.setTimestamp(input.embedTimestamp);

        // Safely set footer with null checks
        const footerText = input.footer ? inputReplacer(args, input.footer) : (client.strings && client.strings.footer);
        const footerIconURL = input.footerImgUrl || (client.strings && client.strings.footerImgUrl);
        if (footerText && footerText.trim().length > 0) {
            emb.setFooter({
                text: footerText,
                iconURL: footerIconURL
            });
        }
        optionsToKeep.embeds = [emb];
    } else optionsToKeep.embeds = [];
    if (!optionsToKeep.components && client.scnxSetup) optionsToKeep.components = require('./scnx-integration').returnSCNXComponents(input, mergeComponentsRows, args);
    optionsToKeep.content = input['message'] ? inputReplacer(args, input['message']) : null;
    return optionsToKeep;
}

/**
 * Extracts a human-readable error description from discord.js builder validation errors.
 * Handles CombinedPropertyError (nested errors array), ExpectedConstraintError, and plain Error.
 * @param {Error} e The caught error
 * @returns {string} Readable error description
 * @private
 */
function formatV4BuilderError(e) {
    if (Array.isArray(e.errors)) {
        return e.errors.map(([key, err]) => {
            const detail = err.given !== undefined ? ` (got ${JSON.stringify(err.given)})` : '';
            return `${key}: ${err.message}${detail}`;
        }).join('; ');
    }
    const parts = [e.message];
    if (e.constraint) parts.push(`[${e.constraint}]`);
    if (e.given !== undefined) parts.push(`(got ${JSON.stringify(e.given)})`);
    if (e.expected) parts.push(`expected: ${Array.isArray(e.expected) ? e.expected.join(', ') : e.expected}`);
    return parts.join(' ');
}

/**
 * Maps a v4 button style integer to a discord.js ButtonStyle enum value
 * @param {number} style Button style integer (1-5)
 * @returns {number} ButtonStyle enum value
 * @private
 */
function mapButtonStyle(style) {
    const map = {
        1: ButtonStyle.Primary,
        2: ButtonStyle.Secondary,
        3: ButtonStyle.Success,
        4: ButtonStyle.Danger,
        5: ButtonStyle.Link
    };
    return map[style] || ButtonStyle.Secondary;
}

/**
 * Builds a discord.js ButtonBuilder from a v4 button component object
 * @param {Object} comp V4 button component data
 * @param {Object} args Variable replacement args
 * @returns {ButtonBuilder|null} Built button or null if invalid
 * @private
 */
function buildV4Button(comp, args) {
    const btn = new ButtonBuilder();
    const style = comp.style || 2;
    btn.setStyle(mapButtonStyle(style));

    const label = inputReplacer(args, comp.label, true);
    if (label) btn.setLabel(truncate(label, 80));

    if (comp.emoji) {
        const emoji = typeof comp.emoji === 'string' ? comp.emoji.trim() : comp.emoji;
        if (emoji && emoji !== '' && emoji !== 'null') btn.setEmoji(emoji);
    }

    if (comp.disabled) btn.setDisabled(true);

    if (comp.scnx_action) {
        const action = comp.scnx_action;
        if (action.type === 'roleButton') {
            const actionChar = {
                add: 'a',
                remove: 'r',
                toggle: 't'
            }[action.action || 'toggle'];
            btn.setCustomId(`srb-${actionChar}-${action.id}`);
        } else if (action.type === 'customCommandButton') {
            btn.setCustomId(`cc-${action.id}`);
        } else if (action.type === 'disabledButton') {
            btn.setDisabled(true);
            btn.setCustomId(`disabled-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        } else if (action.type === 'linkButton') {
            btn.setStyle(ButtonStyle.Link);
            if (comp.url) btn.setURL(inputReplacer(args, comp.url));
        }
    } else if (style === 5 && comp.url) {
        btn.setURL(inputReplacer(args, comp.url));
    } else if (comp.custom_id) {
        btn.setCustomId(comp.custom_id);
    }

    if (!label && !comp.emoji) return null;
    return btn;
}

/**
 * Builds a discord.js StringSelectMenuBuilder from a v4 select component object
 * @param {Object} comp V4 string select component data
 * @param {Object} args Variable replacement args
 * @returns {StringSelectMenuBuilder|null} Built select menu or null if invalid
 * @private
 */
function buildV4StringSelect(comp, args) {
    if (!Array.isArray(comp.options) || comp.options.length === 0) return null;

    const select = new StringSelectMenuBuilder();

    if (comp.scnx_action) {
        if (comp.scnx_action.type === 'roleElement') {
            select.setCustomId('select-roles');
        } else if (comp.scnx_action.type === 'customCommandElement') {
            select.setCustomId('cc-select');
        }
    } else if (comp.custom_id) {
        select.setCustomId(comp.custom_id);
    }

    const placeholder = inputReplacer(args, comp.placeholder, true);
    if (placeholder) select.setPlaceholder(truncate(placeholder, 150));

    if (typeof comp.min_values === 'number') select.setMinValues(comp.min_values);
    if (typeof comp.max_values === 'number') select.setMaxValues(comp.max_values);

    const options = [];
    for (const opt of comp.options) {
        if (!opt.label || !opt.value) continue;
        const option = {
            label: truncate(inputReplacer(args, opt.label), 100),
            value: String(opt.value)
        };
        const desc = inputReplacer(args, opt.description, true);
        if (desc) option.description = truncate(desc, 100);
        if (opt.emoji && opt.emoji !== '' && opt.emoji !== 'null') option.emoji = opt.emoji;
        options.push(option);
    }
    if (options.length === 0) return null;
    select.addOptions(options);
    return select;
}

/**
 * Builds a discord.js component builder from a v4 component object.
 * Used recursively for nested components (Container, Section children).
 * @param {Object} comp V4 component data
 * @param {Object} args Variable replacement args
 * @returns {Object|null} A discord.js builder instance or null if invalid/skipped
 * @private
 */
function buildV4Component(comp, args) {
    if (!comp || typeof comp !== 'object' || !comp.type) return null;

    try {
        switch (comp.type) {
            case 10: { // TextDisplay
                const content = inputReplacer(args, comp.content, true);
                if (!content) return null;
                return new TextDisplayBuilder().setContent(truncate(content, 4000));
            }
            case 14: { // Separator
                const sep = new SeparatorBuilder();
                if (typeof comp.divider === 'boolean') sep.setDivider(comp.divider);
                if (comp.spacing === 2) sep.setSpacing(SeparatorSpacingSize.Large);
                else sep.setSpacing(SeparatorSpacingSize.Small);
                return sep;
            }
            case 12: { // MediaGallery
                if (!Array.isArray(comp.items) || comp.items.length === 0) return null;
                const gallery = new MediaGalleryBuilder();
                let galleryItemCount = 0;
                for (const item of comp.items) {
                    if (!item.media || !item.media.url) continue;
                    try {
                        const galleryItem = new MediaGalleryItemBuilder()
                            .setURL(inputReplacer(args, item.media.url));
                        if (item.description) galleryItem.setDescription(truncate(inputReplacer(args, item.description), 1024));
                        if (item.spoiler) galleryItem.setSpoiler(true);
                        gallery.addItems(galleryItem);
                        galleryItemCount++;
                    } catch (e) {
                        client.logger.error(`[embedType/v4] Skipping invalid media gallery item (url: ${JSON.stringify(item.media.url)}): ${formatV4BuilderError(e)}`);
                    }
                }
                if (galleryItemCount === 0) return null;
                return gallery;
            }
            case 13: { // File
                if (!comp.file || !comp.file.url) return null;
                const file = new FileBuilder().setURL(inputReplacer(args, comp.file.url));
                if (comp.spoiler) file.setSpoiler(true);
                return file;
            }
            case 1: { // ActionRow
                if (!Array.isArray(comp.components) || comp.components.length === 0) return null;
                const row = new ActionRowBuilder();
                const firstChild = comp.components[0];
                if (firstChild && firstChild.type === 3) {
                    // String select menu (max 1 per row)
                    const select = buildV4StringSelect(firstChild, args);
                    if (!select) return null;
                    row.addComponents(select);
                } else {
                    // Buttons (max 5 per row)
                    const buttons = [];
                    for (const btnComp of comp.components.slice(0, 5)) {
                        if (btnComp.type !== 2) continue;
                        try {
                            const btn = buildV4Button(btnComp, args);
                            if (btn) buttons.push(btn);
                        } catch (e) {
                            client.logger.error(`[embedType/v4] Skipping invalid button (label: ${JSON.stringify(btnComp.label || null)}): ${formatV4BuilderError(e)}`);
                        }
                    }
                    if (buttons.length === 0) return null;
                    row.addComponents(...buttons);
                }
                return row;
            }
            case 9: { // Section
                if (!Array.isArray(comp.components) || comp.components.length === 0) return null;
                if (!comp.accessory) return null;
                const section = new SectionBuilder();
                const textDisplays = [];
                for (const child of comp.components.slice(0, 3)) {
                    if (child.type !== 10) continue;
                    const content = inputReplacer(args, child.content, true);
                    if (content) textDisplays.push(new TextDisplayBuilder().setContent(truncate(content, 4000)));
                }
                if (textDisplays.length === 0) return null;
                section.addTextDisplayComponents(...textDisplays);

                if (comp.accessory.type === 11) { // Thumbnail
                    if (comp.accessory.media && comp.accessory.media.url) {
                        const thumb = new ThumbnailBuilder().setURL(inputReplacer(args, comp.accessory.media.url));
                        if (comp.accessory.description) thumb.setDescription(truncate(inputReplacer(args, comp.accessory.description), 1024));
                        if (comp.accessory.spoiler) thumb.setSpoiler(true);
                        section.setThumbnailAccessory(thumb);
                    } else {
                        return null;
                    }
                } else if (comp.accessory.type === 2) { // Button
                    try {
                        const btn = buildV4Button(comp.accessory, args);
                        if (btn) section.setButtonAccessory(btn);
                        else return null;
                    } catch (e) {
                        client.logger.error(`[embedType/v4] Skipping section due to invalid button accessory (label: ${JSON.stringify(comp.accessory.label || null)}): ${formatV4BuilderError(e)}`);
                        return null;
                    }
                } else {
                    return null;
                }
                return section;
            }
            case 17: { // Container
                const container = new ContainerBuilder();
                if (typeof comp.accent_color === 'number') container.setAccentColor(comp.accent_color);
                else if (comp.accent_color) container.setAccentColor(parseColor(comp.accent_color));
                if (comp.spoiler) container.setSpoiler(true);

                if (!Array.isArray(comp.components) || comp.components.length === 0) return null;

                let addedChildren = 0;
                for (const child of comp.components) {
                    try {
                        const built = buildV4Component(child, args);
                        if (!built) continue;
                        switch (child.type) {
                            case 10:
                                container.addTextDisplayComponents(built);
                                addedChildren++;
                                break;
                            case 14:
                                container.addSeparatorComponents(built);
                                addedChildren++;
                                break;
                            case 12:
                                container.addMediaGalleryComponents(built);
                                addedChildren++;
                                break;
                            case 13:
                                container.addFileComponents(built);
                                addedChildren++;
                                break;
                            case 1:
                                container.addActionRowComponents(built);
                                addedChildren++;
                                break;
                            case 9:
                                container.addSectionComponents(built);
                                addedChildren++;
                                break;
                        }
                    } catch (e) {
                        client.logger.error(`[embedType/v4] Failed to build container child (type ${child.type}): ${formatV4BuilderError(e)}`);
                    }
                }
                if (addedChildren === 0) return null;
                return container;
            }
            default:
                return null;
        }
    } catch (e) {
        client.logger.error(`[embedType/v4] Failed to build component (type ${comp.type}): ${formatV4BuilderError(e)}`);
        return null;
    }
}

/**
 * Handles the V4 (Components V2) message schema
 * @param {Object} input V4 schema input with components array
 * @param {Object} args Variable replacement args
 * @param {Object} optionsToKeep Options to keep in the output
 * @param {Array} mergeComponentsRows Additional ActionRows to merge
 * @returns {Object} Discord.js MessageOptions
 * @private
 */
function embedTypeSchemaV4(input, args = {}, optionsToKeep = {}, mergeComponentsRows = []) {
    // Set IS_COMPONENTS_V2 flag, preserving any existing flags
    const existingFlags = optionsToKeep.flags ? (typeof optionsToKeep.flags === 'number' ? optionsToKeep.flags : Number(optionsToKeep.flags)) : 0;
    optionsToKeep.flags = existingFlags | MessageFlags.IsComponentsV2;

    const components = [];
    for (const comp of input.components || []) {
        try {
            const built = buildV4Component(comp, args);
            if (built) components.push(built);
        } catch (e) {
            client.logger.error(`[embedType/v4] Failed to build top-level component (type ${(comp || {}).type}): ${formatV4BuilderError(e)}`);
        }
    }

    for (const row of mergeComponentsRows) {
        components.push(row);
    }

    // Add SCNX branding for non-paid plans
    if (client.scnxSetup && !['PROFESSIONAL', 'PRO', 'ENTERPRISE'].includes(client.scnxData.plan)) {
        components.push(new TextDisplayBuilder().setContent('-# Powered by scnx.xyz \u26A1'));
    }

    optionsToKeep.components = components;
    optionsToKeep.content = null;
    optionsToKeep.embeds = [];
    return optionsToKeep;
}

module.exports.embedType = embedType;

module.exports.embedTypeV2 = async function (input, args, otP, mergeComponentsRows) {
    let optionsToKeep = embedType(input, args, otP, mergeComponentsRows);
    if (!optionsToKeep.attachments && client.scnxSetup && (input.dynamicImage || {}).enabled) {
        optionsToKeep = await require('./scnx-integration').returnDynamicImages(input, optionsToKeep, args);
        // For v4, dynamic image was added to files but embeds don't exist; add a File component to display it
        if ((input._schema || 'v2') === 'v4' && optionsToKeep.files && optionsToKeep.files.length > 0) {
            if (!optionsToKeep.components) optionsToKeep.components = [];
            optionsToKeep.components.push(new FileBuilder().setURL('attachment://image.png'));
        }
    }
    return optionsToKeep;
};

/**
 * Makes a Date humanly readable
 * @param  {Date} date Date to format
 * @param  {Boolean} skipDiscordFormat If enabled, the time will be returned in a real string, not using discord's message attachments
 * @return {string} Returns humanly readable string
 * @author Simon Csaba <mail@scderox.de>
 */
function formatDate(date, skipDiscordFormat = false) {
    if (!skipDiscordFormat) return `${dateToDiscordTimestamp(date)} (${dateToDiscordTimestamp(date, 'R')})`;
    const yyyy = date.getFullYear().toString(), mm = (date.getMonth() + 1).toString(), dd = date.getDate().toString(),
        hh = date.getHours().toString(), min = date.getMinutes().toString();
    return localize('helpers', 'timestamp', {
        dd: dd[1] ? dd : '0' + dd[0],
        mm: mm[1] ? mm : '0' + mm[0],
        yyyy,
        hh: hh[1] ? hh : '0' + hh[0],
        min: min[1] ? min : '0' + min[0]
    });
}

module.exports.formatDate = formatDate;

/**
 * Posts (encrypted) content to SC Network Paste
 * @param {String} content Content to post
 * @param {Object} opts Configuration of upload entry
 * @return {Promise<string>} URL to document
 */
async function postToSCNetworkPaste(content, opts = {
    expire: '1month',
    burnafterreading: 0,
    opendiscussion: 1,
    textformat: 'plaintext',
    output: 'text',
    compression: 'zlib'
}) {
    const key = isoCrypto.getRandomValues(new Uint8Array(32));
    const res = await privatebin.sendText(content, key, opts);
    return `https://paste.scootkit.com${res.url}#${encode(key)}`;
}

module.exports.postToSCNetworkPaste = postToSCNetworkPaste;

/**
 * Genrate a random string (cryptographically unsafe)
 * @param {Number} length Length of the generated string
 * @param {String} characters String of characters to choose from
 * @returns {string} Random string
 */
module.exports.randomString = function (length, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result = result + characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
};

/**
 * Creates a paste from the messages in a channel.
 * @param {Channel} channel Channel to create log from
 * @param {Number} limit Number of messages to include
 * @param {String} expire Time after with paste expires
 * @return {Promise<string>}
 */
async function messageLogToStringToPaste(channel, limit = 100, expire = '1month') {
    let messages = '';
    (await channel.messages.fetch({limit: limit > 100 ? 100 : limit})).forEach(m => {
        messages = `[${m.id}] ${m.author.bot ? '[BOT] ' : ''}${formatDiscordUserName(m.author)}  (${m.author.id}): ${m.content}\n` + messages;
    });
    messages = `=== CHANNEL-LOG OF ${channel.name} (${channel.id}): Last messages before report ${formatDate(new Date())} ===\n` + messages;
    return await postToSCNetworkPaste(messages,
        {
            expire,
            burnafterreading: 0,
            opendiscussion: 0,
            textformat: 'plaintext',
            output: 'text',
            compression: 'zlib'
        });
}

module.exports.messageLogToStringToPaste = messageLogToStringToPaste;

/**
 * Truncates a string to a specific length
 * @param  {string} string String to truncate
 * @param  {number} length Length to truncate to
 * @return {string} Truncated string
 */
function truncate(string, length) {
    return (string.length > length) ? string.substr(0, length - 3).trim() + '...' : string;
}

module.exports.truncate = truncate;

/**
 * Puffers (add empty spaces to center text) a string to a specific size
 * @param  {string} string String to puffer
 * @param  {number} size Length to puffer to
 * @return {string}
 * @author Simon Csaba <mail@scderox.de>
 */
function pufferStringToSize(string, size) {
    if (typeof string !== 'string') string = string.toString();
    const pufferNeeded = size - string.length;
    for (let i = 0; i < pufferNeeded; i++) {
        if (i % 2 === 0) string = '\xa0' + string;
        else string = string + '\xa0';
    }
    return string;
}

module.exports.pufferStringToSize = pufferStringToSize;

/**
 * Sends a multiple-site-embed-message
 * @param  {Object} channel Channel in which to send the message
 * @param  {Array<object>} sites Array of MessageEmbeds (https://discord.js.org/#/docs/main/stable/class/MessageEmbed)
 * @param  {Array<string>} allowedUserIDs Array of User-IDs of users allowed to use the pagination
 * @param {Object} messageOrInteraction Message or [CommandInteraction](https://discord.js.org/#/docs/main/stable/class/CommandInteraction) to respond to
 * @return {string}
 * @author Simon Csaba <mail@scderox.de>
 */
async function sendMultipleSiteButtonMessage(channel, sites = [], allowedUserIDs = [], messageOrInteraction = null) {
    if (sites.length === 1) {
        if (messageOrInteraction) return messageOrInteraction.reply({embeds: [sites[0]]});
        return await channel.send({embeds: [sites[0]]});
    }
    let m;
    if (messageOrInteraction) m = await messageOrInteraction.reply({
        components: [{type: 'ACTION_ROW', components: getButtons(1)}],
        embeds: [sites[0]],
        fetchReply: true
    });
    else m = await channel.send({components: [{type: 'ACTION_ROW', components: getButtons(1)}], embeds: [sites[0]]});
    const c = m.createMessageComponentCollector({componentType: ComponentType.Button, time: 60000});
    let currentSite = 1;
    c.on('collect', async (interaction) => {
        if (!allowedUserIDs.includes(interaction.user.id)) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('helpers', 'you-did-not-run-this-command')
        });
        let nextSite = currentSite + 1;
        if (interaction.customId === 'back') nextSite = currentSite - 1;
        currentSite = nextSite;
        await interaction.update({
            components: [{type: 'ACTION_ROW', components: getButtons(nextSite)}],
            embeds: [sites[nextSite - 1]]
        }).catch(() => {
        });
    });
    c.on('end', () => {
        m.edit({
            components: [{type: 'ACTION_ROW', components: getButtons(currentSite, true)}],
            embeds: [sites[currentSite - 1]]
        }).catch(() => {
        });
    });

    /**
     * Generate the buttons for a specified site
     * @param {Number} site Site-Number
     * @param {Boolean} disabled If the buttons should be disabled
     * @returns {Array}
     * @private
     */
    function getButtons(site, disabled = false) {
        const btns = [];
        if (site !== 1) btns.push({
            type: 'BUTTON',
            label: '◀ ' + localize('helpers', 'back'),
            customId: 'back',
            style: 'PRIMARY',
            disabled
        });
        if (site !== sites.length) btns.push({
            type: 'BUTTON',
            label: localize('helpers', 'next') + ' ▶',
            customId: 'next',
            style: 'PRIMARY',
            disabled
        });
        return btns;
    }
}

module.exports.sendMultipleSiteButtonMessage = sendMultipleSiteButtonMessage;

/**
 * Compares two arrays
 * @param {Array} array1 First array
 * @param {Array} array2 Second array
 * @returns {boolean} Wherever the arrays are the same
 */
function compareArrays(array1, array2) {
    if (array1.length !== array2.length) return false;

    for (let i = 0, l = array1.length; i < l; i++) {
        if (array1[i] instanceof Object) {
            for (const key in array1[i]) {
                if (array2[key] !== array1[key]) return false;
            }
            continue;
        }
        if (!array2.includes(array1[i])) return false;
    }
    return true;
}

module.exports.compareArrays = compareArrays;

/**
 * Check if a new version of CustomDCBot is available in the main branch on github
 * @returns {Promise<void>}
 */
async function checkForUpdates() {
}

module.exports.checkForUpdates = checkForUpdates;

/**
 * Randomly selects a number between min and max
 * @param {Number} min
 * @param {Number} max
 * @returns {number} Random integer
 */
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

module.exports.randomIntFromInterval = randomIntFromInterval;

/**
 * Returns a random element from an array
 * @param {Array} array Array of values
 * @returns {*}
 */
function randomElementFromArray(array) {
    if (array.length === 0) return null;
    if (array.length === 1) return array[0];
    return array[Math.floor(Math.random() * array.length)];
}

module.exports.randomElementFromArray = randomElementFromArray;

/**
 * Returns a string (progressbar) to visualize a progress in percentage
 * @param {Number} percentage Percentage of progress
 * @param {Number} length Length of the whole progressbar
 * @return {string} Progressbar
 */
function renderProgressbar(percentage, length = 20) {
    let s = '';
    for (let i = 1; i <= length; i++) {
        if (percentage >= 5 * i) s = s + '█';
        else s = s + '░';
    }
    return s;
}

module.exports.renderProgressbar = renderProgressbar;

/**
 * Formats a Date to a discord timestamp
 * @param {Date} date Date to convert
 * @param {String} timeStampStyle [Timestamp Style](https://discord.com/developers/docs/reference#message-formatting-timestamp-styles) in which this timeStamp should be
 * @return {string} Discord-Timestamp
 */
function dateToDiscordTimestamp(date, timeStampStyle = null) {
    return `<t:${(date.getTime() / 1000).toFixed(0)}${timeStampStyle ? ':' + timeStampStyle : ''}>`;
}

module.exports.dateToDiscordTimestamp = dateToDiscordTimestamp;

/**
 * Locks a Guild-Channel for everyone except roles specified in allowedRoles
 * @param {GuildChannel} channel Channel to lock
 * @param {Array<Role>} allowedRoles Array of roles who can talk in the channel
 * @param {String} reason Reason for the channel lock
 * @return {Promise<void>}
 */
async function lockChannel(channel, allowedRoles = [], reason = localize('main', 'channel-lock')) {
    const dup = await channel.client.models['ChannelLock'].findOne({where: {id: channel.id}});
    if (dup) await dup.destroy();


    if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) {
        await channel.setLocked(true, reason);
    } else {
        await channel.client.models['ChannelLock'].create({
            id: channel.id,
            lockReason: reason,
            permissions: Array.from(channel.permissionOverwrites.cache.values())
        });

        for (const overwrite of channel.permissionOverwrites.cache.filter(e => e.allow.has(PermissionFlagsBits.SendMessages)).values()) {
            if (overwrite.type === 'role' && channel.client.guild.members.me.roles.botRole?.id === overwrite.id) continue;
            if (overwrite.type === 'member' && channel.client.user.id === overwrite.id) continue;
            await overwrite.edit({
                SendMessages: false,
                SendMessagesInThreads: false
            }, reason);
        }

        const everyoneRole = await channel.guild.roles.cache.find(r => r.name === '@everyone');
        if (channel.permissionsFor(everyoneRole).has(PermissionFlagsBits.ViewChannel)) await channel.permissionOverwrites.create(everyoneRole, {
            SendMessages: false,
            SendMessagesInThreads: false
        }, {reason});

        for (const roleID of allowedRoles) {
            await channel.permissionOverwrites.create(roleID, {
                SendMessages: true
            }, {reason});
        }
    }
}

/**
 * Unlocks a previously locked channel
 * @param {GuildChannel} channel Channel to unlock
 * @param {String} reason Reason for this unlock
 * @return {Promise<void>}
 */
async function unlockChannel(channel, reason = localize('main', 'channel-unlock')) {
    const item = await channel.client.models['ChannelLock'].findOne({where: {id: channel.id}});
    if (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) {
        await channel.setLocked(false, reason);
    } else {
        if (item && (item || {}).permissions) await channel.permissionOverwrites.set(item.permissions, reason);
        else channel.client.logger.error(localize('main', 'channel-unlock-data-not-found', {c: channel.id}));
    }
}

module.exports.lockChannel = lockChannel;
module.exports.unlockChannel = unlockChannel;

/**
 * Function to migrate Database models
 * @param {string} module Name of the Module
 * @param {string} oldModel Name of the old Model
 * @param {string} newModel Name of the new Model
 * @returns {Promise<void>}
 * @author jateute
 */
async function migrate(module, oldModel, newModel) {
    const old = await client.models[module][oldModel].findAll();
    if (old.length === 0) return;
    client.logger.info(localize('main', 'migrate-start', {o: oldModel, m: newModel}));
    for (const model of old) {
        delete model.dataValues.updatedAt;
        delete model.dataValues.createdAt;
        await client.models[module][newModel].create(model.dataValues);
        await model.destroy();
    }
    client.logger.info(localize('main', 'migrate-success', {o: oldModel, m: newModel}));
}

module.exports.migrate = migrate;

/**
 * Disables a module. NOTE: This can't and won't clear any set intervals or jobs
 * @param {String} module Name of the module to disable
 * @param {String} reason Reason why module should gets disabled.
 */
function disableModule(module, reason = null) {
    if (!client.modules[module]) throw new Error(`${module} got never loaded`);
    client.modules[module].enabled = false;
    client.logger.error(localize('main', 'module-disable', {r: reason, m: module}));
    if (client.logChannel) client.logChannel.send(localize('main', 'module-disable', {
        m: module,
        r: reason
    })).then(() => {
    });
    if (client.scnxSetup) require('./scnx-integration').reportIssue(client, {
        type: 'MODULE_FAILURE',
        errorDescription: 'module_disabled',
        errorData: {reason},
        module
    }).then(() => {
    });
}

module.exports.disableModule = disableModule;

/**
 * Formates a number to make it human-readable
 * @param {Number|string} number
 * @returns {string}
 */
module.exports.formatNumber = function (number) {
    if (typeof number === 'string') number = parseInt(number);
    return new Intl.NumberFormat(client.locale.split('_')[0], {}).format(number);
};

/**
 * Creates a MD5 Hash String from a string
 * @param {String} string String to hash
 * @return {string} MD5 Hash String
 */
module.exports.hashMD5 = function (string) {
    return crypto.createHash('md5').update(string).digest('hex');
};
module.exports.shuffleArray = function (input) {
    const array = [...input];
    for (let i = array.length - 1; i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};
