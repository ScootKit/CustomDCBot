/*
 * Tests for the /quiz command (commands/quiz.js).
 *
 * create / create-bool: permission gate on createAllowedRole.
 * play:
 *  - creates a QuizUser row on first play
 *  - enforces the daily limit
 *  - "no quiz" when the quiz list is empty
 *  - continuous mode advances nextQuizID; random mode picks any
 *  - builds the private quiz (shuffled options, private flag) and bumps the counter
 * leaderboard: renders ranked users, skips members not in cache, falls back to
 *   the empty-leaderboard string.
 *
 * createQuiz, durationParser, shuffleArray are mocked for determinism.
 */
const mockCreateQuiz = jest.fn().mockResolvedValue();
jest.mock('../../modules/quiz/quizUtil', () => ({createQuiz: (...a) => mockCreateQuiz(...a)}));
jest.mock('../../src/functions/parseDuration', () => jest.fn(() => 60000));
jest.mock('../../src/functions/helpers', () => {
    const actual = jest.requireActual('../../src/functions/helpers');
    return {
        ...actual,
        shuffleArray: (a) => a
    };
});

const command = require('../../modules/quiz/commands/quiz');

beforeEach(() => mockCreateQuiz.mockClear());

describe('create permission gating', () => {
    test('rejects a member without the create role', async () => {
        const interaction = {
            client: {
                configurations: {
                    quiz: {
                        config: {
                            createAllowedRole: 'role-mod',
                            emojis: {}
                        }
                    }
                }
            },
            member: {roles: {cache: {has: jest.fn(() => false)}}},
            options: {getSubcommand: () => 'create'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.create(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('quiz.no-permission');
    });
});

describe('play subcommand', () => {
    function playClient({
                            user,
                            quizList,
                            config = {}
                        }) {
        return {
            configurations: {
                quiz: {
                    config: {
                        dailyQuizLimit: 3,
                        mode: 'random', ...config
                    },
                    quizList
                }
            },
            models: {
                quiz: {
                    QuizUser: {
                        findAll: jest.fn().mockResolvedValue(user ? [user] : []),
                        create: jest.fn().mockResolvedValue({
                            dailyQuiz: 0,
                            nextQuizID: 0
                        }),
                        update: jest.fn().mockResolvedValue()
                    }
                }
            }
        };
    }

    test('creates a QuizUser on first play and enforces an empty quiz list', async () => {
        const client = playClient({
            user: null,
            quizList: []
        });
        const interaction = {
            client,
            user: {id: 'u1'},
            channel: {id: 'c'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.play(interaction);
        expect(client.models.quiz.QuizUser.create).toHaveBeenCalledWith({
            userID: 'u1',
            dailyQuiz: 0
        });
        expect(interaction.reply.mock.calls[0][0].content).toContain('quiz.no-quiz');
        expect(mockCreateQuiz).not.toHaveBeenCalled();
    });

    test('blocks when the daily quiz limit is reached', async () => {
        const client = playClient({
            user: {dailyQuiz: 3},
            quizList: [{}],
            config: {dailyQuizLimit: 3}
        });
        const interaction = {
            client,
            user: {id: 'u1'},
            channel: {id: 'c'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.play(interaction);
        expect(interaction.reply.mock.calls[0][0].content).toContain('quiz.daily-quiz-limit');
        expect(mockCreateQuiz).not.toHaveBeenCalled();
    });

    test('starts a random quiz and bumps the daily counter', async () => {
        const quiz = {
            wrongOptions: ['W1', 'W2'],
            correctOptions: ['C1'],
            duration: '1m'
        };
        const client = playClient({
            user: {
                dailyQuiz: 0,
                nextQuizID: 0
            },
            quizList: [quiz],
            config: {mode: 'random'}
        });
        const interaction = {
            client,
            user: {id: 'u1'},
            channel: {id: 'c'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.play(interaction);
        expect(mockCreateQuiz).toHaveBeenCalledTimes(1);
        const data = mockCreateQuiz.mock.calls[0][0];
        expect(data.private).toBe(true);
        expect(data.canChangeVote).toBe(false);
        // 2 wrong + 1 correct = 3 options
        expect(data.options).toHaveLength(3);
        expect(data.options.find(o => o.correct)).toEqual({
            text: 'C1',
            correct: true
        });
        expect(client.models.quiz.QuizUser.update).toHaveBeenCalledWith(
            expect.objectContaining({dailyQuiz: 1}),
            {where: {userID: 'u1'}}
        );
    });

    test('continuous mode advances nextQuizID and wraps at the end', async () => {
        const quiz0 = {
            wrongOptions: [],
            correctOptions: ['C'],
            duration: '1m'
        };
        const quiz1 = {
            wrongOptions: [],
            correctOptions: ['C'],
            duration: '1m'
        };
        const client = playClient({
            user: {
                dailyQuiz: 0,
                nextQuizID: 1
            },
            quizList: [quiz0, quiz1],
            config: {mode: 'continuous'}
        });
        const interaction = {
            client,
            user: {id: 'u1'},
            channel: {id: 'c'},
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.play(interaction);
        // nextQuizID was 1 (last index) -> wraps to 0
        const updateArg = client.models.quiz.QuizUser.update.mock.calls[0][0];
        expect(updateArg.nextQuizID).toBe(0);
    });
});

describe('leaderboard subcommand', () => {
    function lbClient(users, membersByID) {
        return {
            strings: {disableFooterTimestamp: true},
            configurations: {
                quiz: {
                    strings: {
                        embed: {
                            leaderboardTitle: 'LB',
                            leaderboardColor: 'BLUE',
                            leaderboardSubtitle: 'Top',
                            leaderboardButton: 'Mine'
                        }
                    }
                }
            },
            models: {quiz: {QuizUser: {findAll: jest.fn().mockResolvedValue(users)}}}
        };
    }

    test('ranks cached members and skips uncached ones', async () => {
        const users = [{
            userID: 'a',
            xp: 10
        }, {
            userID: 'ghost',
            xp: 5
        }, {
            userID: 'b',
            xp: 3
        }];
        const membersByID = {
            a: {user: {toString: () => '<@a>'}},
            b: {user: {toString: () => '<@b>'}}
        };
        const client = lbClient(users);
        const interaction = {
            client,
            guild: {
                members: {cache: {get: jest.fn((id) => membersByID[id])}},
                iconURL: () => 'http://icon'
            },
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.leaderboard(interaction);
        const embed = interaction.reply.mock.calls[0][0].embeds[0];
        const field = embed.data.fields[0];
        expect(field.value).toContain('quiz.leaderboard-notation');
        // ghost (not cached) excluded -> only 2 ranked lines
        expect(field.value.split('\n').filter(Boolean)).toHaveLength(2);
    });

    test('falls back to the empty-leaderboard string when nobody qualifies', async () => {
        const client = lbClient([{
            userID: 'ghost',
            xp: 1
        }]);
        const interaction = {
            client,
            guild: {
                members: {cache: {get: jest.fn(() => undefined)}},
                iconURL: () => 'http://icon'
            },
            reply: jest.fn().mockResolvedValue()
        };
        await command.subcommands.leaderboard(interaction);
        const field = interaction.reply.mock.calls[0][0].embeds[0].data.fields[0];
        expect(field.value).toContain('levels.no-user-on-leaderboard');
    });
});

test('create and create-bool share the same handler', () => {
    expect(command.subcommands['create-bool']).toBe(command.subcommands.create);
});