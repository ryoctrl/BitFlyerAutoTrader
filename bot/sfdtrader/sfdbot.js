const io = require('socket.io-client');
const config = require(__dirname + '/config.json');
const BitFlyer = require('../../api/bitflyer').BitFlyer;
const Util = require('../../utilities/util').Util;

const btcTickerChannel = 'lightning_ticker_BTC_JPY';
const fxTickerChannel = 'lightning_ticker_FX_BTC_JPY';
const fxBoardChannel = 'lightning_board_FX_BTC_JPY';
const fxExecutionsChannel = 'lightning_executions_FX_BTC_JPY';
const btcExecutionsChannel = 'lightning_executions_BTC_JPY';
const streamURI = 'https://io.lightstream.bitflyer.com';
const api = new BitFlyer();
const util = new Util();
const orderSize = config.amount;

//リアルタイムAPIの準備/設定
const socket = io(streamURI, { transports: ["websocket"] });

socket.on("connect", () => {
	socket.emit("subscribe", fxTickerChannel);
	socket.emit("subscribe", btcExecutionsChannel);
});


socket.on(btcExecutionsChannel, message => {
	btcjpy = message[0].price;
});

socket.on(fxTickerChannel, message=> {
	bestBid = message.best_bid;
	bestAsk = message.best_ask;
});

//現物BTC/JPYの最終取引価格
let btcjpy = 0;
//現在のbestBid
let bestBid = 0;
//現在のbestAsk
let bestAsk = 0;
//注文ID
let executionID = ''
//現在の建玉合計
let numPosition = 0;
//ループ間隔(秒)
let interval = 0.2;
//取引処理実行までの閾値
const countLimit = 10 / interval;
//取引処理用のカウンタ
let count = countLimit;
//注文用obj
let order = {
	product_code: 'FX_BTC_JPY',
	child_order_type: 'LIMIT',
};

const checkingOrder = async (id) => {
	let count = 0;
	while(true) {
		if(count > 5) return false;
		let orders = await api.getChildorders(id);
		if(orders.length && orders.length > 0) {
			if(orders[0].child_order_state === 'COMPLETED') return true;
		}
		count++;
		await util.sleepSec(0.8);
		continue;
	}
};

const sfdTrade= async () => {
	while(true) {
		if(numPosition != 0 && getCurrentSFD() > 5.5) {
			order.side = 'BUY';
			order.child_order_type = 'MARKET';
			order.size = orderSize * numPosition;
			let o = await api.sendChildorder(order);
			if(api.child_order_acceptance_id) {
				order.child_order_type = 'LIMIT';
				numPosition = 0;
			}
		
		}
		if(numPosition == 0 && count >= countLimit) {
			order.side = 'SELL';
			order.price = canGetSFDSell();
			order.size = orderSize;
			if(test && order.price != -1) {
				console.log(`売り: ${order.price}`);
				numPosition++;
			} else if(order.price != -1) {
				console.log(`売り: ${order.price}`);
				let o = await api.sendChildorder(order);
				console.log(o);
				if(o.child_order_acceptance_id) {
					executionID = o.child_order_acceptance_id;
					numPosition++;
					console.log(`SELL: ${numPosition}`);
					count = 0;
					let completed = await checkingOrder(o.child_order_acceptance_id);
					console.log(completed);
					if(!completed) {
						numPosition = 0;
						let body = {
							product_code: 'FX_BTC_JPY',
							child_order_acceptance_id: executionID
						};
						let cancel = await api.cancelChildorder(body);
						console.log(cancel);
					}
				}
			}
		} else if(numPosition > 0){
			order.side = 'BUY';
			order.price = canFreeSFDBuy();
			order.size = orderSize * numPosition;
			if(test && order.price != -1) {
				console.log(`買い戻し: ${order.price}`);
				numPosition = 0;
			} else if(order.price != -1) {
				console.log(`買い戻し: ${order.price}`);
				let o = await api.sendChildorder(order);
				if(o.child_order_acceptance_id) {
					numPosition = 0;
					let completed = await checkingOrder(o.child_order_acceptance_id);
					if(!completed) {
						numPosition = 1;
						let body = {
							product_code: 'FX_BTC_JPY',
							child_order_acceptance_id: executionID
						};
						let cancel = await api.cancelChildorder(body);
						console.log(cancel);
					};
				}
			}
		} 
		count++;
		await util.sleepSec(0.2);
	}
};

let count = 0;
const canGetSFDSell = () => {
	let percentage = (bestBid/btcjpy - 1) * 100;
	console.log(`売り待機中... BestBid: ${bestBid}, 乖離率: ${percentage}`);
	if(isNaN(percentage) || !isFinite(percentage)){
		if(count >= 30) console.log('price always Inifinity!');
		else count++;
		return -1;
	}

	if(percentage > 5.1) return -1;
	return percentage > 5.025 ? bestBid : -1;
}

const getCurrentSFD = () => {
	return (bestBid/btcjpy - 1) * 100;
}

const canFreeSFDBuy = () => {
	let percentage = (bestAsk / btcjpy - 1) * 100;
	console.log(`買い待機中... BestAsk: ${bestAsk}, 乖離率: ${percentage}`);
	if(isNaN(percentage) || !isFinite(percentage)) return -1;
	return (bestAsk / btcjpy - 1) * 100 < 4.975 ? bestAsk : -1;
}


sfdTrade();
