module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    rootDir: '.',
    // On low-core CI runners Jest uses few workers, so one worker can run many
    // suites back-to-back and accumulate heap until it OOMs. Recycle a worker
    // once it grows past this limit to keep memory bounded.
    workerIdleMemoryLimit: '768MB',
    setupFiles: ['<rootDir>/src/discordjs-fix.js'],
    // Coverage targets the real runtime logic under src/. discordjs-fix.js is a load-time
    // monkey-patch shim for discord.js and is excluded.
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/discordjs-fix.js'
    ],
    moduleNameMapper: {
        '^(?:\\.{1,2}/)+main$': '<rootDir>/tests/__stubs__/main.js',
        '(?:^|/)src/functions/localize$': '<rootDir>/tests/__stubs__/localize.js',
        '^\\./localize$': '<rootDir>/tests/__stubs__/localize.js'
    }
};
