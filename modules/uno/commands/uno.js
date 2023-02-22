const {localize} = require('../../../src/functions/localize');
const {MessageActionRow, MessageButton} = require('discord.js');

const publicrow = new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('uno-deck')
            .setLabel(localize('uno', 'view-deck'))
            .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('uno-draw')
            .setLabel(localize('uno', 'draw'))
            .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('uno-uno')
            .setLabel(localize('uno', 'uno'))
            .setStyle('PRIMARY')
    );

/**
 * @param {Object} player
 * @return {MessageActionRow}
 */
function buildDeck(player) {
    const row = new MessageActionRow();
    player.cards.forEach(c => {
        row.addComponents(new MessageButton()
            .setCustomId('uno-card-' + c.name)
            .setLabel(c.name)
            .setStyle('PRIMARY'))
    });
    return row;
}

module.exports.run = async function (interaction) {
    const now = Date.now();
    const msg = await interaction.reply({
        content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: "**1**", timestamp: "<t:" + Math.floor(now / 1000 + 2 * 60) + ":R>"}),
        allowedMentions: {
            users: []
        },
        fetchReply: true,
        components: [
            {
                type: 'ACTION_ROW',
                components: [
                    {
                        type: 'BUTTON',
                        style: 'PRIMARY',
                        customId: 'uno-join',
                        label: localize('tic-tac-toe', 'accept-invite')
                    }
                ]
            }
        ]
    });

    let game = {
        players: [{
            id: interaction.user.id,
            name: interaction.user.username,
            interaction,
            cards: [],
            uno: false
        }],
    }
    const collector = msg.createMessageComponentCollector({componentType: "BUTTON"})
	collector.on("collect", async i => {
        if (i.customId === 'uno-join') {
            if (game.players.some(p => p.id === i.user.id)) return i.reply({content: localize('uno', 'already-joined'), ephemeral: true});
            game.players.push({
                id: i.user.id,
                name: i.user.username,
                interaction: i,
                cards: [],
                uno: false
            })
            i.update({
                content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: "**" + game.players.length + "**", timestamp: "<t:" + Math.floor(now / 1000 + 2 * 60) + ":R>"}),
                allowedMentions: {
                    users: []
                }
            })
        }
    });

    setTimeout(() => {
        if (game.players.length < 2) return interaction.editReply({content: localize('uno', 'not-enough-players'), components: []});

        interaction.editReply({content: localize('uno', 'game-started', {u: game.players.map(u => "<@" + u.id + ">").join(' ')}), components: [publicrow]});
        game.players.forEach(p => {
            p.interaction.followUp({content: ".-.", components: [buildDeck(p)], ephemeral: true})
        })
    }, 120000);
};


module.exports.config = {
    name: 'uno',
    description: localize('uno', 'command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('tic-tac-toe', 'user-description')
        }
    ]
};
