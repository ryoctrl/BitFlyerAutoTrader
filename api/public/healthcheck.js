// 取引所の稼動状態を確認
function getHealth () {
  var path = '/v1/gethealth';
  var query = '?product_code=FX_BTC_JPY';
  var url = 'https://api.bitflyer.jp' + path + query;
  request(url, function (err, response, payload) {
    console.log('稼動状態')
    console.log(payload);
  });
}
getHealth();