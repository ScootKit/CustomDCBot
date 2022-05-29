const args = process.argv.slice(2);
if (!args[0] || !args[1]) {
    console.error('Wrong usage. node add-embedtype-object.js <Path to example file> <Path to config file>');
    process.exit(1);
}

const jsonfile = require('jsonfile');
const exampleFile = jsonfile.readFileSync(args[0]);
let configFile = jsonfile.readFileSync(args[1]);
if (!Array.isArray(configFile)) configFile = [];

const newObject = {};
for (const field of exampleFile.content) {
    newObject[field.field_name] = field['default-en'] || field.default;
}

configFile.push(newObject);
jsonfile.writeFileSync(args[1], configFile, {spaces: 2});
console.log('Successfully added default object to configuration-file.');