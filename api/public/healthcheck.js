const request = require('request');

//BitFlyerのサーバー稼働状態を確認
function getHealth() {
	const path = '/v1/gethealth';
	const query = '?product_code=FX_BTC_JPY';
	const url = 'https://api.bitflyer.jp' + path + query;
	request(url, (err, res, body) => {
		console.log('ServerHealth');
		console.log(body);
	});
}
getHealth();
