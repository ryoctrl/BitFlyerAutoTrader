const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
const moment = require('moment');

//独自モジュール読み込み
const workDir = process.cwd();
const Strategy = require(workDir + '/bot/vixrsi/strategy.js');
const CwUtil = require(workDir + '/cryptowatch/cwutil.js');
const VIXConfig = require(workDir + '/bot/vixrsi/vixrsi_config.js');
const SECRET = require(workDir + '/secret.json');
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
const orderSize = VIXConfig.trader.amount;
const LOSSCUT_PERCENTAGE = VIXConfig.trader.losscutPercentage;
const PROFIT_PERCENTAGE = VIXConfig.trader.profitPercentage;

//定数宣言
//TODO: API操作部を外部に切り出し
const ORDER_HTTP_METHOD = 'POST';
const ORDER_ENTRY_POINT = '/v1/me/sendchildorder';
const waitMilliSecond = 1000 * 60 * VIXConfig.trader.candleSize;

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
	//現在のポジション
	let position = 'CLOSED';
	//Strategyから渡されるシグナル
	let signal = 'HOLD';
	let order = {
		product_code: 'FX_BTC_JPY',
		child_order_type: 'MARKET',
		price: 0,
		size: orderSize,
	};
	//現在のポジション
	let currentPosition = signal;
	//現在の建玉合計
	let currentAmount = 0;
	//動作間隔 == ローソク足間隔
	let interval = 60;
	//建玉所持中フラグ
	let whilePositioning = false;
	//利確フラグ
	let secureProfit = false;
	//利確認識フラグ
	let secureProfitDetected = false;
	//ロスカット時のポジション決済フラグ
	let positionExited = false;
	//ロスカットフラグ
	let losscut = false;
	//ロスカット認識時のポジション
	let losscutSide = '';
	//ロギング用のメッセージ
	let logMessage = '';
	
	//一定時間ごとにポジション移行の判断を行う
	try {
		let ohlc = {};
		while(true) {
			//ロスカット or 利確をチェック
			if(whilePositioning) {
				if(!losscut) {
					losscut = await checkLosscut();
				}
				//Losscutと同時成立は多分あり得ない上awaitで時間の無駄になるのでlosscut成立時はチェックしない
				if(!losscut) {
					if(!secureProfitDetected) {
						secureProfitDetected = await checkSecureProfit(secureProfitDetected);
					} else {
						secureProfit = await checkSecureProfit(secureProfitDetected);
					}
				}
			}
			
			ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
			signal = Strategy.vixRsiSignal(ohlc, position);
			position = Strategy.getNextPosition(position, signal);
			
			logMessage = `${moment(Date.now()).format('YYYY/MM/DD HH:mm:ss')} - ${signal},${position}`;
			console.log(logMessage);
			logging(logMessage);
		 	
			if(signal === 'EXIT' || (losscut && !positionExited) || secureProfit) {
				//ここにロスカットフラグの否定を追加？
				if(!losscut && (currentPosition === 'NONE' || currentPosition === 'HOLD')) continue;
				
				if(currentPosition === 'LONG')  {
					order.side = 'SELL';
					losscutSide = currentPosition;
				} else if(currentPosition === 'SHORT') {
					order.side = 'BUY';
					losscutSide = currentPosition;
				}
				order.size = currentAmount * orderSize;
	
				request(generateOrderOptions(exitOrder), function(err, res, payload) {
					if(res.statusCode == 200) {
						positionExited = true;
						if(losscut) {
							logMessage = 'losscut';
						} else {
							logMessage = 'exit';
						}
						currentAmount = 0.0;
						currentPosition = 'HOLD';
						whilePositioning = false;
						secureProfit = false;
						secureProfitDetected = false;
						positionExited = true;
					
						logMessage += `ポジション:${position}, 取引枚数: ${currentAmount * order.size}BTC`;
						logging(logMessage);
						displayJson(payload);
					} else {
						console.log("何らかのエラーにより決済注文が通りませんでした");
						displayJson(payload);
					}
				});
			}
			if (signal === 'BUY' || signal === 'SELL') {
				if(losscut && losscutSide == signal) { continue; }
				losscut = false;
				order.side = signal;
				order.size = orderSize

				request(generateOrderOptions(order), function(err, res, payload) {
					if(res.statusCode == 200) {
						console.log('シグナル:', signal);
						console.log('ポジション:', position);
						console.log('取引枚数(BTC):', order.size);
						currentAmount++;
						currentPosition = position;
						whilePositioning = true;
						positionExited = false;

						logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数: ${order.size}BTC`;
						console.log(logMessage);
						logging(logMessage);
			
						
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
		console.log('Usage: $node bot/vixrsi/vixrsi_bot.js trade');
	}
}

vixRSIBot();
