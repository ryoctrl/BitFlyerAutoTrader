const r2 = require('r2');
const fetch = require('node-fetch');
const crypto = require('crypto');
const Secret = require('../secret.json');

const API_KEY = Secret.API_KEY;
const API_SECRET = Secret.API_SECRET;
const URL = 'https://api.bitflyer.jp';

class BitFlyer {
	constructor() {
	}
	
	/* Public Methods*/
	//資産残高を取得
	async getBalances() {
		let method = 'GET';
		let path = '/v1/me/getbalance';
		return await this.sendRequest(method, path, null);
	}
	
	//証拠金状態を取得
	async getCollateral() {
		let method = 'GET';
		let path = '/v1/me/getcollateral';
		return await this.sendRequest(method, path, null);
	}
	
	//証拠金変動履歴を取得
	async getCollateralHistory() {
		let method = 'GET';
		let path = '/v1/me/getcollateralhistory';
		return await this.sendRequest(method, path, null);
	}

	//現在の建玉を取得
	async getPositions() {
		let method = 'GET';
		let path = '/v1/me/getpositions?product_code=FX_BTC_JPY';
		return await this.sendRequest(method, path, null);
	}
	
	//注文を出す	
	async sendChildorder(body) {
		let method = 'POST';
		let path = '/v1/me/sendchildorder';
		return await this.sendRequest(method, path, body);
	}
	
	//注文をキャンセルする
	async cancelChildorder(body) {
		let method = 'POST';
		let path = '/v1/me/cancelchildorder';
		return await this.sendRequest(method, path, body);
	}

	//注文の詳細を取得
	async getChildorders(id) {
		let method = 'GET';
		let path = '/v1/me/getchildorders?product_code=FX_BTC_JPY';
		if(id) path += `&child_order_acceptance_id=${id}`;
		return await this.sendRequest(method, path, null);
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

	async sendRequest(method, path, body) {
		let ts = Date.now().toString();
		body = JSON.stringify(body);
		let uri = URL + path;
		let text = ts + method + path;
		if(method == 'POST') text += body;
		let sign = crypto.createHmac('sha256', API_SECRET).update(text).digest('hex');
		let options = {
			url: uri,
			method: method,
			headers: {
				'ACCESS-KEY': API_KEY,
				'ACCESS-TIMESTAMP': ts,
				'ACCESS-SIGN': sign,	
				'Content-Type': 'application/json',
			}
		}
		if(method == 'POST') options.body = body;
		let res = await r2(options).json;
		return res;
	}
}

/* Utility methods*/
const displayJson = (json) => {
	try {
		console.log(json);
	} catch(err) {
		console.log(err);
	}
};

module.exports.BitFlyer = BitFlyer;
