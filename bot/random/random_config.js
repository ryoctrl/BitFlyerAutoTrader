exports.strategy = {
  randomLimit: 0.3,
  greedy: false,
}

exports.simulator = {
  amount: 1.0, // 1回に取引するBTC
  loopTime: 60, // 秒単位
  // TODO: 想定損益の幅
}

exports.backtest = {
  amount: 1.0,
  candleSize: 15, // 15分足
  historyCount: 4 * 24, // バックテスト対象のローソク足の数
}

// 本番
// TODO: コメントをREADMEに切り出し
exports.trader = {
  amount: 0.001, // 1回のトレードの取引枚数
  delay: 10, // 注文を開始するまでにdelay秒待つ
  entryType: 'LIMIT', // LIMIT: 指値, MARKET: 成行
  exitType: 'MARKET',
  profitLimitFlag: false,
  profitLimit: 0, // JPY
  lossLimitFlag: true,
  lossLimit: -100, // JPY (負の値)
  shutdownFlag: true,
  shutdownLimit: -1000, // JPY (負の値)
}