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
const crypto = require('crypto');
const zlib = require('zlib');
const centra = require('centra');
const {client} = require('../../main');

const PRIVATEBIN_BASE_URL = 'https://paste.scootkit.com';
const PRIVATEBIN_PBKDF2_ITERATIONS = 100000;
const PRIVATEBIN_KEY_BYTES = 32;
const PRIVATEBIN_GCM_TAG_BITS = 128;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
    if (bytes.length === 0) return '';
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    const size = Math.ceil((bytes.length - zeros) * 138 / 100) + 1;
    const b58 = new Uint8Array(size);
    let length = 0;
    for (let i = zeros; i < bytes.length; i++) {
        let carry = bytes[i];
        let j = 0;
        for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
            carry += 256 * b58[k];
            b58[k] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        length = j;
    }
    let it = size - length;
    while (it < size && b58[it] === 0) it++;
    return '1'.repeat(zeros) + Array.from(b58.slice(it), (b) => BASE58_ALPHABET[b]).join('');
}

function encryptPrivatebinPaste(text, masterKey, opts) {
    const compression = opts.compression || 'zlib';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(8);
    const derivedKey = crypto.pbkdf2Sync(masterKey, salt, PRIVATEBIN_PBKDF2_ITERATIONS, PRIVATEBIN_KEY_BYTES, 'sha256');
    const adata = [
        [
            iv.toString('base64'),
            salt.toString('base64'),
            PRIVATEBIN_PBKDF2_ITERATIONS,
            256,
            PRIVATEBIN_GCM_TAG_BITS,
            'aes',
            'gcm',
            compression
        ],
        opts.textformat || 'plaintext',
        opts.opendiscussion ? 1 : 0,
        opts.burnafterreading ? 1 : 0
    ];
    let plaintext = Buffer.from(JSON.stringify({paste: text}), 'utf8');
    if (compression === 'zlib') plaintext = zlib.deflateRawSync(plaintext);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv, {authTagLength: PRIVATEBIN_GCM_TAG_BITS / 8});
    cipher.setAAD(Buffer.from(JSON.stringify(adata), 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const ct = Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64');
    return {
        ct,
        adata
    };
}

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
    const now = new Date();
    globalArgs['%timestamp%'] = dateToDiscordTimestamp(now);
    globalArgs['%shortTime%'] = dateToDiscordTimestamp(now, 't');
    globalArgs['%longTime%'] = dateToDiscordTimestamp(now, 'T');
    globalArgs['%shortDate%'] = dateToDiscordTimestamp(now, 'd');
    globalArgs['%longDate%'] = dateToDiscordTimestamp(now, 'D');
    globalArgs['%shortDateTime%'] = dateToDiscordTimestamp(now, 'f');
    globalArgs['%longDateTime%'] = dateToDiscordTimestamp(now, 'F');
    globalArgs['%relativeTime%'] = dateToDiscordTimestamp(now, 'R');
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
            const footerIconURL = (embedData.footer?.iconURL || (client.strings && client.strings.footerImgUrl) || '').trim() || undefined;
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
            name: truncate(inputReplacer(args, fieldData.name, true) || '\u200B', 256),
            value: truncate(inputReplacer(args, fieldData.value, true) || '\u200B', 1024),
            inline: fieldData.inline
        });

        const embed = new MessageEmbed({
            title: truncate(inputReplacer(args, embedData.title, true) || '', 256) || undefined,
            description: truncate(inputReplacer(args, embedData.description, true) || '', 4096) || undefined,
            color: parseColor(embedData.color),
            thumbnail: inputReplacer(args, embedData.thumbnailURL)?.trim() ? {url: inputReplacer(args, embedData.thumbnailURL).trim()} : null,
            image: inputReplacer(args, embedData.imageURL)?.trim() ? {url: inputReplacer(args, embedData.imageURL).trim()} : null,
            timestamp: (embedData.footer?.hideTime || embedData.footer?.disabled || client.strings.disableFooterTimestamp) ? null : new Date(),
            author: embedData.author?.name ? {
                name: truncate(inputReplacer(args, embedData.author.name), 256),
                iconURL: inputReplacer(args, embedData.author.imageURL, null)?.trim() || null,
                url: inputReplacer(args, embedData.author.url, null)?.trim() || null
            } : null,
            footer,
            fields
        });
        optionsToKeep.embeds.push(embed);
    }

    optionsToKeep.files = [...(optionsToKeep.files || [])];
    for (const url of input.attachmentURLs || []) {
        if (url && url.trim()) optionsToKeep.files.push({attachment: url.trim()});
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
        if (input['title']) emb.setTitle(truncate(inputReplacer(args, input['title']), 256));
        if (input['description']) emb.setDescription(truncate(inputReplacer(args, input['description']), 4096));
        if (input['color']) emb.setColor(parseColor(input['color']));
        const resolvedURL = inputReplacer(args, input['url'])?.trim();
        if (resolvedURL) emb.setURL(resolvedURL);
        const resolvedImage = inputReplacer(args, input['image'])?.trim();
        if (resolvedImage) emb.setImage(resolvedImage);
        const resolvedThumbnail = inputReplacer(args, input['thumbnail'])?.trim();
        if (resolvedThumbnail) emb.setThumbnail(resolvedThumbnail);
        if (input['author'] && typeof input['author'] === 'object' && (input['author'] || {}).name) emb.setAuthor({
            name: truncate(inputReplacer(args, input['author']['name']), 256),
            iconURL: (input['author']['img'] || '').trim() ? inputReplacer(args, input['author']['img']).trim() : null
        });
        if (typeof input['fields'] === 'object') {
            input.fields.forEach(f => {
                emb.addField(truncate(inputReplacer(args, f['name']), 256), truncate(inputReplacer(args, f['value']), 1024), f['inline']);
            });
        }
        if (!client.strings.disableFooterTimestamp && !input.embedTimestamp) emb.setTimestamp();
        if (input.embedTimestamp) emb.setTimestamp(input.embedTimestamp);

        // Safely set footer with null checks
        const footerText = input.footer ? inputReplacer(args, input.footer) : (client.strings && client.strings.footer);
        const footerIconURL = (input.footerImgUrl || (client.strings && client.strings.footerImgUrl) || '').trim() || undefined;
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

    let hasEmoji = false;
    if (comp.emoji) {
        const emoji = typeof comp.emoji === 'string' ? comp.emoji.trim() : comp.emoji;
        if (emoji && emoji !== '' && emoji !== 'null') {
            btn.setEmoji(emoji);
            hasEmoji = true;
        }
    }

    if (comp.disabled) btn.setDisabled(true);

    let isLink = false;
    let linkUrl = null;
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
            isLink = true;
            btn.setStyle(ButtonStyle.Link);
            linkUrl = comp.url ? inputReplacer(args, comp.url).trim() : '';
        }
    } else if (style === 5) {
        isLink = true;
        linkUrl = comp.url ? inputReplacer(args, comp.url).trim() : '';
    } else if (comp.custom_id) {
        btn.setCustomId(comp.custom_id);
    }

    if (isLink) {
        if (!linkUrl) return null;
        btn.setURL(linkUrl);
    }

    if (!label && !hasEmoji) return null;
    return btn;
}

/**
 * Builds a discord.js StringSelectMenuBuilder from a v4 select component object
 * @param {Object} comp V4 string select component data
 * @param {Object} args Variable replacement args
 * @returns {StringSelectMenuBuilder|null} Built select menu or null if invalid
 * @private
 */
function buildV4StringSelect(comp, args, counters) {
    if (!Array.isArray(comp.options) || comp.options.length === 0) return null;

    const select = new StringSelectMenuBuilder();

    if (comp.scnx_action) {
        if (comp.scnx_action.type === 'roleElement') {
            select.setCustomId(`select-roles-${counters ? counters.roleSelect++ : 0}`);
        } else if (comp.scnx_action.type === 'customCommandElement') {
            select.setCustomId(`cc-select-${counters ? counters.ccSelect++ : 0}`);
        }
    } else if (comp.custom_id) {
        select.setCustomId(comp.custom_id);
    }

    const placeholder = inputReplacer(args, comp.placeholder, true);
    if (placeholder) select.setPlaceholder(truncate(placeholder, 150));

    const options = [];
    for (const opt of comp.options) {
        if (opt.value == null) continue;
        const label = truncate(inputReplacer(args, opt.label, true) || '', 100);
        const value = String(opt.value);
        if (!label || !value) continue;
        const option = {label, value};
        const desc = inputReplacer(args, opt.description, true);
        if (desc) option.description = truncate(desc, 100);
        if (opt.emoji && opt.emoji !== '' && opt.emoji !== 'null') option.emoji = opt.emoji;
        options.push(option);
    }
    if (options.length === 0) return null;
    select.addOptions(options);

    if (typeof comp.min_values === 'number') select.setMinValues(Math.max(0, Math.min(comp.min_values, options.length)));
    if (typeof comp.max_values === 'number') {
        const min = typeof comp.min_values === 'number' ? Math.max(0, Math.min(comp.min_values, options.length)) : 0;
        select.setMaxValues(Math.max(min || 1, Math.min(comp.max_values, options.length)));
    }
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
function buildV4Component(comp, args, counters) {
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
                    const url = inputReplacer(args, item.media.url).trim();
                    if (!url) continue;
                    try {
                        const galleryItem = new MediaGalleryItemBuilder().setURL(url);
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
                const url = inputReplacer(args, comp.file.url).trim();
                if (!url) return null;
                const file = new FileBuilder().setURL(url);
                if (comp.spoiler) file.setSpoiler(true);
                return file;
            }
            case 1: { // ActionRow
                if (!Array.isArray(comp.components) || comp.components.length === 0) return null;
                const row = new ActionRowBuilder();
                const firstChild = comp.components[0];
                if (firstChild && firstChild.type === 3) {
                    // String select menu (max 1 per row)
                    const select = buildV4StringSelect(firstChild, args, counters);
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
                        const thumbUrl = inputReplacer(args, comp.accessory.media.url).trim();
                        if (!thumbUrl) return null;
                        const thumb = new ThumbnailBuilder().setURL(thumbUrl);
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
                        const built = buildV4Component(child, args, counters);
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
                            case 'dynamicImage':
                                container.addMediaGalleryComponents(built);
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
            case 'dynamicImage': { // Placeholder for dynamic image - emits a MediaGallery component at this position
                return new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://image.png')
                );
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

    // Save any pre-existing components passed via optionsToKeep (e.g. giveaway buttons) to append last
    const keepComponents = (optionsToKeep.components || []).map(c => typeof c.toJSON === 'function' ? c.toJSON() : c);

    const counters = {roleSelect: 0, ccSelect: 0};
    for (const comp of input.components || []) {
        try {
            const built = buildV4Component(comp, args, counters);
            if (built) components.push(built);
        } catch (e) {
            client.logger.error(`[embedType/v4] Failed to build top-level component (type ${(comp || {}).type}): ${formatV4BuilderError(e)}`);
        }
    }

    // Check if a dynamicImage sentinel exists anywhere (including inside containers)
    if ((input.components || []).some(function findSentinel(c) {
        return c.type === 'dynamicImage' || (Array.isArray(c.components) && c.components.some(findSentinel));
    })) optionsToKeep._hasDynamicImagePlaceholder = true;

    for (const row of mergeComponentsRows) {
        components.push(row);
    }

    // Append pre-existing components from optionsToKeep at the bottom (e.g. giveaway buttons)
    for (const kept of keepComponents) {
        components.push(kept);
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
        // For v4, dynamic image was added to files but embeds don't exist; add a MediaGallery component to display it
        if ((input._schema || 'v2') === 'v4' && optionsToKeep.files && optionsToKeep.files.length > 0) {
            // If a dynamicImage placeholder was placed in the components, the MediaGallery is already in position
            if (!optionsToKeep._hasDynamicImagePlaceholder) {
                if (!optionsToKeep.components) optionsToKeep.components = [];
                optionsToKeep.components.push(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://image.png')
                ));
            }
            delete optionsToKeep._hasDynamicImagePlaceholder;
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
 * Formats a duration (in milliseconds) as a short human-readable string,
 * picking the largest meaningful unit. Localized via the `helpers` namespace.
 * @param {number} ms Duration in milliseconds
 * @return {string} e.g. "2 months", "5 days", "3 hours", "just now"
 * @author Simon Csaba <mail@scderox.de>
 */
function formatDurationShort(ms) {
    if (!Number.isFinite(ms) || ms < 60_000) return localize('helpers', 'duration-just-now');
    const units = [
        ['year', 365 * 24 * 60 * 60 * 1000],
        ['month', 30 * 24 * 60 * 60 * 1000],
        ['day', 24 * 60 * 60 * 1000],
        ['hour', 60 * 60 * 1000],
        ['minute', 60 * 1000]
    ];
    for (const [unit, size] of units) {
        const value = Math.floor(ms / size);
        if (value >= 1) {
            return localize('helpers', `duration-${unit}${value === 1 ? '' : 's'}`, {i: value});
        }
    }
    return localize('helpers', 'duration-just-now');
}

module.exports.formatDurationShort = formatDurationShort;

/**
 * Returns today's date as YYYY-MM-DD in the bot's configured timezone.
 * @returns {string}
 */
function todayInServerTZ() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: client.config.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

module.exports.todayInServerTZ = todayInServerTZ;

/**
 * Formats a duration in seconds as a short, localized human string.
 * Examples (en): 6125 -> "1h 42m", 125 -> "2m", 30 -> "30s", 0 -> "0m".
 * @param {number} seconds
 * @returns {string}
 */
function formatVoiceDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return localize('helpers', 'voice-time-m', {i: 0});
    if (seconds >= 3600) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return localize('helpers', 'voice-time-hm', {
            h,
            m
        });
    }
    if (seconds >= 60) return localize('helpers', 'voice-time-m', {i: Math.floor(seconds / 60)});
    return localize('helpers', 'voice-time-s', {i: Math.floor(seconds)});
}

module.exports.formatVoiceDuration = formatVoiceDuration;

const PASTE_MAX_ATTEMPTS = 3;
const PASTE_RETRY_BASE_MS = 1000;
const PASTE_RETRY_MAX_DELAY_MS = 60000;

/*
 * PrivateBin returns HTTP 200 with `{status: 1, message: "..."}` for application-level errors
 * (flood protection, invalid options, oversized paste). axios won't throw in that case, so we
 * need to inspect the body ourselves — otherwise res.url is undefined and the caller ends up
 * with a "paste.scootkit.comundefined" URL.
 */
class PasteUploadError extends Error {
    constructor(message, {response = null, cause = null, retryable = false, retryAfterMs = null} = {}) {
        super(message);
        this.name = 'PasteUploadError';
        this.response = response;
        this.cause = cause;
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
    }
}

function classifyPrivatebinResponse(res) {
    if (res && typeof res.url === 'string' && res.url.length > 0) return {ok: true};
    const message = (res && (res.message || res.error)) || 'PrivateBin response missing url';
    const lower = String(message).toLowerCase();
    // Permanent failures we should not retry — there's no point.
    if (lower.includes('size') || lower.includes('large') || lower.includes('invalid')) {
        return {ok: false, message, retryable: false};
    }
    // Flood protection / temporary unavailability — retry with backoff.
    const retryable = lower.includes('flood') || lower.includes('wait') || lower.includes('try again') || lower.includes('busy');
    return {ok: false, message, retryable};
}

function parseRetryAfterMs(headers) {
    const retryAfterHeader = headers && (headers['retry-after'] || headers['Retry-After']);
    if (!retryAfterHeader) return null;
    const seconds = parseInt(retryAfterHeader, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.min(seconds * 1000, PASTE_RETRY_MAX_DELAY_MS);
}

function classifyHttpStatus(status, headers) {
    const retryAfterMs = parseRetryAfterMs(headers);
    if (!status) {
        // No HTTP response: network error, DNS failure, socket reset, timeout.
        return {retryable: true, retryAfterMs};
    }
    const retryable = status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
    return {retryable, retryAfterMs, status};
}

function computePasteRetryDelayMs(attempt, retryAfterMs) {
    if (retryAfterMs) return retryAfterMs;
    const base = PASTE_RETRY_BASE_MS * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 500);
    return Math.min(base + jitter, PASTE_RETRY_MAX_DELAY_MS);
}

function pasteSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Posts (encrypted) content to SC Network Paste. Retries transient failures (flood protection,
 * 5xx, network errors) with exponential backoff and honors Retry-After headers. Throws
 * PasteUploadError when the paste cannot be created — callers should handle that explicitly
 * rather than expecting a fallback URL.
 *
 * @param {String} content Content to post
 * @param {Object} opts Configuration of upload entry
 * @return {Promise<string>} URL to document
 * @throws {PasteUploadError}
 */
async function postToSCNetworkPaste(content, opts = {
    expire: '1month',
    burnafterreading: 0,
    opendiscussion: 1,
    textformat: 'plaintext',
    output: 'text',
    compression: 'zlib'
}) {
    let lastError = null;
    for (let attempt = 0; attempt < PASTE_MAX_ATTEMPTS; attempt++) {
        const key = crypto.randomBytes(PRIVATEBIN_KEY_BYTES);
        const {
            ct,
            adata
        } = encryptPrivatebinPaste(content, key, opts);
        let response;
        try {
            response = await centra(PRIVATEBIN_BASE_URL, 'POST')
                .header('X-Requested-With', 'JSONHttpRequest')
                .body({
                    v: 2,
                    ct,
                    adata,
                    meta: {expire: opts.expire}
                }, 'json')
                .send();
        } catch (networkError) {
            const {
                retryable,
                retryAfterMs
            } = classifyHttpStatus(null, {});
            lastError = new PasteUploadError(
                `PrivateBin network error: ${networkError.message || networkError}`,
                {
                    cause: networkError,
                    retryable,
                    retryAfterMs
                }
            );
            if (!retryable || attempt === PASTE_MAX_ATTEMPTS - 1) throw lastError;
            await pasteSleep(computePasteRetryDelayMs(attempt, retryAfterMs));
            continue;
        }
        const status = response.statusCode;
        if (status < 200 || status >= 300) {
            const {
                retryable,
                retryAfterMs
            } = classifyHttpStatus(status, response.headers);
            lastError = new PasteUploadError(
                `PrivateBin HTTP error (${status})`,
                {
                    cause: null,
                    retryable,
                    retryAfterMs
                }
            );
            if (!retryable || attempt === PASTE_MAX_ATTEMPTS - 1) throw lastError;
            await pasteSleep(computePasteRetryDelayMs(attempt, retryAfterMs));
            continue;
        }
        let res;
        try {
            res = await response.json();
        } catch (parseError) {
            lastError = new PasteUploadError('PrivateBin returned non-JSON response', {
                cause: parseError,
                retryable: false
            });
            throw lastError;
        }
        const classification = classifyPrivatebinResponse(res);
        if (classification.ok) {
            return `${PRIVATEBIN_BASE_URL}${res.url}#${base58Encode(key)}`;
        }
        lastError = new PasteUploadError(`PrivateBin rejected paste: ${classification.message}`, {
            response: res,
            retryable: classification.retryable
        });
        if (!classification.retryable || attempt === PASTE_MAX_ATTEMPTS - 1) throw lastError;
        await pasteSleep(computePasteRetryDelayMs(attempt, null));
    }
    throw lastError;
}

module.exports.postToSCNetworkPaste = postToSCNetworkPaste;
module.exports.PasteUploadError = PasteUploadError;

// Internal building blocks exposed for unit tests; not part of the public bot API.
module.exports.__test = {
    base58Encode,
    encryptPrivatebinPaste,
    classifyHttpStatus,
    parseRetryAfterMs,
    computePasteRetryDelayMs,
    classifyPrivatebinResponse,
    formatV4BuilderError,
    mapButtonStyle,
    getGlobalArgs,
    buildV4Button,
    buildV4StringSelect,
    buildV4Component,
    embedTypeSchemaV2,
    embedTypeSchemaV4
};

/**
 * Genrate a random string (cryptographically unsafe)
 * @param {Number} length Length of the generated string
 * @param {String} characters String of characters to choose from
 * @returns {string} Random string
 */
module.exports.randomString = function (length, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    const charactersLength = characters.length;
    if (charactersLength === 0) return result;
    for (let i = 0; i < length; i++) {
        // crypto.randomInt -> unbiased, unpredictable character pick.
        result = result + characters.charAt(crypto.randomInt(charactersLength));
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
    if (!string) return string;
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
 * @param {Boolean} ephemeral If the reply should be ephemeral (only when responding to an interaction)
 * @return {string}
 * @author Simon Csaba <mail@scderox.de>
 */
async function sendMultipleSiteButtonMessage(channel, sites = [], allowedUserIDs = [], messageOrInteraction = null, ephemeral = false) {
    if (sites.length === 1) {
        if (messageOrInteraction) return messageOrInteraction.reply({embeds: [sites[0]], ephemeral});
        return await channel.send({embeds: [sites[0]]});
    }
    let m;
    if (messageOrInteraction) m = await messageOrInteraction.reply({
        components: [{type: 'ACTION_ROW', components: getButtons(1)}],
        embeds: [sites[0]],
        ephemeral,
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
        });
    });
    c.on('end', () => {
        const payload = {
            components: [{type: 'ACTION_ROW', components: getButtons(currentSite, true)}],
            embeds: [sites[currentSite - 1]]
        };
        if (ephemeral && messageOrInteraction) messageOrInteraction.editReply(payload).catch(() => {
        });
        else m.edit(payload).catch(() => {
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
        if (array1[i] instanceof Object || array2[i] instanceof Object) {
            const keys = new Set([...Object.keys(array1[i] || {}), ...Object.keys(array2[i] || {})]);
            for (const key of keys) {
                if ((array1[i][key] ?? null) !== (array2[i][key] ?? null)) return false;
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
    // Cryptographically secure, unbiased integer in [min, max] inclusive.
    // crypto.randomInt does rejection sampling internally (no modulo bias) and is
    // unpredictable, unlike Math.random. Tolerant of swapped args / non-integers.
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return hi > lo ? crypto.randomInt(lo, hi + 1) : lo;
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
    // crypto.randomInt(max) -> unbiased index in [0, length-1].
    return array[crypto.randomInt(array.length)];
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

        const allowedRoleSet = new Set(allowedRoles.map(r => typeof r === 'string' ? r : r.id || r));
        const botRoleId = channel.client.guild.members.me.roles.botRole?.id;

        for (const overwrite of channel.permissionOverwrites.cache.values()) {
            if (overwrite.id === botRoleId) continue;
            if (overwrite.type === 'member' && channel.client.user.id === overwrite.id) continue;
            if (allowedRoleSet.has(overwrite.id)) continue;
            if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) continue;
            await overwrite.edit({
                SendMessages: false,
                SendMessagesInThreads: false
            }, reason);
        }

        // Also deny roles inheriting SendMessages from the parent category
        if (channel.parent) {
            for (const [id, catOverwrite] of channel.parent.permissionOverwrites.cache) {
                if (catOverwrite.type !== 0) continue; // Only roles
                if (id === botRoleId) continue;
                if (allowedRoleSet.has(id)) continue;
                if (channel.permissionOverwrites.cache.has(id)) continue; // Already handled above
                if (!catOverwrite.allow.has(PermissionFlagsBits.SendMessages)) continue;
                await channel.permissionOverwrites.create(id, {
                    SendMessages: false,
                    SendMessagesInThreads: false
                }, {reason});
            }
        }

        const everyoneRole = channel.guild.roles.everyone;

        /*
         * Use edit (not create) so we MERGE into any existing @everyone overwrite.
         * create() replaces the overwrite wholesale, which would wipe a pre-existing
         * VIEW_CHANNEL deny and leave e.g. a closed ticket visible to @everyone (#cmpwxd).
         */
        await channel.permissionOverwrites.edit(everyoneRole, {
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
 * Checks whether a module is currently enabled. Prefer this over `client.models[X]` or
 * `client.configurations[X]` as enabled-checks — models load for every module directory
 * on disk regardless of enabled state, and configurations are only populated when the
 * module is enabled.
 * @param {Client} client
 * @param {String} moduleName
 * @returns {Boolean}
 */
function moduleEnabled(client, moduleName) {
    return !!(client.modules[moduleName] && client.modules[moduleName].enabled);
}

module.exports.moduleEnabled = moduleEnabled;

/**
 * Formates a number to make it human-readable
 * @param {Number|string} number
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
module.exports.formatNumber = function (number, options = {}) {
    if (typeof number === 'string') number = parseFloat(number);
    return new Intl.NumberFormat(client.bcp47Locale, options).format(number);
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
        // Fisher-Yates with a cryptographically secure, unbiased index in [0, i].
        const j = crypto.randomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Tries to archive a Discord CDN attachment into the guild's scnx file
 * library and returns the full archival result. Returns null when the bot
 * is running outside an scnx setup (OSS build — scnx-integration is not
 * shipped), when archival is disabled, or on any failure. Use this when you
 * need to know whether the returned URL will outlive Discord's signed TTL
 * — e.g. persisting an attachment URL for later restoration.
 * @param {Client} client
 * @param {string} url Discord CDN URL
 * @param {{displayName?: string, tags?: string[], uploaderDiscordID?: string}} meta
 * @returns {Promise<{id: string, url: string, mediaCategory: string, duplicate?: boolean} | null>}
 */
module.exports.tryArchiveDiscordAttachment = async function (client, url, meta = {}) {
    if (!client.scnxSetup) return null;
    return require('./scnx-integration').archiveDiscordAttachment(client, url, meta);
};

/**
 * Convenience wrapper around tryArchiveDiscordAttachment — always returns a
 * URL. On success, the permanent scnx CDN URL; on any failure (disabled,
 * OSS build, rate-limited, quota-exhausted, upstream error), the original
 * Discord URL. Use this at display sites where the URL is only needed
 * within Discord's signed-TTL window.
 * @param {Client} client
 * @param {string} url Discord CDN URL
 * @param {{displayName?: string, tags?: string[], uploaderDiscordID?: string}} meta
 * @returns {Promise<string>}
 */
module.exports.archiveDiscordAttachment = async function (client, url, meta = {}) {
    const result = await module.exports.tryArchiveDiscordAttachment(client, url, meta);
    return result ? result.url : url;
};