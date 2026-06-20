/*
 * Behavior tests for the data-driven logic in staff-management.js that the
 * existing helpers.test.js / interactionCreate.test.js do not cover:
 *
 *   - generateInfractionHistoryResponse(): empty "clean record" path, the
 *     pagination math (5 per page) and the active/voided status icons / jump links
 *   - generatePromotionHistoryResponse(): empty path + populated rows
 *   - generateReviewHistoryResponse(): feature-disabled gate, average-stars math
 *   - generatePanelInfractions/Promotions/Reviews/Status: the page-1 (3 items)
 *     vs page-2 (5 items) limit/offset split and totalPages computation
 *   - generatePanelSubpage(): the type -> generator dispatch table
 *   - executeDataDeletion(): which models get destroyed / which profile fields
 *     get reset for each deletion scope (incl. del_all)
 *   - submitReview(): feature gate, not-a-member, self-rate gate, staff-only gate,
 *     and the happy path that persists a review
 *   - voidInfraction(): permission gate, missing/inactive case, suspension role
 *     restoration, and the generic void path
 *
 * discord.js builders are real (via the discordjs-fix shim); the helpers that hit
 * Discord formatting (embedTypeV2 / dateToDiscordTimestamp / safeSetFooter) are
 * mocked so we assert on decision logic and model interactions, not embed bytes.
 */

jest.mock('../../src/functions/helpers', () => ({
    embedTypeV2: jest.fn().mockResolvedValue({content: 'rendered'}),
    safeSetFooter: jest.fn((embed) => embed),
    dateToDiscordTimestamp: jest.fn(() => '<t:0:F>'),
    disableModule: jest.fn(),
    formatDiscordUserName: (u) => (u && u.tag) || 'user'
}));

const mgmt = require('../../modules/staff-management-system/staff-management');

function makeUser(overrides = {}) {
    return {
        id: 'u1',
        username: 'Target',
        tag: 'Target#1',
        toString: () => '<@u1>',
        displayAvatarURL: () => 'https://cdn.example/avatar.png',
        ...overrides
    };
}

function modelStub(methods = {}) {
    return {
        findAndCountAll: jest.fn().mockResolvedValue({
            count: 0,
            rows: []
        }),
        findAll: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({update: jest.fn().mockResolvedValue()}),
        destroy: jest.fn().mockResolvedValue(),
        findByPk: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(),
        ...methods
    };
}

function makeClient(models = {}, configurations = {}) {
    return {
        guildID: 'g1',
        strings: {footer: 'f'},
        logger: {
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn()
        },
        guilds: {cache: {get: () => null}},
        models: {
            'staff-management-system': {
                Infraction: modelStub(),
                Promotion: modelStub(),
                StaffReview: modelStub(),
                LoaRequest: modelStub(),
                StaffProfile: modelStub(),
                ActivityCheck: modelStub(),
                ActivityCheckResponse: modelStub(),
                StaffShift: modelStub(),
                ...models
            }
        },
        configurations: {'staff-management-system': configurations}
    };
}

describe('generateInfractionHistoryResponse', () => {
    test('returns an ephemeral "clean record" message when there are no infractions', async () => {
        const client = makeClient();
        const res = await mgmt.generateInfractionHistoryResponse(client, makeUser(), 1);
        expect(res.content).toContain('info-clean-rec');
        expect(res.embeds).toBeUndefined();
    });

    test('renders rows with pagination metadata when infractions exist', async () => {
        const rows = [
            {
                caseId: 10,
                type: 'Warning',
                active: true,
                reason: 'spam',
                createdAt: new Date(),
                expiresAt: null,
                issuerId: 'mod',
                messageUrl: 'https://x'
            },
            {
                caseId: 11,
                type: 'Mute',
                active: false,
                reason: 'rude',
                createdAt: new Date(),
                expiresAt: new Date(),
                issuerId: 'mod',
                messageUrl: null
            }
        ];
        const client = makeClient({
            Infraction: modelStub({
                findAndCountAll: jest.fn().mockResolvedValue({
                    count: 7,
                    rows
                })
            })
        });
        const res = await mgmt.generateInfractionHistoryResponse(client, makeUser(), 1);
        expect(res.embeds).toHaveLength(1);
        expect(res.components).toHaveLength(1);
        // 7 infractions / 5 per page => 2 pages
        const desc = res.embeds[0].description;
        expect(desc).toContain('#10');
        expect(desc).toContain('#11');
        // active uses 🔴, voided uses the voided icon token
        expect(desc).toContain('🔴');
        expect(desc).toContain('icon-voided');
        // jump link only for the one with a messageUrl
        expect(desc).toContain('[Jump](https://x)');
    });

    test('paginates with limit 5 and the correct offset for page 2', async () => {
        const findAndCountAll = jest.fn().mockResolvedValue({
            count: 7,
            rows: []
        });
        const client = makeClient({Infraction: modelStub({findAndCountAll})});
        await mgmt.generateInfractionHistoryResponse(client, makeUser(), 2);
        expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
            limit: 5,
            offset: 5
        }));
    });
});

describe('generatePromotionHistoryResponse', () => {
    test('returns the "no promotions" info message when empty', async () => {
        const client = makeClient();
        const res = await mgmt.generatePromotionHistoryResponse(client, makeUser(), 1);
        expect(res.content).toContain('info-no-promo');
    });

    test('renders promotion rows and includes the role mention', async () => {
        const rows = [{
            newRole: 'role9',
            issuerId: 'mod',
            reason: 'great work',
            createdAt: new Date(),
            messageUrl: null
        }];
        const client = makeClient({
            Promotion: modelStub({
                findAndCountAll: jest.fn().mockResolvedValue({
                    count: 1,
                    rows
                })
            })
        });
        const res = await mgmt.generatePromotionHistoryResponse(client, makeUser(), 1);
        expect(res.embeds[0].description).toContain('<@&role9>');
    });
});

describe('generateReviewHistoryResponse', () => {
    test('is gated behind enableReviews', async () => {
        const client = makeClient({}, {reviews: {enableReviews: false}});
        const res = await mgmt.generateReviewHistoryResponse(client, makeUser(), 1);
        expect(res.content).toContain('err-feat-disabled');
    });

    test('computes the average star rating', async () => {
        const client = makeClient({
            StaffReview: modelStub({
                findAndCountAll: jest.fn().mockResolvedValue({
                    count: 2,
                    rows: [
                        {
                            stars: 5,
                            authorId: 'a',
                            comment: 'good',
                            messageUrl: null
                        },
                        {
                            stars: 3,
                            authorId: 'b',
                            comment: 'ok',
                            messageUrl: null
                        }
                    ]
                }),
                findAll: jest.fn().mockResolvedValue([{stars: 5}, {stars: 3}])
            })
        }, {reviews: {enableReviews: true}});
        const res = await mgmt.generateReviewHistoryResponse(client, makeUser(), 1);
        // (5 + 3) / 2 = 4.0 -> appears in the description placeholder args
        expect(res.embeds[0].description).toContain('avg=4.0');
    });
});

describe('panel page limit/offset split (3 then 5)', () => {
    test('infractions page 1 fetches 3 items at offset 0', async () => {
        const findAll = jest.fn().mockResolvedValue([]);
        const client = makeClient({Infraction: modelStub({findAll})});
        await mgmt.generatePanelInfractions(client, makeUser(), 1);
        // last findAll call is the paginated one
        const opts = findAll.mock.calls.at(-1)[0];
        expect(opts.limit).toBe(3);
        expect(opts.offset).toBe(0);
    });

    test('infractions page 2 fetches 5 items at offset 3', async () => {
        const findAll = jest.fn().mockResolvedValue([]);
        const client = makeClient({Infraction: modelStub({findAll})});
        await mgmt.generatePanelInfractions(client, makeUser(), 2);
        const opts = findAll.mock.calls.at(-1)[0];
        expect(opts.limit).toBe(5);
        expect(opts.offset).toBe(3);
    });

    test('promotions page 3 fetches 5 items at offset 8', async () => {
        const findAll = jest.fn().mockResolvedValue([]);
        const client = makeClient({
            Promotion: modelStub({
                count: jest.fn().mockResolvedValue(0),
                findAll
            })
        });
        await mgmt.generatePanelPromotions(client, makeUser(), 3);
        const opts = findAll.mock.calls.at(-1)[0];
        expect(opts.limit).toBe(5);
        expect(opts.offset).toBe(8); // 3 + (3-2)*5
    });

    test('reviews panel computes the average and renders stars', async () => {
        const all = [{
            stars: 4,
            authorId: 'a',
            comment: 'x'
        }, {
            stars: 2,
            authorId: 'b',
            comment: 'y'
        }];
        const client = makeClient({StaffReview: modelStub({findAll: jest.fn().mockResolvedValue(all)})});
        const res = await mgmt.generatePanelReviews(client, makeUser(), 1);
        // avg (4+2)/2 = 3.0 fed to the description token
        expect(res.embeds[0].description).toContain('avg=3.0');
    });

    test('status panel surfaces the active APPROVED status', async () => {
        const future = new Date(Date.now() + 86400000);
        const statuses = [{
            status: 'APPROVED',
            type: 'LOA',
            endDate: future,
            startDate: new Date(),
            reason: 'trip'
        }];
        const client = makeClient({LoaRequest: modelStub({findAll: jest.fn().mockResolvedValue(statuses)})});
        const res = await mgmt.generatePanelStatus(client, makeUser(), 1);
        expect(res.embeds[0].description).toContain('LOA');
    });
});

describe('generatePanelSubpage dispatch', () => {
    test('routes each type to its generator and returns null for unknown types', async () => {
        const client = makeClient();
        expect(await mgmt.generatePanelSubpage(client, makeUser(), 'infractions', 1)).toBeTruthy();
        expect(await mgmt.generatePanelSubpage(client, makeUser(), 'promotions', 1)).toBeTruthy();
        expect(await mgmt.generatePanelSubpage(client, makeUser(), 'reviews', 1)).toBeTruthy();
        expect(await mgmt.generatePanelSubpage(client, makeUser(), 'status', 1)).toBeTruthy();
        expect(await mgmt.generatePanelSubpage(client, makeUser(), 'bogus', 1)).toBeNull();
    });
});

describe('executeDataDeletion', () => {
    test('del_infractions only destroys infractions', async () => {
        const client = makeClient();
        const models = client.models['staff-management-system'];
        await mgmt.executeDataDeletion(client, 'u1', 'del_infractions');
        expect(models.Infraction.destroy).toHaveBeenCalledWith({where: {userId: 'u1'}});
        expect(models.Promotion.destroy).not.toHaveBeenCalled();
        expect(models.StaffReview.destroy).not.toHaveBeenCalled();
    });

    test('del_reviews destroys reviews keyed by targetId', async () => {
        const client = makeClient();
        await mgmt.executeDataDeletion(client, 'u1', 'del_reviews');
        expect(client.models['staff-management-system'].StaffReview.destroy)
            .toHaveBeenCalledWith({where: {targetId: 'u1'}});
    });

    test('del_shifts resets the duty profile fields', async () => {
        const profile = {update: jest.fn().mockResolvedValue()};
        const client = makeClient({StaffProfile: modelStub({findByPk: jest.fn().mockResolvedValue(profile)})});
        await mgmt.executeDataDeletion(client, 'u1', 'del_shifts');
        expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({
            onDuty: false,
            onBreak: false,
            breakStartTime: null,
            lastClockIn: null
        }));
    });

    test('del_all destroys every model and wipes the whole profile', async () => {
        const profile = {update: jest.fn().mockResolvedValue()};
        const client = makeClient({StaffProfile: modelStub({findByPk: jest.fn().mockResolvedValue(profile)})});
        const models = client.models['staff-management-system'];
        await mgmt.executeDataDeletion(client, 'u1', 'del_all');
        expect(models.Infraction.destroy).toHaveBeenCalled();
        expect(models.Promotion.destroy).toHaveBeenCalled();
        expect(models.StaffReview.destroy).toHaveBeenCalled();
        expect(models.ActivityCheckResponse.destroy).toHaveBeenCalled();
        expect(profile.update).toHaveBeenCalledWith(expect.objectContaining({
            isSuspended: false,
            customNickname: null,
            customIntro: null,
            activityStatus: null
        }));
    });

    test('skips the profile update when no profile exists', async () => {
        const client = makeClient({StaffProfile: modelStub({findByPk: jest.fn().mockResolvedValue(null)})});
        await expect(mgmt.executeDataDeletion(client, 'u1', 'del_shifts')).resolves.toBeUndefined();
    });
});

describe('submitReview', () => {
    function reviewInteraction(overrides = {}) {
        return {
            user: {
                id: 'author',
                toString: () => '<@author>',
                displayAvatarURL: () => 'a'
            },
            guild: {
                members: {
                    fetch: jest.fn().mockResolvedValue({roles: {cache: {some: () => true}}}),
                    channels: {cache: {get: () => null}}
                }
            },
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue(),
            ...overrides
        };
    }

    test('is gated behind enableReviews', async () => {
        const client = makeClient({}, {reviews: {enableReviews: false}});
        const interaction = reviewInteraction();
        await mgmt.submitReview(client, interaction, makeUser(), 5, 'nice');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-feat-disabled')
        }));
    });

    test('rejects reviewing someone who is not a guild member', async () => {
        const client = makeClient({}, {reviews: {enableReviews: true}});
        const interaction = reviewInteraction();
        interaction.guild.members.fetch = jest.fn().mockResolvedValue(null);
        await mgmt.submitReview(client, interaction, makeUser(), 5, 'nice');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-not-mem')
        }));
    });

    test('rejects self-reviews unless allowSelfRating is set', async () => {
        const client = makeClient({}, {
            reviews: {
                enableReviews: true,
                allowSelfRating: false,
                onlyAllowStaffReview: false
            }
        });
        const interaction = reviewInteraction();
        await mgmt.submitReview(client, interaction, makeUser({id: 'author'}), 5, 'nice');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-self-rate')
        }));
    });

    test('rejects reviewing a non-staff member when staff-only is enabled', async () => {
        const client = makeClient({}, {
            reviews: {
                enableReviews: true,
                onlyAllowStaffReview: true
            },
            configuration: {staffRoles: ['staff']}
        });
        const interaction = reviewInteraction();
        interaction.guild.members.fetch = jest.fn().mockResolvedValue({roles: {cache: {some: () => false}}});
        await mgmt.submitReview(client, interaction, makeUser(), 5, 'nice');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-staff-rate')
        }));
    });

    test('persists the review on the happy path', async () => {
        const create = jest.fn().mockResolvedValue({update: jest.fn().mockResolvedValue()});
        const client = makeClient({StaffReview: modelStub({create})},
            {
                reviews: {
                    enableReviews: true,
                    allowSelfRating: true,
                    onlyAllowStaffReview: false
                }
            });
        const interaction = reviewInteraction();
        await mgmt.submitReview(client, interaction, makeUser(), 4, 'solid');
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            targetId: 'u1',
            authorId: 'author',
            stars: 4,
            comment: 'solid'
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('succ-review')
        }));
    });
});

describe('voidInfraction', () => {
    function voidInteraction() {
        return {
            user: {id: 'mod'},
            member: {
                permissions: {has: () => true},
                roles: {cache: {some: () => true}}
            },
            guild: {
                members: {fetch: jest.fn().mockResolvedValue(null)},
                channels: {fetch: jest.fn()}
            },
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue()
        };
    }

    test('is gated behind enableInfractions', async () => {
        const client = makeClient({}, {infractions: {enableInfractions: false}});
        const interaction = voidInteraction();
        await mgmt.voidInfraction(client, interaction, '5');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-feat-disabled')
        }));
    });

    test('rejects non-supervisors', async () => {
        const client = makeClient({}, {
            infractions: {enableInfractions: true},
            configuration: {supervisorRoles: ['sup']}
        });
        const interaction = voidInteraction();
        interaction.member = {
            permissions: {has: () => false},
            roles: {cache: {some: () => false}}
        };
        await mgmt.voidInfraction(client, interaction, '5');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-gen-no-perm')
        }));
    });

    test('reports when the referenced case cannot be found', async () => {
        const client = makeClient({Infraction: modelStub({findByPk: jest.fn().mockResolvedValue(null)})},
            {
                infractions: {enableInfractions: true},
                configuration: {}
            });
        const interaction = voidInteraction();
        await mgmt.voidInfraction(client, interaction, '999');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-no-case-ref')
        }));
    });

    test('refuses to void an already-inactive case', async () => {
        const record = {
            caseId: 3,
            active: false,
            type: 'Warning'
        };
        const client = makeClient({Infraction: modelStub({findByPk: jest.fn().mockResolvedValue(record)})},
            {
                infractions: {enableInfractions: true},
                configuration: {}
            });
        const interaction = voidInteraction();
        await mgmt.voidInfraction(client, interaction, '3');
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('err-case-inact')
        }));
    });

    test('voids a regular infraction', async () => {
        const update = jest.fn().mockResolvedValue();
        const record = {
            caseId: 3,
            active: true,
            type: 'Warning',
            update
        };
        const client = makeClient({Infraction: modelStub({findByPk: jest.fn().mockResolvedValue(record)})},
            {
                infractions: {enableInfractions: true},
                configuration: {}
            });
        const interaction = voidInteraction();
        await mgmt.voidInfraction(client, interaction, '3');
        expect(update).toHaveBeenCalledWith({active: false});
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('succ-void')
        }));
    });

    test('restores suspended roles when voiding a suspension', async () => {
        const update = jest.fn().mockResolvedValue();
        const record = {
            caseId: 4,
            active: true,
            type: 'Suspension',
            userId: 'target',
            update
        };
        const profile = {
            isSuspended: true,
            suspendedRoles: '["r1","r2"]',
            update: jest.fn().mockResolvedValue()
        };
        const member = {
            roles: {
                add: jest.fn().mockResolvedValue(),
                remove: jest.fn().mockResolvedValue()
            }
        };
        const client = makeClient({
            Infraction: modelStub({findByPk: jest.fn().mockResolvedValue(record)}),
            StaffProfile: modelStub({findOne: jest.fn().mockResolvedValue(profile)})
        }, {
            infractions: {
                enableInfractions: true,
                suspensionRole: 'susp-role'
            },
            configuration: {}
        });
        const interaction = voidInteraction();
        interaction.guild.members.fetch = jest.fn().mockResolvedValue(member);
        await mgmt.voidInfraction(client, interaction, '4');
        expect(member.roles.add).toHaveBeenCalledWith(['r1', 'r2']);
        expect(member.roles.remove).toHaveBeenCalledWith('susp-role');
        expect(profile.update).toHaveBeenCalledWith({
            isSuspended: false,
            suspendedRoles: '[]'
        });
        expect(record.update).toHaveBeenCalledWith({active: false});
    });
});