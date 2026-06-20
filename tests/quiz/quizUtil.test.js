/*
 * Tests for quizUtil.js: createQuiz, updateMessage, updateLeaderboard, setChanged.
 *
 * createQuiz seeds an empty votes map, renders the message, persists a QuizList
 * row, and (for non-private timed quizzes) schedules an end job.
 *
 * updateMessage builds the embed/components for:
 *  - normal (select menu) vs bool (two buttons) quizzes
 *  - an "own vote" button on public quizzes, absent on private ones
 *  - expired quizzes: disabled components + correctness highlighting, and on a
 *    correct answer it grants XP (update existing / create new QuizUser)
 *
 * updateLeaderboard short-circuits without a configured channel and on no change,
 * and renders/edits the leaderboard embed when forced.
 */
const mockScheduleJob = jest.fn(() => ({cancel: jest.fn()}));
jest.mock('node-schedule', () => ({scheduleJob: (...a) => mockScheduleJob(...a)}));

const quizUtil = require('../../modules/quiz/quizUtil');
const {ChannelType} = require('discord.js');

function makeChannel({
                         existing = null,
                         configOverrides = {}
                     } = {}) {
    const sent = [];
    const channel = {
        id: 'chan1',
        send: jest.fn(async (p) => {
            sent.push(p);
            return {id: 'new-msg'};
        }),
        messages: {fetch: jest.fn(async () => existing)},
        sent
    };
    channel.client = {
        configurations: {
            quiz: {
                strings: {
                    embed: {
                        title: 'Quiz',
                        color: 'BLUE',
                        options: 'Options',
                        liveView: 'Live',
                        expiresOn: 'Expires',
                        thisQuizExpiresOn: 'on %date%',
                        endedQuizColor: 'RED',
                        endedQuizTitle: 'Ended'
                    }
                },
                config: {
                    emojis: ['0️⃣', '1️⃣', '2️⃣'],
                    livePreview: true, ...configOverrides
                }
            }
        },
        jobs: [],
        models: {
            quiz: {
                QuizUser: {
                    findAll: jest.fn().mockResolvedValue([]),
                    update: jest.fn().mockResolvedValue(),
                    create: jest.fn().mockResolvedValue()
                },
                QuizList: {
                    create: jest.fn().mockResolvedValue({}),
                    findOne: jest.fn().mockResolvedValue({})
                }
            }
        }
    };
    return channel;
}

beforeEach(() => mockScheduleJob.mockClear());

describe('updateMessage', () => {
    test('renders a normal quiz with a select menu and own-vote button (public)', async () => {
        const channel = makeChannel();
        const data = {
            description: 'Q?',
            options: [{text: 'A'}, {text: 'B'}],
            votes: {
                '1': ['u1'],
                '2': []
            },
            type: 'normal',
            private: false
        };
        const id = await quizUtil.updateMessage(channel, data);
        expect(id).toBe('new-msg');
        const payload = channel.sent[0];
        const menu = payload.components[0].components[0];
        expect(menu.type).toBe('SELECT_MENU');
        const customIds = payload.components.flatMap(r => r.components.map(c => c.customId));
        expect(customIds).toContain('quiz-own-vote');
    });

    test('renders a bool quiz with two buttons and no own-vote button when private', async () => {
        const channel = makeChannel();
        const data = {
            description: 'True?',
            options: [{text: 'Yes'}, {text: 'No'}],
            votes: {
                '1': [],
                '2': []
            },
            type: 'bool',
            private: true
        };
        await quizUtil.updateMessage(channel, data);
        const payload = channel.sent[0];
        const firstRow = payload.components[0].components;
        expect(firstRow.map(c => c.customId)).toEqual(['quiz-vote-0', 'quiz-vote-1']);
        const allIds = payload.components.flatMap(r => r.components.map(c => c.customId));
        expect(allIds).not.toContain('quiz-own-vote');
    });

    test('expired quiz disables components and awards XP to a correct voter (existing user)', async () => {
        const channel = makeChannel();
        channel.client.models.quiz.QuizUser.findAll.mockResolvedValue([{
            dailyXp: 2,
            xp: 5
        }]);
        const data = {
            description: 'Q',
            options: [{
                text: 'Right',
                correct: true
            }, {text: 'Wrong'}],
            votes: {
                '1': ['voter1'],
                '2': []
            },
            type: 'normal',
            private: false,
            expiresAt: new Date(Date.now() - 1000)
        };
        await quizUtil.updateMessage(channel, data);
        // wait a tick for the async forEach voter handling
        await new Promise(r => setImmediate(r));
        expect(channel.client.models.quiz.QuizUser.update).toHaveBeenCalledWith(
            {
                dailyXp: 3,
                xp: 6
            },
            {where: {userID: 'voter1'}}
        );
        const menu = channel.sent[0].components[0].components[0];
        expect(menu.disabled).toBe(true);
    });

    test('expired quiz creates a new QuizUser for a correct voter with no record', async () => {
        const channel = makeChannel();
        channel.client.models.quiz.QuizUser.findAll.mockResolvedValue([]);
        const data = {
            description: 'Q',
            options: [{
                text: 'Right',
                correct: true
            }, {text: 'Wrong'}],
            votes: {
                '1': ['fresh'],
                '2': []
            },
            type: 'normal',
            private: false,
            expiresAt: new Date(Date.now() - 1000)
        };
        await quizUtil.updateMessage(channel, data);
        await new Promise(r => setImmediate(r));
        expect(channel.client.models.quiz.QuizUser.create).toHaveBeenCalledWith({
            userID: 'fresh',
            dailyXp: 1,
            xp: 1
        });
    });

    test('edits an existing message instead of sending a new one', async () => {
        const existing = {
            id: 'm-old',
            edit: jest.fn(async () => ({id: 'm-old'}))
        };
        const channel = makeChannel({existing});
        const data = {
            description: 'Q',
            options: [{text: 'A'}],
            votes: {'1': []},
            type: 'normal',
            private: false
        };
        const id = await quizUtil.updateMessage(channel, data, 'm-old');
        expect(existing.edit).toHaveBeenCalled();
        expect(channel.send).not.toHaveBeenCalled();
        expect(id).toBe('m-old');
    });

    test('private timed quiz replies ephemerally via the interaction', async () => {
        const channel = makeChannel();
        const interaction = {reply: jest.fn(async () => ({id: 'int-msg'}))};
        const data = {
            description: 'Q',
            options: [{text: 'A'}, {text: 'B'}],
            votes: {
                '1': [],
                '2': []
            },
            type: 'normal',
            private: true
        };
        const id = await quizUtil.updateMessage(channel, data, null, interaction);
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            ephemeral: true,
            fetchReply: true
        }));
        expect(id).toBe('int-msg');
    });
});

describe('createQuiz', () => {
    test('seeds votes, renders, persists and schedules an end job for a public timed quiz', async () => {
        const channel = makeChannel();
        const client = channel.client;
        const data = {
            description: 'Q',
            options: [{text: 'A'}, {text: 'B'}],
            channel,
            endAt: new Date(Date.now() + 60000),
            type: 'normal',
            private: false,
            canChangeVote: true
        };
        await quizUtil.createQuiz(data, client);
        const createArg = client.models.quiz.QuizList.create.mock.calls[0][0];
        expect(createArg.votes).toEqual({
            '1': [],
            '2': []
        });
        expect(createArg.private).toBe(false);
        expect(mockScheduleJob).toHaveBeenCalledTimes(1);
    });

    test('does not schedule a job for a private quiz', async () => {
        const channel = makeChannel();
        const client = channel.client;
        client.jobs = [];
        const interaction = {reply: jest.fn(async () => ({id: 'm'}))};
        const data = {
            description: 'Q',
            options: [{text: 'A'}, {text: 'B'}],
            channel,
            endAt: new Date(Date.now() + 60000),
            type: 'normal',
            private: true,
            canChangeVote: false
        };
        await quizUtil.createQuiz(data, client, interaction);
        expect(mockScheduleJob).not.toHaveBeenCalled();
    });
});

describe('updateLeaderboard', () => {
    test('returns early when no leaderboard channel is configured', async () => {
        const client = {
            configurations: {quiz: {config: {}}},
            channels: {fetch: jest.fn()}
        };
        await quizUtil.updateLeaderboard(client, true);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('returns early when nothing changed and not forced (fresh module state)', async () => {
        // changed is module-global; load a pristine copy so it starts false
        let freshUtil;
        jest.isolateModules(() => {
            freshUtil = require('../../modules/quiz/quizUtil');
        });
        const client = {
            configurations: {quiz: {config: {leaderboardChannel: 'lb'}}},
            channels: {fetch: jest.fn()}
        };
        await freshUtil.updateLeaderboard(client, false);
        expect(client.channels.fetch).not.toHaveBeenCalled();
    });

    test('setChanged flips the change flag so a non-forced update proceeds', async () => {
        let freshUtil;
        jest.isolateModules(() => {
            freshUtil = require('../../modules/quiz/quizUtil');
        });
        freshUtil.setChanged();
        const client = {
            configurations: {
                quiz: {
                    config: {leaderboardChannel: 'lb'},
                    strings: {embed: {}}
                }
            },
            channels: {fetch: jest.fn().mockResolvedValue(null)},
            logger: {error: jest.fn()}
        };
        await freshUtil.updateLeaderboard(client, false);
        // proceeded past the change guard -> attempted to fetch the channel
        expect(client.channels.fetch).toHaveBeenCalled();
    });

    test('renders and sends the leaderboard embed when forced', async () => {
        const messages = {filter: () => ({first: () => null})};
        const channel = {
            type: ChannelType.GuildText,
            guild: {
                members: {cache: {get: () => ({user: {toString: () => '<@a>'}})}},
                iconURL: () => 'http://i'
            },
            messages: {fetch: jest.fn().mockResolvedValue(messages)},
            send: jest.fn().mockResolvedValue({})
        };
        const client = {
            user: {id: 'bot'},
            strings: {disableFooterTimestamp: true},
            configurations: {
                quiz: {
                    config: {leaderboardChannel: 'lb'},
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
            channels: {fetch: jest.fn().mockResolvedValue(channel)},
            logger: {error: jest.fn()},
            models: {
                quiz: {
                    QuizUser: {
                        findAll: jest.fn().mockResolvedValue([{
                            userID: 'a',
                            xp: 9
                        }])
                    }
                }
            }
        };
        await quizUtil.updateLeaderboard(client, true);
        expect(channel.send).toHaveBeenCalled();
        const embed = channel.send.mock.calls[0][0].embeds[0];
        expect(embed.data.fields[0].value).toContain('quiz.leaderboard-notation');
    });

    test('logs an error when the configured channel is missing or not text', async () => {
        const client = {
            configurations: {
                quiz: {
                    config: {leaderboardChannel: 'lb'},
                    strings: {embed: {}}
                }
            },
            channels: {fetch: jest.fn().mockResolvedValue(null)},
            logger: {error: jest.fn()}
        };
        await quizUtil.updateLeaderboard(client, true);
        expect(client.logger.error).toHaveBeenCalledWith(expect.stringContaining('quiz.leaderboard-channel-not-found'));
    });
});