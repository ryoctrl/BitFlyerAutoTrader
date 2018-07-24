const moment = require('moment');
const io = require('socket.io-client');

//独自モジュール読み込み
const workDir = process.cwd();
const Strategy = require(workDir + '/bot/vixrsi/strategy');
const CwUtil = require(workDir + '/cryptowatch/cwutil');
const VIXConfig = require(workDir + '/bot/vixrsi/vixrsi_config');
const SECRET = require(workDir + '/secret.json');
const Util = require(`${workDir}/utilities/util`).Util;
const BitFlyer = require(workDir + '/api/bitflyer').BitFlyer;
const util = new Util();
const bfAPI = new BitFlyer(SECRET.API_KEY, SECRET.API_SECRET);

//TODO: configのjsonを整理
const CANDLE_SIZE = VIXConfig.trader.candleSize;
const PD = VIXConfig.vixStrategyConf.pd;
const LB = VIXConfig.vixStrategyConf.lb;
const ORDER_SIZE = VIXConfig.trader.amount;
const LEVERAGE = VIXConfig.trader.leverage;
const LOSSCUT_PERCENTAGE = VIXConfig.trader.losscutPercentage;
const PROFIT_PERCENTAGE = VIXConfig.trader.profitPercentage;

//定数定義
const LOGNAME = 'vixrsi';

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
        console.log(`BestBidSetTo: ${message.best_bid}, BestAskSetTo: ${message.best_ask}`);
    }
    bestBid = message.best_bid;
    bestAsk = message.best_ask;
});

socket.on(FX_EXECUTIONS_CHANNEL, message => {
    fxBTCJPY = message[0].price;
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
//ロスカット時のポジション決済フラグ
let positionExited = false;
//現在のポジション
let position = 'CLOSED';
//Strategyから渡されるシグナル
let signal = 'HOLD';
//動作間隔 == ローソク足間隔
let interval = 60;
//建玉所持中フラグ
let whilePositioning = false;
//利確フラグ
let secureProfit = false;
//利確認識フラグ
let secureProfitDetected = false;
//利食い中のフラグ
let takeProfitting = false;
//ロスカット認識時のポジション
let losscutSignal = '';
//ロスカット中のフラグ
let losscutting = false;
//ロギング用のメッセージ
let logMessage = '';
//注文用Object
let order = {
    product_code: 'FX_BTC_JPY',
    child_order_type: 'MARKET',
    price: 0,
    size: ORDER_SIZE,
};

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
    losscutIfNeeded();
    takeProfitIfNeeded();
}

///
/// 必要であればLosscutを行う
/// TODO: オーダー処理を切り出してDRY原則に適応
///
///
const losscutIfNeeded = async() => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return;

    if (checkLosscut() && !losscutting) {
        losscutting = true;
        console.log(`【ロスカット】, 評価損益:${positionValuation}, 証拠金:${currentCollateral}, 基準値: ${-(currentCollateral * (LOSSCUT_PERCENTAGE / 100))}`);
        if (currentPosition === 'LONG') {
            order.side = 'SELL';
            losscutSignal = 'BUY';
        } else if (currentPosition === 'SHORT') {
            order.side = 'BUY';
            losscutSignal = 'SELL';
        }
        order.size = numPosition * ORDER_SIZE;
        order.child_order_type = 'MARKET';
        order.price = 0;

        let childOrder = await bfAPI.sendChildorder(order);
        if (childOrder.child_order_acceptance_id) {
            logMessage += `ポジション:${position}, 取引枚数:${numPosition * order.size}BTC\n`;
            positionExitProcess();

            losscutting = false;


            logMessage += `ロスカットを実行しました. 損失:${positionValuation}`;

            util.logging(LOGNAME, logMessage);
            console.log(childOrder);
        } else {
            losscutting = false;
            console.log("何らかのエラーにより決済注文が通りませんでした");
            console.log(childOrder);
        }
    }
}

///
/// 証拠金と評価評価損益からロスカットの可否を返す
///
const checkLosscut = () => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return false;

    //評価損益 が -1 * (証拠金 * (LOSSCUT_PERCENTAGE / 100)以下である場合
    return positionValuation <= -(currentCollateral * (LOSSCUT_PERCENTAGE / 100));
};

///
/// 証拠金と評価損益から利確の可否を返す
///
const checkSecureProfit = () => {
    if (numPosition == 0 || positionValuation == -1 || currentCOllateral == -1) return false;
    return positionValuation >= currentCollateral * (PROFIT_PERCENTAGE / 100);
};



const takeProfitIfNeeded = async() => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return;

    if (checkSecureProfit() && !takeProfitting) {
        takeProfitting = true;

        console.log(`【利食い】, 評価損益:${positionValuation}, 証拠金:${currentCollateral}, 基準値: ${currentCollateral * (LOSSCUT_PERCENTAGE / 100)}`);
        if (currentPosition === 'LONG') {
            order.side = 'SELL';
        } else if (currentPosition === 'SHORT') {
            order.side = 'BUY';
        }
        order.size = numPosition * ORDER_SIZE;
        order.child_order_type = 'MARKET';
        order.price = 0;

        let childOrder = await bfAPI.sendChildorder(order);
        if (childOrder.child_order_acceptance_id) {
            logMessage += `ポジション:${position}, 取引枚数:${numPosition * order.size}BTC\n`;
            positionExitProcess();

            takeProfitting = false;


            logMessage += `利食いを実行しました.　利益:${positionValuation}`;

            util.logging(LOGNAME, logMessage);
            console.log(childOrder);
        } else {
            takeProfitting = false;
            console.log("何らかのエラーにより決済注文が通りませんでした");
            console.log(childOrder);
        }
    }
}

///
/// 証拠金とBTCFXの現在価格から最大建玉数を算出する
/// 切り捨て(証拠金 / (現在価格 * 発注単価(最小0.01) / レバレッジ(15));
/// 切り捨て(2000 / (600000 * 0.01 / 15)) => 5
///
const getMaxPosition = async() => {
    currentCollateral = (await bfAPI.getCollateral()).collateral;

    console.log(`証拠金:${currentCollateral}円`);
    if (fxBTCJPY == -1) {
        fxBTCJPY = (await bfAPI.getFXBoard()).mid_price;
    }
    let unitPrice = fxBTCJPY * ORDER_SIZE / LEVERAGE;
    let result = Math.floor(currentCollateral / unitPrice);
    console.log(`最大建玉数:${result}`);
    return result;
};

///
/// 現在の現物とFXとの価格乖離(%)を取得する
/// どちらかの最終取引価格が未受信であれば0を返す
/// 価格乖離 (%) = （Lightning FX 取引価格 ÷ Lightning 現物 （BTC/JPY）最終取引価格 − 1）× 100
/// 実装は公式サイトの説明通りの計算式とする
///
const getEstrangementPercentage = () => {
    if (fxBTCJPY == -1 || spotBTCJPY == -1) return 0;
    let estrangementPercentage = (fxBTCJPY / spotBTCJPY - 1) * 100;
    return estrangementPercentage;
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



// 変更点: メインの処理を関数に切り出し
const vixRSITrade = async() => {
    //プログラム開始時に最大ポジション数を算出する
    if (currentCollateral == -1) {
        currentCollateral = (await bfAPI.getCollateral()).collateral;
    }
    maxPosition = await getMaxPosition();
    logMessage = `最大建玉:${maxPosition}で開始します`;
    util.logging(LOGNAME, logMessage);
    //一定時間ごとにポジション移行の判断を行う
    try {
        let ohlc = {};
        while (true) {
            ohlc = await CwUtil.getOhlc(CANDLE_SIZE, PD + LB);
            signal = Strategy.vixRsiSignal(ohlc, position);
            position = Strategy.getNextPosition(position, signal);

            logMessage = `${moment(Date.now()).format('YYYY/MM/DD HH:mm:ss')} - ${signal},${position}`;
            util.logging(LOGNAME, logMessage);

            if (signal === 'EXIT') {
                if (positionExited || (!losscut && !secureProfit) && (currentPosition === 'NONE' || currentPosition === 'HOLD')) continue;

                if (currentPosition === 'LONG') {
                    order.side = 'SELL';
                    losscutSignal = 'BUY';
                } else if (currentPosition === 'SHORT') {
                    order.side = 'BUY';
                    losscutSignal = 'SELL';
                }
                order.size = numPosition * ORDER_SIZE;
                order.child_order_type = 'LIMIT';

                let tryOrderCount = 0;
                let trySFDContinueCount = 0;

                logMessage = `【手仕舞】ポジション:${position}, 取引枚数:${numPosition * order.size}BTC`;

                while (true) {
                    if (getEstrangementPercentage() >= 4.95) {
                        trySFDContinueCount++;
                        await sleepSec(1);
                        if (trySFDContinueCount < 10) continue;
                    }
                    if (currentPosition === 'LONG') {
                        order.price = bestBid;
                    } else if (currentPosition === 'SHORT') {
                        order.price = bestAsk;
                    }
                    let childOrder = await bfAPI.sendChildorder(order);

                    if (childOrder.child_order_acceptance_id) {
                        tryOrderCount++;

                        let id = childOrder.child_order_acceptance_id;
                        let result = await waitContractOrderForFiveSec(id);
                        if (result) {
                            logMessage += `, 約定金額:${order.price}, id:${id}`;
                            positionExitProcess();
                            util.logging(LOGNAME, logMessage);
                            break;
                        }

                        let errorMessage = '注文が5秒間約定しなかったためキャンセルします。';
                        util.logging(LOGNAME, errorMessage);
                        let cancelBody = {
                            product_code: 'FX_BTC_JPY',
                            child_order_acceptance_id: id
                        };
                        bfAPI.cancelChildorder(cancelBody);
                        if (tryOrderCount >= 5) {
                            errorMessage = '5回以上注文が通らなかったため成行で決済します。';
                            util.logging(LOGNAME, errorMessage);

                            order.child_order_type = 'MARKET';
                            order.price = 0;

                            let childOrder = await bfAPI.sendChildorder(order);

                            if (childOrder.child_order_acceptance_id) {
                                logMessage += `, 約定金額:成行, id:${childOrder.child_order_acceptance_id}`;

                                positionExitProcess();

                                util.logging(LOGNAME, logMessage);
                                break;
                            }
                        }
                    } else {
                        let errorMessage = '何らかのエラーにより決済注文が通らなかったため1秒後に再注文します。\n';
                        if (childOrder.error_message) errorMessage += childOrder.error_message;
                        util.logging(LOGNAME, errorMessage);
                        await sleepSec(1);
                    }
                }
            } else if (signal === 'BUY' || signal === 'SELL') {
                if (!(losscut && losscutSignal == signal) && numPosition < maxPosition) {

                    losscut = false;
                    losscutSignal = '';
                    order.side = signal;
                    order.size = ORDER_SIZE

                    let sfd = getEstrangementPercentage();
                    if (signal === 'SELL' || (signal === 'BUY' && sfd < 4.95)) {
                        let tryOrderCount = 0;
                        while (true) {
                            if (signal === 'BUY' && bestAsk != -1) {
                                order.child_order_type = 'LIMIT';
                                order.price = bestAsk;
                            } else if (signal === 'SELL' && bestBid != -1) {
                                order.child_order_type = 'LIMIT';
                                order.price = bestBid;
                            }
                            let childOrder = await bfAPI.sendChildorder(order);
                            if (childOrder.child_order_acceptance_id) {
                                tryOrderCount++;

                                let id = childOrder.child_order_acceptance_id;
                                let result = await waitContractOrderForFiveSec(id);
                                if (result) {
                                    positions.push(order.price);
                                    numPosition++;
                                    currentPosition = position;
                                    whilePositioning = true;
                                    positionExited = false;
                                    logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数:${order.size}BTC, 約定価格:${order.price}, id:${id}`;
                                    util.logging(LOGNAME, logMessage);
                                    break;
                                }

                                let errorMessage = '注文が5秒間約定しなかったためキャンセルします。';
                                util.logging(LOGNAME, errorMessage);
                                let cancelBody = {
                                    product_code: 'FX_BTC_JPY',
                                    child_order_acceptance_id: id
                                };
                                bfAPI.cancelChildorder(cancelBody);
                            } else {
                                let errorMessage = '何らかエラーにより正常に発注できませんでした。\n';
                                if (childOrder.error_mssage) errorMessage += childOrder.error_message;
                                util.logging(LOGNAME, errorMessage);
                                await sleepSec(1);
                            }

                            if (tryOrderCount >= 5) {
                                errorMessage = `5回以上注文が通らなかったため今回の注文をスルーします。`
                                util.logging(LOGNAME, errorMessage);
                                break;
                            }
                        }
                    } else if (signal === 'BUY' && sfd >= 4.9) {
                        logMessage = `乖離率が${sfd}%でSFDを徴収される可能性があるためエントリーをスルーしました。`;
                        util.logging(LOGNAME, logMessage);
                    } else {
                        logMessage = `何らかの原因により注文をスルーしました。`;
                        util.logging(LOGNAME, logMessage);
                    }
                } else {
                    logMessage = `ロスカット中または建玉数が限度に達しているのでエントリーをスルーしました。`;
                    util.logging(LOGNAME, logMessage);
                }
            }
            await sleepSec(interval * CANDLE_SIZE - 1);
        }
    } catch (error) {
        console.log(error);
    }
};

const waitContractOrderForFiveSec = async(id) => {
    let orders = null;
    for (let count = 0; count < 5; count++) {
        orders = await bfAPI.getChildorders(id);
        if (orders.length && orders[0].child_order_state === 'COMPLETED') return true;
        await sleepSec(1);
    }
}

const sleepSec = async(seconds) => {
    const interval = 1000 * seconds;
    return new Promise(resolve => setTimeout(resolve, interval));
};

const vixRSIBot = () => {
    console.log('[稼働開始]');
    vixRSITrade();
};

vixRSIBot();