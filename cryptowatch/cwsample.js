var CwUtil = require('./cwutil.js');
var moment = require('moment');

async function cwSample () {
  var candles1 = await CwUtil.getOhlc(1, 10);
  console.log(candles1);
  var candles5 = await CwUtil.getOhlc(5, 10);
  console.log(candles5);
  var candles15 = await CwUtil.getOhlc(15, 10);
  console.log(candles15);
}
// cwSample();

// 5分足の高値安値を過去10本分とってくる
async function highLowSample () {
  var candles = await CwUtil.getOhlc(5, 10);
  var timestamps = CwUtil.getTimes(candles)
  var highs = CwUtil.getHighs(candles)
  var lows = CwUtil.getLows(candles)
  for (var i = 0; i < candles.length; i++) {
    t = moment(timestamps[i]).format(('YYYY/MM/DD HH:mm:ss'));
    console.log('終了時刻:', t, '高値:', highs[i], '安値:', lows[i]);
  }
}

highLowSample();