// cryptowatchからn分足のOHLCを、過去hist本分取得する
var r2 = require('r2');
async function getOhlc(n, hist) {
  var now = Math.ceil((new Date()).getTime() / 1000); // 秒単位
  var beginTime = now - (n * 60) * hist;
  n_sec = n * 60;
  // cryptowatch format
  url = 'https://api.cryptowat.ch/markets/bitflyer/btcfxjpy/ohlc?periods=' + n_sec + '&after=' + beginTime
  var options = {
    url: url,
    method: 'GET',
    body: null,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  var response = await r2(url).json;
	//TODO: node-fetch/libs/index.js:250のjsonで返される例外処理を行う
	console.log(typeof(response));
  var candleStr = String(n_sec)
  // 最初と最後は不要なので捨てる
  return response['result'][candleStr].slice(1, -1);
}

module.exports.getOhlc = getOhlc;

// CryptoWatchから来る形式を使いやすいように変換
exports.getTimes = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[0] * 1000);
}

exports.getOpens = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[1]);
}

exports.getHighs = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[2]);
}

exports.getLows = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[3])  
}

exports.getCloses = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[4]);
}

