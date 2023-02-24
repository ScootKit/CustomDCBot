const {localize} = require('../../../src/functions/localize');
const {MessageActionRow, MessageButton} = require('discord.js');

const cards = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'draw4'];
const colors = ['red', 'blue', 'green', 'yellow'];
const colorEmojis = {'red': '🟥', 'blue': '🟦', 'green': '🟩', 'yellow': '🟨', 'black': '⬛'};

const publicrow = new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('uno-deck')
            .setLabel(localize('uno', 'view-deck'))
            .setStyle('PRIMARY')
    );

/**
 * Build a deck for a player
 * @param {Object} player
 * @return {MessageActionRow}
 */
function buildDeck(player, game) {
    const controlrow = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId('uno-draw')
                .setLabel(localize('uno', 'draw'))
                .setStyle('SECONDARY'),
            new MessageButton()
                .setCustomId('uno-uno')
                .setLabel(localize('uno', 'uno'))
                .setStyle('SECONDARY')
        );

    const cardrow1 = new MessageActionRow();
    const cardrow2 = new MessageActionRow();
    const cardrow3 = new MessageActionRow();
    const cardrow4 = new MessageActionRow();

    player.cards.slice(0, 20).forEach((c, i) => {
        let row = cardrow1;
        if (i > 4) row = cardrow2;
        if (i > 9) row = cardrow3;
        if (i > 14) row = cardrow4;

        row.addComponents(
            new MessageButton()
                .setCustomId('uno-card-' + c.name + '-' + c.color)
                .setLabel(c.name)
                .setEmoji(colorEmojis[c.color])
                .setStyle('PRIMARY')
                .setDisabled(game.lastCard.color !== c.color && game.lastCard.name !== c.name)
        );
    });

    const rows = [controlrow, cardrow1];
    if (cardrow2.components.length > 0) rows.push(cardrow2);
    if (cardrow3.components.length > 0) rows.push(cardrow3);
    if (cardrow4.components.length > 0) rows.push(cardrow4);
    return rows;
}

/**
 * Handle a button click
 * @param {MessageComponentInteraction} i
 */
function perPlayerHandler(i) {

}

module.exports.run = async function (interaction) {
    const now = Date.now();
    const msg = await interaction.reply({
        content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: '**1**', timestamp: '<t:' + Math.floor(now / 1000 + 2 * 60) + ':R>'}),
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

    const game = {
        players: [{
            id: interaction.user.id,
            name: interaction.user.username,
            interaction,
            cards: [],
            uno: false
        }],
        lastCard: {name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]}
    };
    const collector = msg.createMessageComponentCollector({componentType: 'BUTTON'});
    collector.on('collect', async i => {
        if (i.customId === 'uno-join') {
            // if (game.players.some(p => p.id === i.user.id)) return i.reply({content: localize('uno', 'already-joined'), ephemeral: true});
            game.players.push({
                id: i.user.id,
                name: i.user.username,
                interaction: i,
                cards: [],
                uno: false
            });
            i.update({
                content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: '**' + game.players.length + '**', timestamp: '<t:' + Math.floor(now / 1000 + 2 * 60) + ':R>'}),
                allowedMentions: {
                    users: []
                }
            });
        } else if (i.customId === 'uno-deck') {
            const m = await i.reply({components: buildDeck(game.players.find(p => p.id === i.user.id), game), fetchReply: true, ephemeral: true});
            m.createMessageComponentCollector({componentType: 'BUTTON'}).on('collect', perPlayerHandler);
        }
    });

    setTimeout(() => {
        if (game.players.length < 2) return interaction.editReply({content: localize('uno', 'not-enough-players'), components: []});

        interaction.editReply({content: localize('uno', 'game-started', {u: game.players.map(u => '<@' + u.id + '>').join(' ')}) + '\n' + game.lastCard.color + ' ' + game.lastCard.name, components: [publicrow]});
        game.players.forEach(async p => {
            for (let i = 0; i < 7; i++) p.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});

            const m = await p.interaction.followUp({components: buildDeck(p, game), fetchReply: true, ephemeral: true});
            m.createMessageComponentCollector({componentType: 'BUTTON'}).on('collect', perPlayerHandler);
        });
    }, 4000); // 120000
};


module.exports.config = {
    name: 'uno',
    description: localize('uno', 'command-description'),
    defaultPermission: true
};
