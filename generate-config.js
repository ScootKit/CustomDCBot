const exampleFile = require('./config-generator/config.json');
const config = {};
const jsonfile = require('jsonfile');
let confDir = `${__dirname}/config`;
const args = process.argv.slice(2);
if (args[0] === '--help' || args[0] === '-h') {
    console.log('node generate-config.js <configDir>');
    process.exit();
}
if (args[0]) {
    confDir = args[0];
}
try {
    require(`${confDir}/config.json`);
    console.error('Seems like you already have an config file! You can start the bot now with "npm start"!');
    process.exit(1);
} catch (e) {
    console.log('[INFO] Starting generation...');
    exampleFile.content.forEach(async field => {
        if (!field.field_name) return;
        config[field.field_name] = field.default;
    });

    jsonfile.writeFile(`${confDir}/config.json`, config, {spaces: 2}, (err => {
        if (err) console.error(`[ERROR] An error occurred while saving: ${err}`);
        else console.log('[DONE]: Config was saved successfully successfully. Please edit the config.json file inside your config dictionary and start the bot then with "npm start". Have a great day <3');
    }));
}
