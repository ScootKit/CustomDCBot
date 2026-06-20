/*
 * Tests for the counter number parser (exported as countingGameParseContent).
 *
 * Covers: plain integers, the null result for non-numeric input and for "0"
 * (since the parser treats a falsy parseInt as "not a number"), leading-number
 * text, and stripping of stray characters when allowCharactersInMessage is on.
 * (The allowMaths path relies on a dynamic ESM import of `fparser` that the
 * Jest CJS runtime cannot satisfy, so it is intentionally not exercised here.)
 */

const {countingGameParseContent} = require('../../modules/counter/events/messageCreate');

function makeClient({
                        allowCharactersInMessage = false,
                        allowMaths = false
                    } = {}) {
    return {
        configurations: {
            counter: {
                config: {
                    allowCharactersInMessage,
                    allowMaths
                }
            }
        }
    };
}

describe('counter parseMessageNumber', () => {
    test('parses a plain integer', async () => {
        expect(await countingGameParseContent('42', makeClient())).toBe(42);
    });

    test('returns null for non-numeric content', async () => {
        expect(await countingGameParseContent('hello', makeClient())).toBeNull();
    });

    test('returns null for "0" (falsy parseInt is treated as not-a-number)', async () => {
        expect(await countingGameParseContent('0', makeClient())).toBeNull();
    });

    test('leading-number text still parses without the strip option', async () => {
        // parseInt('7 apples') === 7
        expect(await countingGameParseContent('7 apples', makeClient())).toBe(7);
    });

    test('strips surrounding letters when allowCharactersInMessage is on', async () => {
        expect(await countingGameParseContent('the answer is 15!', makeClient({allowCharactersInMessage: true}))).toBe(15);
    });

    test('keeps digits adjacent to stripped letters (no math) producing a joined number', async () => {
        // Without allowMaths the stripped string '1and2' -> '12' is parsed as 12.
        expect(await countingGameParseContent('1 and 2', makeClient({allowCharactersInMessage: true}))).toBe(12);
    });
});