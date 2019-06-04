const moment = require('moment');
const fs = require('fs');
const LOG_FORMAT = process.env.LOG_FORMAT;
const BASE_LOG_DIR = process.env.BASE_LOG_DIR;
const baseLogDir = BASE_LOG_DIR.endsWith('/') ? BASE_LOG_DIR : BASE_LOG_DIR + '/';
if(!fs.existsSync(baseLogDir)) fs.mkdirSync(baseLogDir);

const getDate = () => {
    return moment().format(LOG_FORMAT);
}

const getCurrentLogFileName = () => {
    return `${moment().format('YYYYMMDD')}.log`;
}

const log = (message, callback) => {
    let logMessage = typeof(message) === 'object' ? JSON.stringify(message) : message;
    logMessage = `${getDate()} - ${logMessage}`
    console.log(logMessage);
    logMessage = logMessage.endsWith('\n') ? logMessage : logMessage + '\n';
    const logPath = baseLogDir + getCurrentLogFileName();
    const cb = callback ? callback :  err => {
        if(!err) return;
        console.error('LogFileOutputError!');
        console.error(err);
    }
    fs.appendFile(logPath, logMessage, cb);
}

module.exports = log;
