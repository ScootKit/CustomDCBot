/*
 * Behavioural tests for the /calculate-level command
 * (modules/levels/commands/calculate-level.js).
 *
 * Covers the validation branches (out-of-range, above configured max, zero
 * xp-range) and the success path where it builds an embed and computes the
 * min/avg/max messages and voice-minutes needed to reach a level.
 */

const command = require('../../modules/levels/commands/calculate-level');

function makeInteraction({
                             level,
                             config = {},
                             strings = {}
                         } = {}) {
    const moduleConfig = {
        curveType: 'EXPONENTIAL',
        startFromZero: false,
        maximumLevelEnabled: false,
        maximumLevel: 100,
        'min-xp': 15,
        'max-xp': 25,
        voiceXPPerMinute: 0,
        ...config
    };
    return {
        client: {
            configurations: {
                levels: {
                    config: moduleConfig,
                    strings: {leaderboardEmbed: {color: 'GREEN'}, ...strings}
                }
            },
            strings: {
                footer: 'f',
                footerImgUrl: '',
                disableFooterTimestamp: true
            }
        },
        options: {getInteger: () => level},
        reply: jest.fn().mockResolvedValue()
    };
}

describe('/calculate-level validation', () => {
    test('rejects a level below the minimum', async () => {
        const interaction = makeInteraction({
            level: 0,
            config: {startFromZero: false}
        });
        await command.run(interaction);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.ephemeral).toBe(true);
        expect(arg.content).toContain('levels.level-out-of-range');
    });

    test('allows level 0 when startFromZero is enabled', async () => {
        const interaction = makeInteraction({
            level: 0,
            config: {startFromZero: true}
        });
        await command.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        // not the out-of-range error; should be the success embed
        expect(arg.content).toBeUndefined();
        expect(arg.embeds).toHaveLength(1);
    });

    test('rejects a level above the configured maximum', async () => {
        const interaction = makeInteraction({
            level: 50,
            config: {
                maximumLevelEnabled: true,
                maximumLevel: 10
            }
        });
        await command.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('levels.calculate-level-above-max');
    });

    test('errors when the xp range is zero', async () => {
        const interaction = makeInteraction({
            level: 5,
            config: {
                'min-xp': 0,
                'max-xp': 0
            }
        });
        await command.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('levels.calculate-level-zero-xp-range');
    });
});

describe('/calculate-level success path', () => {
    test('replies with an embed and computes message estimates', async () => {
        // EXPONENTIAL level 2 (internal) needs 2000 xp. With xp 15-25:
        //   maxMessages = ceil(2000/15)=134, minMessages = ceil(2000/25)=80, avg=ceil(2000/20)=100
        const interaction = makeInteraction({
            level: 2,
            config: {
                'min-xp': 15,
                'max-xp': 25
            }
        });
        await command.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.embeds).toHaveLength(1);
        const embed = arg.embeds[0];
        const fields = embed.fields || (embed.data && embed.data.fields);
        const messagesField = fields.find(f => f.name.includes('messages-needed'));
        expect(messagesField.value).toContain('min=80');
        expect(messagesField.value).toContain('avg=100');
        expect(messagesField.value).toContain('max=134');
    });

    test('level 1 needs zero xp', async () => {
        const interaction = makeInteraction({level: 1});
        await command.run(interaction);
        const arg = interaction.reply.mock.calls[0][0];
        const embed = arg.embeds[0];
        const fields = embed.fields || (embed.data && embed.data.fields);
        const xpField = fields.find(f => f.name.includes('xp-needed'));
        expect(xpField.value).toBe('0');
    });

    test('adds a voice-minutes field when voiceXPPerMinute > 0', async () => {
        const interaction = makeInteraction({
            level: 2,
            config: {voiceXPPerMinute: '10'}
        });
        await command.run(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const fields = embed.fields || (embed.data && embed.data.fields);
        // 2000 xp / 10 per minute = 200 minutes
        const voiceField = fields.find(f => f.name.includes('voice-needed'));
        expect(voiceField).toBeDefined();
        expect(voiceField.value).toContain('minutes=200');
    });

    test('omits the voice field when voiceXPPerMinute is 0', async () => {
        const interaction = makeInteraction({
            level: 2,
            config: {voiceXPPerMinute: 0}
        });
        await command.run(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const fields = embed.fields || (embed.data && embed.data.fields);
        expect(fields.find(f => f.name.includes('voice-needed'))).toBeUndefined();
    });
});