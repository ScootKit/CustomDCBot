const {localize} = require('../../../src/functions/localize');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ComponentType,
    MessageEmbed
} = require('discord.js');
const {formatDiscordUserName} = require('../../../src/functions/helpers');

const rpsgames = [];
const moves = ['🪨 ' + localize('rock-paper-scissors', 'stone'), '📄 ' + localize('rock-paper-scissors', 'paper'), '✂️ ' + localize('rock-paper-scissors', 'scissors')];
const movesDouble = [...moves, ...moves];
const statestyle = {
    none: 'PRIMARY',
    selected: 'SECONDARY',
    [localize('rock-paper-scissors', 'tie')]: 'PRIMARY',
    [localize('rock-paper-scissors', 'won')]: 'SUCCESS',
    [localize('rock-paper-scissors', 'lost')]: 'DANGER'
};
const stateemoji = {
    none: '⏰',
    selected: '✅'
};

/**
 * Finds the winner of the game
 * @param {String} move1
 * @param {String} move2
 * @returns {{win1: string, win2: string}}
 */
function findWinner(move1, move2) {
    let win1 = '', win2 = '';
    if (move1 === move2) {
        win1 = localize('rock-paper-scissors', 'tie');
        win2 = localize('rock-paper-scissors', 'tie');
    } else {
        for (let j = 0; j < moves.length; j++) {
            if (move2 === moves[j] && move1 === movesDouble[j + 1]) {
                win1 = localize('rock-paper-scissors', 'won');
                win2 = localize('rock-paper-scissors', 'lost');
            } else if (move2 === moves[j] && move1 === movesDouble[j + 2]) {
                win1 = localize('rock-paper-scissors', 'lost');
                win2 = localize('rock-paper-scissors', 'won');
            }
        }
    }
    return {
        win1,
        win2
    };
}

/**
 * Generates a row with the buttons for the game
 * @returns {MessageActionRow}
 */
function rpsrow() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('rps_scissors')
                .setLabel(localize('rock-paper-scissors', 'scissors'))
                .setStyle('PRIMARY')
                .setEmoji('✂️')
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId('rps_stone')
                .setLabel(localize('rock-paper-scissors', 'stone'))
                .setStyle('PRIMARY')
                .setEmoji('🪨')
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId('rps_paper')
                .setLabel(localize('rock-paper-scissors', 'paper'))
                .setStyle('PRIMARY')
                .setEmoji('📄')
        );
}

/**
 * Generates a row with a play again button
 * @returns {MessageActionRow}
 */
function playagain() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('rps_playagain')
                .setLabel(localize('rock-paper-scissors', 'play-again'))
                .setStyle('SECONDARY')
        );
}

/**
 * Generates a row which displays the players and their current state
 * @param {User} user1
 * @param {User} user2
 * @param {String} state1
 * @param {String} state2
 * @returns {MessageActionRow}
 */
function generatePlayer(user1, user2, state1, state2) {
    const b1 = new ButtonBuilder()
        .setCustomId('rps_user1')
        .setLabel(formatDiscordUserName(user1))
        .setStyle(statestyle[state1])
        .setDisabled(true);
    if (stateemoji[state1]) b1.setEmoji(stateemoji[state1]);
    const b2 = new ButtonBuilder()
        .setCustomId('rps_user2')
        .setLabel(formatDiscordUserName(user2))
        .setStyle(statestyle[state1])
        .setDisabled(true);
    if (stateemoji[state1]) b2.setEmoji(stateemoji[state2]);

    return new ActionRowBuilder()
        .addComponents(
            b1
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId('rps_vs')
                .setStyle('SECONDARY')
                .setEmoji('⚔️')
                .setDisabled(true)
        )
        .addComponents(
            b2
        );
}

/**
 * Resets the game
 * @param {Object} game
 * @returns {[MessageActionRow, MessageActionRow]}
 */
function resetGame(game) {
    game.state1 = 'none';
    game.state2 = game.user2.bot ? 'selected' : 'none';
    delete game.selected1;
    delete game.selected2;
    rpsgames[game.msg] = game;
    return [rpsrow(), generatePlayer(game.user1, game.user2, game.state1, game.state2)];
}

/**
 * Generates a string with the users to mention
 * @param {Object} game
 * @returns string
 */
function mentionUsers(game) {
    let mention = '';
    if (game.state1 === 'none') mention = mention + '<@' + game.user1.id + '>';
    if (!game.user2.bot && game.state2 === 'none') mention = mention + (mention === '' ? '' : ' ') + '<@' + game.user2.id + '>';
    return mention || null;
}

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('user');

    let user2;
    if (member && interaction.user.id !== member.id) user2 = member.user;
    else user2 = interaction.client.user;

    let confirmed;
    if (!user2.bot) {
        const confirmmsg = await interaction.reply({
            content: localize('rock-paper-scissors', 'challenge-message', {
                t: member.toString(),
                u: interaction.user.toString()
            }),
            allowedMentions: {
                users: [user2.id]
            },
            fetchReply: true,
            components: [
                {
                    type: 'ACTION_ROW',
                    components: [
                        {
                            type: 'BUTTON',
                            style: 'PRIMARY',
                            customId: 'accept-invite',
                            label: localize('tic-tac-toe', 'accept-invite')
                        },
                        {
                            type: 'BUTTON',
                            style: 'SECONDARY',
                            customId: 'deny-invite',
                            label: localize('tic-tac-toe', 'deny-invite')
                        }
                    ]
                }
            ]
        });
        confirmed = await confirmmsg.awaitMessageComponent({
            filter: i => i.user.id === user2.id,
            componentType: ComponentType.Button,
            time: 120000
        }).catch(() => {
        });
        if (!confirmed) return confirmmsg.update({
            content: localize('rock-paper-scissors', 'invite-expired', {
                u: interaction.user.toString(),
                i: '<@' + user2.id + '>'
            }),
            components: []
        });
        if (confirmed.customId === 'deny-invite') return confirmed.update({
            content: localize('rock-paper-scissors', 'invite-denied', {
                u: interaction.user.toString(),
                i: '<@' + user2.id + '>'
            }),
            components: []
        });
    }

    const embed = new MessageEmbed()
        .setTitle(localize('rock-paper-scissors', 'rps-title'))
        .setDescription(localize('rock-paper-scissors', 'rps-description'));

    const msg = await (confirmed || interaction)[confirmed ? 'update' : 'reply']({
        content: '<@' + interaction.user.id + '>' + (user2.bot ? '' : ' <@' + user2.id + '>'),
        embeds: [embed],
        components: [rpsrow(), generatePlayer(interaction.user, user2, 'none', user2.bot ? 'selected' : 'none')].map((v) => v.toJSON()),
        fetchReply: true
    });

    rpsgames[msg.id] = {
        user1: interaction.user,
        user2,
        msg: msg.id,
        state1: 'none',
        state2: user2.bot ? 'selected' : 'none'
    };

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id || i.user.id === user2.id
    });
    collector.on('collect', i => {
        const game = rpsgames[i.message.id];

        if (i.customId === 'rps_playagain') return i.update({
            components: resetGame(game).map(v => v.toJSON()),
            content: mentionUsers(game)
        });

        if (i.user.id === game.user1.id) {
            game.state1 = 'selected';
            game.selected1 = i.customId;
        } else if (i.user.id === game.user2.id) {
            game.state2 = 'selected';
            game.selected2 = i.customId;
        }

        rpsgames[i.message.id] = game;
        if (!game.selected1 || (!game.selected2 && !user2.bot)) return i.update({
            content: mentionUsers(game),
            components: [rpsrow(), generatePlayer(game.user1, game.user2, game.state1, game.state2)].map(v => v.toJSON())
        });

        let resU1 = '';
        let winResult = {};
        let components = [];
        if (user2.bot) {
            const picked = moves[Math.floor(Math.random() * moves.length)];

            if (i.customId === 'rps_stone') resU1 = moves[0];
            else if (i.customId === 'rps_paper') resU1 = moves[1];
            else if (i.customId === 'rps_scissors') resU1 = moves[2];

            winResult = findWinner(resU1, picked);
            game.state1 = winResult.win1;
            game.state2 = winResult.win2;
            rpsgames[i.message.id] = game;

            if (picked === resU1) embed.setTitle(localize('rock-paper-scissors', 'its-a-tie-try-again'));
            else embed.setTitle(localize('rock-paper-scissors', 'rps-title'));
            embed.setDescription('<@' + game.user1.id + '>: **' + resU1 + '**' + (resU1 !== picked ? ' (' + game.state1 + ')' : '') + '\n<@' + game.user2.id + '>: **' + picked + '**' + (resU1 !== picked ? ' (' + game.state2 + ')' : ''));

            if (picked === resU1) components = resetGame(game);
            else components = [generatePlayer(game.user1, game.user2, game.state1, game.state2), playagain()];
        } else {
            let resU2 = '';
            if (game.selected1 === 'rps_stone') resU2 = moves[0];
            else if (game.selected1 === 'rps_paper') resU2 = moves[1];
            else if (game.selected1 === 'rps_scissors') resU2 = moves[2];

            if (game.selected2 === 'rps_stone') resU1 = moves[0];
            else if (game.selected2 === 'rps_paper') resU1 = moves[1];
            else if (game.selected2 === 'rps_scissors') resU1 = moves[2];

            winResult = findWinner(resU1, resU2);
            game.state1 = winResult.win1;
            game.state2 = winResult.win2;
            rpsgames[i.message.id] = game;

            if (resU1 === resU2) embed.setTitle(localize('rock-paper-scissors', 'its-a-tie-try-again'));
            else embed.setTitle(localize('rock-paper-scissors', 'rps-title'));
            embed.setDescription('<@' + game.user1.id + '>: **' + resU2 + '**' + (resU1 !== resU2 ? ' (' + game.state2 + ')' : '') + '\n<@' + game.user2.id + '>: **' + resU1 + '**' + (resU1 !== resU2 ? ' (' + game.state1 + ')' : ''));

            if (resU1 === resU2) components = resetGame(game);
            else components = [generatePlayer(game.user1, game.user2, game.state2, game.state1), playagain()];
        }
        i.update({
            content: mentionUsers(game),
            embeds: [embed],
            components: components.map(f => f.toJSON())
        });
    });
};


module.exports.config = {
    name: 'rock-paper-scissors',
    description: localize('rock-paper-scissors', 'command-description'),

    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('tic-tac-toe', 'user-description')
        }
    ]
};