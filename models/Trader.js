const { RestClient } = require('node-bitflyer');
const BitFlyer = require('../api/bitflyer').BitFlyer;
const querystring = require('querystring');
const util = require('../util');

const DELAY = 1000;

class Trader {
    constructor(key, secret, lot) {
        this.client = new BitFlyer(key, secret);
        this.order = this.order.bind(this);
        this.lot = lot;
    }

    async getBalance() {
        const client = this.client;
        return await client.getBalances();
    }

    async getExec(idObj) {
        idObj.product_code = 'FX_BTC_JPY';
        const client = this.client;
        let result = await client.getExec(idObj);
        let json = result;
        let count = 0;
        while (json.length === 0 || count > 10) {
            await util.sleep(1000);
            count++;
            result = await client.getExec(idObj);
            json = result;
        }
        return result;
    }

    async getOrders(idObj) {
        const client = this.client;
        return await client.getChildorders(idObj.child_order_acceptance_id);
    }

    async order(side, size) {
        const orderCompletion = async res => {
            await new Promise(resolve => setTimeout(resolve, DELAY));
            if(res == null) return false;
            if (res instanceof Error) {
                let error = res.toString();
                error = error.split(' ');
                let beginJson = false;
                let errorMessage = '';
                for (const er of error) {
                    if (er.startsWith('"')) beginJson = true;
                    if (beginJson) errorMessage += er;
                    if (er.endsWith('"') && beginJson) break;
                }
                return JSON.parse(errorMessage);
            }
            if(!res.child_order_acceptance_id) return false;
            return await this.getExec(res);
        };

        const client = this.client;
        return await client.sendChildorder({
            product_code: 'FX_BTC_JPY',
            child_order_type: 'MARKET',
            side: side,
            size: size,
            minute_to_expire: 5000,
            time_in_force: 'GTC'
        }).then(orderCompletion);
    }
}

module.exports = Trader;
