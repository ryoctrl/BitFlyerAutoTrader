/*
既存のCryptoWatchAPIのresponseの形式で実装する.
[
	[CloseTime, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume],
	[CloseTime, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume],
]
*/

const workDir = process.cwd();
const BitFlyer = require('./bitflyer').BitFlyer;
const api = new BitFlyer(null, null);
const util = require('../util');

///
/// BitFlyerRESTAPIの約定履歴からn分足のチャートをhist本作成する
///
const getOhlc = async(n, hist) => {
	//n = 1(分足), hist= 72(本分)
	ohlcList = [];
	ohlc = [];
	let before = 0;
	while(ohlcList.length < hist) {
		let executions = await api.getExecutions(null, 500, before, null);
		for(const execution of executions) {
			let ts = generateTimestamp(execution.exec_date);
			if(ohlc[0] && ohlc[0] != ts) {
				ohlcList.unshift(ohlc);
				ohlc = [];
			}
			if(!ohlc[0]) ohlc[0] = ts;
			ohlc[1] = execution.price;
			ohlc[2] = ohlc[2] && ohlc[2] > execution.price? ohlc[2] : execution.price;
			ohlc[3] = ohlc[3] && ohlc[3] < execution.price? ohlc[3] : execution.price;
			if(!ohlc[4]) ohlc[4] = execution.price;
		}
		before = executions[executions.length - 1].id;
	}
	return ohlcList;
};

///
/// 与えられた執行時間, 価格からOHLCを更新する
///
const updateOhlc = (execDate, price, ohlcList) => {
	if(ohlcList.length == 0) return;
	let ts = generateTimestamp(execDate);
	let latestOhlc = ohlcList[ohlcList.length - 1]
	if(latestOhlc[0] != ts) {
		let ohlc = [];
		ohlc[0] = ts;
		ohlc[1] = price;
		ohlc[2] = price;
		ohlc[3] = price;
		ohlc[4] = price;
		ohlcList.push(ohlc);	
		ohlcList.shift();
		let sec = ohlcList[ohlcList.length - 2];
		let logMessage = `${sec[0]}, ${sec[1]}, ${sec[2]}, ${sec[3]}, ${sec[4]}`;
        util.log(logMessage);
	} else {
		latestOhlc[2] = latestOhlc[2] > price ? latestOhlc[2] : price;
		latestOhlc[3] = latestOhlc[3] < price ? latestOhlc[3] : price;
		latestOhlc[4] = price;
	}
	return ohlcList;
};

//
// APIのレスポンスに付属している執行時間からプログラム内で用いるタイムスタンプに変換する
//
const generateTimestamp = (execDate) => {
	let date = new Date(execDate);
	return Date.parse(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0))) / 1000;
};

module.exports.getOhlc = getOhlc;
module.exports.updateOhlc = updateOhlc;

exports.getTimes = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[0] * 1000);
}

exports.getOpens = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[1]);
}

exports.getHighs = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[2]);
}

exports.getLows = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[3])  
}

exports.getCloses = function (ohlc_list) {
  return ohlc_list.map(ohlc => ohlc[4]);
}

