const BitFlyer = require('./bitflyer').BitFlyer;
const r2 = require('r2');
const fetch = require('node-fetch');

let api = new BitFlyer();

const generateOrderOptions = (orderJson) => {
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

const run = async () => {
/*
	console.log("資産残高取得テスト");
	let balances = await api.getBalances();
	console.log(balances);

	console.log('証拠金状態取得テスト');
	let collateral = await api.getCollateral();
	console.log(collateral);

	console.log('証拠金変動履歴取得テスト');
	let collateralHistory = await api.getCollateralHistory();
	console.log(collateralHistory);

	console.log('現在の建玉取得テスト');
	let positions = await api.getPositions();
	console.log(positions);
	
	console.log('板情報取得テスト');
	let board = await api.getBoard();
	console.log(board.mid_price);
*/	
/*
	console.log('注文テスト');
	let body = {
		product_code: 'FX_BTC_JPY',
		child_order_type: 'MARKET',
		price: 0,
		size: 0.01,
		side: 'BUY'
	};
	let order = await api.sendChildorder(body);
	console.log(order);
*/
	console.log('注文取得テスト');
	let order = await api.getChildorders();
	console.log(order);
}
run();
