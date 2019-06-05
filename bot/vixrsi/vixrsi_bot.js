const moment = require('moment');
const io = require('socket.io-client');

//独自モジュール読み込み
const workDir = process.cwd();
const Strategy = require(workDir + '/bot/vixrsi/strategy');
//const CwUtil = require(workDir + '/cryptowatch/cwutil');
const CwUtil = require(`${workDir}/api/chartUtil`);
const VIXConfig = require(workDir + '/bot/vixrsi/vixrsi_config');
const util = require(`${workDir}/util`);
const BitFlyer = require(workDir + '/api/bitflyer').BitFlyer;
const bfAPI = new BitFlyer(process.env.API_KEY, process.env.API_SECRET);
const Trader = require(`${workDir}/models/Trader`);
Trader.trader = new Trader(process.env.API_KEY, process.env.API_SECRET);
const { Deal, STATES } = require('../../models/Deal');

//TODO: configのjsonを整理
const CANDLE_SIZE = VIXConfig.trader.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;
const ORDER_SIZE = VIXConfig.trader.amount;
const LEVERAGE = VIXConfig.trader.leverage;

//リアルタイムAPIの準備/設定
const FX_TICKER_CHANNEL = "lightning_ticker_FX_BTC_JPY";
const STREAM_URI = "https://io.lightstream.bitflyer.com";
const FX_EXECUTIONS_CHANNEL = 'lightning_executions_FX_BTC_JPY';
const SPOT_EXECUTIONS_CHANNEL = 'lightning_executions_BTC_JPY';
const socket = io(STREAM_URI, { transports: ["websocket"] });
socket.on("connect", () => {
    socket.emit("subscribe", FX_TICKER_CHANNEL);
    socket.emit("subscribe", FX_EXECUTIONS_CHANNEL);
    socket.emit("subscribe", SPOT_EXECUTIONS_CHANNEL);
});

//Tickerの受信
socket.on(FX_TICKER_CHANNEL, message => {
    if (bestBid == -1 || bestAsk == -1) {
        util.log(`BestBidSetTo: ${message.best_bid}, BestAskSetTo: ${message.best_ask}`);
    }
    bestBid = message.best_bid;
    bestAsk = message.best_ask;
});

socket.on(FX_EXECUTIONS_CHANNEL, message => {
    fxBTCJPY = message[0].price;
    updateOhlc(message[0].exec_date, message[0].price);
    calcPositionVlauation();
});

socket.on(SPOT_EXECUTIONS_CHANNEL, message => {
    spotBTCJPY = message[0].price;
});

//最高値買い価格
let bestBid = -1;
//最安値売り価格
let bestAsk = -1;
//最大ポジション数
let maxPosition = 0;
//現物の最終取引価格
let spotBTCJPY = -1;
//FXの最終取引価格
let fxBTCJPY = -1;
//現在のポジションの評価損益
let positionValuation = -1;
//現在のポジションの約定金額一覧
let positions = [];
//現在の建玉合計
let numPosition = 0;
//現在の証拠金
let currentCollateral = -1;
//現在のポジション
let currentPosition = 'CLOSED';
//ロスカットフラグ
let losscut = false;
//現在のポジション
let position = 'CLOSED';
//Strategyから渡されるシグナル
let signal = 'HOLD';
//動作間隔 == ローソク足間隔
let interval = 60;
//ロスカット期間のカウンタ
let losscuttingCount = 0;
//ロギング用のメッセージ
let logMessage = '';

///
/// fxBTCJPYの価格から現状の評価損益を設定する
/// 
///
///
const calcPositionVlauation = () => {
    if (numPosition == 0 || positions.length == 0) return;
    let averagePositionPrice = 0;
    for (let position of positions) {
        averagePositionPrice += position;
    }
    averagePositionPrice /= numPosition;
    if (currentPosition === 'LONG') {
        positionValuation = (fxBTCJPY - averagePositionPrice) * ORDER_SIZE * numPosition;
    } else if (currentPosition === 'SHORT') {
        positionValuation = (averagePositionPrice - fxBTCJPY) * ORDER_SIZE * numPosition;
    }
}

///
/// 証拠金とBTCFXの現在価格から最大建玉数を算出する
/// 切り捨て(証拠金 / (現在価格 * 発注単価(最小0.01) / レバレッジ(15));
/// 切り捨て(2000 / (600000 * 0.01 / 15)) => 5
///
const getMaxPosition = async() => {
    currentCollateral = (await bfAPI.getCollateral()).collateral;

    util.log(`証拠金:${currentCollateral}円`);
    if (fxBTCJPY == -1) {
        fxBTCJPY = (await bfAPI.getFXBoard()).mid_price;
    }
    let unitPrice = fxBTCJPY * ORDER_SIZE / LEVERAGE;
    let result = Math.floor(currentCollateral / unitPrice);
    util.log(`最大建玉数:${result}`);
    return result;
};

///
/// 現在の現物とFXとの価格乖離(%)を少数第二位まで取得する
/// どちらかの最終取引価格が未受信であれば0を返す
/// 価格乖離 (%) = （Lightning FX 取引価格 ÷ Lightning 現物 （BTC/JPY）最終取引価格 − 1）× 100
/// 実装は公式サイトの説明通りの計算式とする
///
const getEstrangementPercentage = () => {
    if (fxBTCJPY == -1 || spotBTCJPY == -1) return 0;
    let estrangementPercentage = (fxBTCJPY / spotBTCJPY - 1) * 100;
    let n = 2;
    return Math.floor(estrangementPercentage * Math.pow(10, n)) / Math.pow(10, n);
}

///
/// 決済時の各種変数の初期化を行う
///
const positionExitProcess = async() => {
    positionExited = true;
    numPosition = 0;
    positions = [];
    positionValuation = -1;
    currentPosition = 'CLOSED';
    position = 'CLOSED';
    whilePositioning = false;
    secureProfit = false;
    secureProfitDetected = false;
    maxPosition = await getMaxPosition();
}

const updateOhlc = (execDate, price) => {
    if (ohlc.length != PD + LB) return;
    CwUtil.updateOhlc(execDate, price, ohlc);

};

let ohlc = [];
let deals = [];

// 変更点: メインの処理を関数に切り出し
const vixRSITrade = async() => {
    //プログラム開始時に最大ポジション数を算出する
    if (currentCollateral == -1) {
        currentCollateral = (await bfAPI.getCollateral()).collateral;
    }

    //ohlcを初期化
    util.log('OHLCデータを取得中...30秒程度時間がかかります。');
    ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
    util.log(`OHLCデータを取得しました. データ数:${ohlc.length}`);
    maxPosition = await getMaxPosition();
    logMessage = `最大建玉:${maxPosition}で開始します`;
    util.log(logMessage);
    //一定時間ごとにポジション移行の判断を行う
    try {
        while (true) {
            if (losscut && losscuttingCount >= 60) {
                losscut = false;
                losscutSignal = '';
                losscuttingCount = 0;
            }
            signal = Strategy.vixRsiSignal(ohlc, position);
            position = Strategy.getNextPosition(position, signal);

            logMessage = `${signal},${position}`;
            util.log(logMessage);

            if (signal === 'EXIT') {
                let amounts = 0;
                let prices = 0;
                deals.map(deal => {
                    prices += deal.settle()
                    amounts += deal.lot;
                });
                delas = [];
                logMessage = `【手仕舞】ポジション:${position}, 取引枚数:${amounts}BTC, 約定金額:${prices / amounts}`;
                util.log(logMessage);
            } else if (signal === 'BUY' || signal === 'SELL') {
                const deal = new Deal(signal, amount);
                const price = await deal.deal();
                const id = deal.deal_child_order_acceptance_id;
                const sfd = getEstrangementPercentage();
                logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数:${amount}BTC, 約定価格:${price}, id:${id}, SFD:${sfd}`;
                util.log(logMessage);
                deals.push(deal);
            }
            await util.sleep((interval * CANDLE_SIZE - 1) * 1000);
        }
    } catch (error) {
        util.log(error);
    }
};

const vixRSIBot = () => {
    util.log('[稼働開始]');
    vixRSITrade();
};

vixRSIBot();
