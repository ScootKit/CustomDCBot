/*
 * Edge-case coverage for the quiz interactionCreate handler not exercised by
 * interactionCreate.test.js:
 *  - early return when the interaction has no message
 *  - unknown quiz (findOne -> null) returns silently
 *  - bool-style button vote (quiz-vote-N) on a private quiz
 *  - private quiz vote ignored when the user has no QuizUser record
 *  - quiz-own-vote on an open quiz surfaces the change/cannot-change hint
 *  - select-menu vote on an expired public quiz is ignored
 */
const mockUpdateMessage = jest.fn().mockResolvedValue('msg-id');
const mockSetChanged = jest.fn();
jest.mock('../../modules/quiz/quizUtil', () => ({
    updateMessage: (...a) => mockUpdateMessage(...a),
    setChanged: (...a) => mockSetChanged(...a)
}));

const handler = require('../../modules/quiz/events/interactionCreate');

function makeClient(quiz, {quizUsers = []} = {}) {
    return {
        models: {
            quiz: {
                QuizList: {findOne: jest.fn().mockResolvedValue(quiz)},
                QuizUser: {
                    findOne: jest.fn().mockResolvedValue(null),
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
        ...overrides
    };
}

beforeEach(() => {
    mockUpdateMessage.mockClear();
    mockSetChanged.mockClear();
});

test('returns immediately when the interaction has no message', async () => {
    const client = makeClient(null);
    const interaction = baseInteraction({
        message: null,
        isButton: () => true,
        customId: 'show-quiz-rank'
    });
    await handler.run(client, interaction);
    expect(client.models.quiz.QuizUser.findOne).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
});

test('returns silently for an unknown quiz message', async () => {
    const client = makeClient(null);
    const interaction = baseInteraction({
        isSelectMenu: () => true,
        customId: 'quiz-vote',
        values: ['0']
    });
    await handler.run(client, interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
});

test('bool button vote on a private quiz awards XP for the correct answer', async () => {
    const quiz = {
        votes: {
            '1': [],
            '2': []
        },
        options: [{
            text: 'Yes',
            correct: true
        }, {
            text: 'No',
            correct: false
        }],
        private: true
    };
    const client = makeClient(quiz, {
        quizUsers: [{
            dailyXp: 0,
            xp: 1
        }]
    });
    const interaction = baseInteraction({
        isButton: () => true,
        customId: 'quiz-vote-0'
    });
    interaction.client = makeClient(quiz, {
        quizUsers: [{
            dailyXp: 0,
            xp: 1
        }]
    });
    await handler.run(client, interaction);
    expect(interaction.client.models.quiz.QuizUser.update).toHaveBeenCalledWith(
        {
            dailyXp: 1,
            xp: 2
        },
        {where: {userID: 'u1'}}
    );
    expect(mockSetChanged).toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalled();
});

test('private quiz vote is ignored when the user has no record', async () => {
    const quiz = {
        votes: {
            '1': [],
            '2': []
        },
        options: [{
            text: 'A',
            correct: true
        }, {text: 'B'}],
        private: true
    };
    const client = makeClient(quiz);
    const interaction = baseInteraction({
        isSelectMenu: () => true,
        customId: 'quiz-vote',
        values: ['0']
    });
    interaction.client = makeClient(quiz, {quizUsers: []}); // findAll -> []
    await handler.run(client, interaction);
    expect(interaction.update).not.toHaveBeenCalled();
    expect(mockSetChanged).not.toHaveBeenCalled();
});

test('quiz-own-vote on an open quiz shows the cannot-change hint when locked', async () => {
    const quiz = {
        votes: {
            '1': ['u1'],
            '2': []
        },
        options: [{text: 'A'}, {text: 'B'}],
        canChangeVote: false
    };
    const client = makeClient(quiz);
    const interaction = baseInteraction({
        isButton: () => true,
        customId: 'quiz-own-vote'
    });
    await handler.run(client, interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('quiz.cannot-change-opinion');
});

test('quiz-own-vote on an open changeable quiz shows the change hint', async () => {
    const quiz = {
        votes: {
            '1': ['u1'],
            '2': []
        },
        options: [{text: 'A'}, {text: 'B'}],
        canChangeVote: true
    };
    const client = makeClient(quiz);
    const interaction = baseInteraction({
        isButton: () => true,
        customId: 'quiz-own-vote'
    });
    await handler.run(client, interaction);
    expect(interaction.reply.mock.calls[0][0].content).toContain('quiz.change-opinion');
});

test('select-menu vote on an expired public quiz is ignored', async () => {
    const quiz = {
        votes: {
            '1': [],
            '2': []
        },
        options: [{text: 'A'}, {text: 'B'}],
        private: false,
        expiresAt: new Date(Date.now() - 1000),
        save: jest.fn()
    };
    const client = makeClient(quiz);
    const interaction = baseInteraction({
        isSelectMenu: () => true,
        customId: 'quiz-vote',
        values: ['0']
    });
    await handler.run(client, interaction);
    expect(quiz.save).not.toHaveBeenCalled();
    expect(mockUpdateMessage).not.toHaveBeenCalled();
});