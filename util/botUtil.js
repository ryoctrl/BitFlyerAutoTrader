const moment = require('moment');
const waitBFMaintenance = () => {
    const now = moment();
    const beginMaintenance = moment().hour(3).minute(45);
    const endMaintenance = moment().hour(4).minute(15);
    const canEntry = now >= beginMaintenance && now <= endMaintenance;
    return {
        canEntry: canEntry,
        message: canEntry ? '' : 'メンテナンス前後のためエントリーを見送ります.'
    }
};

module.exports = {
    canEntry: () => {
        return waitBFMaintenance();
    }
}
