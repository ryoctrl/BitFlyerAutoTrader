const calcBolingerBand = (ohlcDatas) => {
	if(!ohlcDatas.length || !ohlcDatas.length == 0) return;
	for(let ohlc of ohlc) {

	}

};

//ohlcデータからLength日単純移動平均を算出する.
//https://www.moneypartners.co.jp/support/tech/sma.html
//@param ohlcDatas: ohlcデータ配列 新しい順に格納しておく必要がある。
//@param length: SMA算出日数
//@return SMA配列
const sma = (ohlcDatas, length) => {
	if(!ohlcDatas.length || ohlcDatas.length < length + 1) return;
	let sma = [];
	let slc = [];
	for(let i = 0; i < ohlcDatas.length - length + 1; i++) {
		slc = ohlcDatas.slice(i, i + length);
		sma.push(sum(slc) / length);
	}
	return sma;
};


//ohlcデータからLength日指数平滑移動平均を算出する.
//
//@param ohlcDatas: ohlcデータ配列 新しい順に格納しておく必要がある.
//@param length: EMA算出日数
//@return EMA配列
const ema = (ohlcDatas, length) => {
	if(!ohlcDatas.length || ohlcDatas.length < length + 1) return;
	let ema = [];


};

//TODO: 配列先頭から時間順になるように考慮し直す
// ohlcデータからDMI指標を算出する.
// https://kabu.com/sp/investment/guide/technical/19.html
// @param ohlcDatas: ohlcデータ配列
// @param length: DMI算出数
// @return DMI{+DI, -DI, ADX}配列
const calcDMI = (ohlcDatas, length) => {
	if(!ohlcDatas.length || ohlcDatas.length < length + 1)  return;
	let dmiDatas = [];
	for(let i = ohlcDatas.length - 1; 
		i >= ohlcDatas.length - length; 
		i--) {
		//dmi初期化
		let dmi = {
			plusDI: 0,
			minusDI: 0,
			ADX: 0
		};
		let todayHigh = ohlcDatas[i][2];
		let todayLow = ohlcDatas[i][3];
		let yesterdayHigh = ohlcDatas[i - 1][2];
		let yesterdayLow = ohlcDatas[i - 1][3];

		let diffHigh = todayHigh - yesterdayHigh;
		let diffLow = yesterdayLow - todayLow;

		let plusDM = diffHigh, minusDM = diffLow;

		if(diffHigh == diffLow) {
			plusDM = 0;
			minusDM = 0;
		} else if(diffHigh > 0) {
			if(diffLow <= 0) {
				plusDM = diffHigh;
			} else if(diffHigh > diffLow) {
				plusDM = diffHigh;
			}
		} else if(diffLow > 0) {
			if(diffHigh <= 0) {
				minusDM = diffLow;
			} else if(diffLow > diffHigh) {
				minusDM = diffLow;
			}
		}
		let yesterdayClose = ohlcDatas[i - 1][4];
		let tr = Math.max(
				todayHigh - todayLow, 
				todayHigh - yesterdayClose, 
				yesterdayClose - todayLow
		);
		dmi.ADX = tr;
		//dmi.plusDI = plusDM / tr;
		//dmi.minusDI = minusDM / tr;
		dmi.plusDI = plusDM;
		dmi.minusDI = minusDM;
		dmiDatas.unshift(dmi);
	}

	return dmiDatas;
};


/** Utilities **/
//配列の合計値を算出
const sum = (ary) => {
	return ary.reduce( (prev, current, i, ary) => {
		return prev + current;
	});
};


module.exports.calcDMI = calcDMI;
