const mainStub = require('../__stubs__/main');
const {embedType} = require('../../src/functions/helpers');

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

describe('embedType - string input', () => {
    test('wraps a plain string into content', () => {
        const out = embedType('hello world');
        expect(out.content).toBe('hello world');
    });

    test('emits no embeds/components for string input', () => {
        const out = embedType('hi');
        expect(out.embeds).toBeUndefined();
        expect(out.components).toBeUndefined();
    });

    test('default allowedMentions parses users and roles only', () => {
        const out = embedType('ping');
        expect(out.allowedMentions).toEqual({parse: ['users', 'roles']});
    });

    test('adds everyone to allowedMentions when disableEveryoneProtection is set', () => {
        mainStub.client.config.disableEveryoneProtection = true;
        const out = embedType('ping');
        expect(out.allowedMentions.parse).toEqual(['users', 'roles', 'everyone']);
    });

    test('preserves explicit allowedMentions from optionsToKeep', () => {
        const out = embedType('hi', {}, {allowedMentions: {parse: ['users']}});
        expect(out.allowedMentions).toEqual({parse: ['users']});
    });

    test('substitutes %placeholder% style args', () => {
        const out = embedType('hi %who%', {'%who%': 'Alice'});
        expect(out.content).toBe('hi Alice');
    });

    test('substitutes multiple placeholders', () => {
        const out = embedType('%a%-%b%-%a%', {
            '%a%': 'X',
            '%b%': 'Y'
        });
        expect(out.content).toBe('X-Y-X');
    });

    test('handles empty string', () => {
        const out = embedType('');
        expect(out.content).toBe('');
    });

    test('handles strings containing already-substituted-looking text', () => {
        const out = embedType('the value %unused% stays', {'%name%': 'Bob'});
        expect(out.content).toBe('the value %unused% stays');
    });

    test('returns the same optionsToKeep object (mutates in place)', () => {
        const otk = {someField: 'kept'};
        const out = embedType('hi', {}, otk);
        expect(out).toBe(otk);
        expect(out.someField).toBe('kept');
        expect(out.content).toBe('hi');
    });

    test('global args from client.user merge into substitution', () => {
        mainStub.client.user = {
            id: 'b-1',
            tag: 'Bot#0000',
            username: 'b',
            displayName: 'Bot',
            displayAvatarURL: () => 'https://x/a.png',
            toString: () => '<@b-1>'
        };
        const out = embedType('Hi from %botName%');
        expect(out.content).toBe('Hi from Bot');
    });
});