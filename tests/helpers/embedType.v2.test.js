const mainStub = require('../__stubs__/main');
const {
    embedType,
    embedTypeV2
} = require('../../src/functions/helpers');

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
}

beforeEach(resetClient);

describe('embedType v2 - dispatch', () => {
    test('default _schema (undefined) routes through v2 path', () => {
        const out = embedType({title: 'Hello'});
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.title).toBe('Hello');
    });

    test('explicit _schema "v2" routes through v2 path', () => {
        const out = embedType({
            _schema: 'v2',
            title: 'Hi'
        });
        expect(out.embeds[0].data.title).toBe('Hi');
    });
});

describe('embedType v2 - empty / minimal input', () => {
    test('completely empty object emits no embeds', () => {
        const out = embedType({});
        expect(out.embeds).toEqual([]);
    });

    test('input with only a message (content) emits no embed', () => {
        const out = embedType({message: 'just a content'});
        expect(out.embeds).toEqual([]);
        expect(out.content).toBe('just a content');
    });

    test('input with only image still produces an embed', () => {
        const out = embedType({image: 'https://x/i.png'});
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.image.url).toBe('https://x/i.png');
    });
});

describe('embedType v2 - title and description', () => {
    test('renders both title and description', () => {
        const out = embedType({
            title: 'T',
            description: 'D'
        });
        expect(out.embeds[0].data.title).toBe('T');
        expect(out.embeds[0].data.description).toBe('D');
    });

    test('truncates title over 256 chars', () => {
        const out = embedType({title: 'x'.repeat(500)});
        expect(out.embeds[0].data.title).toHaveLength(256);
        expect(out.embeds[0].data.title.endsWith('...')).toBe(true);
    });

    test('truncates description over 4096 chars', () => {
        const out = embedType({
            title: 't',
            description: 'y'.repeat(5000)
        });
        expect(out.embeds[0].data.description).toHaveLength(4096);
    });

    test('substitutes args into title and description', () => {
        const out = embedType({
            title: 'Hi %name%',
            description: 'Welcome %name%'
        }, {'%name%': 'Alice'});
        expect(out.embeds[0].data.title).toBe('Hi Alice');
        expect(out.embeds[0].data.description).toBe('Welcome Alice');
    });
});

describe('embedType v2 - color', () => {
    test('accepts named color', () => {
        const out = embedType({
            title: 't',
            color: 'RED'
        });
        expect(out.embeds[0].data.color).toBe(0xE74C3C);
    });

    test('accepts hex string with hash', () => {
        const out = embedType({
            title: 't',
            color: '#abcdef'
        });
        expect(out.embeds[0].data.color).toBe(0xabcdef);
    });

    test('accepts bare hex string', () => {
        const out = embedType({
            title: 't',
            color: 'ff00ff'
        });
        expect(out.embeds[0].data.color).toBe(0xff00ff);
    });

    test('accepts numeric color', () => {
        const out = embedType({
            title: 't',
            color: 0x123456
        });
        expect(out.embeds[0].data.color).toBe(0x123456);
    });
});

describe('embedType v2 - URL, image, thumbnail', () => {
    test('sets URL when provided', () => {
        const out = embedType({
            title: 't',
            url: 'https://example.com'
        });
        expect(out.embeds[0].data.url).toBe('https://example.com');
    });

    test('skips URL when whitespace-only', () => {
        const out = embedType({
            title: 't',
            url: '   '
        });
        expect(out.embeds[0].data.url).toBeUndefined();
    });

    test('sets image when provided', () => {
        const out = embedType({
            title: 't',
            image: 'https://x/i.png'
        });
        expect(out.embeds[0].data.image.url).toBe('https://x/i.png');
    });

    test('sets thumbnail when provided', () => {
        const out = embedType({
            title: 't',
            thumbnail: 'https://x/t.png'
        });
        expect(out.embeds[0].data.thumbnail.url).toBe('https://x/t.png');
    });

    test('substitutes args in image/thumbnail/url', () => {
        const out = embedType(
            {
                title: 't',
                url: 'https://%host%/x',
                image: 'https://%host%/i',
                thumbnail: 'https://%host%/t'
            },
            {'%host%': 'example.com'}
        );
        expect(out.embeds[0].data.url).toBe('https://example.com/x');
        expect(out.embeds[0].data.image.url).toBe('https://example.com/i');
        expect(out.embeds[0].data.thumbnail.url).toBe('https://example.com/t');
    });
});

describe('embedType v2 - author', () => {
    test('sets author name when present', () => {
        const out = embedType({
            title: 't',
            author: {name: 'Alice'}
        });
        expect(out.embeds[0].data.author.name).toBe('Alice');
    });

    test('sets author iconURL from img field', () => {
        const out = embedType({
            title: 't',
            author: {
                name: 'Alice',
                img: 'https://x/a.png'
            }
        });
        expect(out.embeds[0].data.author.icon_url).toBe('https://x/a.png');
    });

    test('skips author iconURL when img is empty', () => {
        const out = embedType({
            title: 't',
            author: {
                name: 'Alice',
                img: ''
            }
        });
        expect(out.embeds[0].data.author.icon_url).toBeNull();
    });

    test('truncates author name over 256 chars', () => {
        const out = embedType({
            title: 't',
            author: {name: 'a'.repeat(500)}
        });
        expect(out.embeds[0].data.author.name).toHaveLength(256);
    });

    test('skips author block when name missing', () => {
        const out = embedType({
            title: 't',
            author: {img: 'https://x/a.png'}
        });
        expect(out.embeds[0].data.author).toBeUndefined();
    });

    test('handles non-object author gracefully', () => {
        const out = embedType({
            title: 't',
            author: 'not an object'
        });
        expect(out.embeds[0].data.author).toBeUndefined();
    });
});

describe('embedType v2 - fields', () => {
    test('emits a single field', () => {
        const out = embedType({
            title: 't',
            fields: [{
                name: 'F',
                value: 'V',
                inline: true
            }]
        });
        expect(out.embeds[0].data.fields).toEqual([{
            name: 'F',
            value: 'V',
            inline: true
        }]);
    });

    test('emits multiple fields preserving order', () => {
        const out = embedType({
            title: 't',
            fields: [
                {
                    name: 'A',
                    value: '1'
                },
                {
                    name: 'B',
                    value: '2'
                },
                {
                    name: 'C',
                    value: '3'
                }
            ]
        });
        expect(out.embeds[0].data.fields.map((f) => f.name)).toEqual(['A', 'B', 'C']);
    });

    test('truncates field name to 256 and value to 1024', () => {
        const out = embedType({
            title: 't',
            fields: [{
                name: 'a'.repeat(500),
                value: 'b'.repeat(2000)
            }]
        });
        expect(out.embeds[0].data.fields[0].name).toHaveLength(256);
        expect(out.embeds[0].data.fields[0].value).toHaveLength(1024);
    });

    test('substitutes args in field name and value', () => {
        const out = embedType({
            title: 't',
            fields: [{
                name: 'Name: %x%',
                value: 'Value: %x%'
            }]
        }, {'%x%': '42'});
        expect(out.embeds[0].data.fields[0]).toMatchObject({
            name: 'Name: 42',
            value: 'Value: 42'
        });
    });

    test('non-object fields value is ignored without throwing', () => {
        expect(() => embedType({
            title: 't',
            fields: 'not an array'
        })).not.toThrow();
    });
});

describe('embedType v2 - footer', () => {
    test('uses input footer text', () => {
        const out = embedType({
            title: 't',
            footer: 'custom footer'
        });
        expect(out.embeds[0].data.footer.text).toBe('custom footer');
    });

    test('falls back to client.strings.footer when no input footer', () => {
        mainStub.client.strings.footer = 'default-footer';
        const out = embedType({title: 't'});
        expect(out.embeds[0].data.footer.text).toBe('default-footer');
    });

    test('uses footerImgUrl from input', () => {
        const out = embedType({
            title: 't',
            footer: 'x',
            footerImgUrl: 'https://x/icon.png'
        });
        expect(out.embeds[0].data.footer.icon_url).toBe('https://x/icon.png');
    });

    test('falls back to client.strings.footerImgUrl', () => {
        mainStub.client.strings.footerImgUrl = 'https://x/default-icon.png';
        const out = embedType({
            title: 't',
            footer: 'x'
        });
        expect(out.embeds[0].data.footer.icon_url).toBe('https://x/default-icon.png');
    });

    test('skips footer when both input and client.strings.footer are empty', () => {
        mainStub.client.strings.footer = '';
        const out = embedType({title: 't'});
        expect(out.embeds[0].data.footer).toBeUndefined();
    });

    test('substitutes args in footer text', () => {
        const out = embedType({
            title: 't',
            footer: 'by %name%'
        }, {'%name%': 'Bob'});
        expect(out.embeds[0].data.footer.text).toBe('by Bob');
    });
});

describe('embedType v2 - timestamp', () => {
    test('sets a timestamp by default', () => {
        const out = embedType({title: 't'});
        expect(out.embeds[0].data.timestamp).toBeDefined();
        expect(typeof out.embeds[0].data.timestamp).toBe('string');
    });

    test('omits timestamp when disableFooterTimestamp set', () => {
        mainStub.client.strings.disableFooterTimestamp = true;
        const out = embedType({title: 't'});
        expect(out.embeds[0].data.timestamp).toBeUndefined();
    });

    test('uses explicit embedTimestamp Date override', () => {
        const ts = new Date('2024-06-01T12:00:00Z');
        const out = embedType({
            title: 't',
            embedTimestamp: ts
        });
        expect(new Date(out.embeds[0].data.timestamp).getTime()).toBe(ts.getTime());
    });
});

describe('embedType v2 - message content', () => {
    test('sets content from input.message', () => {
        const out = embedType({
            title: 't',
            message: 'side message'
        });
        expect(out.content).toBe('side message');
    });

    test('content is null when message missing', () => {
        const out = embedType({title: 't'});
        expect(out.content).toBeNull();
    });

    test('substitutes args in message', () => {
        const out = embedType({
            title: 't',
            message: 'hi %who%'
        }, {'%who%': 'world'});
        expect(out.content).toBe('hi world');
    });
});

describe('embedTypeV2 (async wrapper)', () => {
    test('passes through identical to embedType for non-dynamic input', async () => {
        const sync = embedType({
            title: 'sync',
            description: 'd'
        });
        const async_ = await embedTypeV2({
            title: 'sync',
            description: 'd'
        }, {}, {});
        expect(async_.embeds[0].data.title).toBe(sync.embeds[0].data.title);
    });
});