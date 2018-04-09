// ライブラリ
var request = require('request');
var crypto = require('crypto');
var fs = require('fs');
// シークレットな情報
var SECRET = JSON.parse(fs.readFileSync('secret.json', 'utf8'));

var API_KEY = SECRET.apiKey;
var API_SECRET = SECRET.apiSecret;

// TODO: その他の設定情報（ストラテジーのパラメータや売買単位など）

// 変更点: 関数を追加
function getSimpleSignal (position) {
  if (position === 'LONG') return 'SELL';
  if (position === 'SHORT') return 'BUY';
  if (position === 'CLOSED') { // ノーポジをとりあえずCLOSEDと呼ぶ
    // ポジションを持っていないとき、ランダムで売買かノーポジを続ける
    randomValue = Math.random();
    if (randomValue < 0.3) {
      return 'BUY';
    } else if (randomValue > 0.7) {
      return 'SELL';
    } else {
      return 'HOLD'; // ポジションを変えないことをとりあえずHOLDと呼ぶ
    }
  }
  // ここは通らないはず!
  console.log('Error in getSimpleSignal function!');
}

// 変更点: 関数を追加
function getNextPosition (position, signal) {
  if (position === 'LONG') return 'CLOSED';
  if (position === 'SHORT') return 'CLOSED';
  if (position === 'CLOSED' && signal === 'BUY') return 'LONG';
  if (position === 'CLOSED' && signal === 'SELL') return 'SHORT';
  if (signal === 'HOLD') return position;
  // ここは通らないはず!
  console.log('Error in getNextPosition function!');
}

// 変更点: シミュレート用の関数を追加
function simpleBotSimulate () {
  var position = 'CLOSED';
  var signal = 'HOLD';
  // 1分毎にポジションを移行する
  setInterval(() => {
    signal = getSimpleSignal(position);
    position = getNextPosition(position, signal);
    console.log('(simulate) シグナル:', signal, '0.001 BTC');
    console.log('(simulate) ポジション:', position);
  }, 60 * 1000);
}

// 変更点: メインの処理を関数に切り出し
function simpleBotTrade (signal) {
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
        console.log(JSON.parse(payload));
      });
    }
  }, 60 * 1000);
}

function firstBot () {
  var mode = process.argv[2];
  if (mode === 'simulate') {
    simpleBotSimulate();
  } else if (mode === 'trade') {
    simpleBotTrade();
  } else {
    console.log('Invalid args!'); // コマンドライン引数が間違っているとき
  }
}

// ついでに取引所の稼働状況も確認しておく
getHealth();
// メイン
firstBot();

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

