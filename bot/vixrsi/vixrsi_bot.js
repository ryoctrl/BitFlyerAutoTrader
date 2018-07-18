const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
const moment = require('momoent');

//独自モジュール読み込み
const Strategy = require('./strategy.js');
const CwUtil = require('../../cryptowatch/cwutil.js');
const VIXConfig = require('./vixrsi_config.js');
const SECRET = require('../../secret.json');
//ToDo: apiモジュールをbotプロジェクトディレクトリに作る
const BitFlyer = require('/var/www/bfbotapi/bitflyer/api').BitFlyer;
const bfAPI = new BitFlyer();

//Config内容の読み取り
const API_KEY = SECRET.API_KEY;
const API_SECRET = SECRET.API_SECRET;
//TODO: configのjsonを整理
const CANDLE_SIZE = VIXConfig.vixSimulatorConf.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;
const LOSSCUT_PERCENTAGE = VIXConfig.trader.losscutPercentage;
const PROFIT_PERCENTAGE = VIXConfig.trader.profitPercentage;

//定数宣言
//TODO: API操作部を外部に切り出し
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

const checkLosscut = async () => {
	let collateral = await bfAPI.getCollateral();
	let amount = collateral.collateral;
	let pnl = collateral.open_position_pnl;
	return pnl <= -(amount * (LOSSCUT_PERCENTAGE / 100));
};

const checkSecureProfit = async(detected) => {
	let collateral = await bfAPI.getCollateral();
	let amount = collateral.collateral;
	let pnl = collateral.open_position_pnl;
	return result = false;
	let message = '';
	if(detected) {
		result = pnl <= amount * (PROFIT_PERCENTAGE / 100);
		console.log('利確処理 : ', result);
		message += '利確処理:';
	} else {
		result = pnl >= amount * (PROFIT_PERCENTAGE / 100);
		console.log('利確フラグ : ', result);
		message += '利確フラグ';
	}
	message += result ? 'ON' : 'OFF';
	logging(message);
	return result;
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

	let secureProfit = false;
	let secureProfitDetected = false;
	
	//一定時間ごとにポジション移行の判断を行う
	try {
		let ohlc = {};
		let losscut = false;
		//ロスカット時のポジションフラグ
		let positionExsited = false;
		let losscutSide = '';
		while(true) {
			//ロスカット/利確処理
			if(whilePositioning) {
				//ロスカットフラグが立っていなければ
				if(!losscut) {
					losscut = await checkLosscut();
				}
				//利確フラグ
				if(!secureProfitDetected) {
					secureProfitDetected = await checkSecureProfit(secureProfitDetected);
				} else {
					secureProfit = await checkSecureProfit(secureProfitDetected);
				}
			}
			ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
			signal = Strategy.vixRsiSignal(ohlc, position);
			position = Strategy.getNextPosition(position, signal);
			const detail = `${moment(Date.now()).format('YYYY/MM/DD HH:mm:ss')} - ${signal},${position}`;
			console.log(detail);
			logging(detail);
		 	if(signal === 'EXIT' || (losscut && !positionExited) || secureProfit) {
				//ここにロスカットフラグの否定を追加？
				if(currentPosition === 'NONE' || currentPosition === 'HOLD' ) continue;
				let exitOrder = {};
				exitOrder.product_code = 'FX_BTC_JPY';
				exitOrder.child_order_type = 'MARKET';
				exitOrder.price = 0;
				exitOrder.size = currentAmount * order.size;
				
				if(currentPosition === 'LONG')  {
					exitOrder.side = 'SELL';
					losscutSide = currentPosition;
				} else if(currentPosition === 'SHORT') {
					exitOrder.side = 'BUY';
					losscutSide = currentPosition;
				}
	
				request(generateOrderOptions(exitOrder), function(err, res, payload) {
					if(res.statusCode == 200) {
						positionExited = true;
						if(losscut) {
							console.log('LOSSCUT');
							logging('LOSSCUT');
						} else {
							console.log("POSITION EXITED");
						}
						console.log('ポジション:', position);
						console.log('取引枚数(BTC)', currentAmount);
						currentAmount = 0.0;
						currentPosition = 'HOLD';
						displayJson(payload);
						whilePositioning = false;
						count = 0;
						secureProfit = false;
						secureProfitDetected = false;
						//positionExited操作
					} else {
						console.log("何らかのエラーにより決済注文が通りませんでした");
						displayJson(payload);
					}
				});
			}
			if (signal === 'BUY' || signal === 'SELL') {
				if(losscut && losscutSide == signal) { continue; }
				losscut = false;
				positionExited = true;
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
		let jsonObj = JSON.parse(json);
		if(jsonObj.error_message) logging(jsonObj.error_message);
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
