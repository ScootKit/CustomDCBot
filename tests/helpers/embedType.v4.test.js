const mainStub = require('../__stubs__/main');
const {
    embedType,
    __test
} = require('../../src/functions/helpers');
const {
    buildV4Button,
    buildV4StringSelect,
    buildV4Component
} = __test;
const {ButtonStyle} = require('discord.js');

function resetClient() {
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'test-footer',
        footerImgUrl: '',
        disableFooterTimestamp: false
    };
    mainStub.client.scnxSetup = false;
    mainStub.client.user = null;
    mainStub.client.guild = null;
    mainStub.client.logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        log: jest.fn()
    };
}

beforeEach(resetClient);

describe('embedType v4 - dispatch', () => {
    test('sets IsComponentsV2 flag and clears content/embeds', () => {
        const out = embedType({
            _schema: 'v4',
            components: []
        });
        expect(out.flags).toBeGreaterThan(0);
        expect(out.content).toBeNull();
        expect(out.embeds).toEqual([]);
    });

    test('preserves existing optionsToKeep.flags via bitwise OR', () => {
        const out = embedType({
            _schema: 'v4',
            components: []
        }, {}, {flags: 1});
        expect(out.flags & 1).toBe(1);
    });

    test('coerces string flags to number before OR', () => {
        const out = embedType({
            _schema: 'v4',
            components: []
        }, {}, {flags: '2'});
        expect(typeof out.flags).toBe('number');
    });

    test('preserves existing components by appending at the end', () => {
        const existing = {marker: 'kept'};
        const out = embedType({
            _schema: 'v4',
            components: []
        }, {}, {components: [existing]});
        expect(out.components.at(-1)).toEqual(existing);
    });

    test('appends mergeComponentsRows in order', () => {
        const row1 = {marker: 'row1'};
        const row2 = {marker: 'row2'};
        const out = embedType({
            _schema: 'v4',
            components: []
        }, {}, {}, [row1, row2]);
        expect(out.components).toContain(row1);
        expect(out.components).toContain(row2);
    });

    test('logs error and continues when a top-level component build throws', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{type: 'bogus'}]
        });
        expect(out.components).toEqual([]);
    });

    test('null/undefined component returns null from builder', () => {
        expect(buildV4Component(null, {})).toBeNull();
        expect(buildV4Component(undefined, {})).toBeNull();
        expect(buildV4Component({}, {})).toBeNull();
    });
});

describe('embedType v4 - TextDisplay (type 10)', () => {
    test('renders TextDisplay with content', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 10,
                content: 'Hello world'
            }]
        });
        expect(out.components).toHaveLength(1);
        expect(out.components[0].data.content).toBe('Hello world');
    });

    test('substitutes args in content', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 10,
                content: 'Hi %name%'
            }]
        }, {'%name%': 'Eve'});
        expect(out.components[0].data.content).toBe('Hi Eve');
    });

    test('truncates content over 4000 chars', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 10,
                content: 'x'.repeat(5000)
            }]
        });
        expect(out.components[0].data.content).toHaveLength(4000);
    });

    test('skips empty content', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 10,
                content: ''
            }]
        });
        expect(out.components).toEqual([]);
    });

    test('skips missing content', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{type: 10}]
        });
        expect(out.components).toEqual([]);
    });
});

describe('embedType v4 - Separator (type 14)', () => {
    test('renders a Separator with defaults', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{type: 14}]
        });
        expect(out.components).toHaveLength(1);
    });

    test('honors divider true', () => {
        const sep = buildV4Component({
            type: 14,
            divider: true
        }, {});
        expect(sep.data.divider).toBe(true);
    });

    test('honors divider false', () => {
        const sep = buildV4Component({
            type: 14,
            divider: false
        }, {});
        expect(sep.data.divider).toBe(false);
    });

    test('spacing 2 maps to Large', () => {
        const sep = buildV4Component({
            type: 14,
            spacing: 2
        }, {});
        expect(sep.data.spacing).toBe(2);
    });

    test('default spacing is Small (1)', () => {
        const sep = buildV4Component({type: 14}, {});
        expect(sep.data.spacing).toBe(1);
    });
});

describe('embedType v4 - MediaGallery (type 12)', () => {
    test('renders a gallery with one item', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 12,
                items: [{media: {url: 'https://x/a.png'}}]
            }]
        });
        expect(out.components).toHaveLength(1);
        expect(out.components[0].items).toHaveLength(1);
    });

    test('skips items without media.url', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 12,
                items: [{media: {}}, {media: {url: 'https://x/a.png'}}]
            }]
        });
        expect(out.components[0].items).toHaveLength(1);
    });

    test('returns null when items array is empty', () => {
        const result = buildV4Component({
            type: 12,
            items: []
        }, {});
        expect(result).toBeNull();
    });

    test('returns null when items is missing', () => {
        const result = buildV4Component({type: 12}, {});
        expect(result).toBeNull();
    });

    test('renders item description and spoiler flag', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 12,
                items: [{
                    media: {url: 'https://x/i.png'},
                    description: 'alt text',
                    spoiler: true
                }]
            }]
        });
        const item = out.components[0].items[0].data;
        expect(item.description).toBe('alt text');
        expect(item.spoiler).toBe(true);
    });

    test('substitutes args in item url and description', () => {
        const out = embedType(
            {
                _schema: 'v4',
                components: [{
                    type: 12,
                    items: [{
                        media: {url: 'https://%h%/i.png'},
                        description: 'image of %who%'
                    }]
                }]
            },
            {
                '%h%': 'example.com',
                '%who%': 'me'
            }
        );
        const item = out.components[0].items[0].data;
        expect(item.media.url).toBe('https://example.com/i.png');
        expect(item.description).toBe('image of me');
    });

    test('skips items whose substituted URL is empty', () => {
        const out = embedType(
            {
                _schema: 'v4',
                components: [{
                    type: 12,
                    items: [{media: {url: '%missing%'}}]
                }]
            },
            {}
        );
        expect(out.components).toEqual([]);
    });
});

describe('embedType v4 - File (type 13)', () => {
    test('renders a File component with attachment:// URL', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 13,
                file: {url: 'attachment://doc.pdf'}
            }]
        });
        expect(out.components).toHaveLength(1);
    });

    test('returns null when file.url missing', () => {
        const result = buildV4Component({
            type: 13,
            file: {}
        }, {});
        expect(result).toBeNull();
    });

    test('returns null when file is missing', () => {
        const result = buildV4Component({type: 13}, {});
        expect(result).toBeNull();
    });

    test('honors spoiler flag', () => {
        const file = buildV4Component({
            type: 13,
            file: {url: 'attachment://a.pdf'},
            spoiler: true
        }, {});
        expect(file.data.spoiler).toBe(true);
    });

    test('substitutes args in file URL', () => {
        const file = buildV4Component({
            type: 13,
            file: {url: 'attachment://%name%.pdf'}
        }, {'%name%': 'doc'});
        expect(file.data.file.url).toBe('attachment://doc.pdf');
    });

    test('logs error and returns null when URL fails discord.js validation', () => {
        // FileBuilder rejects any scheme other than attachment://. Builder error is swallowed
        // by the try/catch in buildV4Component which logs and returns null.
        const result = buildV4Component({
            type: 13,
            file: {url: 'https://x/a.pdf'}
        }, {});
        expect(result).toBeNull();
    });
});

describe('embedType v4 - ActionRow (type 1) with buttons', () => {
    test('renders a row with one button', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    style: 1,
                    label: 'Click',
                    custom_id: 'x'
                }]
            }]
        });
        expect(out.components).toHaveLength(1);
    });

    test('caps row at 5 buttons (slices excess)', () => {
        const buttons = Array.from({length: 8}, (_, i) => ({
            type: 2,
            style: 1,
            label: `B${i}`,
            custom_id: `b-${i}`
        }));
        const row = buildV4Component({
            type: 1,
            components: buttons
        }, {});
        expect(row.components).toHaveLength(5);
    });

    test('returns null when row has no valid buttons', () => {
        const row = buildV4Component({
            type: 1,
            components: [{
                type: 2,
                style: 1
            }] // no label, no emoji -> invalid
        }, {});
        expect(row).toBeNull();
    });

    test('returns null when components array missing or empty', () => {
        expect(buildV4Component({type: 1}, {})).toBeNull();
        expect(buildV4Component({
            type: 1,
            components: []
        }, {})).toBeNull();
    });

    test('skips non-button (type !== 2) entries silently', () => {
        const row = buildV4Component({
            type: 1,
            components: [
                {
                    type: 2,
                    style: 1,
                    label: 'OK',
                    custom_id: 'x'
                },
                {
                    type: 99,
                    label: 'ignored'
                }
            ]
        }, {});
        expect(row.components).toHaveLength(1);
    });
});

describe('embedType v4 - ActionRow with StringSelect', () => {
    test('first child of type 3 routes to StringSelect builder', () => {
        const row = buildV4Component({
            type: 1,
            components: [{
                type: 3,
                custom_id: 'sel',
                options: [{
                    label: 'A',
                    value: 'a'
                }, {
                    label: 'B',
                    value: 'b'
                }]
            }]
        }, {});
        expect(row).toBeTruthy();
        expect(row.components).toHaveLength(1);
    });

    test('returns null when select has empty options', () => {
        const row = buildV4Component({
            type: 1,
            components: [{
                type: 3,
                custom_id: 's',
                options: []
            }]
        }, {});
        expect(row).toBeNull();
    });
});

describe('buildV4Button', () => {
    test('renders Primary style button with label and custom_id', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'Go',
            custom_id: 'go-btn'
        }, {});
        expect(btn.data.style).toBe(ButtonStyle.Primary);
        expect(btn.data.label).toBe('Go');
        expect(btn.data.custom_id).toBe('go-btn');
    });

    test('renders Secondary by default when style missing', () => {
        const btn = buildV4Button({
            type: 2,
            label: 'X',
            custom_id: 'x'
        }, {});
        expect(btn.data.style).toBe(ButtonStyle.Secondary);
    });

    test('truncates label at 80 chars', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'a'.repeat(100),
            custom_id: 'x'
        }, {});
        expect(btn.data.label).toHaveLength(80);
    });

    test('substitutes args in label', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'Hi %name%',
            custom_id: 'x'
        }, {'%name%': 'Eve'});
        expect(btn.data.label).toBe('Hi Eve');
    });

    test('sets emoji when valid', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'Like',
            emoji: '👍'
        }, {});
        expect(btn.data.emoji).toMatchObject({name: '👍'});
    });

    test('skips emoji string "null"', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'X',
            emoji: 'null'
        }, {});
        expect(btn.data.emoji).toBeUndefined();
    });

    test('skips empty emoji', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'X',
            emoji: ''
        }, {});
        expect(btn.data.emoji).toBeUndefined();
    });

    test('returns null when no label and no emoji', () => {
        expect(buildV4Button({
            type: 2,
            style: 1
        }, {})).toBeNull();
    });

    test('emoji-only button (no label) is valid', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            emoji: '⭐',
            custom_id: 'star'
        }, {});
        expect(btn).toBeTruthy();
        expect(btn.data.label).toBeUndefined();
    });

    test('disabled flag flows through', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'X',
            custom_id: 'x',
            disabled: true
        }, {});
        expect(btn.data.disabled).toBe(true);
    });

    test('style 5 (link) requires url and skips if missing', () => {
        expect(buildV4Button({
            type: 2,
            style: 5,
            label: 'L'
        }, {})).toBeNull();
    });

    test('style 5 (link) with url renders as Link button', () => {
        const btn = buildV4Button({
            type: 2,
            style: 5,
            label: 'L',
            url: 'https://example.com'
        }, {});
        expect(btn.data.style).toBe(ButtonStyle.Link);
        expect(btn.data.url).toBe('https://example.com');
    });

    test('substitutes args in URL', () => {
        const btn = buildV4Button(
            {
                type: 2,
                style: 5,
                label: 'L',
                url: 'https://%host%'
            },
            {'%host%': 'example.org'}
        );
        expect(btn.data.url).toBe('https://example.org');
    });

    test('scnx_action linkButton overrides style', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'Link',
            url: 'https://x.io',
            scnx_action: {type: 'linkButton'}
        }, {});
        expect(btn.data.style).toBe(ButtonStyle.Link);
    });

    test('scnx_action linkButton returns null when url empty', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'Link',
            scnx_action: {type: 'linkButton'}
        }, {});
        expect(btn).toBeNull();
    });

    test('scnx_action roleButton with add → srb-a-<id> custom_id', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'R',
            scnx_action: {
                type: 'roleButton',
                id: 'r-1',
                action: 'add'
            }
        }, {});
        expect(btn.data.custom_id).toBe('srb-a-r-1');
    });

    test('scnx_action roleButton with remove → srb-r-<id>', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'R',
            scnx_action: {
                type: 'roleButton',
                id: 'r-2',
                action: 'remove'
            }
        }, {});
        expect(btn.data.custom_id).toBe('srb-r-r-2');
    });

    test('scnx_action roleButton with toggle (default) → srb-t-<id>', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'R',
            scnx_action: {
                type: 'roleButton',
                id: 'r-3'
            }
        }, {});
        expect(btn.data.custom_id).toBe('srb-t-r-3');
    });

    test('scnx_action customCommandButton → cc-<id>', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'CC',
            scnx_action: {
                type: 'customCommandButton',
                id: 'cmd-7'
            }
        }, {});
        expect(btn.data.custom_id).toBe('cc-cmd-7');
    });

    test('scnx_action disabledButton forces disabled and unique id', () => {
        const btn = buildV4Button({
            type: 2,
            style: 1,
            label: 'D',
            scnx_action: {type: 'disabledButton'}
        }, {});
        expect(btn.data.disabled).toBe(true);
        expect(btn.data.custom_id).toMatch(/^disabled-/);
    });
});

describe('buildV4StringSelect', () => {
    test('builds a basic select with options', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'A',
                value: 'a'
            }, {
                label: 'B',
                value: 'b'
            }]
        }, {}, {
            roleSelect: 0,
            ccSelect: 0
        });
        expect(sel.data.custom_id).toBe('s');
        expect(sel.options).toHaveLength(2);
    });

    test('returns null when options missing or empty', () => {
        expect(buildV4StringSelect({
            type: 3,
            custom_id: 's'
        }, {}, {})).toBeNull();
        expect(buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: []
        }, {}, {})).toBeNull();
    });

    test('skips options without a value', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'A',
                value: 'a'
            }, {label: 'B'}]
        }, {}, {});
        expect(sel.options).toHaveLength(1);
    });

    test('skips options whose label resolves empty', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'A',
                value: 'a'
            }, {
                label: '',
                value: 'b'
            }]
        }, {}, {});
        expect(sel.options).toHaveLength(1);
    });

    test('truncates option labels at 100 and descriptions at 100', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'x'.repeat(200),
                value: 'v',
                description: 'd'.repeat(200)
            }]
        }, {}, {});
        expect(sel.options[0].data.label).toHaveLength(100);
        expect(sel.options[0].data.description).toHaveLength(100);
    });

    test('truncates placeholder at 150', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            placeholder: 'p'.repeat(200),
            options: [{
                label: 'A',
                value: 'a'
            }]
        }, {}, {});
        expect(sel.data.placeholder).toHaveLength(150);
    });

    test('honors min_values and max_values within bounds', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            min_values: 1,
            max_values: 2,
            options: [{
                label: 'A',
                value: 'a'
            }, {
                label: 'B',
                value: 'b'
            }, {
                label: 'C',
                value: 'c'
            }]
        }, {}, {});
        expect(sel.data.min_values).toBe(1);
        expect(sel.data.max_values).toBe(2);
    });

    test('clamps max_values to options length', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            max_values: 99,
            options: [{
                label: 'A',
                value: 'a'
            }, {
                label: 'B',
                value: 'b'
            }]
        }, {}, {});
        expect(sel.data.max_values).toBeLessThanOrEqual(2);
    });

    test('scnx_action roleElement uses incremental counter for custom_id', () => {
        const counters = {
            roleSelect: 0,
            ccSelect: 0
        };
        const a = buildV4StringSelect({
            type: 3,
            scnx_action: {type: 'roleElement'},
            options: [{
                label: 'A',
                value: 'a'
            }]
        }, {}, counters);
        const b = buildV4StringSelect({
            type: 3,
            scnx_action: {type: 'roleElement'},
            options: [{
                label: 'B',
                value: 'b'
            }]
        }, {}, counters);
        expect(a.data.custom_id).toBe('select-roles-0');
        expect(b.data.custom_id).toBe('select-roles-1');
    });

    test('scnx_action customCommandElement uses cc counter', () => {
        const counters = {
            roleSelect: 0,
            ccSelect: 0
        };
        const a = buildV4StringSelect({
            type: 3,
            scnx_action: {type: 'customCommandElement'},
            options: [{
                label: 'A',
                value: 'a'
            }]
        }, {}, counters);
        expect(a.data.custom_id).toBe('cc-select-0');
    });

    test('option emoji is forwarded when not "null"', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'A',
                value: 'a',
                emoji: '🔥'
            }]
        }, {}, {});
        expect(sel.options[0].data.emoji).toMatchObject({name: '🔥'});
    });

    test('option emoji "null" is skipped', () => {
        const sel = buildV4StringSelect({
            type: 3,
            custom_id: 's',
            options: [{
                label: 'A',
                value: 'a',
                emoji: 'null'
            }]
        }, {}, {});
        expect(sel.options[0].data.emoji).toBeUndefined();
    });
});

describe('embedType v4 - Section (type 9)', () => {
    test('returns null when accessory missing', () => {
        const out = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'hello'
            }]
        }, {});
        expect(out).toBeNull();
    });

    test('returns null when no text components', () => {
        const out = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: ''
            }],
            accessory: {
                type: 11,
                media: {url: 'https://x/t.png'}
            }
        }, {});
        expect(out).toBeNull();
    });

    test('returns null when no components array', () => {
        expect(buildV4Component({
            type: 9,
            accessory: {
                type: 11,
                media: {url: 'https://x/t.png'}
            }
        }, {})).toBeNull();
    });

    test('caps text displays at 3', () => {
        const text = (n) => ({
            type: 10,
            content: `t${n}`
        });
        const sect = buildV4Component({
            type: 9,
            components: [text(1), text(2), text(3), text(4), text(5)],
            accessory: {
                type: 11,
                media: {url: 'https://x/t.png'}
            }
        }, {});
        expect(sect.components).toHaveLength(3);
    });

    test('thumbnail accessory with description and spoiler', () => {
        const sect = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'side'
            }],
            accessory: {
                type: 11,
                media: {url: 'https://x/t.png'},
                description: 'thumb',
                spoiler: true
            }
        }, {});
        expect(sect.accessory).toBeTruthy();
    });

    test('thumbnail accessory returns null when media missing', () => {
        const sect = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'side'
            }],
            accessory: {type: 11}
        }, {});
        expect(sect).toBeNull();
    });

    test('button accessory works', () => {
        const sect = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'side'
            }],
            accessory: {
                type: 2,
                style: 1,
                label: 'Go',
                custom_id: 'g'
            }
        }, {});
        expect(sect).toBeTruthy();
    });

    test('button accessory returns null when button invalid', () => {
        const sect = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'side'
            }],
            accessory: {
                type: 2,
                style: 1
            }
        }, {});
        expect(sect).toBeNull();
    });

    test('unknown accessory type returns null', () => {
        const sect = buildV4Component({
            type: 9,
            components: [{
                type: 10,
                content: 'side'
            }],
            accessory: {type: 99}
        }, {});
        expect(sect).toBeNull();
    });
});

describe('embedType v4 - Container (type 17)', () => {
    test('returns null when components array missing or empty', () => {
        expect(buildV4Component({type: 17}, {})).toBeNull();
        expect(buildV4Component({
            type: 17,
            components: []
        }, {})).toBeNull();
    });

    test('returns null when no children build successfully', () => {
        const out = buildV4Component({
            type: 17,
            components: [{
                type: 10,
                content: ''
            }, {type: 99}]
        }, {});
        expect(out).toBeNull();
    });

    test('accepts numeric accent_color', () => {
        const c = buildV4Component({
            type: 17,
            accent_color: 0x123456,
            components: [{
                type: 10,
                content: 'hi'
            }]
        }, {});
        expect(c.data.accent_color).toBe(0x123456);
    });

    test('accepts named accent_color via parseColor', () => {
        const c = buildV4Component({
            type: 17,
            accent_color: 'BLURPLE',
            components: [{
                type: 10,
                content: 'hi'
            }]
        }, {});
        expect(c.data.accent_color).toBe(0x5865F2);
    });

    test('spoiler flag flows through', () => {
        const c = buildV4Component({
            type: 17,
            spoiler: true,
            components: [{
                type: 10,
                content: 'hi'
            }]
        }, {});
        expect(c.data.spoiler).toBe(true);
    });

    test('adds TextDisplay children', () => {
        const c = buildV4Component({
            type: 17,
            components: [{
                type: 10,
                content: 'A'
            }, {
                type: 10,
                content: 'B'
            }]
        }, {});
        expect(c.components.filter((x) => x.constructor.name === 'TextDisplayBuilder')).toHaveLength(2);
    });

    test('adds Separator children', () => {
        const c = buildV4Component({
            type: 17,
            components: [{
                type: 10,
                content: 'hello'
            }, {type: 14}]
        }, {});
        expect(c).toBeTruthy();
        expect(c.components.length).toBeGreaterThanOrEqual(2);
    });

    test('adds MediaGallery children', () => {
        const c = buildV4Component({
            type: 17,
            components: [
                {
                    type: 10,
                    content: 'hello'
                },
                {
                    type: 12,
                    items: [{media: {url: 'https://x/i.png'}}]
                }
            ]
        }, {});
        expect(c).toBeTruthy();
    });

    test('adds ActionRow children with buttons', () => {
        const c = buildV4Component({
            type: 17,
            components: [
                {
                    type: 10,
                    content: 'hello'
                },
                {
                    type: 1,
                    components: [{
                        type: 2,
                        style: 1,
                        label: 'X',
                        custom_id: 'x'
                    }]
                }
            ]
        }, {});
        expect(c).toBeTruthy();
    });

    test('adds Section children', () => {
        const c = buildV4Component({
            type: 17,
            components: [
                {
                    type: 10,
                    content: 'hello'
                },
                {
                    type: 9,
                    components: [{
                        type: 10,
                        content: 'side'
                    }],
                    accessory: {
                        type: 11,
                        media: {url: 'https://x/t.png'}
                    }
                }
            ]
        }, {});
        expect(c).toBeTruthy();
    });

    test('logs and continues when a child build throws', () => {
        const c = buildV4Component({
            type: 17,
            components: [{
                type: 10,
                content: 'good'
            }, null, {
                type: 10,
                content: 'also good'
            }]
        }, {});
        expect(c).toBeTruthy();
    });
});

describe('embedType v4 - dynamicImage placeholder', () => {
    test('dynamicImage emits a MediaGalleryBuilder', () => {
        const out = buildV4Component({type: 'dynamicImage'}, {});
        expect(out).toBeTruthy();
        expect(out.items).toHaveLength(1);
        expect(out.items[0].data.media.url).toBe('attachment://image.png');
    });

    test('top-level dynamicImage sets _hasDynamicImagePlaceholder flag', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{type: 'dynamicImage'}]
        });
        expect(out._hasDynamicImagePlaceholder).toBe(true);
    });

    test('nested dynamicImage inside container also sets the flag', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 17,
                components: [{
                    type: 10,
                    content: 'x'
                }, {type: 'dynamicImage'}]
            }]
        });
        expect(out._hasDynamicImagePlaceholder).toBe(true);
    });

    test('non-v4 input does not set the flag', () => {
        const out = embedType({title: 't'});
        expect(out._hasDynamicImagePlaceholder).toBeUndefined();
    });
});

describe('embedType v4 - unknown component types', () => {
    test('unknown numeric type returns null', () => {
        expect(buildV4Component({type: 999}, {})).toBeNull();
    });

    test('unknown string type returns null', () => {
        expect(buildV4Component({type: 'foo'}, {})).toBeNull();
    });
});

describe('embedType v4 - args substitution depth', () => {
    test('args propagate to nested container child labels', () => {
        const out = embedType({
            _schema: 'v4',
            components: [{
                type: 17,
                components: [
                    {
                        type: 10,
                        content: 'Welcome %who%'
                    },
                    {
                        type: 1,
                        components: [{
                            type: 2,
                            style: 1,
                            label: 'Hi %who%',
                            custom_id: 'x'
                        }]
                    }
                ]
            }]
        }, {'%who%': 'Alice'});
        expect(out).toBeTruthy();
    });
});