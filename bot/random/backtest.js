var RandomConfig = require('./random_config.js')
var Strategy = require('./strategy.js')
var CwUtil = require('../../cryptowatch/cwutil.js');
var moment = require('moment');

// Easy Mode
// 1. 始値で必ず売買できることにする
// 2. 注文が必ず通ることにする
async function backtestEasy () {
  // 初期化
  var position = 'CLOSED';
  var longPrice = 0;
  var shortPrice = 0
  var profit = 0; // ポジションを解消したときの損益
  var totalProfit = 0; // 合計の損益
  var winCount = 0; // 利益が出た取引の回数
  var totalCount = 0; // 合計の取引回数
  // 今回は買いましなどしないので使わない
  // var longPrices = [];
  // var shortPrices = [];

  // 設定の読み込み
  var candleSize = RandomConfig.backtest.candleSize; // 15分足
  var historyCount = RandomConfig.backtest.historyCount; // 24時間分

  // 過去データの読み込み
  var ohlcHist = await CwUtil.getOhlc(candleSize, historyCount); // 現在から7日分の履歴
  var openHist = CwUtil.getOpens(ohlcHist); // 始値の履歴
  var closeTimeHist = CwUtil.getTimes(ohlcHist); // 終了時刻のタイムスタンプ

  // 売買による損益を計算
  for (var i = 0; i < ohlcHist.length; i++) {
    signal = Strategy.getRandomSignal(position);
    nextPosition = Strategy.getNextPosition(position, signal);
    amount = RandomConfig.backtest.amount
    // 売買に関する履歴
    // 始値で売買したことにする
    if (position === 'CLOSED' && signal === 'BUY') {
      longPrice = openHist[i];
    }
    if (position === 'CLOSED' && signal === 'SELL') {
      shortPrice = openHist[i];
    }
    // ポジションを解消したときに損益を計算する
    if (position === 'LONG' && signal === 'SELL') {
      profit = amount * (openHist[i] - longPrice); // 売値 > 買値のとき利益
      // 終了時刻基準になっているので -1 する
      exitTime = moment(closeTimeHist[i-1]).format(('YYYY/MM/DD HH:mm:ss'));;
      console.log('【利確／損切時刻】', exitTime, '【利益】', profit); 
      totalProfit += profit;
      if (profit > 0) {
        winCount++;
      }
      totalCount++;
      longPrice = 0;

    }
    if (signal === 'SELL' && signal === 'BUY') {
      profit = amount * (shortPrice - openHist[i]); // 売値 > 買値のとき利益
      // 終了時刻基準になっているので -1 する
      exitTime = moment(closeTimeHist[i-1]).format(('YYYY/MM/DD HH:mm:ss'));;
      console.log('【利確／損切時刻】', exitTime, '【利益】', profit); 
      totalProfit += profit;
      if (profit > 0) {
        winCount++;
      }
      totalCount++;
      shortPrice = 0;
      // TODO: 詳細の取引履歴は外部ファイルに出力したい
    }
    position = nextPosition;
  }

  console.log('推定総利益:', totalProfit);
  console.log('推定勝率:', winCount / totalCount);
  console.log('----------');
}

backtestEasy();