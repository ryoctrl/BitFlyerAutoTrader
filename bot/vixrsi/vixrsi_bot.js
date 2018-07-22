const moment = require('moment');
const io = require('socket.io-client');

//独自モジュール読み込み
const workDir = process.cwd();
const Strategy = require(workDir + '/bot/vixrsi/strategy');
const CwUtil = require(workDir + '/cryptowatch/cwutil');
const VIXConfig = require(workDir + '/bot/vixrsi/vixrsi_config');
const SECRET = require(workDir + '/secret.json');
const Util = require(`${workDir}/utilities/util`).Util;
const BitFlyer = require(workDir + '/api/bitflyer').BitFlyer;
const util = new Util();
const bfAPI = new BitFlyer();

//Config内容の読み取り
const API_KEY = SECRET.API_KEY;
const API_SECRET = SECRET.API_SECRET;
//TODO: configのjsonを整理
const CANDLE_SIZE = VIXConfig.trader.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;
const orderSize = VIXConfig.trader.amount;
const leverage = VIXConfig.trader.leverage;
const LOSSCUT_PERCENTAGE = VIXConfig.trader.losscutPercentage;
const PROFIT_PERCENTAGE = VIXConfig.trader.profitPercentage;

//定数宣言
//TODO: API操作部を外部に切り出し
const ORDER_HTTP_METHOD = 'POST';
const ORDER_ENTRY_POINT = '/v1/me/sendchildorder';
const waitMilliSecond = 1000 * 60 * VIXConfig.trader.candleSize;
const LOGNAME = 'vixrsi';

//リアルタイムAPIの準備/設定
const FX_TICKER_CHANNEL = "lightning_ticker_FX_BTC_JPY";
const STREAM_URI = "https://io.lightstream.bitflyer.com";
const socket = io(STREAM_URI, { transports: ["websocket"] });
socket.on("connect", () => {
	socket.emit("subscribe", FX_TICKER_CHANNEL);
});

socket.on(FX_TICKER_CHANNEL, message => {
	if(bestBid == -1 || bestAsk == -1) {
		console.log(`BestBidSetTo: ${message.best_bid}, BestAskSetTo: ${message.best_ask}`);
	}
	bestBid = message.best_bid;
	bestAsk = message.best_ask;
});

let bestBid = -1;
let bestAsk = -1;
let maxPosition = 0;

///
/// 証拠金と評価評価損益からロスカットの可否を返す
///
const checkLosscut = async () => {
	let collateral = await bfAPI.getCollateral();
	let amount = collateral.collateral;
	let pnl = collateral.open_position_pnl;
	return pnl <= -(amount * (LOSSCUT_PERCENTAGE / 100));
};

///
/// 証拠金と評価損益から利確の可否を返す
/// detectedにfalseを指定すると評価損益が基準額以上
/// detectedにtrueを指定すると評価損益が基準額以下でtrueを返す
/// 一度認識した後にその額を下回れば損失になる前に利確するスタンス
///
const checkSecureProfit = async(detected) => {
	let collateral = await bfAPI.getCollateral();
	let amount = collateral.collateral;
	let pnl = collateral.open_position_pnl;
	return result = false;
	let message = '';
	if(detected) {
		result = pnl <= amount * (PROFIT_PERCENTAGE / 100);
	} else {
		result = pnl >= amount * (PROFIT_PERCENTAGE / 100);
	}
	return result;
};

///
/// 証拠金とBTCFXの現在価格から最大建玉数を算出する
/// 切り捨て(証拠金 / (現在価格 * 発注単価(最小0.01) / レバレッジ(15));
/// 切り捨て(2000 / (600000 * 0.01 / 15)) => 5
///
const getMaxPosition = async () => {
	let collateralObj = await bfAPI.getCollateral();
	let collateral = collateralObj.collateral;
	console.log(`証拠金:${collateral}円`);
	let price = await bfAPI.getFXBoard();
	price = price.mid_price;
	let unitPrice = price * orderSize / leverage;
	let result = Math.floor(collateral / unitPrice);
	console.log(`最大建玉数:${result}`);
	return result;
};

const getSFD = async() => {
	let fxPrice = (await bfAPI.getFXBoard()).mid_price;
	let btcPrice = (await bfAPI.getBTCBoard()).mid_price;
	let kairi = fxPrice/btcPrice * 100 - 100;
	return kairi;
}

// 変更点: メインの処理を関数に切り出し
const vixRSITrade = async () => {
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
	let numPosition = 0;
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
	let losscutSignal = '';
	//ロギング用のメッセージ
	let logMessage = '';
	//プログラム開始時に最大ポジション数を算出する
	maxPosition = await getMaxPosition();
	console.log(`最大建玉:${maxPosition} で開始します`);
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
			util.logging(LOGNAME, logMessage);
		 	
			if(signal === 'EXIT' || (losscut && !positionExited) || secureProfit) {
				if((!losscut && !secureProfit) && (currentPosition === 'NONE' || currentPosition === 'HOLD')) continue;
				
				if(currentPosition === 'LONG')  {
					order.side = 'SELL';
					losscutSignal = 'BUY';
				} else if(currentPosition === 'SHORT') {
					order.side = 'BUY';
					losscutSignal = 'SELL';
				}
				order.size = numPosition * orderSize;
				order.child_order_type = 'MARKET';
				order.price = 0;
			
				let childOrder = await bfAPI.sendChildorder(order);
				
				if(childOrder.child_order_acceptance_id) {
					logMessage += `ポジション:${position}, 取引枚数:${numPosition * order.size}BTC`;
					positionExited = true;
					numPosition = 0.0;
					currentPosition = 'HOLD';
					whilePositioning = false;
					secureProfit = false;
					secureProfitDetected = false;
					maxPosition = await getMaxPosition();	
					
					if(losscut) logMessage = 'ロスカット';
					else if(secureProfit) logMessage = '利食い';
					else logMessage = '手仕舞';

					util.logging(LOGNAME, logMessage);
					console.log(childOrder);
				} else {
					console.log("何らかのエラーにより決済注文が通りませんでした");
					console.log(childOrder);
				}
			} else if (signal === 'BUY' || signal === 'SELL') {
				if(!(losscut && losscutSignal == signal) || numPosition < maxPosition) {
					
					losscut = false;
					losscutSignal = '';
					order.side = signal;
					if(signal === 'BUY' && bestAsk != -1) {
						order.child_order_type = 'LIMIT';
						order.price = bestAsk;
					} else if(signal === 'SELL' && bestBid != -1) {
						order.child_order_type = 'LIMIT';
						order.price = bestBid;
					}
					order.size = orderSize
				
					let sfd = await getSFD();
					if(signal === 'SELL' || (signal === 'BUY' && sfd < 4.9)) {
						let tryOrderCount = 0;
						while(true) {
							let childOrder = await bfAPI.sendChildorder(order);
							if(childOrder.child_order_acceptance_id) {
								tryOrderCount++;
								
								let id = childOrder.child_order_acceptance_id;
								let result = await waitContractOrderForFiveSec(id);
								if(result) {
									numPosition++;
									currentPosition = position;
									whilePositioning = true;
									positionExited = false;
									logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数:${order.size}BTC, 約定価格:${order.price}`;
									console.log(logMessage);
									util.logging(LOGNAME, logMessage);
									console.log(childOrder);
									break;
								}
								
								console.log('注文が5秒間約定しなかったためキャンセルします。');
								let cancelBody = {
									product_code: 'FX_BTC_JPY',
									child_order_acceptance_id: id
								};
								let cancel = await bfAPI.cancelChildorder(cancelBody);
								console.log(cancel);
								if(tryOrderCount >= 5) break;
							} else {
								console.log('エラーにより正常に発注できませんでした');
								console.log(childOrder);
								break;
							}
						}
					} 
				}
			}
			await sleepSec(interval * CANDLE_SIZE - 1);
		}
	} catch(error) {
		console.log(error);
	}
};

const waitContractOrderForFiveSec = async (id) => {
	let orders = null;
	for(let count = 0; count < 5; count++) {
		orders = await bfAPI.getChildorders(id);
		if(orders.length && orders[0].child_order_state === 'COMPLETED') return true;
		await sleepSec(1);
	}
}

const sleepSec = async (seconds) => {
	const interval = 1000 * seconds;
	return new Promise(resolve => setTimeout(resolve, interval));
};

const vixRSIBot = () => {
	console.log('[稼働開始]');
	vixRSITrade();
};

vixRSIBot();
