var RandomConfig = require('./random_config.js')
var RANDOM_LIMIT = RandomConfig.strategy.randomLimit;
var GREEDY = RandomConfig.strategy.greedy;

function getSignal (position) {
  if (position === 'LONG') return 'SELL';
  if (position === 'SHORT') return 'BUY';
  if (position === 'CLOSED') { // ノーポジをとりあえずCLOSEDと呼ぶ
    // ポジションを持っていないとき、ランダムで売買かノーポジを続ける
    randomValue = Math.random();
    if (randomValue < RANDOME_LIMIT) {
      return 'BUY';
    } else if (randomValue > 1 - RANDOM_LIMIT) {
      return 'SELL';
    } else {
      return 'HOLD'; // ポジションを変えないことをとりあえずHOLDと呼ぶ
    }
  }

  throw new Error('Error in RandomStrategy: getSignal');
}

function getNextPosition (position, signal) {
  if (position === 'LONG') {
    if (signal === 'SELL' && GREEDY) {
      return 'SHORT';
    } else if (signal === 'SELL') {
      return 'CLOSED';
    } else {
      return 'LONG';
    }
  }
  if (position === 'SHORT') {
    if (signal === 'BUY' && GREEDY) {
      return 'LONG';
    } else if (signal === 'BUY') {
      return 'CLOSED';
    } else {
      return 'SHORT';
    }
  }
  if (position === 'CLOSED' && signal === 'BUY') return 'LONG';
  if (position === 'CLOSED' && signal === 'SELL') return 'SHORT';
  if (signal === 'HOLD') return position;
  
  throw new Error('Error in RandomStrategy: getNextPosition');
}