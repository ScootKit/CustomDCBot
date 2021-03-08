const {embedType} = require('../../../src/functions/helpers');
const {generateSuggestionEmbed} = require('../suggestion');
const {confDir} = require('./../../../main');

module.exports.run = async function (client, msg, args) {
    const moduleConfig = require(`${confDir}/suggestions/config.json`);
    let suggestionElement;
    switch (args[0]) {
        case 'create':
            await args.shift();
            let suggestion = '';
            args.forEach((arg) => suggestion = suggestion + arg + ' ');
            suggestion = suggestion.slice(0, -1);
            const channel = await client.channels.fetch(moduleConfig.suggestionChannel);
            let suggestionMsg = await channel.send('Just a sec...');
            suggestionElement = await client.models['suggestions']['Suggestion'].create({
                suggestion: suggestion,
                messageID: suggestionMsg.id,
                suggesterID: msg.author.id,
                comments: []
            });
            await generateSuggestionEmbed(client, suggestionElement);
            await msg.reply(embedType(moduleConfig.successfullySubmitted, {'%id%': suggestionElement.id}));
            break;
        case 'comment':
            if (!moduleConfig.allowUserComment && !msg.member.roles.cache.find(r => moduleConfig['adminRoles'].includes(r.id))) return msg.channel.send(embedType(client.strings.not_enough_permissions));
            suggestionElement = await client.models['suggestions']['Suggestion'].findOne({
                where: {
                    id: args[1]
                }
            });
            if (!suggestionElement) return msg.reply('Suggestion not found');
            let comment = '';
            await args.shift();
            await args.shift();
            args.forEach((arg) => comment = comment + arg + ' ');
            comment = comment.slice(0, -1);
            suggestionElement.comments.push({
                comment: comment,
                userID: msg.author.id
            });
            const realarray = suggestionElement.comments;
            suggestionElement.comments = null;
            suggestionElement.comments = realarray; // Thanks sequelize wtf
            await suggestionElement.save();
            await generateSuggestionEmbed(client, suggestionElement);
            await msg.channel.send(moduleConfig.successfullyComment);
            break;
        case 'approve':
        case 'deny':
            if (!msg.member.roles.cache.find(r => moduleConfig['adminRoles'].includes(r.id))) return msg.channel.send(embedType(client.strings.not_enough_permissions));
            suggestionElement = await client.models['suggestions']['Suggestion'].findOne({
                where: {
                    id: args[1]
                }
            });
            if (!suggestionElement) return msg.reply('Suggestion not found');
            let reason = '';
            let type = args[0];
            await args.shift();
            await args.shift();
            args.forEach((arg) => reason = reason + arg + ' ');
            reason = reason.slice(0, -1);
            suggestionElement.adminAnswer = {
                action: type,
                reason: reason,
                userID: msg.author.id
            };
            await suggestionElement.save();
            await generateSuggestionEmbed(client, suggestionElement);
            await msg.channel.send('Done :smile:');
            break;
        default:
            msg.channel.send(`Wrong usage. You can choose between these different usages:\n\`${client.config.prefix}suggestion create <Suggestion>\` - Creates a suggestion\n\`${client.config.prefix}suggestion comment <SuggestionID> <Comment>\` - Comments on a suggestion\n\n**Commands for Admins**\n\`${client.config.prefix}suggestion accept <SuggestionID> <Reason>\` - Approves suggestion\n\`${client.config.prefix}suggestion deny <SuggestionID> <Reason>\` - Denys a suggestion`);
    }
};

module.exports.help = {
    'name': 'suggestion',
    'description': 'Creates a suggestions / Comments on a suggestion / Anwser to a suggestion',
    'module': 'suggestions',
    'aliases': ['suggest', 'suggestion', 's']
};
module.exports.config = {
    'restricted': false
};