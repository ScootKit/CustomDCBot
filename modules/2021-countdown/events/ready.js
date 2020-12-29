const {confDir} = require('../../../main');
const countDownDate = new Date("Jan 1, 2021 00:00:01").getTime();
exports.run = async (client) => {
    const moduleConf = require(`${confDir}/2021-countdown/config.json`);
    const channel = client.guilds.cache.get(client.guildID).channels.cache.get(moduleConf['channel_id']);
    if (!channel) {
        console.error(`Channel with ID ${moduleConf['channel_id']} not found.`)
        process.exit(1);
    }
    await channel.setName('Loading...')
    await updateChannel()
    const intv = setInterval(async () => {
       await updateChannel()
    }, moduleConf['update_interval'] >= 30 ? moduleConf['update_interval'] * 1000: 30 * 1000)
    async function updateChannel() {
        const distance = countDownDate - new Date().getTime();
        if (distance < 0) {
            await channel.setName(moduleConf['2021_text']).catch(console.error)
            clearInterval(intv);
            return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        await channel.setName(moduleConf['format'].split('%d%').join(days).split('%h%').join(hours).split('%m%').join(minutes).split('%s%').join(seconds)).catch(console.error)
    }
}

