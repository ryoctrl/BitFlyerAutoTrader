var RandomConfig = require('./random_config.js')
var Strategy = require('./strategy.js')

var AMOUNT = RandomConfig.simulator.amount;
var LOOP_TIME = RandomConfig.simulator.loopTime
// 変更点: シミュレート用の関数を追加
function simpleBotSimulate () {
  var position = 'CLOSED';
  var signal = 'HOLD';
  var amount = 0;
  try {
    // 1分毎にポジションを移行する
    setInterval(() => {
      signal = Strategy.getSimpleSignal(position);
      position = Strategy.getNextPosition(position, signal);
      amount += RandomConfig.simulator
      console.log('(simulate) シグナル:', signal);
      console.log('(simulate) ポジション:', position);
      console.log('(simulate) 枚数:', amount)
      // TODO: CLOSEしたときに想定利益、総利益、利益率、勝率を表示
    }, LOOP_TIME * 1000);
  } catch (err) {
    console.log(err);
  }
}

simpleBotSimulate();