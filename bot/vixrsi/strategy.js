// ライブラリ
const fs = require('fs');
const CwUtil = require('../../cryptowatch/cwutil.js');
const moment = require('moment');
const SD = require('technicalindicators').SD; // 標準偏差
const SMA = require('technicalindicators').SMA; // SMA
const WEMA = require('technicalindicators').WEMA; // Wilders Smoothing

// ストラテジーの設定
const VIXConfig = require('./vixrsi_config.js');
const VIX = VIXConfig.vixStrategyConf;

function vixRsiSignal(ohlc, position) {
  // ohlcを使いやすい形に変更
  const openRev = CwUtil.getOpens(ohlc).reverse();
  const highRev = CwUtil.getHighs(ohlc).reverse();
  const lowRev = CwUtil.getLows(ohlc).reverse();
  const closeRev = CwUtil.getCloses(ohlc).reverse();

  var wvf = []; // Williams Vix Fix
  // 合計長さの最小はlb+pd e.g.72 closeRev.length > lb + pb
  for (var i = 0; i < VIX.lb; i++) {
    var closeMax = Math.max.apply(null, closeRev.slice(i, i + VIX.pd));
    wvf[i] = (closeMax - lowRev[i]) / closeMax * 100;
  }
  // iの小さい方が新しいデータであることに注意
  const sDev = VIX.mult * SD.calculate({period : VIX.bbl, values : wvf})[0]
  // const sDev = standardDeviation(wvf.slice(0, VIX.bbl));
  const midLine = SMA.calculate({period : VIX.bbl, values : wvf})[0]; // ただの平均
  const lowerBand = midLine - sDev;
  const upperBand = midLine + sDev;
  const rangeHigh = Math.max.apply(null, wvf.slice(0, VIX.lb)) * VIX.ph;
  const rangeLow = Math.min.apply(null, wvf.slice(0, VIX.lb)) * VIX.pl;
  // Fast RSI
  var up = [];
  var down = [];
  for (var i = 0; i < VIX.lb; i++) {
    up[i] = Math.max(closeRev[i]-closeRev[i+1], 0); // 直前の終値との差分
    down[i] = -Math.min(closeRev[i]-closeRev[i+1], 0); // 直前の終値との差分
  }
  // TradingViewのRMAが出てきたら、WEMAを使う（か、自前で実装する）
  const fastUps = WEMA.calculate({period: 7, values: up.reverse()}); // Wilders Smoothing, ライブラリの都合上、時間の昇順に戻す
  const fastUp = fastUps[fastUps.length - 1]; // 最新のデータだけ取得
  const fastDowns = WEMA.calculate({period: 7, values: down.reverse()});
  const fastDown = fastDowns[fastDowns.length - 1];
  var fastRsi = 50;
  if (fastDown < 0.01) {
    fastRsi = 100;
  } else if (fastUp < 0.01) {
    fastRsi = 0;
  } else {
    fastRsi = 100 - (100 / (1 + fastUp / fastDown));
  }
  var body = [];
  for(var i = 0; i < 10; i++) {
    body[i] = closeRev[i] - openRev[i];
  }
  const abody = SMA.calculate({period : body.length, values : body})[0]; // ただの平均
  var upSignal = (wvf[0] >= upperBand || wvf[0] >= rangeHigh) && (fastRsi < VIX.limit) && (closeRev[0] < openRev[0]);
  var downSignal = (wvf[0] >= upperBand || wvf[0] >= rangeHigh) && (fastRsi > (100 - VIX.limit)) && (closeRev[0] > openRev[0]);
  var exitSignal = false;
  if (position === 'LONG') {
    if (closeRev[0] > openRev[0] && body[0] > abody / 3) {
      exitSignal = true;
    }
  } else if (position === 'SHORT') {
    if (closeRev[0] < openRev[0] && body[0] > abody / 3) {
      exitSignal = true;
    }
  } 

  // Signals
  if (!VIX.greedy) {
    if (upSignal && (position === 'SHORT')) return 'EXIT';
    if (upSignal && (position === 'CLOSED')) return 'BUY';
    if (downSignal && (position === 'LONG')) return 'EXIT';
    if (downSignal && (position === 'CLOSED')) return 'SELL';
    if (exitSignal) return 'EXIT';
  }
  // 基本的にこっちを使う
  if (VIX.greedy) {
    if (upSignal && (position === 'SHORT')) return 'EXIT';
    if (upSignal) return 'BUY';
    if (downSignal && (position === 'LONG')) return 'EXIT';
    if (downSignal) return 'SELL';
    if (exitSignal) return 'EXIT';
  }

  return 'HOLD'
}

function getNextPosition (position, signal) {
  if (!VIX.greedy) {
    if (position === 'LONG' && signal === 'EXIT') return 'CLOSED';
    if (position === 'SHORT' && signal === 'EXIT') return 'CLOSED';
    if (position === 'CLOSED' && signal === 'BUY') return 'LONG';
    if (position === 'CLOSED' && signal === 'SELL') return 'SHORT';
    if (signal === 'HOLD') return position;
  }
  // 基本的にこっちを使う
  if (VIX.greedy) {
    if (signal === 'EXIT') return 'CLOSED';
    if (signal === 'BUY') return 'LONG';
    if (signal === 'SELL') return 'SHORT';
    if (signal === 'HOLD') return position;
  }
  // ここは通らないはず!
  console.log('Error in getNextPosition function!');
}

module.exports.vixRsiSignal = vixRsiSignal;
module.exports.getNextPosition = getNextPosition;
