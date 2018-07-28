const io = require('socket.io-client');

const workDir = process.cwd();
const BitFlyer = require(`${workDir}/api/bitflyer`).BitFlyer;
const SECRET = require(workDir + '/secret.json');
const Util = require('../../utilities/util').Util;

const btcExecutionsChannel = 'lightning_executions_BTC_JPY';
const streamURI = 'https://io.lightstream.bitflyer.com';
const api = new BitFlyer(SECRET.API_KEY, SECRET.API_SECRET);
const util = new Util();

//リアルタイムAPIの準備/設定
const socket = io(streamURI, { transports: ["websocket"] });

socket.on("connect", () => {
    socket.emit("subscribe", btcExecutionsChannel);
});


socket.on(btcExecutionsChannel, message => {
    sfdPrice = Math.round(message[0].price * 1.05);
});

//注文用obj
let order = {
    product_code: 'FX_BTC_JPY',
    child_order_type: 'LIMIT',
    size: 0.01,
};

let positioning = false;
let sfdPrice = 0;
let positioningPrice = 0;
let positionGetted = false;
const displaySFDPrice = async() => {
	while(true) {
		if(sfdPrice == 0) {
			await util.sleepSec(1);
			continue;
		}
		
		if(positioning && positionGetted) {
			order.price = sfdPrice - 1;
			order.side = 'BUY';
			positioning = false;
			await execOrder(false);
			console.log('complete buy process');
		} if(!positioning && !positionGetted) {
			order.price = sfdPrice;
			order.side = 'SELL';
			positioning = true;
			positioningPrice = order.price;
			await execOrder(true);
			console.log('complete sell process');
		}
		await util.sleepSec(0.01);
	}	
};

let body = {
	product_code: 'FX_BTC_JPY',
	child_order_acceptance_id: ''
};

let orderIds = [];

const cancelAllorders = async () => {
	if(orderIds.length == 0) return;
	let copyOfOrderIds = orderIds.slice();
	orderIds = [];
	for(let orderId of copyOfOrderIds) {
		body.child_order_acceptance_id = orderId;
		api.cancelChildorder(body)
		await util.sleepSec(0.5);
	}
};
const execOrder = async (selling) => {
	console.log('execOrder');
	while(true) {
		if((positioning && order.price != sfdPrice) || (!positioning && order.price != sfdPrice)) {
			cancelAllorders();
			if(positioning) {
				console.log('celling price');
				order.price = sfdPrice;
			} else {
				console.log('buying price');
				order.price = sfdPrice - 1;
			}
		} else {
			await util.sleepSec(1);
			continue;
		}
		let o = await api.sendChildorder(order);
		console.log(`${order.side}, 0.01:${order.price}`);
		console.log(o);
		if(o.child_order_acceptance_id) {
			let id = o.child_order_acceptance_id;
			orderIds.push(id);
			let orders = await api.getCompletedChildorders(id);
			if(orders.length && orders.length != 0) {
				positionGetted = selling;
				console.log('complete order');
				return;
			}
			//body.child_order_acceptance_id = id;
			//api.cancelChildorder(body);
		}
		await util.sleepSec(1);
	}
}
displaySFDPrice();
