/**
 * @author Akama Aka <akama.aka@akami-solutions.cc>
 * @param senderIwan : string
 * @param receiverIwan : string
 * @param amount : decimal - 13.37
 * @param description : string - My first product
 * @param key : number - 123 674
 * @param username : string - My Username
 * @returns {{success: boolean, message: {id: string, sender: string, receiver: string, amount: decimal | string | float, description: string, created: string}}}
 * @desc Create a Payment to the SIWFT API
 * @see https://docs.siwft.org/transactions.html
 * @tutorial https://github.com/akami-solutions/siwft_bot-shop_discord
 */
let host = 'https://api.siwft.org/v0/';
const createPayment = async (senderIwan, receiverIwan, amount, description = null, key, username) => {
    const apiUri = `${host}/transaction/${senderIwan}/${receiverIwan}`;
    const body = {
        "amount": amount,
        "description": description
    }
    const headers = {
        "Content-Type": "application/json",
        "Authorization": key,
        "X-Auth-Username": username
    }
    // Send the request and check if the responsed JSON includes success: true
    // If it does, return true, otherwise return false
    const response = await fetch(apiUri, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
    });
    const responseJson = await response.json();
    return {success: responseJson.success, id: responseJson["message"]["id"]};
}

/**
 * @author Akama Aka <akama.aka@akami-solutions.cc>
 * @desc Get the wallets public data from the SIWFT API
 * @param iwan : string - The iwan of the wallet
 * @return {Promise<{data, success: *}>}
 */
const getWalletData = async (iwan) => {
    const apiUri = `${host}/wallet/${iwan}`;
    const headers = {
        "Content-Type": "application/json"
    }
    const response = await fetch(apiUri, {
        method: "GET",
        headers: headers
    });
    return {success: response.success, data: response["message"]};
}

module.exports = [
    createPayment,
    getWalletData
]