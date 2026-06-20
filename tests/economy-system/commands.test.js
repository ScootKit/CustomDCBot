/*
 * Behavioural tests for the economy-system /economy command subcommands
 * (modules/economy-system/commands/economy-system.js).
 *
 * The economy-system core (editBalance/editBank/createLeaderboard) and helpers
 * are mocked so we assert the command's own decision logic:
 *   - cooldown gating on work/crime/rob/daily/weekly (the shared cooldown()
 *     helper creates a row when none exists, blocks while still inside the
 *     window, and refreshes the timestamp once it has elapsed)
 *   - work credits a random amount within the configured bounds
 *   - crime's win/lose coin flip and the "no wallet -> drain bank" fallback
 *   - rob percentage maths, the maxRobAmount cap, and the "victim not found" guard
 *   - admin add/remove/set permission gating + the self-abuse guard
 *   - balance lookups, deposit/withdraw 'all' resolution and NaN handling
 *   - msg_drop enable/disable toggling and destroy's permission gate
 */

const mockEditBalance = jest.fn().mockResolvedValue();
const mockEditBank = jest.fn().mockResolvedValue();
const mockCreateLeaderboard = jest.fn().mockResolvedValue();
jest.mock('../../modules/economy-system/economy-system', () => ({
    editBalance: (...a) => mockEditBalance(...a),
    editBank: (...a) => mockEditBank(...a),
    createLeaderboard: (...a) => mockCreateLeaderboard(...a)
}));

const mockRandomInt = jest.fn();
const mockRandomElement = jest.fn((arr) => arr[0]);
jest.mock('../../src/functions/helpers', () => ({
    embedType: (input, args, opts) => ({
        input,
        args,
        opts
    }),
    randomIntFromInterval: (...a) => mockRandomInt(...a),
    randomElementFromArray: (...a) => mockRandomElement(...a),
    formatDiscordUserName: (u) => (u && u.tag) || 'user'
}));

const cmd = require('../../modules/economy-system/commands/economy-system');

function makeModels({
                        cooldownRow = null,
                        balanceRow = undefined,
                        dropRow = null
                    } = {}) {
    const cooldown = {
        findOne: jest.fn().mockResolvedValue(cooldownRow),
        create: jest.fn().mockResolvedValue(),
        findAll: jest.fn().mockResolvedValue([])
    };
    const Balance = {
        findOne: jest.fn().mockResolvedValue(balanceRow === undefined ? null : balanceRow),
        findAll: jest.fn().mockResolvedValue([])
    };
    const dropMsg = {
        findOne: jest.fn().mockResolvedValue(dropRow),
        create: jest.fn().mockResolvedValue(),
        findAll: jest.fn().mockResolvedValue([])
    };
    const Shop = {findAll: jest.fn().mockResolvedValue([])};
    return {
        cooldown,
        Balance,
        dropMsg,
        Shop
    };
}

function makeInteraction({
                             userId = 'me',
                             config = {},
                             strings = {},
                             models = makeModels(),
                             options = {},
                             botOperators = [],
                             logChannel = null
                         } = {}) {
    const baseConfig = {
        publicCommandReplies: false,
        currencySymbol: '$',
        workCooldown: 5,
        crimeCooldown: 5,
        robCooldown: 5,
        minWorkMoney: 10,
        maxWorkMoney: 50,
        minCrimeMoney: 10,
        maxCrimeMoney: 50,
        robPercent: 50,
        maxRobAmount: 1000,
        dailyReward: 100,
        weeklyReward: 500,
        admins: [],
        selfBalance: false,
        ...config
    };
    const baseStrings = {
        cooldown: 'COOLDOWN',
        workSuccess: ['WORK'],
        crimeSuccess: ['CRIME_WIN'],
        crimeFail: ['CRIME_LOSE'],
        robSuccess: 'ROB',
        userNotFound: 'NOT_FOUND',
        dailyReward: 'DAILY',
        weeklyReward: 'WEEKLY',
        balanceReply: 'BAL',
        depositMsg: 'DEP',
        withdrawMsg: 'WD',
        NaN: 'NAN',
        msgDropAlreadyEnabled: 'A_EN',
        msgDropEnabled: 'EN',
        msgDropAlreadyDisabled: 'A_DIS',
        msgDropDisabled: 'DIS',
        ...strings
    };
    const interaction = {
        user: {
            id: userId,
            tag: 'Me#1',
            toString: () => `<@${userId}>`
        },
        reply: jest.fn().mockResolvedValue(),
        options: {
            getUser: jest.fn((name) => options[`user_${name}`] ?? options.user ?? null),
            getInteger: jest.fn((name) => options[name] ?? null),
            getBoolean: jest.fn((name) => options[name] ?? null),
            get: jest.fn((name) => (name in options ? {value: options[name]} : undefined))
        },
        client: {
            config: {botOperators},
            strings: {not_enough_permissions: 'NO_PERMS'},
            logChannel,
            logger: {
                info: jest.fn(),
                error: jest.fn()
            },
            configurations: {
                'economy-system': {
                    config: baseConfig,
                    strings: baseStrings
                }
            },
            models: {'economy-system': models}
        }
    };
    // beforeSubcommand wires interaction.str / interaction.config
    return interaction;
}

beforeEach(() => {
    mockEditBalance.mockClear();
    mockEditBank.mockClear();
    mockCreateLeaderboard.mockClear();
    mockRandomInt.mockReset().mockReturnValue(25);
    mockRandomElement.mockClear().mockImplementation((arr) => arr[0]);
});

async function withBefore(interaction, sub) {
    await cmd.beforeSubcommand(interaction);
    return sub(interaction);
}

describe('beforeSubcommand', () => {
    test('attaches the module strings and config onto the interaction', async () => {
        const interaction = makeInteraction();
        await cmd.beforeSubcommand(interaction);
        expect(interaction.str).toBe(interaction.client.configurations['economy-system'].strings);
        expect(interaction.config).toBe(interaction.client.configurations['economy-system'].config);
    });
});

describe('work + cooldown helper', () => {
    test('creates a cooldown row and credits the wallet on first use', async () => {
        const models = makeModels({cooldownRow: null});
        mockRandomInt.mockReturnValue(33);
        const interaction = makeInteraction({models});
        await withBefore(interaction, cmd.subcommands.work);

        expect(models.cooldown.create).toHaveBeenCalledWith(expect.objectContaining({
            command: 'work',
            userId: 'me'
        }));
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 33);
        expect(mockCreateLeaderboard).toHaveBeenCalled();
        // The reply uses the (mocked) success string, not the cooldown string.
        expect(interaction.reply.mock.calls[0][0].input).toBe('WORK');
    });

    test('blocks work while the cooldown window is still active', async () => {
        const cooldownRow = {
            timestamp: new Date(Date.now()),
            save: jest.fn()
        };
        const interaction = makeInteraction({models: makeModels({cooldownRow})});
        await withBefore(interaction, cmd.subcommands.work);

        expect(mockEditBalance).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].input).toBe('COOLDOWN');
        expect(cooldownRow.save).not.toHaveBeenCalled();
    });

    test('refreshes the timestamp and proceeds once the window has elapsed', async () => {
        const cooldownRow = {
            timestamp: new Date(Date.now() - 10 * 60000),
            save: jest.fn().mockResolvedValue()
        };
        const interaction = makeInteraction({models: makeModels({cooldownRow})});
        await withBefore(interaction, cmd.subcommands.work);

        expect(cooldownRow.save).toHaveBeenCalled();
        expect(mockEditBalance).toHaveBeenCalled();
    });

    test('rolls the earnings between min and max as passed to randomIntFromInterval', async () => {
        const interaction = makeInteraction({
            config: {
                minWorkMoney: 5,
                maxWorkMoney: 9
            }
        });
        await withBefore(interaction, cmd.subcommands.work);
        // Source passes (min, max) in order: randomIntFromInterval(minWorkMoney, maxWorkMoney).
        expect(mockRandomInt).toHaveBeenCalledWith(5, 9);
    });
});

describe('crime', () => {
    test('a winning flip credits a random amount', async () => {
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.99); // floor(0.99*2)=1 -> success branch
        mockRandomInt.mockReturnValue(40);
        const interaction = makeInteraction();
        await withBefore(interaction, cmd.subcommands.crime);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 40);
        expect(interaction.reply.mock.calls[0][0].input).toBe('CRIME_WIN');
        spy.mockRestore();
    });

    test('a losing flip removes half the wallet balance', async () => {
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1); // floor(0.1*2)=0 -> fail branch
        const balanceRow = {balance: 80};
        const interaction = makeInteraction({models: makeModels({balanceRow})});
        await withBefore(interaction, cmd.subcommands.crime);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'remove', 40);
        expect(interaction.reply.mock.calls[0][0].input).toBe('CRIME_LOSE');
        spy.mockRestore();
    });

    test('a losing flip with an empty wallet drains the bank by maxCrimeMoney', async () => {
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0); // fail branch
        const balanceRow = {balance: 0};
        const interaction = makeInteraction({
            models: makeModels({balanceRow}),
            config: {maxCrimeMoney: 200}
        });
        await withBefore(interaction, cmd.subcommands.crime);
        expect(mockEditBank).toHaveBeenCalledWith(interaction.client, 'me', 'remove', 200);
        spy.mockRestore();
    });

    test('respects the crime cooldown', async () => {
        const cooldownRow = {
            timestamp: new Date(),
            save: jest.fn()
        };
        const interaction = makeInteraction({models: makeModels({cooldownRow})});
        await withBefore(interaction, cmd.subcommands.crime);
        expect(interaction.reply.mock.calls[0][0].input).toBe('COOLDOWN');
    });
});

describe('rob', () => {
    test('rejects when the victim has no balance row', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue(null);
        const interaction = makeInteraction({
            models,
            options: {
                user: {
                    id: 'victim',
                    tag: 'V#1'
                }
            }
        });
        await withBefore(interaction, cmd.subcommands.rob);
        expect(interaction.reply.mock.calls[0][0].input).toBe('NOT_FOUND');
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('transfers robPercent of the victim balance to the robber', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({balance: 200});
        const interaction = makeInteraction({
            models,
            options: {
                user: {
                    id: 'victim',
                    tag: 'V#1'
                }
            },
            config: {
                robPercent: 25,
                maxRobAmount: 1000
            }
        });
        await withBefore(interaction, cmd.subcommands.rob);
        // 25% of 200 = 50
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 50);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'victim', 'remove', 50);
    });

    test('caps the stolen amount at maxRobAmount', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({balance: 10000});
        const interaction = makeInteraction({
            models,
            options: {
                user: {
                    id: 'victim',
                    tag: 'V#1'
                }
            },
            config: {
                robPercent: 100,
                maxRobAmount: 300
            }
        });
        await withBefore(interaction, cmd.subcommands.rob);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 300);
    });
});

describe('daily and weekly', () => {
    test('daily adds the configured reward and uses a 24h cooldown', async () => {
        const models = makeModels({cooldownRow: null});
        const interaction = makeInteraction({
            models,
            config: {dailyReward: 100}
        });
        await withBefore(interaction, cmd.subcommands.daily);
        expect(models.cooldown.create).toHaveBeenCalledWith(expect.objectContaining({command: 'daily'}));
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 100);
    });

    test('weekly adds the configured weekly reward', async () => {
        const interaction = makeInteraction({config: {weeklyReward: 700}});
        await withBefore(interaction, cmd.subcommands.weekly);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'me', 'add', 700);
    });

    test('daily is blocked while on cooldown', async () => {
        const cooldownRow = {
            timestamp: new Date(),
            save: jest.fn()
        };
        const interaction = makeInteraction({models: makeModels({cooldownRow})});
        await withBefore(interaction, cmd.subcommands.daily);
        expect(mockEditBalance).not.toHaveBeenCalled();
    });
});

describe('balance', () => {
    test('replies with the requested user balance breakdown', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({
            balance: 30,
            bank: 70
        });
        const interaction = makeInteraction({
            models,
            options: {
                user: {
                    id: 'other',
                    tag: 'O#1'
                }
            }
        });
        await withBefore(interaction, cmd.subcommands.balance);
        const args = interaction.reply.mock.calls[0][0].args;
        expect(args['%balance%']).toBe('30 $');
        expect(args['%bank%']).toBe('70 $');
        expect(args['%total%']).toBe('100 $');
    });

    test('defaults to the caller when no user option is given', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({
            balance: 1,
            bank: 2
        });
        const interaction = makeInteraction({
            models,
            options: {}
        });
        await withBefore(interaction, cmd.subcommands.balance);
        expect(models.Balance.findOne).toHaveBeenCalledWith({where: {id: 'me'}});
    });

    test('replies userNotFound when there is no balance row', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue(null);
        const interaction = makeInteraction({
            models,
            options: {
                user: {
                    id: 'ghost',
                    tag: 'G#1'
                }
            }
        });
        await withBefore(interaction, cmd.subcommands.balance);
        expect(interaction.reply.mock.calls[0][0].input).toBe('NOT_FOUND');
    });
});

describe('deposit and withdraw', () => {
    test('deposit "all" resolves to the wallet balance', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({
            balance: 60,
            bank: 0
        });
        const interaction = makeInteraction({
            models,
            options: {amount: 'all'}
        });
        await withBefore(interaction, cmd.subcommands.deposit);
        expect(mockEditBank).toHaveBeenCalledWith(interaction.client, 'me', 'deposit', 60);
    });

    test('deposit rejects a non-numeric amount', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({
            balance: 60,
            bank: 0
        });
        const interaction = makeInteraction({
            models,
            options: {amount: 'banana'}
        });
        await withBefore(interaction, cmd.subcommands.deposit);
        expect(interaction.reply.mock.calls[0][0].input).toBe('NAN');
        expect(mockEditBank).not.toHaveBeenCalled();
    });

    test('withdraw "all" resolves to the bank balance', async () => {
        const models = makeModels();
        models.Balance.findOne.mockResolvedValue({
            balance: 0,
            bank: 40
        });
        const interaction = makeInteraction({
            models,
            options: {amount: 'all'}
        });
        await withBefore(interaction, cmd.subcommands.withdraw);
        expect(mockEditBank).toHaveBeenCalledWith(interaction.client, 'me', 'withdraw', 40);
    });
});

describe('admin add/remove/set permission gating', () => {
    test('add is denied for non-admins', async () => {
        const interaction = makeInteraction({
            options: {
                user: {
                    id: 'target',
                    tag: 'T#1'
                },
                amount: 50
            }
        });
        await withBefore(interaction, cmd.subcommands.add);
        expect(interaction.reply.mock.calls[0][0].input).toBe('NO_PERMS');
        expect(mockEditBalance).not.toHaveBeenCalled();
    });

    test('add works for a configured admin', async () => {
        const interaction = makeInteraction({
            userId: 'admin',
            config: {admins: ['admin']},
            options: {
                user: {
                    id: 'target',
                    tag: 'T#1'
                },
                amount: 50
            }
        });
        await withBefore(interaction, cmd.subcommands.add);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'target', 'add', 50);
    });

    test('a bot operator can use admin commands even when not in admins', async () => {
        const interaction = makeInteraction({
            userId: 'op',
            botOperators: ['op'],
            options: {
                user: {
                    id: 'target',
                    tag: 'T#1'
                },
                balance: 99
            }
        });
        await withBefore(interaction, cmd.subcommands.set);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'target', 'set', 99);
    });

    test('self-targeting is blocked unless selfBalance is enabled', async () => {
        const interaction = makeInteraction({
            userId: 'admin',
            config: {
                admins: ['admin'],
                selfBalance: false
            },
            options: {
                user: {
                    id: 'admin',
                    tag: 'A#1'
                },
                amount: 10
            }
        });
        await withBefore(interaction, cmd.subcommands.add);
        expect(mockEditBalance).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].content).toContain('admin-self-abuse-answer');
    });

    test('remove subtracts the amount for an admin', async () => {
        const interaction = makeInteraction({
            userId: 'admin',
            config: {admins: ['admin']},
            options: {
                user: {
                    id: 'target',
                    tag: 'T#1'
                },
                amount: 20
            }
        });
        await withBefore(interaction, cmd.subcommands.remove);
        expect(mockEditBalance).toHaveBeenCalledWith(interaction.client, 'target', 'remove', 20);
    });
});

describe('msg_drop toggles', () => {
    test('enable destroys an existing opt-out row (re-enabling drops)', async () => {
        const dropRow = {destroy: jest.fn().mockResolvedValue()};
        const interaction = makeInteraction({models: makeModels({dropRow})});
        await withBefore(interaction, cmd.subcommands.msg_drop_msg.enable);
        expect(dropRow.destroy).toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].input).toBe('EN');
    });

    test('enable reports "already enabled" when there is no opt-out row', async () => {
        const interaction = makeInteraction({models: makeModels({dropRow: null})});
        await withBefore(interaction, cmd.subcommands.msg_drop_msg.enable);
        expect(interaction.reply.mock.calls[0][0].input).toBe('A_EN');
    });

    test('disable creates an opt-out row when none exists', async () => {
        const models = makeModels({dropRow: null});
        const interaction = makeInteraction({models});
        await withBefore(interaction, cmd.subcommands.msg_drop_msg.disable);
        expect(models.dropMsg.create).toHaveBeenCalledWith({id: 'me'});
        expect(interaction.reply.mock.calls[0][0].input).toBe('DIS');
    });

    test('disable reports "already disabled" when a row exists', async () => {
        const interaction = makeInteraction({models: makeModels({dropRow: {}})});
        await withBefore(interaction, cmd.subcommands.msg_drop_msg.disable);
        expect(interaction.reply.mock.calls[0][0].input).toBe('A_DIS');
    });
});

describe('destroy', () => {
    test('is denied for non-admins', async () => {
        const interaction = makeInteraction({options: {confirm: true}});
        await withBefore(interaction, cmd.subcommands.destroy);
        expect(interaction.reply.mock.calls[0][0].input).toBe('NO_PERMS');
    });

    test('aborts without the confirm flag', async () => {
        const interaction = makeInteraction({
            userId: 'admin',
            config: {admins: ['admin']},
            options: {confirm: false}
        });
        await withBefore(interaction, cmd.subcommands.destroy);
        expect(interaction.reply.mock.calls[0][0].content).toContain('destroy-cancel-reply');
    });

    test('with confirm wipes every model collection', async () => {
        const models = makeModels();
        const rows = (n) => Array.from({length: n}, () => ({destroy: jest.fn().mockResolvedValue()}));
        models.cooldown.findAll.mockResolvedValue(rows(2));
        models.dropMsg.findAll.mockResolvedValue(rows(1));
        models.Shop.findAll.mockResolvedValue(rows(3));
        models.Balance.findAll.mockResolvedValue(rows(2));
        const interaction = makeInteraction({
            userId: 'admin',
            config: {admins: ['admin']},
            models,
            options: {confirm: true}
        });
        await withBefore(interaction, cmd.subcommands.destroy);
        expect(interaction.reply.mock.calls[0][0].content).toContain('destroy-reply');
        expect(models.cooldown.findAll).toHaveBeenCalled();
        expect(models.Balance.findAll).toHaveBeenCalled();
    });
});

describe('config.options builder', () => {
    test('omits cheat subcommands when allowCheats is off', () => {
        const client = {configurations: {'economy-system': {config: {allowCheats: false}}}};
        const names = cmd.config.options(client).map((o) => o.name);
        expect(names).toContain('work');
        expect(names).not.toContain('add');
        expect(names).not.toContain('destroy');
    });

    test('includes add/remove/set/destroy when allowCheats is on', () => {
        const client = {configurations: {'economy-system': {config: {allowCheats: true}}}};
        const names = cmd.config.options(client).map((o) => o.name);
        expect(names).toEqual(expect.arrayContaining(['add', 'remove', 'set', 'destroy']));
    });
});