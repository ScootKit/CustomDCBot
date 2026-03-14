const Discord = require('discord.js');

const {
    ActionRowBuilder,
    AttachmentBuilder,
    BaseInteraction,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    GatewayIntentBits,
    Guild,
    InteractionResponse,
    Message,
    ModalBuilder,
    MessagePayload,
    Partials,
    PermissionsBitField,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} = Discord;
const permissionNameMap = Object.fromEntries(Object.keys(Discord.PermissionFlagsBits || {}).map(k => [k.toUpperCase(), Discord.PermissionFlagsBits[k]]));

Discord.MessageEmbed = EmbedBuilder;
Discord.MessageAttachment = AttachmentBuilder;
Discord.MessageActionRow = ActionRowBuilder;
Discord.MessageButton = ButtonBuilder;
Discord.MessageSelectMenu = StringSelectMenuBuilder;
Discord.TextInputComponent = TextInputBuilder;
Discord.Modal = ModalBuilder;
Discord.Permissions = PermissionsBitField;
Discord.Intents = {FLAGS: GatewayIntentBits};
Discord.Partials = Partials;

if (EmbedBuilder && !EmbedBuilder.prototype.addField) {
    EmbedBuilder.prototype.addField = function (name, value, inline = false) {
        return this.addFields({name, value, inline});
    };
}

const originalButtonSetStyle = ButtonBuilder.prototype.setStyle;
ButtonBuilder.prototype.setStyle = function (style) {
    if (typeof style === 'string') {
        const key = style.toUpperCase();
        style = ButtonStyle[key.charAt(0) + key.slice(1).toLowerCase()] || ButtonStyle[key] || style;
    }
    return originalButtonSetStyle.call(this, style);
};

const originalTextInputSetStyle = TextInputBuilder.prototype.setStyle;
TextInputBuilder.prototype.setStyle = function (style) {
    if (typeof style === 'string') {
        const key = style.toUpperCase();
        style = TextInputStyle[key.charAt(0) + key.slice(1).toLowerCase()] || TextInputStyle[key] || style;
    }
    return originalTextInputSetStyle.call(this, style);
};

if (BaseInteraction && !BaseInteraction.prototype.isSelectMenu) {
    BaseInteraction.prototype.isSelectMenu = BaseInteraction.prototype.isStringSelectMenu || function () {
        return false;
    };
}

const normalizeComponentType = (type) => {
    if (typeof type !== 'string') return type;
    if (type === 'SELECT_MENU') return ComponentType.StringSelect;
    if (type === 'STRING_SELECT') return ComponentType.StringSelect;
    if (type === 'USER_SELECT') return ComponentType.UserSelect;
    if (type === 'ROLE_SELECT') return ComponentType.RoleSelect;
    if (type === 'MENTIONABLE_SELECT') return ComponentType.MentionableSelect;
    if (type === 'CHANNEL_SELECT') return ComponentType.ChannelSelect;
    if (type === 'TEXT_INPUT') return ComponentType.TextInput;
    if (type === 'BUTTON') return ComponentType.Button;
    if (type === 'ACTION_ROW') return ComponentType.ActionRow;
    const pascal = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return ComponentType[pascal] || ComponentType[type] || type;
};

const normalizeStyle = (style) => {
    if (typeof style !== 'string') return style;
    const up = style.toUpperCase();
    return ButtonStyle[up.charAt(0) + up.slice(1).toLowerCase()] || ButtonStyle[up] || TextInputStyle[up.charAt(0) + up.slice(1).toLowerCase()] || TextInputStyle[up] || style;
};

function normalizeComponents(components) {
    if (!Array.isArray(components)) return components;
    return components.map(comp => {
        if (!comp || typeof comp !== 'object') return comp;
        if (typeof comp.toJSON === 'function') return comp;
        const newComp = {...comp};
        if (newComp.type) newComp.type = normalizeComponentType(newComp.type);
        if (newComp.style) newComp.style = normalizeStyle(newComp.style);
        if (newComp.components) newComp.components = normalizeComponents(newComp.components);
        return newComp;
    });
}

function normalizeMessageOptions(options) {
    if (!options || typeof options !== 'object') return options;
    const cloned = {...options};
    if (cloned.components) cloned.components = normalizeComponents(cloned.components);
    if (cloned.embeds && Array.isArray(cloned.embeds)) {
        cloned.embeds = cloned.embeds.map(e => e?.data ? e : (e instanceof EmbedBuilder ? e : new EmbedBuilder(e)));
    }
    return cloned;
}

if (MessagePayload && MessagePayload.create) {
    const originalMessagePayloadCreate = MessagePayload.create;
    MessagePayload.create = function (...args) {
        if (args[1]) args[1] = normalizeMessageOptions(args[1]);
        return originalMessagePayloadCreate.apply(this, args);
    };
}

const originalResolve = PermissionsBitField.resolve;
PermissionsBitField.resolve = function (permission, ...args) {
    if (typeof permission === 'string') {
        const upper = permission.toUpperCase();
        if (permissionNameMap[upper]) permission = permissionNameMap[upper];
        else {
            const pascal = permission.toLowerCase().split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
            if (Discord.PermissionFlagsBits && Discord.PermissionFlagsBits[pascal]) permission = Discord.PermissionFlagsBits[pascal];
        }
    }
    return originalResolve.call(this, permission, ...args);
};

function patchCollector(target) {
    if (!target || !target.prototype || !target.prototype.createMessageComponentCollector) return;
    const original = target.prototype.createMessageComponentCollector;
    target.prototype.createMessageComponentCollector = function (options = {}) {
        if (options.componentType) options.componentType = normalizeComponentType(options.componentType);
        return original.call(this, options);
    };
}

patchCollector(Message);
patchCollector(InteractionResponse);

if (Guild && !Object.getOwnPropertyDescriptor(Guild.prototype, 'me')) {
    Object.defineProperty(Guild.prototype, 'me', {
        get() {
            return this.members.me;
        }
    });
}

require.cache[require.resolve('discord.js')].exports = Discord;

module.exports = Discord;