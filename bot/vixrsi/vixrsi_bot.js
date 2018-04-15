var Strategy = require('./strategy.js');
var VIXConfig = require('./vixrsi_config.js')
var CwUtil = require('../../cryptowatch/cwutil.js');

var request = require('request');
var crypto = require('crypto');
var fs = require('fs');
// シークレットな情報
var SECRET = JSON.parse(fs.readFileSync('secret.json', 'utf8'));

var API_KEY = SECRET.apiKey;
var API_SECRET = SECRET.apiSecret;

const CANDLE_SIZE = VIXConfig.vixSimulatorConf.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;

// 変更点: メインの処理を関数に切り出し
async function vixRSITrade () {
  var position = 'CLOSED';
  var signal = 'HOLD';
  var order = {};
  order.product_code = 'FX_BTC_JPY';
  order.child_order_type = 'MARKET';
  order.price = 0; // 成行のときは0を指定
  order.size = VIXConfig.trader.amount; // 取引する枚数
  const waitMilliSecond = 1000 * 60 * VIXConfig.trader.candleSize;
  // 一定時間ごとにポジションの移行を判断する
  try {
    while (true) {
      var ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
      signal = Strategy.vixRsiSignal(ohlc, position);
      position = Strategy.getNextPosition(position, signal);
      console.log(signal);
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
          console.log('シグナル:', signal);
          console.log('ポジション:', position);
          console.log('取引枚数(BTC)', order.size);
          // TODO: undefinedが帰ってくるときにparse errorが発生するので修正
          try {
            console.log(JSON.parse(payload));
          } catch (error) {
            console.log(error);
          }
        });
      }
      await sleepSec(60 * CANDLE_SIZE);
    }
  } catch (error) {
    console.log(error);
  }
}

async function sleepSec(seconds) {
  interval = 1000 * seconds
  return new Promise(resolve => setTimeout(resolve, interval))
}

function vixRSIBot () {
  var mode = process.argv[2];
  if (mode === 'trade') { // Take care
    console.log('[稼働開始]');
    vixRSITrade();
  } else {
    console.log('Invalid args!'); // コマンドライン引数が間違っているとき
  }
}

vixRSIBot();