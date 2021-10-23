/**
 * Basic functions for the economy system
 * @module economy-system
 * @author jateute
 */

/**
 * add a User to DB
 * @param {Client} client Client
 * @param {string} id Id of the user
 * @returns {promise<void>}
 */
createUser = async function (client, id) {
    const moduleConfig = client.configurations['economy-system']['config'];
    client.models['economy-system']['Balace'].create({
        id: id,
        balance: moduleConfig['startMoney']
    });
    client.logger.debug(`[economy-system] Created model for the user with the Id ${id}`);
};

/**
 * Add/ Remove xyz from balance/ set balance to
 * @param {Client} client Client
 * @param {string} id UserId of the user which is effected
 * @param {string} action The action which is should be performed (add/ remove/ set)
 * @param {number} value The value which is added/ removed to/ from the balance/ to which the balance gets set
 * @returns {Promise<void>}
 */
balanceFunction = async function (client, id, action, value) {
    const user = client.models['economy-system']['Balance'].findOne({
        where: {
            id: id
        }
    });
    if (!user) {
        createUser(client, id);
    }
    switch (action) {
        case 'add':
            newBalance = parseInt(user.balance) + parseInt(value);
            user.balance = newBalance;
            user.save();
            break;

        case 'remove':
            newBalance = parseInt(user.balance) - parseInt(value);
            user.balance = newBalance;
            user.save();
            break;

        case 'set':
            user.balace = parseInt(value);
            user.save();
            break;

        default:
            client.logger.error(`[economy-system] ${action} This action is invalid`);
            break;
    }
};

module.exports.balance = balanceFunction;
module.exports.createUser = createUser;
