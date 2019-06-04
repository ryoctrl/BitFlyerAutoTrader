const Trader = require('./Trader');
const logger = require('../utils/logger');

const STATES = {
    INIT: 'INIT',
    ERROR_DEAL: 'ERROR_DEAL',
    ERROR_SETTLE: 'ERROR_SETTLE',
    FINISHED: 'FINISHED'
};

class Deal {
    constructor(type, lot) {
        this.trader = Trader.trader;
        this.orderType = type;
        this.settleType = type === 'BUY' ? 'SELL' : 'BUY';
        this.lot = lot;
        this.sell = -1;
        this.buy = -1;
        this.result = 0;
        this.state = STATES.INIT;
        this.message = '';
    }

    async _order(type) {
        const trader = this.trader;
        const order = await this.trader.order(type);
        return JSON.parse(order);
    }

    async deal() {
        const json = await this._order(this.orderType);
        if(json.status && json.status < 0) {
            this.state = STATES.ERROR_DEAL;
            this.message = '発注が約定しませんでした';
            logger.log('発注が約定しませんでした');
            return;
        }

        if(this.orderType === 'BUY') this.buy = json[0].price;
        else this.sell = json[0].price;

        logger.log(`${this.orderType === 'BUY' ? 'ロング' : 'ショート'}ポジションが約定しました ${json[0].price}円`);
        return json[0].price;
    }

    async settle() {
        if(this.state === STATES.ERROR_DEAL) {
            logger.log('発注がエラー状態なため決済を見送りました');
            return 0;
        }
        const json = await this._order(this.settleType);
        if(json.status && json.status < 0) {
            this.state = STATES.ERROR_SETTLE;
            this.message = '決済が約定しませんでした';
            logger.log('決済が約定しませんでした');
            return;
        }

        if(this.settleType === 'BUY') this.buy = json[0].price;
        else this.sell = json[0].price;

        this.result = (this.sell - this.buy) * this.lot;
        logger.log(`決済完了: Buy:${this.buy}円 Sell:${this.sell}円 Total: ${this.result}円`);
        return json[0].price;
    }
}

module.exports = {
    Deal,
    STATES
};
