const {localize} = require('../../../src/functions/localize');
const {MessageActionRow, MessageButton} = require('discord.js');

const cards = [
    '0',
    '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '1', '2', '3', '4', '5', '6', '7', '8', '9',
    localize('uno', 'skip'), localize('uno', 'skip'),
    localize('uno', 'reverse'), localize('uno', 'reverse'),
    localize('uno', 'draw2'), localize('uno', 'draw2'),
    localize('uno', 'color'),
    localize('uno', 'colordraw4')
];
const colorEmojis = {'red': '🟥', 'blue': '🟦', 'green': '🟩', 'yellow': '🟨'};
const colors = Object.keys(colorEmojis);

const publicrow = new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('uno-deck')
            .setLabel(localize('uno', 'view-deck'))
            .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('uno-uno')
            .setLabel(localize('uno', 'uno'))
            .setStyle('PRIMARY')
    );

/**
 * Build a deck for a player
 * @param {Object} player
 * @param {Object} game
 * @param {Boolean} neutral
 * @return {MessageActionRow}
 */
function buildDeck(player, game, neutral = false) {
    const controlrow = new MessageActionRow();
    if (player.turn && !player.blockRedraw) controlrow.addComponents(
        new MessageButton()
            .setCustomId('uno-draw')
            .setLabel(localize('uno', 'draw'))
            .setStyle('SECONDARY')
    );
    else controlrow.addComponents(
        new MessageButton()
            .setCustomId('uno-update')
            .setLabel(localize('uno', 'update-button'))
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
                .setCustomId('uno-card-' + c.name + '-' + c.color + '-' + i)
                .setLabel(c.name)
                .setEmoji(colorEmojis[c.color])
                .setStyle(!neutral && canUseCard(game, c, player.cards) ? 'PRIMARY' : 'SECONDARY')
                .setDisabled(neutral || (player.turn ? !canUseCard(game, c, player.cards) : true))
        );
    });

    const rows = [controlrow, cardrow1];
    if (cardrow2.components.length > 0) rows.push(cardrow2);
    if (cardrow3.components.length > 0) rows.push(cardrow3);
    if (cardrow4.components.length > 0) rows.push(cardrow4);
    return rows;
}

/**
 * Checks if the player can use a card
 * @param {Object} game
 * @param {Object} card
 * @param {Array} playerCards
 * @returns {Boolean}
 */
function canUseCard(game, card, playerCards) {
    if (game.pendingDraws > 0 && card.name !== localize('uno', 'draw2') && card.name !== localize('uno', 'colordraw4')) return false;
    if (card.name === localize('uno', 'color') || (card.name === localize('uno', 'colordraw4') && game.lastCard.name !== localize('uno', 'draw2') && !playerCards.some(c => c.color === game.lastCard.color))) return true;
    return game.lastCard.name === card.name || game.lastCard.color === card.color;
}

/**
 * Selects the next player
 * @param {Object} game
 * @param {Object} player
 * @param {Integer} moves
 * @param {Boolean} revSkip
 */
function nextPlayer(game, player, moves = 1, revSkip = false) {
    player.turn = false;
    let next = game.players[player.n + (game.reversed ? -1 * moves : moves)] || game.players[game.reversed ? game.players.length - 1 : 0];
    if (game.players.length === 2 && revSkip) next = player;
    next.turn = true;
    next.uno = false;

    if (game.inactiveTimeout[0]) clearTimeout(game.inactiveTimeout[0]);
    if (game.inactiveTimeout[1]) clearTimeout(game.inactiveTimeout[1]);
    game.inactiveTimeout[0] = setTimeout(() => {
        game.msg.channel.send({content: localize('uno', 'inactive-warn', {u: '<@' + next.id + '>'}), reference: {messageId: game.msg.id, channelId: game.msg.channel.id}});
    }, 1000 * 60);
    game.inactiveTimeout[1] = setTimeout(() => {
        nextPlayer(game, next);
        game.players = game.players.filter(p => p.id !== next.id);
        if (game.players.length <= 1) {
            clearTimeout(game.inactiveTimeout[0]);
            clearTimeout(game.inactiveTimeout[1]);
            return game.msg.edit({content: localize('uno', 'inactive-win', {u: '<@' + game.players[0]?.id + '>'}), components: []});
        }
        game.msg.edit(gameMsg(game));
    }, 1000 * 60 * 2);
}

/**
 * Handle a button click
 * @param {MessageComponentInteraction} i
 * @param {Object} player
 * @param {Object} game
 */
function perPlayerHandler(i, player, game) {
    if (player.turn && game.pendingDraws > 0 && !player.cards.some(c => (c.name === localize('uno', 'draw2') && canUseCard(game, c, player.cards)) || (c.name === localize('uno', 'colordraw4') && canUseCard(game, c, player.cards)))) {
        if (game.justChoosingColor) game.justChoosingColor = false;
        else {
            game.turns++;
            if (game.pendingDraws > 0) {
                for (let j = 0; j < game.pendingDraws; j++) player.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});
                game.pendingDraws = 0;
            }

            nextPlayer(game, player);
            game.players[player.n] = player;
            i.update({content: localize('uno', 'auto-drawn-skip'), components: buildDeck(player, game)});
            return game.msg.edit(gameMsg(game));
        }
    }
    if (i.customId === 'uno-update') return i.update({content: null, components: buildDeck(player, game)});

    if (!player.turn) return i.reply({content: localize('connect-four', 'not-turn'), ephemeral: true});
    game.justChoosingColor = false;

    if (game.inactiveTimeout[0]) clearTimeout(game.inactiveTimeout[0]);
    if (game.inactiveTimeout[1]) clearTimeout(game.inactiveTimeout[1]);

    game.turns++;
    if (game.pendingDraws > 0 && i.customId !== 'uno-dont-use-drawn' && !i.customId.startsWith('uno-color-') && i.customId.startsWith('uno-card-' + localize('uno', 'draw2') + '-') && i.customId.startsWith('uno-card-' + localize('uno', 'colordraw4') + '-')) {
        for (let j = 0; j < game.pendingDraws; j++) player.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});
        game.pendingDraws = 0;
    }
    if (i.customId === 'uno-draw') {
        player.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});

        const c = player.cards[player.cards.length - 1];
        if (canUseCard(game, c, player.cards)) {
            player.blockRedraw = true;
            i.update({
                content: localize('uno', 'use-drawn'),
                components: [
                    new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('uno-card-' + c.name + '-' + c.color)
                                .setLabel(c.name)
                                .setEmoji(colorEmojis[c.color])
                                .setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId('uno-dont-use-drawn')
                                .setLabel(localize('uno', 'dont-use-drawn'))
                                .setStyle('SECONDARY')
                        )
                ],
                ephemeral: true
            });
        } else {
            nextPlayer(game, player);
            i.update({components: buildDeck(player, game)});
            game.msg.edit(gameMsg(game));
        }
    } else if (i.customId.startsWith('uno-card-')) {
        player.blockRedraw = false;
        if (player.cards.length === 2 && !player.uno) {
            player.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});
            nextPlayer(game, player);
            i.update({content: localize('uno', 'missing-uno'), components: buildDeck(player, game)});
            return game.msg.edit(gameMsg(game));
        }
        const name = i.customId.split('-')[2];
        const color = i.customId.split('-')[3];
        if (!canUseCard(game, {name, color}, player.cards)) return i.update({content: localize('uno', 'invalid-card', {c: colorEmojis[color] + ' **' + name + '**'}), components: buildDeck(player, game)});

        const toremove = player.cards.find(c => c.name === name && c.color === color);
        if (!toremove) return i.update({content: localize('uno', 'used-card', {c: colorEmojis[color] + ' **' + name + '**'}), components: buildDeck(player, game)});

        player.cards.splice(player.cards.indexOf(toremove), 1);

        if (player.cards.length === 0) {
            i.update({content: localize('uno', 'win-you'), components: []});
            return game.msg.edit({content: localize('uno', 'win', {u: '<@' + player.id + '>', turns: '**' + game.turns + '**'}), components: []});
        }
        if (name === localize('uno', 'reverse')) game.reversed = !game.reversed;

        if (name === localize('uno', 'skip')) nextPlayer(game, player, 2, true);
        else if (name === localize('uno', 'color') || name === localize('uno', 'colordraw4')) {
            if (name === localize('uno', 'colordraw4')) {
                game.pendingDraws = game.pendingDraws + 4;
                game.justChoosingColor = true;
            }
            return i.update({content: localize('uno', 'choose-color'), components: [
                new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('uno-color-red-' + name)
                            .setEmoji(colorEmojis.red)
                            .setStyle('PRIMARY'),
                        new MessageButton()
                            .setCustomId('uno-color-blue-' + name)
                            .setEmoji(colorEmojis.blue)
                            .setStyle('PRIMARY'),
                        new MessageButton()
                            .setCustomId('uno-color-green-' + name)
                            .setEmoji(colorEmojis.green)
                            .setStyle('PRIMARY'),
                        new MessageButton()
                            .setCustomId('uno-color-yellow-' + name)
                            .setEmoji(colorEmojis.yellow)
                            .setStyle('PRIMARY')
                    ),
                ...buildDeck(player, game, true).slice(1)
            ]});
        } else nextPlayer(game, player, 1, name === localize('uno', 'reverse'));
        if (name === localize('uno', 'draw2')) game.pendingDraws = game.pendingDraws + 2;

        game.previousCards = [game.previousCards[1], game.previousCards[2], colorEmojis[game.lastCard.color] + ' ' + game.lastCard.name];
        game.lastCard = {name, color};
        i.update({content: null, components: buildDeck(player, game)});
        game.msg.edit(gameMsg(game));
    } else if (i.customId === 'uno-dont-use-drawn' || i.customId.startsWith('uno-color-')) {
        player.blockRedraw = false;
        if (i.customId.startsWith('uno-color-')) game.lastCard = {name: i.customId.split('-')[3], color: i.customId.split('-')[2]};
        nextPlayer(game, player);
        i.update({content: null, components: buildDeck(player, game)});
        game.msg.edit(gameMsg(game));
    }
    game.players[player.n] = player;
}

/**
 * Returns the game message
 * @param {Object} game
 * @returns {String}
 */
function gameMsg(game) {
    return {
        content: game.players.map(u => localize('uno', 'user-cards', {u: '<@' + u.id + '>', cards: '**' + (u.cards.length === 0 ? 7 : u.cards.length) + '**'})).join(', ') + '\n' +
            localize('uno', 'turn', {u: '<@' + game.players.find(p => p.turn).id + '>'}) + '\n' +
            (game.previousCards.length > 0 ? localize('uno', 'previous-cards') + game.previousCards.filter(c => c).join(' → ') + '\n' : '') + '\n' +
            colorEmojis[game.lastCard.color] + ' **' + game.lastCard.name + '**' +
            (game.players.some(p => p.uno) ? '\nUno: ' + game.players.filter(p => p.uno).map(p => '<@' + p.id + '>').join(' ') : '') +
            (game.pendingDraws > 0 ? '\n\n⚠️️ ' + localize('uno', 'pending-draws', {count: '**' + game.pendingDraws + '**'}) : ''),
        allowedMentions: {
            users: [game.players.find(p => p.turn).id]
        },
        components: [publicrow]
    };
}

module.exports.run = async function (interaction) {
    const timestamp = '<t:' + Math.round(Date.now() / 1000 + 180) + ':R>';
    const msg = await interaction.reply({
        content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: '**1**', timestamp}),
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
                    },
                    {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        customId: 'uno-start',
                        label: localize('uno', 'start-game')
                    }
                ]
            }
        ]
    });

    const game = {
        players: [{
            id: interaction.user.id,
            interaction,
            n: 0,
            cards: [],
            uno: false,
            turn: false,
            blockRedraw: false
        }],
        lastCard: {name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]},
        previousCards: [],
        inactiveTimeout: [],
        msg,
        turns: 0,
        reversed: false,
        justChoosingColor: false,
        pendingDraws: 0
    };

    /**
     * Starts the game
     */
    async function startGame() {
        if (game.players.length < 2) {
            collector.stop();
            return interaction.editReply({content: localize('uno', 'not-enough-players'), components: []}).catch(() => {});
        }

        game.players[Math.floor(Math.random() * game.players.length)].turn = true;
        await interaction.editReply(gameMsg(game)).catch(() => {});
        game.players.forEach(async p => {
            for (let i = 0; i < 7; i++) p.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});

            const m = await p.interaction.followUp({components: buildDeck(p, game), fetchReply: true, ephemeral: true});
            m.createMessageComponentCollector({componentType: 'BUTTON'}).on('collect', i => perPlayerHandler(i, p, game));
        });
    }
    const timeout = setTimeout(startGame, 179000);

    const collector = msg.createMessageComponentCollector({componentType: 'BUTTON'});
    collector.on('collect', async i => {
        if (i.customId === 'uno-join') {
            if (game.players.some(p => p.id === i.user.id)) return i.reply({content: localize('uno', 'already-joined'), ephemeral: true});
            if (game.players.length > 45) return i.reply({content: localize('uno', 'max-players'), ephemeral: true});
            game.players.push({
                id: i.user.id,
                interaction: i,
                n: game.players.length,
                cards: [],
                uno: false,
                turn: false,
                blockRedraw: false
            });
            i.update({
                content: localize('uno', 'challenge-message', {u: interaction.user.toString(), count: '**' + game.players.length + '**', timestamp}),
                allowedMentions: {
                    users: []
                }
            });
        } else if (i.customId === 'uno-start') {
            if (game.players[0].id !== i.user.id) return i.reply({content: localize('uno', 'not-host'), ephemeral: true});
            startGame();
            clearTimeout(timeout);
            i.deferUpdate();
        } else if (i.customId === 'uno-deck') {
            const player = game.players.find(p => p.id === i.user.id);
            if (!player) return i.reply({content: localize('uno', 'not-in-game'), ephemeral: true});
            const m = await i.reply({components: buildDeck(player, game), fetchReply: true, ephemeral: true});
            m.createMessageComponentCollector({componentType: 'BUTTON'}).on('collect', int => perPlayerHandler(int, player, game));
        } else if (i.customId === 'uno-uno') {
            const player = game.players.find(p => p.id === i.user.id);
            if (!player) return i.reply({content: localize('uno', 'not-in-game'), ephemeral: true});

            if (player.cards.length === 2) {
                player.uno = true;
                i.reply({content: localize('uno', 'done-uno'), ephemeral: true});
            } else {
                player.cards.push({name: cards[Math.floor(Math.random() * cards.length)], color: colors[Math.floor(Math.random() * colors.length)]});
                i.reply({content: localize('uno', 'cant-uno'), ephemeral: true});
            }
        }
    });
};


module.exports.config = {
    name: 'uno',
    description: localize('uno', 'command-description'),
    defaultPermission: true
};