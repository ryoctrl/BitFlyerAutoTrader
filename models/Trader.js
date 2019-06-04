const { RestClient } = require('node-bitflyer');
const querystring = require('querystring');

const DELAY = 1000;

class Trader {
    constructor(key, secret, lot) {
        this.client = new RestClient(key, secret);
        this.order = this.order.bind(this);
        this.lot = lot;
    }

    async getBalance() {
        const client = this.client;
        return await client.fetch('GET', '/me/getcollateral');
    }

    async getExec(idObj) {
        idObj.product_code = 'FX_BTC_JPY';
        const client = this.client;
        const path = '/me/getexecutions?' + querystring.stringify(idObj);
        let result = await client.fetch('GET', path);
        let json = JSON.parse(result);
        let count = 0;
        while(json.length === 0 || count > 10) {
            await new Promise(resolve => setTimeout(resolve, DELAY));
            count++;
            result = await client.fetch('GET', path);
            json = JSON.parse(result);
        }
        return result;
    }

    async getOrders(idObj) {
        const client = this.client;
        return await client.fetch('GET', '/me/getchildorders?' + querystring.stringify(idObj));
    }

    async order(side) {
        const orderCompletion = async res => {
            await new Promise(resolve => setTimeout(resolve, DELAY));
            if(res instanceof Error) {
                let error = res.toString();
                error = error.split(' ');
                let beginJson = false;
                let errorMessage = '';
                for(const er of error) {
                    if(er.startsWith('"')) beginJson = true;
                    if(beginJson) errorMessage += er;
                    if(er.endsWith('"') && beginJson) break;
                }
                return JSON.parse(errorMessage);
            }
            const resJson = JSON.parse(res);
            if(!resJson || !resJson.child_order_acceptance_id) return false;
            return await this.getExec(resJson);
        };

        const client = this.client;
        return  await client.fetch('POST', '/me/sendchildorder', {
            product_code: 'FX_BTC_JPY',
            child_order_type: 'MARKET',
            side: side,
            size: this.lot,
            minute_to_expire: 5000,
            time_in_force: 'GTC'
        }).then(orderCompletion);
    }
}

module.exports = Trader;
