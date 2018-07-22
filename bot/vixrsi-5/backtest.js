var VIXConfig = require('./vixrsi_config.js')
var Strategy = require('./strategy.js')
var CwUtil = require('../../cryptowatch/cwutil.js');
var moment = require('moment');

// Easy Mode
// 1. 始値で必ず売買できることにする
// 2. 注文が必ず通ることにする
const backtestEasy = async () => {
	//初期化
	let position = 'CLOSED';
	let longPrice = 0;
	let shortPrice = 0;
	let profit = 0; //ポジションを解消したときの損益
	let totalProfit = 0; //合計の損益
	let winCount = 0; //利益が出た取引の回数
	let totalCount = 0; //合計の取引回数
	//今回はマルチポジショニングはしないので使わない
	//let longPrices = [];
	//let shortPrices = [];

	const amount = VIXConfig.trader.amount;
	const candleSize = VIXConfig.trader.candleSize;	//15分足
	const historyCount = VIXConfig.backtest.historyCount; //24時間
	const pd = VIXConfig.vixStrategyConf.pd;
	const lb = VIXConfig.vixStrategyConf.lb

	//過去データ読み込み
	let ohlcHist = await CwUtil.getOhlc(candleSize, historyCount + pd + lb);
	let openHist = CwUtil.getOpens(ohlcHist); //初値の履歴
	let closeTimeHist = CwUtil.getTimes(ohlcHist); //終了時刻のタイムスタンプ

	//売買による損益計算
	for(let i = 0; i < historyCount; i++) {
		//対象とするローソク足の切り出し
		let ohlcTarget = ohlcHist.slice(i, i + pd + lb);
		let signal = Strategy.vixRsiSignal(ohlcTarget, position);
		let nextPosition = Strategy.getNextPosition(position, signal);
		//売買に関する履歴
		//始値で売買した事にする
		if(signal === 'BUY') {
			let entryTime = moment(closeTimeHist[i - 1]).format(('YYYY/MM/DD HH:mm:ss'));
			console.log(`【LONG】${entryTime}`);
			longPrice = openHist[i];
		} else if(signal === 'SELL') {
			let entryTime = moment(closeTimeHist[i - 1]).format(('YYYY/MM/DD HH:mm:ss'));
			console.log(`【SHORT】${entryTime}`);
			shortPrice = openHist[i];
		} else if(signal === 'EXIT' && position === 'LONG') {
			//ポジション解消時に損益を計算
			profit = amount * (openHist[i] - longPrice); //売値 > 買値の時利益
			//終了時刻基準になっているので-1する
			exitTime = moment(closeTimeHist[i - 1]).format(('YYYY/MM/DD HH:mm:ss'));
			console.log(`【利確/損切時刻】${exitTime} 【利益】${profit}`);
			totalProfit += profit;
			if(profit > 0) winCount++;
			totalCount++;
			longPrice = 0;
		} else if(signal === 'EXIT' && position === 'SHORT') {
			profit = amount * (shortPrice - openHist[i]); //売値 > 買値の時利益
			exitTime = moment(closeTimeHist[i - 1]).format(('YYYY/MM/DD HH:mm:ss'));
			console.log(` 【利確/損切時刻】${exitTime} 【利益】${profit}`);
			totalProfit += profit;
			if(profit > 0) winCount++;
			totalCount++;
			shortPrice = 0;
		}
		//詳細の取引履歴は外部ファイルに出力したい
		position = nextPosition;
	}
	console.log(`推定総利益: ${totalProfit}`);
	console.log(`推定勝率: ${winCount / totalCount}`);
	console.log('----------');
}

backtestEasy();
