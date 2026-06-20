/*
 * Behavioural tests for the quiz interactionCreate handler.
 *
 * Covers the branch logic of voting/answer handling:
 *  - show-quiz-rank with and without an existing QuizUser row.
 *  - quiz-own-vote: reporting the user's prior choice + correctness once expired.
 *  - quiz-vote on a public quiz: vote recorded, persisted, message re-rendered.
 *  - "cannot change vote" guard when canChangeVote is false and user already voted.
 *  - private quiz: correct answer awards XP, wrong answer does not.
 *
 * quizUtil.updateMessage is mocked so we only exercise the handler's branching.
 */
const mockUpdateMessage = jest.fn().mockResolvedValue('msg-id');
const mockSetChanged = jest.fn();
jest.mock('../../modules/quiz/quizUtil', () => ({
    updateMessage: (...a) => mockUpdateMessage(...a),
    setChanged: (...a) => mockSetChanged(...a)
}));

const handler = require('../../modules/quiz/events/interactionCreate');

function makeClient({
                        quiz = null,
                        quizUser = null,
                        quizUsers = []
                    } = {}) {
    return {
        models: {
            quiz: {
                QuizList: {findOne: jest.fn().mockResolvedValue(quiz)},
                QuizUser: {
                    findOne: jest.fn().mockResolvedValue(quizUser),
                    findAll: jest.fn().mockResolvedValue(quizUsers),
                    update: jest.fn().mockResolvedValue(),
                    create: jest.fn().mockResolvedValue()
                }
            }
        }
    };
}

function baseInteraction(overrides = {}) {
    return {
        message: {id: 'm1'},
        channel: {id: 'c1'},
        user: {id: 'u1'},
        isButton: () => false,
        isSelectMenu: () => false,
        reply: jest.fn().mockResolvedValue(),
        update: jest.fn().mockResolvedValue(),
        save: jest.fn(),
        ...overrides
    };
}

beforeEach(() => {
    mockUpdateMessage.mockClear();
    mockSetChanged.mockClear();
});

describe('show-quiz-rank', () => {
    test('replies with the user XP when a rank exists', async () => {
        const client = makeClient({quizUser: {xp: 42}});
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'show-quiz-rank'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'quiz.your-rank(xp=42)',
                ephemeral: true
            })
        );
    });

    test('replies with no-rank when the user has no record', async () => {
        const client = makeClient({quizUser: null});
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'show-quiz-rank'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('quiz.no-rank'),
                ephemeral: true
            })
        );
    });
});

describe('quiz-own-vote', () => {
    test('tells a non-voter they have not voted yet', async () => {
        const quiz = {
            votes: {
                '1': [],
                '2': []
            },
            options: [{}, {}]
        };
        const client = makeClient({quiz});
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'quiz-own-vote'
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({content: expect.stringContaining('quiz.not-voted-yet')})
        );
    });

    test('reports the chosen option and correctness once the quiz is expired', async () => {
        const quiz = {
            votes: {
                '1': ['u1'],
                '2': []
            },
            options: [{
                text: 'Right',
                correct: true
            }, {
                text: 'Wrong',
                correct: false
            }],
            expiresAt: new Date(Date.now() - 1000)
        };
        const client = makeClient({quiz});
        const interaction = baseInteraction({
            isButton: () => true,
            customId: 'quiz-own-vote'
        });
        await handler.run(client, interaction);
        const arg = interaction.reply.mock.calls[0][0].content;
        expect(arg).toContain('quiz.you-voted(o=Right)');
        expect(arg).toContain('quiz.answer-correct');
    });
});

describe('public quiz voting (quiz-vote select menu)', () => {
    test('records the vote, persists, and re-renders the message', async () => {
        const quiz = {
            votes: {
                '1': [],
                '2': []
            },
            options: [{text: 'A'}, {text: 'B'}],
            canChangeVote: true,
            private: false,
            save: jest.fn().mockResolvedValue()
        };
        const client = makeClient({quiz});
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'quiz-vote',
            values: ['0']
        });
        await handler.run(client, interaction);
        // index 0 -> votes bucket "1"
        expect(quiz.votes['1']).toContain('u1');
        expect(quiz.save).toHaveBeenCalled();
        expect(mockUpdateMessage).toHaveBeenCalledWith(interaction.channel, quiz, 'm1');
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'quiz.voted-successfully',
                ephemeral: true
            })
        );
    });

    test('blocks re-voting when canChangeVote is false', async () => {
        const quiz = {
            votes: {
                '1': ['u1'],
                '2': []
            },
            options: [{text: 'A'}, {text: 'B'}],
            canChangeVote: false,
            private: false,
            save: jest.fn().mockResolvedValue()
        };
        const client = makeClient({quiz});
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'quiz-vote',
            values: ['1']
        });
        await handler.run(client, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'quiz.cannot-change-opinion',
                ephemeral: true
            })
        );
        expect(mockUpdateMessage).not.toHaveBeenCalled();
        expect(quiz.save).not.toHaveBeenCalled();
    });
});

describe('private quiz voting', () => {
    test('awards XP and marks changed for a correct answer', async () => {
        const quiz = {
            votes: {
                '1': [],
                '2': []
            },
            options: [{
                text: 'A',
                correct: true
            }, {
                text: 'B',
                correct: false
            }],
            private: true
        };
        const client = makeClient({
            quiz,
            quizUsers: [{
                dailyXp: 0,
                xp: 5
            }]
        });
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'quiz-vote',
            values: ['0'],
            client: makeClient({
                quiz,
                quizUsers: [{
                    dailyXp: 0,
                    xp: 5
                }]
            })
        });
        await handler.run(client, interaction);
        expect(interaction.client.models.quiz.QuizUser.update).toHaveBeenCalledWith(
            {
                dailyXp: 1,
                xp: 6
            },
            {where: {userID: 'u1'}}
        );
        expect(mockSetChanged).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });

    test('does not award XP for a wrong answer', async () => {
        const quiz = {
            votes: {
                '1': [],
                '2': []
            },
            options: [{
                text: 'A',
                correct: true
            }, {
                text: 'B',
                correct: false
            }],
            private: true
        };
        const client = makeClient({
            quiz,
            quizUsers: [{
                dailyXp: 0,
                xp: 5
            }]
        });
        const interaction = baseInteraction({
            isSelectMenu: () => true,
            customId: 'quiz-vote',
            values: ['1'],
            client: makeClient({
                quiz,
                quizUsers: [{
                    dailyXp: 0,
                    xp: 5
                }]
            })
        });
        await handler.run(client, interaction);
        expect(interaction.client.models.quiz.QuizUser.update).not.toHaveBeenCalled();
        expect(mockSetChanged).not.toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });
});