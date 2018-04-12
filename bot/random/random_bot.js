// Buy and Sell randomly
var request = require('request');
var crypto = require('crypto');
var fs = require('fs');
// シークレットな情報
var SECRET = JSON.parse(fs.readFileSync('../../secret.json', 'utf8'));

var API_KEY = SECRET.apiKey;
var API_SECRET = SECRET.apiSecret;

// 変更点: メインの処理を関数に切り出し
function randomTrade (signal) {
  var position = 'CLOSED';
  var signal = 'HOLD';
  var order = {};
  order.product_code = 'FX_BTC_JPY';
  order.child_order_type = 'MARKET';
  order.price = 0; // 成行のときは0を指定
  order.size = 0.001;
  // 1分毎にポジションを移行する
  setInterval(() => {
    signal = getSimpleSignal(position);
    position = getNextPosition(position, signal);
    if (signal === 'BUY' || signal === 'SELL') {
      order.side = signal;
      var timestamp = Date.now().toString();
      var method = 'POST';
      var path = '/v1/me/sendchildorder';
      var body = JSON.stringify(order);
      var text = timestamp + method + path + body;
      var sign = crypto.createHmac('sha256', API_SECRET).update(text).digest('hex');
      var options = {
        url: 'https://api.bitflyer.jp' + path,
        method: method,
        body: body,
        headers: {
          'ACCESS-KEY': API_KEY,
          'ACCESS-TIMESTAMP': timestamp,
          'ACCESS-SIGN': sign,
          'Content-Type': 'application/json'
        }
      };
      request(options, function (err, response, payload) {
        console.log('シグナル:', signal, ' 0.001 BTC');
        console.log('ポジション:', position);
        // TODO: undefinedが帰ってくるときにparse errorが発生するので修正
        console.log(JSON.parse(payload)); 
      });
    }
  }, 60 * 1000);
}

function randomBot () {
  var mode = process.argv[2];
  if (mode === 'trade') { // Take care
    randomBotTrade();
  } else {
    console.log('Invalid args!'); // コマンドライン引数が間違っているとき
  }
}

randomBot();