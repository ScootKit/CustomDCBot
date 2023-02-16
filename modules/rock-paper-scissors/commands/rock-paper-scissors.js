const {localize} = require('../../../src/functions/localize');
const {MessageEmbed, MessageActionRow, MessageButton} = require('discord.js');

const rpsgames = [];
const moves = ['🪨 ' + localize('rock-paper-scissors', 'stone'), '📄 ' + localize('rock-paper-scissors', 'paper'), '✂️ ' + localize('rock-paper-scissors', 'scissors')];
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
 * Generates a row with the buttons for the game
 * @returns {MessageActionRow}
 */
function rpsrow() {
    return new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId('rps_scissors')
                .setLabel(localize('rock-paper-scissors', 'scissors'))
                .setStyle('PRIMARY')
                .setEmoji('✂️')
        )
        .addComponents(
            new MessageButton()
                .setCustomId('rps_stone')
                .setLabel(localize('rock-paper-scissors', 'stone'))
                .setStyle('PRIMARY')
                .setEmoji('🪨')
        )
        .addComponents(
            new MessageButton()
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
    return new MessageActionRow()
        .addComponents(
            new MessageButton()
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
    return new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId('user1')
                .setLabel(user1.tag)
                .setEmoji(stateemoji[state1] || '')
                .setStyle(statestyle[state1])
                .setDisabled(true)
        )
        .addComponents(
            new MessageButton()
                .setCustomId('vs')
                .setStyle('SECONDARY')
                .setEmoji('⚔️')
                .setDisabled(true)
        )
        .addComponents(
            new MessageButton()
                .setCustomId('user2')
                .setLabel(user2.tag)
                .setEmoji(stateemoji[state2] || '')
                .setStyle(statestyle[state2])
                .setDisabled(true)
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

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('user');

    let user2;
    if (member && interaction.user.id !== member.id) user2 = member.user;
    else user2 = interaction.client.user;

    if (!user2.bot) {
        const confirmmsg = await interaction.reply({
            content: localize('rock-paper-scissors', 'challenge-message', {t: member.toString(), u: interaction.user.toString()}),
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
        const confirmed = await confirmmsg.awaitMessageComponent({filter: i => i.user.id === user2.id, componentType: 'BUTTON', time: 120000}).catch(() => {});
        if (!confirmed) return interaction.editReply({content: localize('rock-paper-scissors', 'invite-expired', {u: interaction.user.toString(), i: "<@" + user2.id + ">"}), components: []});
    }

    const embed = new MessageEmbed()
        .setTitle(localize('rock-paper-scissors', 'rps-title'))
        .setDescription(localize('rock-paper-scissors', 'rps-description')); // Something like 'Choose your weapon!' or 'Choose your move!'

    const msg = await interaction.editReply({embeds: [embed], components: [rpsrow(), generatePlayer(interaction.user, user2, 'none', user2.bot ? 'selected' : 'none')], fetchReply: true});

    rpsgames[msg.id] = {
        user1: interaction.user,
        user2,
        msg: msg.id,
        state1: 'none',
        state2: user2.bot ? 'selected' : 'none'
    };

    const collector = msg.createMessageComponentCollector({componentType: 'BUTTON', filter: i => i.user.id === interaction.user.id || i.user.id === user2.id});
    collector.on('collect', i => {
        const game = rpsgames[i.message.id];

        if (i.customId === 'rps_playagain') return i.update({components: resetGame(game)});

        if (i.user.id === game.user1.id) {
            game.state1 = 'selected';
            game.selected1 = i.customId;
        } else if (i.user.id === game.user2.id) {
            game.state2 = 'selected';
            game.selected2 = i.customId;
        }

        rpsgames[i.message.id] = game;
        if (!game.selected1 || (!game.selected2 && !user2.bot)) return i.update({components: [rpsrow(), generatePlayer(game.user1, game.user2, game.state1, game.state2)]});

        let resU1 = '';
        let components = [];
        if (user2.bot) {
            const picked = moves[Math.floor(Math.random() * 3)];

            if (i.customId === 'rps_stone') resU1 = moves[0];
            else if (i.customId === 'rps_paper') resU1 = moves[1];
            else if (i.customId === 'rps_scissors') resU1 = moves[2];

            if (picked === resU1) {
                win1 = localize('rock-paper-scissors', 'tie');
                win2 = localize('rock-paper-scissors', 'tie');
            } else if (picked === moves[0] && resU1 === moves[1]) win1 = localize('rock-paper-scissors', 'won');
            else if (picked === moves[0] && resU1 === moves[2]) win1 = localize('rock-paper-scissors', 'lost');
            else if (picked === moves[1] && resU1 === moves[0]) win1 = localize('rock-paper-scissors', 'lost');
            else if (picked === moves[1] && resU1 === moves[2]) win1 = localize('rock-paper-scissors', 'won');
            else if (picked === moves[2] && resU1 === moves[0]) win1 = localize('rock-paper-scissors', 'won');
            else if (picked === moves[2] && resU1 === moves[1]) win1 = localize('rock-paper-scissors', 'lost');
            if (picked === moves[0] && resU1 === moves[1]) win2 = localize('rock-paper-scissors', 'lost');
            else if (picked === moves[0] && resU1 === moves[2]) win2 = localize('rock-paper-scissors', 'won');
            else if (picked === moves[1] && resU1 === moves[0]) win2 = localize('rock-paper-scissors', 'won');
            else if (picked === moves[1] && resU1 === moves[2]) win2 = localize('rock-paper-scissors', 'lost');
            else if (picked === moves[2] && resU1 === moves[0]) win2 = localize('rock-paper-scissors', 'lost');
            else if (picked === moves[2] && resU1 === moves[1]) win2 = localize('rock-paper-scissors', 'won');

            game.state1 = win1;
            game.state2 = win2;
            rpsgames[i.message.id] = game;

            if (picked === resU1) embed.setTitle(localize('rock-paper-scissors', 'its-a-tie-try-again'));
            embed.setDescription('<@' + game.user1.id + '>: **' + resU1 + '**' + (resU1 !== picked ? ' (' + win1 + ')' : '') + '\n<@' + game.user2.id + '>: **' + picked + '**' + (resU1 !== picked ? ' (' + win2 + ')' : ''));
            if (picked === resU1) components = resetGame(game);
            else components = [generatePlayer(game.user1, game.user2, win1, win2), playagain()];
        } else {
            let resU2 = '';
            if (game.selected1 === 'rps_stone') resU2 = moves[0];
            else if (game.selected1 === 'rps_paper') resU2 = moves[1];
            else if (game.selected1 === 'rps_scissors') resU2 = moves[2];

            if (game.selected2 === 'rps_stone') resU1 = moves[0];
            else if (game.selected2 === 'rps_paper') resU1 = moves[1];
            else if (game.selected2 === 'rps_scissors') resU1 = moves[2];

            if (resU1 === resU2) {
                win1 = localize('rock-paper-scissors', 'tie');
                win2 = localize('rock-paper-scissors', 'tie');
            } else if (resU2 === moves[0] && resU1 === moves[1]) win1 = localize('rock-paper-scissors', 'won');
            else if (resU2 === moves[0] && resU1 === moves[2]) win1 = localize('rock-paper-scissors', 'lost');
            else if (resU2 === moves[1] && resU1 === moves[0]) win1 = localize('rock-paper-scissors', 'lost');
            else if (resU2 === moves[1] && resU1 === moves[2]) win1 = localize('rock-paper-scissors', 'won');
            else if (resU2 === moves[2] && resU1 === moves[0]) win1 = localize('rock-paper-scissors', 'won');
            else if (resU2 === moves[2] && resU1 === moves[1]) win1 = localize('rock-paper-scissors', 'lost');
            if (resU2 === moves[0] && resU1 === moves[1]) win2 = localize('rock-paper-scissors', 'lost');
            else if (resU2 === moves[0] && resU1 === moves[2]) win2 = localize('rock-paper-scissors', 'won');
            else if (resU2 === moves[1] && resU1 === moves[0]) win2 = localize('rock-paper-scissors', 'won');
            else if (resU2 === moves[1] && resU1 === moves[2]) win2 = localize('rock-paper-scissors', 'lost');
            else if (resU2 === moves[2] && resU1 === moves[0]) win2 = localize('rock-paper-scissors', 'lost');
            else if (resU2 === moves[2] && resU1 === moves[1]) win2 = localize('rock-paper-scissors', 'won');

            game.state1 = win1;
            game.state2 = win2;
            rpsgames[i.message.id] = game;

            if (resU1 === resU2) embed.setTitle(localize('rock-paper-scissors', 'its-a-tie-try-again'));
            embed.setDescription('<@' + game.user1.id + '>: **' + resU2 + '**' + (resU1 !== resU2 ? ' (' + win2 + ')' : '') + '\n<@' + game.user2.id + '>: **' + resU1 + '**' + (resU1 !== resU2 ? ' (' + win1 + ')' : ''));
            if (resU1 === resU2) components = resetGame(game);
            else components = [generatePlayer(game.user1, game.user2, win2, win1), playagain()];
        }
        i.update({embeds: [embed], components});
    });
};


module.exports.config = {
    name: 'rock-paper-scissors',
    description: localize('rock-paper-scissors', 'command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('rock-paper-scissors', 'user-description')
        }
    ]
};
