const {localize} = require('../../../src/functions/localize');
const {randomString, postToSCNetworkPaste, formatDiscordUserName} = require('../../../src/functions/helpers');

module.exports.subcommands = {
    'create-code': function (interaction) {
        interaction.client.models['hunt-the-code']['Code'].create({
            code: (interaction.options.getString('code') || (randomString(3) + '-' + randomString(3) + '-' + randomString(3))).toUpperCase(),
            displayName: interaction.options.getString('display-name')
        }).then((codeObject) => {
            interaction.reply({
                ephemeral: true,
                content: '✅ ' + localize('hunt-the-code', 'code-created', {
                    displayName: interaction.options.getString('display-name'),
                    code: codeObject.code
                })
            });
        }).catch(() => {
            interaction.reply({
                ephemeral: true,
                content: '⚠ ' + localize('hunt-the-code', 'error-creating-code', {displayName: interaction.options.getString('display-name')})
            });
        });
    },
    'end': async function (interaction) {
        await interaction.deferReply({ephemeral: true});
        const url = await generateReport(interaction.client);
        await interaction.client.models['hunt-the-code']['Code'].destroy({
            truncate: true
        });
        await interaction.client.models['hunt-the-code']['User'].destroy({
            truncate: true
        });
        await interaction.editReply({
            content: '✅ ' + localize('hunt-the-code', 'successful-reset', {url})
        });
    },
    'report': async function (interaction) {
        await interaction.deferReply({ephemeral: true});
        const url = await generateReport(interaction.client);
        await interaction.editReply({
            content: localize('hunt-the-code', 'report', {url})
        });
    }
};

/**
 * Generate a report of the current Code-Hunt-Session
 * @param {Client} client Client
 * @returns {Promise<string>} URL to Report
 */
async function generateReport(client) {
    let reportString = `# ${localize('hunt-the-code', 'report-header', {s: client.guild.name})}\n`;
    const codes = await client.models['hunt-the-code']['Code'].findAll({
        order: [
            ['foundCount', 'DESC']
        ]
    });
    const users = await client.models['hunt-the-code']['User'].findAll({
        order: [
            ['foundCount', 'DESC']
        ]
    });
    reportString = reportString + `\n## ${localize('hunt-the-code', 'user-header')}\n| Rank | Tag | ID | Amount found | Codes |\n| --- | --- | --- | --- | --- |\n`;
    for (const i in users) {
        const user = users[i];
        const u = await client.users.fetch(user.id);
        reportString = reportString + `| ${parseInt(i) + 1}. | ${formatDiscordUserName(u)} | ${u.id} | ${user.foundCount} | ${user.foundCodes.join(', ')} |\n`;
    }
    reportString = reportString + `\n## ${localize('hunt-the-code', 'code-header')}\n| Rank | Code | Display-Name | Times found |\n| --- | --- | --- | --- |\n`;
    for (const i in codes) {
        const code = codes[i];
        reportString = reportString + `| ${parseInt(i) + 1}. | ${code.code} | ${code.displayName} | ${code.foundCount} |\n`;
    }
    reportString = reportString + `\n<br><br><br><hr>Generated at ${new Date().toLocaleString(client.locale)}.`;
    return await postToSCNetworkPaste(reportString, {
        expire: '1month',
        burnafterreading: 0,
        opendiscussion: 1,
        textformat: 'markdown',
        output: 'text',
        compression: 'zlib'
    });
}

module.exports.config = {
    name: 'hunt-the-code-admin',
    description: localize('hunt-the-code', 'admin-command-description'),
    defaultPermission: false,
    options: [
        {
            type: 'SUB_COMMAND',
            name: 'create-code',
            description: localize('hunt-the-code', 'create-code-description'),
            options: [
                {
                    type: 'STRING',
                    name: 'display-name',
                    required: true,
                    description: localize('hunt-the-code', 'display-name-description')
                },
                {
                    type: 'STRING',
                    name: 'code',
                    required: false,
                    description: localize('hunt-the-code', 'code-description')
                }
            ]
        },
        {
            type: 'SUB_COMMAND',
            name: 'end',
            description: localize('hunt-the-code', 'end-description')
        },
        {
            type: 'SUB_COMMAND',
            name: 'report',
            description: localize('hunt-the-code', 'report-description')
        }
    ]
};