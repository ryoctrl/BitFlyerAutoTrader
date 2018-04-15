var VIXConfig = require('./vixrsi_config.js');
var Strategy = require('./strategy.js');
var CwUtil = require('../../cryptowatch/cwutil.js');

const AMOUNT = VIXConfig.vixSimulatorConf.amount;
const LOOP_TIME = VIXConfig.vixSimulatorConf.loopTime;
const CANDLE_SIZE = VIXConfig.vixSimulatorConf.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;
// 変更点: シミュレート用の関数を追加
async function vixRsiSimulate () {
  var position = 'CLOSED';
  var signal = 'HOLD';
  var amount = 0;
  try {
    while (true) {
      // 1時間毎にポジションを移行するが
      // TODO: 1日の取引回数が少ないので検証しづらいかもしれない
      var ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
      signal = Strategy.vixRsiSignal(ohlc, position);
      nextPosition = Strategy.getNextPosition(position, signal);
      amount = AMOUNT;
      console.log('(simulate) シグナル:', signal);
      if (nextPosition !== position) {
        console.log('(simulate) 移行後のポジション:', nextPosition);
        console.log('(simulate) 注文枚数:', amount);
        position = nextPosition;
      }
      console.log('----------');
      // TODO: CLOSEしたときに想定利益、総利益、利益率、勝率を表示
      await sleepSec(60 * CANDLE_SIZE);
    }
  } catch (err) {
    console.log(err);
  }
}

async function sleepSec(seconds) {
  interval = 1000 * seconds
  return new Promise(resolve => setTimeout(resolve, interval))
}

vixRsiSimulate();