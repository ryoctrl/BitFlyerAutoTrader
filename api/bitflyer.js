const r2 = require('r2');
const fetch = require('node-fetch');
const crypto = require('crypto');
const Secret = require('../secret.json');

const URL = 'https://api.bitflyer.jp';

class BitFlyer {
    constructor(API_KEY, API_SECRET) {
        this.API_KEY = API_KEY;
        this.API_SECRET = API_SECRET;
    }

    /* Public Methods*/
    //資産残高を取得
    async getBalances() {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
        let path = '/v1/me/getbalance';
        return await this.sendRequest(method, path, null, true);
    }

    //証拠金状態を取得
    async getCollateral() {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
        let path = '/v1/me/getcollateral';
        return await this.sendRequest(method, path, null, true);
    }

    //取引所の状態を取得
    async getHealth() {
        let method = 'GET';
        let path = '/v1/gethealth/?product_code=FX_BTC_JPY'
        return await this.sendPublicRequest(method, path, null);
    }

    //証拠金変動履歴を取得
    async getCollateralHistory() {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
        let path = '/v1/me/getcollateralhistory';
        return await this.sendRequest(method, path, null, true);
    }

    //現在の建玉を取得
    async getPositions() {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
        let path = '/v1/me/getpositions?product_code=FX_BTC_JPY';
        return await this.sendRequest(method, path, null, true);
    }

    //注文を出す	
    async sendChildorder(body) {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'POST';
        let path = '/v1/me/sendchildorder';
        return await this.sendRequest(method, path, body, true);
    }

    //注文をキャンセルする
    async cancelChildorder(body) {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'POST';
        let path = '/v1/me/cancelchildorder';
        return await this.sendRequest(method, path, body, false);
    }

    //注文の詳細を取得
    async getChildorders(id) {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
        let path = '/v1/me/getchildorders?product_code=FX_BTC_JPY';
        if (id) path += `&child_order_acceptance_id=${id}`;
        return await this.sendRequest(method, path, null, true);
    }

    //完了した注文の詳細を取得
    async getCompletedChildorders(id) {
	if(!this.API_KEY || !this.API_SECRET) return;
        let method = 'GET';
	let path = '/v1/me/getchildorders?product_code=FX_BTC_JPY&child_order_state=COMPLETED';
	if(id) path += `&child_order_acceptance_id=${id}`;
	return await this.sendRequest(method, path, null, true);
    }

    async getBTCBoard() {
        let method = 'GET';
        let path = '/v1/board?product_code=BTC_JPY';
        return await this.sendPublicRequest(method, path, null);
    }

    //板情報を取得
    async getFXBoard() {
        let method = 'GET';
        let path = '/v1/board?product_code=FX_BTC_JPY';
        return await this.sendPublicRequest(method, path, null);
    }

    async sendPublicRequest(method, path, body) {
        let url = URL + path;
        let res = await fetch(url);
        return res.json();
    }

    async sendRequest(method, path, body, isJson) {
        let ts = Date.now().toString();
        body = JSON.stringify(body);
        let uri = URL + path;
        let text = ts + method + path;
        if (method == 'POST') text += body;
        let sign = crypto.createHmac('sha256', this.API_SECRET).update(text).digest('hex');
        let options = {
            url: uri,
            method: method,
            headers: {
                'ACCESS-KEY': this.API_KEY,
                'ACCESS-TIMESTAMP': ts,
                'ACCESS-SIGN': sign,
                'Content-Type': 'application/json',
            }
        }
        if (method == 'POST') options.body = body;
        if (isJson) {
            let res = await r2(options).json;
            return res;
        } else {
            let res = await r2(options);
            return res;
        }
    }
}

/* Utility methods*/
const displayJson = (json) => {
    try {
        console.log(json);
    } catch (err) {
        console.log(err);
    }
};

module.exports.BitFlyer = BitFlyer;
