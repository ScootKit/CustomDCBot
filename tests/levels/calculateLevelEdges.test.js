/*
 * Additional edge cases for /calculate-level (modules/levels/commands/
 * calculate-level.js) not covered by calculateLevel.test.js:
 *   - the invalid-custom-formula branch when calculateLevelXP throws,
 *   - getFormulaString selection rendered into the embed for LINEAR /
 *     EXPONENTIATION / CUSTOM (with and without a custom curve string),
 *   - the upper bound (> 1,000,000) rejection.
 * calculateLevelXP is mocked per-test so we can force the throw without a real
 * math parser.
 */
jest.mock('discord.js', () => {
    class MessageEmbed {
        constructor() {
            this.fields = [];
            this.data = {};
        }

        setColor(c) {
            this.data.color = c;
            return this;
        }

        setTitle(t) {
            this.data.title = t;
            return this;
        }

        setFooter(f) {
            this.data.footer = f;
            return this;
        }

        setTimestamp() {
            this.data.timestamp = true;
            return this;
        }

        addField(name, value, inline) {
            this.fields.push({
                name,
                value,
                inline
            });
            return this;
        }
    }

    return {MessageEmbed};
});
const mockCalc = jest.fn();
jest.mock('../../modules/levels/events/messageCreate', () => ({
    calculateLevelXP: (...a) => mockCalc(...a)
}));

const command = require('../../modules/levels/commands/calculate-level');

beforeEach(() => mockCalc.mockReset().mockReturnValue(3000));

function makeInteraction({
                             level,
                             config = {}
                         } = {}) {
    return {
        client: {
            configurations: {
                levels: {
                    config: {
                        curveType: 'EXPONENTIAL',
                        startFromZero: false,
                        maximumLevelEnabled: false,
                        maximumLevel: 100,
                        'min-xp': 15,
                        'max-xp': 25,
                        voiceXPPerMinute: 0, ...config
                    },
                    strings: {leaderboardEmbed: {color: 'GREEN'}}
                }
            },
            strings: {
                footer: 'f',
                disableFooterTimestamp: true
            }
        },
        options: {getInteger: () => level},
        reply: jest.fn().mockResolvedValue()
    };
}

test('rejects a level above the 1,000,000 hard ceiling', async () => {
    const interaction = makeInteraction({level: 1000001});
    await command.run(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('level-out-of-range');
});

test('reports invalid-custom-formula when the curve evaluator throws', async () => {
    mockCalc.mockImplementation(() => {
        throw new Error('bad formula');
    });
    const interaction = makeInteraction({
        level: 5,
        config: {curveType: 'CUSTOM'}
    });
    await command.run(interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('invalid-custom-formula');
});

test('renders the LINEAR formula string in the embed', async () => {
    const interaction = makeInteraction({
        level: 5,
        config: {curveType: 'LINEAR'}
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const formula = embed.fields.find(f => f.value.includes('750'));
    expect(formula.value).toBe('`x * 750`');
});

test('renders the EXPONENTIATION formula string', async () => {
    const interaction = makeInteraction({
        level: 5,
        config: {curveType: 'EXPONENTIATION'}
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    expect(embed.fields.some(f => f.value.includes('350 * (x - 1) ^ 2'))).toBe(true);
});

test('renders the supplied custom curve string for CUSTOM', async () => {
    const interaction = makeInteraction({
        level: 5,
        config: {
            curveType: 'CUSTOM',
            customLevelCurve: 'x^3'
        }
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    expect(embed.fields.some(f => f.value === '`x^3`')).toBe(true);
});

test('falls back to the EXPONENTIAL formula when CUSTOM has no curve string', async () => {
    const interaction = makeInteraction({
        level: 5,
        config: {
            curveType: 'CUSTOM',
            customLevelCurve: null
        }
    });
    await command.run(interaction);
    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    expect(embed.fields.some(f => f.value.includes('x * 750 + ((x - 1) * 500)'))).toBe(true);
});