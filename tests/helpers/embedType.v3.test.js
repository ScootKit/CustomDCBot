const mainStub = require('../__stubs__/main');
const {embedType} = require('../../src/functions/helpers');

function resetClient() {
    mainStub.client.config = {
        disableEveryoneProtection: false,
        timezone: 'UTC'
    };
    mainStub.client.strings = {
        footer: 'default-footer',
        footerImgUrl: '',
        disableFooterTimestamp: false
    };
    mainStub.client.scnxSetup = false;
    mainStub.client.user = null;
    mainStub.client.guild = null;
}

beforeEach(resetClient);

describe('embedType v3 - dispatch', () => {
    test('input with _schema "v3" routes through legacy embeds[] path', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{title: 'v3'}]
        });
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.title).toBe('v3');
    });

    test('any non-v2/non-v4 _schema falls through legacy path', () => {
        const out = embedType({
            _schema: 'legacy',
            embeds: [{title: 'L'}]
        });
        expect(out.embeds[0].data.title).toBe('L');
    });
});

describe('embedType v3 - embeds array', () => {
    test('emits no embeds when embeds[] is empty', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: []
        });
        expect(out.embeds).toEqual([]);
    });

    test('emits no embeds when embeds is absent', () => {
        const out = embedType({_schema: 'v3'});
        expect(out.embeds).toEqual([]);
    });

    test('emits multiple embeds preserving order', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{title: 'A'}, {title: 'B'}, {title: 'C'}]
        });
        expect(out.embeds.map((e) => e.data.title)).toEqual(['A', 'B', 'C']);
    });

    test('handles 10 embeds (V3 spec max)', () => {
        const embeds = Array.from({length: 10}, (_, i) => ({title: `E${i}`}));
        const out = embedType({
            _schema: 'v3',
            embeds
        });
        expect(out.embeds).toHaveLength(10);
    });
});

describe('embedType v3 - embed fields', () => {
    test('renders title and description', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 'T',
                description: 'D'
            }]
        });
        expect(out.embeds[0].data.title).toBe('T');
        expect(out.embeds[0].data.description).toBe('D');
    });

    test('truncates title at 256 chars', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{title: 'x'.repeat(500)}]
        });
        expect(out.embeds[0].data.title).toHaveLength(256);
    });

    test('truncates description at 4096 chars', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{description: 'y'.repeat(5000)}]
        });
        expect(out.embeds[0].data.description).toHaveLength(4096);
    });

    test('renders color from all formats', () => {
        const named = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                color: 'BLURPLE'
            }]
        });
        expect(named.embeds[0].data.color).toBe(0x5865F2);
        const hex = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                color: '#ffaa00'
            }]
        });
        expect(hex.embeds[0].data.color).toBe(0xffaa00);
        const num = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                color: 0x336699
            }]
        });
        expect(num.embeds[0].data.color).toBe(0x336699);
    });

    test('renders thumbnailURL', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                thumbnailURL: 'https://x/t.png'
            }]
        });
        expect(out.embeds[0].data.thumbnail.url).toBe('https://x/t.png');
    });

    test('renders imageURL', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                imageURL: 'https://x/i.png'
            }]
        });
        expect(out.embeds[0].data.image.url).toBe('https://x/i.png');
    });

    test('substitutes args in thumbnailURL and imageURL', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: [{
                    title: 't',
                    thumbnailURL: 'https://%h%/t',
                    imageURL: 'https://%h%/i'
                }]
            },
            {'%h%': 'example.com'}
        );
        expect(out.embeds[0].data.thumbnail.url).toBe('https://example.com/t');
        expect(out.embeds[0].data.image.url).toBe('https://example.com/i');
    });

    test('skips thumbnail/image when value is empty or whitespace', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                thumbnailURL: '   ',
                imageURL: ''
            }]
        });
        expect(out.embeds[0].data.thumbnail).toBeNull();
        expect(out.embeds[0].data.image).toBeNull();
    });
});

describe('embedType v3 - footer', () => {
    test('renders footer text and icon', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                footer: {
                    text: 'F',
                    iconURL: 'https://x/i.png'
                }
            }]
        });
        expect(out.embeds[0].data.footer.text).toBe('F');
        expect(out.embeds[0].data.footer.icon_url).toBe('https://x/i.png');
    });

    test('falls back to client.strings.footer when text empty', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                footer: {text: ''}
            }]
        });
        expect(out.embeds[0].data.footer.text).toBe('default-footer');
    });

    test('disabled footer is omitted entirely', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                footer: {
                    disabled: true,
                    text: 'ignored'
                }
            }]
        });
        expect(out.embeds[0].data.footer).toBeNull();
    });

    test('disabled footer also disables timestamp', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                footer: {disabled: true}
            }]
        });
        expect(out.embeds[0].data.timestamp).toBeNull();
    });

    test('hideTime suppresses timestamp but keeps footer', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                footer: {
                    text: 'F',
                    hideTime: true
                }
            }]
        });
        expect(out.embeds[0].data.footer.text).toBe('F');
        expect(out.embeds[0].data.timestamp).toBeNull();
    });

    test('substitutes args in footer text', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: [{
                    title: 't',
                    footer: {text: 'by %name%'}
                }]
            },
            {'%name%': 'Carol'}
        );
        expect(out.embeds[0].data.footer.text).toBe('by Carol');
    });
});

describe('embedType v3 - author', () => {
    test('renders full author with name, imageURL, url', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                author: {
                    name: 'Alice',
                    imageURL: 'https://x/a.png',
                    url: 'https://example.com/u'
                }
            }]
        });
        expect(out.embeds[0].data.author.name).toBe('Alice');
        expect(out.embeds[0].data.author.icon_url).toBe('https://x/a.png');
        expect(out.embeds[0].data.author.url).toBe('https://example.com/u');
    });

    test('omits author when name is missing', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                author: {imageURL: 'https://x/a.png'}
            }]
        });
        expect(out.embeds[0].data.author).toBeNull();
    });

    test('skips iconURL when empty or whitespace', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                author: {
                    name: 'A',
                    imageURL: ' '
                }
            }]
        });
        expect(out.embeds[0].data.author.icon_url).toBeNull();
    });

    test('truncates name at 256 chars', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                author: {name: 'x'.repeat(500)}
            }]
        });
        expect(out.embeds[0].data.author.name).toHaveLength(256);
    });

    test('substitutes args in author name', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: [{
                    title: 't',
                    author: {name: 'Hello %who%'}
                }]
            },
            {'%who%': 'World'}
        );
        expect(out.embeds[0].data.author.name).toBe('Hello World');
    });
});

describe('embedType v3 - embed fields', () => {
    test('emits single field with default inline false', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                fields: [{
                    name: 'F',
                    value: 'V'
                }]
            }]
        });
        expect(out.embeds[0].data.fields).toEqual([{
            name: 'F',
            value: 'V'
        }]);
    });

    test('emits inline field correctly', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                fields: [{
                    name: 'F',
                    value: 'V',
                    inline: true
                }]
            }]
        });
        expect(out.embeds[0].data.fields[0].inline).toBe(true);
    });

    test('uses zero-width space for empty field name/value', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                fields: [{
                    name: '',
                    value: ''
                }]
            }]
        });
        expect(out.embeds[0].data.fields[0].name).toBe('​');
        expect(out.embeds[0].data.fields[0].value).toBe('​');
    });

    test('truncates field name at 256 and value at 1024', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                fields: [{
                    name: 'a'.repeat(500),
                    value: 'b'.repeat(2000)
                }]
            }]
        });
        expect(out.embeds[0].data.fields[0].name).toHaveLength(256);
        expect(out.embeds[0].data.fields[0].value).toHaveLength(1024);
    });

    test('renders multiple fields preserving order', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{
                title: 't',
                fields: [{
                    name: 'a',
                    value: '1'
                }, {
                    name: 'b',
                    value: '2'
                }, {
                    name: 'c',
                    value: '3'
                }]
            }]
        });
        expect(out.embeds[0].data.fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
    });
});

describe('embedType v3 - attachmentURLs', () => {
    test('appends attachmentURLs as files', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [],
            attachmentURLs: ['https://x/a.png', 'https://x/b.png']
        });
        expect(out.files).toHaveLength(2);
        expect(out.files[0]).toEqual({attachment: 'https://x/a.png'});
        expect(out.files[1]).toEqual({attachment: 'https://x/b.png'});
    });

    test('filters out empty and whitespace-only URLs', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [],
            attachmentURLs: ['', '   ', 'https://x/c.png', null]
        });
        expect(out.files).toHaveLength(1);
        expect(out.files[0].attachment).toBe('https://x/c.png');
    });

    test('preserves pre-existing optionsToKeep.files', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: [],
                attachmentURLs: ['https://x/new.png']
            },
            {},
            {files: [{attachment: 'https://x/existing.png'}]}
        );
        expect(out.files).toHaveLength(2);
        expect(out.files[0].attachment).toBe('https://x/existing.png');
        expect(out.files[1].attachment).toBe('https://x/new.png');
    });

    test('treats missing attachmentURLs as empty', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: []
        });
        expect(out.files).toEqual([]);
    });
});

describe('embedType v3 - content', () => {
    test('sets content from input.content field', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [],
            content: 'top-level content'
        });
        expect(out.content).toBe('top-level content');
    });

    test('content with args is substituted', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [],
            content: 'hello %who%'
        }, {'%who%': 'Dave'});
        expect(out.content).toBe('hello Dave');
    });

    test('returns null content when missing and no message', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: []
        });
        expect(out.content).toBeNull();
    });

    test('preserves existing optionsToKeep.content over input.content', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: [],
                content: 'from input'
            },
            {},
            {content: 'from optionsToKeep'}
        );
        expect(out.content).toBe('from optionsToKeep');
    });
});

describe('embedType v3 - timestamp', () => {
    test('sets a timestamp by default', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: [{title: 't'}]
        });
        expect(out.embeds[0].data.timestamp).toBeDefined();
    });

    test('global disableFooterTimestamp suppresses timestamp', () => {
        mainStub.client.strings.disableFooterTimestamp = true;
        const out = embedType({
            _schema: 'v3',
            embeds: [{title: 't'}]
        });
        expect(out.embeds[0].data.timestamp).toBeNull();
    });
});

describe('embedType v3 - allowedMentions', () => {
    test('default allowedMentions includes users and roles', () => {
        const out = embedType({
            _schema: 'v3',
            embeds: []
        });
        expect(out.allowedMentions.parse).toEqual(['users', 'roles']);
    });

    test('preserves optionsToKeep allowedMentions', () => {
        const out = embedType(
            {
                _schema: 'v3',
                embeds: []
            },
            {},
            {allowedMentions: {parse: []}}
        );
        expect(out.allowedMentions).toEqual({parse: []});
    });
});