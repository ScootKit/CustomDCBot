const {localize} = require('../../../src/functions/localize');
const {randomElementFromArray} = require('../../../src/functions/helpers');

module.exports.run = async function (interaction) {
    const member = interaction.options.getMember('user', true);
    if (member.user.id === interaction.user.id) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('tic-tac-toe', 'self-invite-not-possible', {r: `<@${((await interaction.guild.members.fetch({withPresences: true})).filter(u => u.presence && u.user.id !== interaction.user.id && !u.user.bot).random() || {user: {id: 'RickAstley'}}).user.id}>`})
    });
    const rep = await interaction.reply({
        content: localize('tic-tac-toe', 'challenge-message', {t: member.toString(), u: interaction.user.toString()}),
        allowedMentions: {
            users: [member.user.id]
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
    let started = false;
    let ended = false;
    let endReason = null;
    let gameEndReasonType = null;
    let currentUser = randomElementFromArray([interaction.member, member]);
    const a = rep.createMessageComponentCollector({componentType: 'BUTTON'});
    setTimeout(() => {
        if (started || a.ended) return;
        endReason = localize('tic-tac-toe', 'invite-expired', {u: interaction.user.toString(), i: member.toString()});
        a.stop();
    }, 120000);

    const grid = {
        1: {
            1: null,
            2: null,
            3: null
        },
        2: {
            1: null,
            2: null,
            3: null
        },
        3: {
            1: null,
            2: null,
            3: null
        }
    };

    /**
     * Checks if game ended
     * @private
     * @returns {boolean}
     */
    function checkGameEnded() {
        if (ended) return true;
        let allPassed = true;
        const lastUser = currentUser.user.id === interaction.user.id ? member : interaction.member;

        /**
         * Returns values from blocks above, below, left and right if the block is user owned
         * @param rID ID of the row
         * @param id ID of column
         * @private
         * @returns {{below: boolean, left: boolean, above: boolean, right: boolean}|void}
         */
        function checkBlock(rID, id) {
            rID = parseInt(rID);
            id = parseInt(id);
            const value = grid[rID][id];
            if (value !== lastUser.user.id) return;
            let above, below;
            if (!grid[rID - 1]) above = null;
            else above = grid[rID - 1][id] === value;
            if (!grid[rID + 1]) below = null;
            else below = grid[rID + 1][id] === value;
            const left = typeof grid[rID][id - 1] === 'undefined' ? null : (grid[rID][id - 1] === value);
            const right = typeof grid[rID][id + 1] === 'undefined' ? null : (grid[rID][id + 1] === value);
            return {above, below, left, right};
        }

        for (const rID in grid) {
            for (const id in grid[rID]) {
                if (grid[rID][id] === null) allPassed = false;
                const cB = checkBlock(rID, id);
                if (!cB) continue;
                let x = 0;
                let y = 0;
                if (cB.above) y++;
                if (cB.below) y++;
                if (cB.left) x++;
                if (cB.right) x++;
                let diagPass = false;
                if (parseInt(rID) === 2 && parseInt(id) === 2) {
                    if (grid[1][1] === lastUser.user.id && grid[3][3] === lastUser.user.id) diagPass = true;
                    if (grid[1][3] === lastUser.user.id && grid[3][1] === lastUser.user.id) diagPass = true;
                }
                if (x === 2 || y === 2 || diagPass) {
                    ended = true;
                    gameEndReasonType = 'win';
                    currentUser = lastUser;
                    return true;
                }
            }
        }

        if (allPassed) {
            ended = true;
            gameEndReasonType = 'draw';
            return true;
        } else return false;
    }

    /**
     * Generate the Game-Components
     * @private
     * @returns {{components: {style: string, disabled: (boolean|boolean), label: (string), type: string, customId: string}[], type: string}[]}
     */
    function generateComponents() {

        /**
         * Generates components for a row
         * @private
         * @param number ID of the row
         * @returns {{components: {style: string, disabled: (boolean|boolean), label: (string), type: string, customId: string}[], type: string}}
         */
        function generateRow(number) {

            /**
             * Generates the components in this row
             * @private
             * @param cNumber ID of the column
             * @returns {{style: string, disabled: (boolean|boolean), label: (string), type: string, customId: string}}
             */
            function generateComponent(cNumber) {
                return {
                    type: 'BUTTON',
                    style: 'SECONDARY',
                    customId: `${number}-${cNumber}`,
                    // eslint-disable-next-line no-nested-ternary
                    label: grid[number][cNumber] === null ? '⚪' : (grid[number][cNumber] === interaction.user.id ? '\uD83D\uDFE2' : '\uD83D\uDFE1'),
                    disabled: ended ? ended : !!grid[number][cNumber]
                };
            }

            return {
                type: 'ACTION_ROW',
                components: [generateComponent(1), generateComponent(2), generateComponent(3)]
            };
        }

        return [generateRow(1), generateRow(2), generateRow(3)];
    }

    a.on('collect', (i) => {
        let justStart = false;
        if (!started) {
            if (i.user.id !== member.id) return i.reply({
                ephemeral: true,
                content: '⚠️ ' + localize('tic-tac-toe', 'you-are-not-the-invited-one')
            });
            if (i.customId === 'deny-invite') {
                endReason = localize('tic-tac-toe', 'invite-denied', {
                    u: interaction.user.toString(),
                    i: member.toString()
                });
                return a.stop();
            }
            justStart = true;
            started = true;
        }
        if (!justStart && currentUser.user.id !== i.user.id) return i.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('tic-tac-toe', 'not-your-turn')
        });
        if (!i.customId.includes('invite')) {
            const x = i.customId.split('-')[0];
            const y = i.customId.split('-')[1];
            grid[x][y] = i.user.id;
            currentUser = interaction.user.id === i.user.id ? member : interaction.member;
        }
        checkGameEnded();
        if (ended) {
            if (gameEndReasonType === 'draw') return i.update({
                components: generateComponents(),
                allowedMentions: {parse: []},
                content: localize('tic-tac-toe', 'draw-header', {u: interaction.user.toString(), i: member.toString()})
            });
            if (gameEndReasonType === 'win') return i.update({
                components: generateComponents(),
                allowedMentions: {users: [currentUser.user.id]},
                content: localize('tic-tac-toe', 'win-header', {
                    u: interaction.user.toString(),
                    i: member.toString(),
                    w: currentUser.toString()
                })
            });
        }
        i.update({
            content: localize('tic-tac-toe', 'playing-header', {
                u: interaction.user.toString(),
                i: member.toString(),
                t: currentUser.toString()
            }),
            allowedMentions: {users: [currentUser.user.id]},
            components: generateComponents()
        });
    });
    a.on('end', () => {
        rep.edit({
            content: endReason,
            components: []
        });
    }
    );
};


module.exports.config = {
    name: 'tic-tac-toe',
    description: localize('tic-tac-toe', 'command-description'),
    defaultPermission: true,
    options: [
        {
            type: 'USER',
            required: true,
            name: 'user',
            description: localize('tic-tac-toe', 'user-description')
        }
    ]
};