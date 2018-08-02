exports.vixStrategyConf = {
	limit: 40, //RSI Limit
	pd: 22, //Lookback period standard deviation high
	bbl: 20, //Bollinger band length
	mult: 2, //Bollinger band Standard Deviation Up
	lb: 50, //Lookback period percentile high
	ph: 0.85, //highest percentile
	pl: 1.01, //lowest percentile, 1.10 = 90%, 1.05 = 95%, 1.01 =99%
	greedy: true,
}

exports.backtest = {
	historyCount: 8 * 48, //バックテスト対象のローソク足の数.pd + lbより大きい必要がある.
}

// 本番
// TODO: コメントをREADMEに切り出し
exports.trader = {
	amount: 0.01, //トレードの単位当たりの発注数
	leverage: 15, //レバレッジ
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
	losscutPercentage: 4, 	//証拠金に対するロスカット発動基準となる評価損益の割合
	profitPercentage: 4	//証拠金に対する利確発動基準となる評価損益の割合
}
