const {localize} = require('../../../src/functions/localize');
const {MessageActionRow, MessageButton} = require('discord.js');
const footer = [':one:', ':two:', ':three:', ':four:', ':five:', ':six:', ':seven:', ':eight:', ':nine:', ':keycap_ten:'];

/**
 * Builds the game message
 * @param {Array} grid
 * @param {Integer} fieldSize
 * @param {String} color
 * @param {String} userTurn
 * @param {String} username1
 * @param {String} username2
 * @returns {String}
 */
function gameMessage(grid, fieldSize, color, userTurn, username1, username2) {
    return localize('connect-four', 'game-message', {
        u1: '**' + username1 + '**',
        u2: '**' + username2 + '**',
        c: ':' + color + '_circle:',
        t: userTurn,
        g: grid.map(k => k.join('')).join('\n') + '\n' + footer.slice(0, fieldSize).join('')
    });
}

/**
 * Checks if the user has won diagonally
 * @param {Array} grid
 * @param {Integer} position
 * @param {Integer} y
 * @returns {String}
 */
function checkWinDiag(grid, position, y) {
    const diagonal = [];
    let runningCheck = true;
    let runningPush = false;
    let i = y - 1;
    let j = position - 1;
    while (runningCheck) {
        i++;
        j++;
        if (i === grid.length || j === grid.length + 1) {
            runningCheck = false;
            runningPush = true;
        }
    }
    while (runningPush) {
        i--;
        j--;
        diagonal.push([i, j]);
        if (i === 0 || j === -1) runningPush = false;
    }

    return diagonal;
}

/**
 * Checks if the user has won diagonally left
 * @param {Array} grid
 * @param {Integer} position
 * @param {Integer} y
 * @returns {Array}
 */
function checkWinDiagLeft(grid, position, y) {
    const diagonal = [];
    let runningCheck = true;
    let runningPush = false;
    let i = y - 1;
    let j = position + 1;
    while (runningCheck) {
        i++;
        j--;
        if (i === grid.length || j === -1) {
            runningCheck = false;
            runningPush = true;
        }
    }
    while (runningPush) {
        i--;
        j++;
        diagonal.push([i, j]);
        if (i === 0 || j === grid.length) runningPush = false;
    }

    return diagonal;
}

/**
 * Checks for a tie and if a player has won
 * @param {Array} grid
 * @param {String} color
 * @param {Integer} position
 * @param {Integer} y
 * @returns {String}
 */
function checkWin(grid, color, position, y) {
    let streak = [];
    for (const i in grid) {
        for (const j in grid[i]) {
            if (grid[i][j].includes('_circle')) streak.push(grid[i][j]);
            else streak = [];
            if (streak.length === grid.length * grid[0].length) return 'tie';
        }
    }

    const diagonal = [checkWinDiag(grid, position, y), checkWinDiagLeft(grid, position, y)];
    for (const dir in diagonal) {
        streak = [];
        for (const index in diagonal[dir]) {
            const field = diagonal[dir][index];
            if (grid[field[0]][field[1]] === ':' + color + '_circle:') streak.push(field);
            else streak = [];
            if (streak.length === 4) {
                streak.forEach(k => {
                    grid[k[0]][k[1]] = ':' + color + '_square:';
                });
                return color;
            }
        }
    }

    for (const i in grid) {
        streak = [];
        for (const j in grid[i]) {
            if (grid[i][j] === ':' + color + '_circle:') streak.push([i, j]);
            else streak = [];
            if (streak.length === 4) {
                streak.forEach(k => {
                    grid[k[0]][k[1]] = ':' + color + '_square:';
                });
                return color;
            }
        }
    }

    streak = [];
    for (const i in grid) {
        if (grid[i][position] === ':' + color + '_circle:') streak.push([i, position]);
        else streak = [];
        if (streak.length === 4) {
            streak.forEach(k => {
                grid[k[0]][k[1]] = ':' + color + '_square:';
            });
            return color;
        }
    }
}

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('user');
    if (member.id === interaction.user.id) return interaction.reply({content: localize('connect-four', 'challenge-yourself'), ephemeral: true});
    if (member.user.bot) return interaction.reply({content: localize('connect-four', 'challenge-bot'), ephemeral: true});

    const msg = await interaction.reply({
        content: localize('connect-four', 'challenge-message', {t: member.toString(), u: interaction.user.toString()}),
        allowedMentions: {
            users: [member.id]
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
    const confirmed = await msg.awaitMessageComponent({filter: i => i.user.id === member.id, componentType: 'BUTTON', time: 120000}).catch(() => {});
    if (!confirmed) return msg.edit({content: localize('connect-four', 'invite-expired', {u: interaction.user.toString(), i: '<@' + member.id + '>'}), components: []});
    if (confirmed.customId === 'deny-invite') return confirmed.update({content: localize('connect-four', 'invite-denied', {u: interaction.user.toString(), i: '<@' + member.id + '>'}), components: []});

    const fieldSize = interaction.options.getInteger('field_size') || 7;

    const grid = new Array(fieldSize - 1).fill();
    for (const i in grid) grid[i] = new Array(fieldSize).fill(':white_large_square:');

    const row1 = new MessageActionRow();
    const row2 = new MessageActionRow();
    for (let i = 1; i < fieldSize + 1; i++) {
        (i <= 5 ? row1 : row2).addComponents(
            new MessageButton()
                .setCustomId('c4_' + i)
                .setLabel('' + i)
                .setStyle('PRIMARY')
        );
    }

    let color = Math.random() > 0.5 ? 'red' : 'blue';
    let user = '';
    if (color === 'blue') user = '<@' + interaction.user.id + '>';
    else user = '<@' + member.id + '>';

    confirmed.update({
        content: gameMessage(grid, fieldSize, color, user, member.user.username, interaction.user.username),
        components: fieldSize > 5 ? [row1, row2] : [row1]
    });

    const collector = msg.createMessageComponentCollector({componentType: 'BUTTON', filter: i => i.user.id === interaction.user.id || i.user.id === member.id});
    collector.on('collect', i => {
        if ((color === 'blue' && i.user.id !== interaction.user.id) || (color === 'red' && i.user.id !== member.id)) return i.reply({content: localize('connect-four', 'not-turn'), ephemeral: true});
        const position = parseInt(i.customId.replace('c4_', '')) - 1;

        for (let j = grid.length - 1; j >= 0; j--) {
            if (grid[j][position] === ':white_large_square:') {
                grid[j][position] = ':' + color + '_circle:';
                const winner = checkWin(grid, color, position, j);
                if (winner) {
                    let wintext = localize('connect-four', 'tie');
                    if (winner === 'blue') wintext = localize('connect-four', 'win', {u: '<@' + interaction.user.id + '>'});
                    else if (winner === 'red') wintext = localize('connect-four', 'win', {u: '<@' + member.id + '>'});

                    return i.update({content: wintext + '\n\n' + grid.map(k => k.join('')).join('\n') + '\n' + footer.slice(0, fieldSize).join(''), components: []});
                }

                if (color === 'blue') {
                    user = '<@' + member.id + '>';
                    color = 'red';
                } else {
                    user = '<@' + interaction.user.id + '>';
                    color = 'blue';
                }
                return i.update(gameMessage(grid, fieldSize, color, user, member.user.username, interaction.user.username));
            }
        }
    });
};


module.exports.config = {
    name: 'connect-four',
    description: localize('connect-four', 'command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'USER',
            name: 'user',
            description: localize('tic-tac-toe', 'user-description'),
            required: true
        },
        {
            type: 'INTEGER',
            name: 'field_size',
            description: localize('connect-four', 'field-size-description'),
            minValue: 4,
            maxValue: 10
        }
    ]
};
