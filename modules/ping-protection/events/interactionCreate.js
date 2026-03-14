const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js'); 
const { deleteAllUserData, generateHistoryResponse, generateActionsResponse } = require('../ping-protection');
const { localize } = require('../../../src/functions/localize');

// Interaction handler
module.exports.run = async function (client, interaction) {
    if (!client.botReadyAt) return;
    
    if (interaction.isButton() && interaction.customId.startsWith('ping-protection_')) {
        
        // Ping history pagination
        if (interaction.customId.startsWith('ping-protection_hist-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);

            const replyOptions = await generateHistoryResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return; 
        }

        if (interaction.customId.startsWith('ping-protection_mod-page_')) {
            const parts = interaction.customId.split('_');
            const userId = parts[2];
            const targetPage = parseInt(parts[3]);
            
            const replyOptions = await generateActionsResponse(client, userId, targetPage);
            await interaction.update(replyOptions);
            return;
        }

        // Panel buttons
        const [prefix, action, userId] = interaction.customId.split('_');
        
        const isAdmin = interaction.member.permissions.has('Administrator') || 
                        (client.config.admins || []).includes(interaction.user.id);

        if (['history', 'actions', 'delete'].includes(action)) {
             if (!isAdmin) return interaction.reply({ 
                content: localize('ping-protection', 'no-permission'), 
                flags: MessageFlags.Ephemeral });
        }

        if (action === 'history') {
            const replyOptions = await generateHistoryResponse(client, userId, 1);
            await interaction.reply({ 
                ...replyOptions, 
                flags: MessageFlags.Ephemeral 
            });
        }

        else if (action === 'actions') {
            const replyOptions = await generateActionsResponse(client, userId, 1);
            await interaction.reply({ 
                ...replyOptions, 
                flags: MessageFlags.Ephemeral 
            });
        }
        else if (action === 'delete') {
            const modal = new ModalBuilder()
                .setCustomId(`ping-protection_confirm-delete_${userId}`)
                .setTitle(localize('ping-protection', 'modal-title'));

            const input = new TextInputBuilder()
                .setCustomId('confirmation_text')
                .setLabel(localize('ping-protection', 'modal-label')) 
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(localize('ping-protection', 'modal-phrase'))
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);

            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping-protection_confirm-delete_')) {
        const userId = interaction.customId.split('_')[2];
        const userInput = interaction.fields.getTextInputValue('confirmation_text');
        const requiredPhrase = localize('ping-protection', 'modal-phrase', { locale: interaction.locale }); 

        if (userInput === requiredPhrase) {
            await deleteAllUserData(client, userId);
            await interaction.reply({ 
                content: `✅ ${localize('ping-protection', 'modal-success-data-deletion', {u: userId})}`, 
                flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ 
                content: `❌ ${localize('ping-protection', 'modal-failed')}`, 
                flags: MessageFlags.Ephemeral });
        }
    }
};