var Strategy = require('./strategy.js');
var VIXConfig = require('./vixrsi_config.js')
var CwUtil = require('../../cryptowatch/cwutil.js');
const moment = require('moment');

var request = require('request');
var crypto = require('crypto');
var fs = require('fs');
// シークレットな情報
var SECRET = JSON.parse(fs.readFileSync('secret.json', 'utf8'));

var API_KEY = SECRET.apiKey;
var API_SECRET = SECRET.apiSecret;

const CANDLE_SIZE = VIXConfig.vixSimulatorConf.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;

const ORDER_HTTP_METHOD = 'POST';
const ORDER_ENTRY_POINT = '/v1/me/sendchildorder';

const logging = (message) => {
	const logDir = 'logs/';
	const logfileName = moment(Date.now()).format('YYYYMMDD') + ".log";
	if(!message.endsWith('\n')) message += '\n';
	fs.appendFile(logDir + logfileName, message, (err) => {
		if(err) console.log(err);
	});			
};

// 変更点: メインの処理を関数に切り出し
async function vixRSITrade () {
	let position = 'CLOSED';
	let signal = 'HOLD';
	let order = {};
	order.product_code = 'FX_BTC_JPY';
	order.child_order_type = 'MARKET';
	order.price = 0;
	order.size = VIXConfig.trader.amount;
	const waitMilliSecond = 1000 * 60 * VIXConfig.trader.candleSize;
	let currentPosition = signal;
	let currentAmount = 0;

	let interval = 60;
	let whilePositioning = false;
	let count = 0;
	
	//一定時間ごとにポジション移行の判断を行う
	try {
		while(true) {
			var ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
			signal = Strategy.vixRsiSignal(ohlc, position);
			position = Strategy.getNextPosition(position, signal);
			const detail = `${moment(Date.now()).format('YYYY/MM/DD HH:mm:ss')} - ${signal},${position}`;
			console.log(detail);
			logging(detail);
		 	if(signal === 'EXIT') {
				if(currentPosition === 'NONE' || currentPosition === 'HOLD' ) continue;
				let exitOrder = {};
				exitOrder.product_code = 'FX_BTC_JPY';
				exitOrder.child_order_type = 'MARKET';
				exitOrder.price = 0;
				exitOrder.size = currentAmount * order.size;
				
				if(currentPosition === 'LONG')  {
					exitOrder.side = 'SELL';
				} else if(currentPosition === 'SHORT') {
					exitOrder.side = 'BUY';
				}
	
				request(generateOrderOptions(exitOrder), function(err, res, payload) {
					if(res.statusCode == 200) {
						console.log("POSITION EXITED");
						console.log('ポジション:', position);
						console.log('取引枚数(BTC)', currentAmount);
						currentAmount = 0.0;
						currentPosition = 'HOLD';
						displayJson(payload);
						whilePositioning = false;
						count = 0;
					} else {
						console.log("何らかのエラーにより決済注文が通りませんでした");
						displayJson(payload);
					}
				});
			}
			if (signal === 'BUY' || signal === 'SELL') {
				order.side = signal;

				request(generateOrderOptions(order), function(err, res, payload) {
					if(res.statusCode == 200) {
						console.log('シグナル:', signal);
						console.log('ポジション:', position);
						console.log('取引枚数(BTC):', order.size);
						currentAmount++;
						currentPosition = position;
						whilePositioning = true;
						displayJson(payload);
					} else {
						console.log("エラーにより正常に発注できませんでした");
						displayJson(payload);
					}
				});
			}
			await sleepSec(interval * CANDLE_SIZE);
		}
	} catch(error) {
		console.log(error);
	}
}

function displayJson(json) {
	try {
		console.log(JSON.parse(json));
	} catch(error) {
		console.log(error);
	}
}

function generateOrderOptions(orderJson) {
	let ts = Date.now().toString();
	let body = JSON.stringify(orderJson);
	let text = ts + ORDER_HTTP_METHOD + ORDER_ENTRY_POINT + body;
	let sign = crypto.createHmac('sha256', API_SECRET).update(text).digest('hex');
	return {
		url: 'https://api.bitflyer.jp' + ORDER_ENTRY_POINT,
		method: ORDER_HTTP_METHOD,
		body: body,
		headers: {
			'ACCESS-KEY': API_KEY,
			'ACCESS-TIMESTAMP': ts,	
			'ACCESS-SIGN': sign,
			'Content-Type': 'application/json'
		}
	};
}

async function sleepSec(seconds) {
	const interval = 1000 * seconds;
	return new Promise(resolve => setTimeout(resolve, interval));
}



function vixRSIBot() {
	let mode = process.argv[2];
	if(mode === 'trade') {
		console.log('[稼働開始]');
		vixRSITrade();
	} else {
		console.log('Invalid args!');
	}
}

vixRSIBot();
