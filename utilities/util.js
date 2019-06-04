const moment = require('moment');
const fs = require('fs');

class Util {
    async sleepSec(seconds) {
        let milliSeconds = 1000 * seconds;
        return new Promise(resolve => setTimeout(resolve, milliSeconds));
    }

    logging(name, message) {
        console.log(message);
        let logDir = 'logs/';
        if(!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        logDir += `${name}/`;
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        let logfileName = `${moment(Date.now()).format('YYYYMMDD')}.log`;
        if (!message.endsWith('\n')) message += '\n';
        fs.appendFile(`${logDir}${logfileName}`, message, (err) => {
            if (err) console.log(`LogFileOutputErr: ${err}`);
        });
    }
}

module.exports.Util = Util;