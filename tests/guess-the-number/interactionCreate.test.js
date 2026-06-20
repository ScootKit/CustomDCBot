/*
 * Tests for the guess-the-number button handler: the leaderboard button renders
 * a ranked embed (or an "empty" notice when there are no users), and the
 * emoji-guide button replies with the legend. Verifies the DB query ordering
 * options and the rendered description contents.
 */
const handler = require('../../modules/guess-the-number/events/interactionCreate');

function makeInteraction(customId) {
    return {
        customId,
        reply: jest.fn().mockResolvedValue()
    };
}

function makeClient(users) {
    return {
        models: {'guess-the-number': {User: {findAll: jest.fn().mockResolvedValue(users)}}}
    };
}

test('leaderboard replies with an empty notice when no users exist', async () => {
    const client = makeClient([]);
    const interaction = makeInteraction('gtn-leaderboard');
    await handler.run(client, interaction);
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.ephemeral).toBe(true);
    expect(arg.content).toContain('guess-the-number.leaderboard-empty');
});

test('leaderboard queries ordered by wins desc then totalGuesses asc, limited to 20', async () => {
    const client = makeClient([{
        userID: 'u1',
        wins: 3,
        totalGuesses: 10
    }]);
    await handler.run(client, makeInteraction('gtn-leaderboard'));
    const opts = client.models['guess-the-number'].User.findAll.mock.calls[0][0];
    expect(opts.order).toEqual([['wins', 'DESC'], ['totalGuesses', 'ASC']]);
    expect(opts.limit).toBe(20);
});

test('leaderboard renders a numbered embed listing each user mention and stats', async () => {
    const users = [
        {
            userID: 'a',
            wins: 5,
            totalGuesses: 12
        },
        {
            userID: 'b',
            wins: 2,
            totalGuesses: 30
        }
    ];
    const interaction = makeInteraction('gtn-leaderboard');
    await handler.run(makeClient(users), interaction);
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.ephemeral).toBe(true);
    const desc = arg.embeds[0].data.description;
    expect(desc).toContain('**1.** <@a>');
    expect(desc).toContain('**2.** <@b>');
    expect(desc).toContain('5');
    expect(desc).toContain('30');
});

test('emoji-guide button replies with the legend and does not hit the DB', async () => {
    const client = makeClient([]);
    const interaction = makeInteraction('gtn-reaction-meaning');
    await handler.run(client, interaction);
    expect(client.models['guess-the-number'].User.findAll).not.toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.ephemeral).toBe(true);
    expect(arg.content).toContain('guess-the-number.guide-win');
});

test('an unrelated customId is ignored', async () => {
    const client = makeClient([]);
    const interaction = makeInteraction('something-else');
    await handler.run(client, interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
});