var RandomConfig = require('./random_config.js')
var Strategy = require('./strategy.js')

var AMOUNT = RandomConfig.simulator.amount;
var LOOP_TIME = RandomConfig.simulator.loopTime
// 変更点: シミュレート用の関数を追加
function randomBotSimulate () {
  var position = 'CLOSED';
  var signal = 'HOLD';
  var amount = 0;
  try {
    // 1分毎にポジションを移行する
    setInterval(() => {
      signal = Strategy.getRandomSignal(position);
      nextPosition = Strategy.getNextPosition(position, signal);
      amount = RandomConfig.simulator.amount
      console.log('(simulate) シグナル:', signal);
      if (nextPosition !== position) {
        console.log('(simulate) 移行後のポジション:', nextPosition);
        console.log('(simulate) 注文枚数:', amount);
        position = nextPosition;
      }
      console.log('----------');
      // TODO: CLOSEしたときに想定利益、総利益、利益率、勝率を表示
    }, LOOP_TIME * 1000);
  } catch (err) {
    console.log(err);
  }
}

randomBotSimulate();