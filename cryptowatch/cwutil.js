// cryptowatchからn分足のOHLCを、過去hist本分取得する
const axios = require('axios');
const moment = require('moment');
const querystring = require('querystring');
const BASE_URL = 'https://api.cryptowat.ch/markets/bitflyer/btcfxjpy/ohlc?';
const getOhlc = async (n, hist) => {
    const now = moment();
    const beginTime = now.unix() - (n * 60) * hist;
    const nSec = 60 * n;
    const obj = {
        periods: nSec,
        after: beginTime
    };
    const url = BASE_URL + querystring.stringify(obj);
    const axiosOpts = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }

    }
    const response = await axios.get(url, axiosOpts).then(res => res.data);
    const candleStr = String(nSec);
    return response['result'][candleStr].slice(1, -1);
};

module.exports.getOhlc = getOhlc;

// CryptoWatchから来る形式を使いやすいように変換
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

