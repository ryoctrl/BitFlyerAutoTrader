exports.vixStrategyConf = {
  limit: 40, // RSI Limit
  pd: 22, // LookBack Period Standard Deviation High
  bbl: 20, // Bollinger Band Length
  mult: 2, // Bollinger Band Standard Devaition Up
  lb: 50, // Look Back Period Percentile High
  ph: 0.85, // Highest Percentile
  pl: 1.01, // Lowest Percentile, 1.10=90%, 1.05=95%, 1.01=99%"
  greedy: false,
}

exports.vixSimulatorConf = {
  candleSize: 1,
  greedy: false,
  amount: 0.1, // 1回に取引するBTC
  loopTime: 60, // 秒単位
  // TODO: 想定損益の幅
}

exports.backtest = {
  amount: 0.1,
  candleSize: 1, // n分足、60がおすすめ
  historyCount: 8 * 48, // バックテスト対象のローソク足の数。pd + lbより大きい必要がある
}

// 本番
// TODO: コメントをREADMEに切り出し
exports.trader = {
  amount: 0.001, // 1回のトレードの取引枚数。
  candleSize: 1, // n分足、本番では60がおすすめ
  delay: 10, // TODO: 注文を開始するまでにdelay秒待つ
  entryType: 'LIMIT', // LIMIT: 指値, MARKET: 成行
  exitType: 'MARKET',
  profitLimitFlag: false,
  profitLimit: 0, // JPY
  lossLimitFlag: true,
  lossLimit: -100, // JPY (負の値)
  shutdownFlag: true,
  shutdownLimit: -1000, // JPY (負の値)
}