var VIXConfig = require('./vixrsi_config.js')
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
  var candleSize = VIXConfig.backtest.candleSize; // 15分足
  var historyCount = VIXConfig.backtest.historyCount; // 24時間分
  var pd = VIXConfig.vixStrategyConf.pd;
  var lb = VIXConfig.vixStrategyConf.lb;

  // 過去データの読み込み
  var ohlcHist = await CwUtil.getOhlc(candleSize, historyCount + pd + lb);
  var openHist = CwUtil.getOpens(ohlcHist); // 始値の履歴
  var closeTimeHist = CwUtil.getTimes(ohlcHist); // 終了時刻のタイムスタンプ

  // 売買による損益を計算
  for (var i = 0; i < historyCount; i++) {
    // 対象とするローソク足の切り出し
    var ohlcTarget = ohlcHist.slice(i, i + pd + lb);
    signal = Strategy.vixRsiSignal(ohlcTarget, position);
    nextPosition = Strategy.getNextPosition(position, signal);
    amount = VIXConfig.backtest.amount
    // 売買に関する履歴
    // 始値で売買したことにする
    if (position === 'CLOSED' && signal === 'BUY') {
      longPrice = openHist[i];
    }
    if (position === 'CLOSED' && signal === 'SELL') {
      shortPrice = openHist[i];
    }
    // ポジションを解消したときに損益を計算する
    if (position === 'LONG' && signal === 'EXIT') {
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
    if (signal === 'SELL' && signal === 'EXIT') {
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