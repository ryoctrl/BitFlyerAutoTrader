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
//ロスカット期間のカウンタ
let losscuttingCount = 0;
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
        losscut = true;
        util.log(`【ロスカット】, 評価損益:${positionValuation}, 証拠金:${currentCollateral}, 基準値: ${-(currentCollateral * (LOSSCUT_PERCENTAGE / 100))}`);
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
            logMessage += `ポジション:${position}, 取引枚数:${order.size}BTC\n`;
            logMessage += `ロスカットを実行しました.損失:${positionValuation}`;
            util.log(logMessage);
            util.log(childOrder);


            positionExitProcess();
            losscutting = false;
        } else {
            losscutting = false;
            util.log("何らかのエラーにより決済注文が通りませんでした");
            util.log(childOrder);
        }
    }
}

///
/// 証拠金と評価評価損益からロスカットの可否を返す
///
const checkLosscut = () => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return false;

    return positionValuation <= -(currentCollateral * (LOSSCUT_PERCENTAGE / 100));
};

///
/// 証拠金と評価損益から利確の可否を返す
///
const checkSecureProfit = () => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return false;
    return positionValuation >= currentCollateral * (PROFIT_PERCENTAGE / 100);
};

const takeProfitIfNeeded = async() => {
    if (numPosition == 0 || positionValuation == -1 || currentCollateral == -1) return;

    if (checkSecureProfit() && !takeProfitting) {
        takeProfitting = true;

        util.log(`【利食い】, 評価損益:${positionValuation}, 証拠金:${currentCollateral}, 基準値: ${currentCollateral * (LOSSCUT_PERCENTAGE / 100)}`);
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
            logMessage += `ポジション:${position}, 取引枚数:${order.size}BTC\n`;
            logMessage += `利食いを実行しました. 利益:${positionValuation}`;
            util.log(logMessage);
            util.log(childOrder);

            positionExitProcess();
            takeProfitting = false;
        } else {
            takeProfitting = false;
            util.log("何らかのエラーにより決済注文が通りませんでした");
            util.log(childOrder);
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
                if (positionExited || (!losscut && !secureProfit) && (currentPosition === 'NONE' || currentPosition === 'HOLD')) continue;
                if (numPosition == 0) {
                    await util.sleep((interval * CANDLE_SIZE - 1) * 1000);
                    continue;
                }

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

                logMessage = `【手仕舞】ポジション:${position}, 取引枚数:${order.size}BTC`;

                while (true) {
                    if (getEstrangementPercentage() >= 4.95 && currentPosition === 'SHORT') {
                        trySFDContinueCount++;
                        await util.sleep(1000);
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
                            util.log(logMessage);
                            break;
                        }

                        let cancelBody = {
                            product_code: 'FX_BTC_JPY',
                            child_order_acceptance_id: id
                        };
                        await bfAPI.cancelChildorder(cancelBody);
			await util.sleep(1000);
                        let posList = await bfAPI.getPositions();
                        if (posList.length && posList.length < numPosition) {
                            logMessage += `, 約定金額:${order.price}, id:${id}`;
                            positionExitProcess();
                            util.log(logMessage);
                            break;
                        }
			let errorMessage = '決済注文が5秒間約定しなかったためキャンセルします。';
                        util.log(errorMessage);
                        if (tryOrderCount >= 5) {
                            errorMessage = '5回以上注文が通らなかったため成行で決済します。';
                            util.log(errorMessage);

                            order.child_order_type = 'MARKET';
                            order.price = 0;

                            let childOrder = await bfAPI.sendChildorder(order);

                            if (childOrder.child_order_acceptance_id) {
                                logMessage += `, 約定金額:成行, id:${childOrder.child_order_acceptance_id}`;

                                positionExitProcess();

                                util.log(logMessage);
                                break;
                            }
                        }
                    } else {
                        let errorMessage = '何らかのエラーにより決済注文が通らなかったため1秒後に再注文します。\n';
                        if (childOrder.error_message) errorMessage += childOrder.error_message;
                        util.log(order);
                        util.log(errorMessage);
                        await util.sleep(1000);
                    }
                }
            } else if (signal === 'BUY' || signal === 'SELL') {
                if (!(losscut && losscutSignal == signal) && numPosition < maxPosition) {

                    losscut = false;
                    losscutSignal = '';
                    order.side = signal;
                    order.size = ORDER_SIZE

                    let sfd = getEstrangementPercentage();
                    if (canEntry(signal, sfd)) {
                        let tryOrderCount = 0;
                        while (true) {
                            if (tryOrderCount < 10 && signal === 'BUY') {
                                sfd = getEstrangementPercentage();
                                if (sfd >= 4.93) continue;
                            }
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
                                    logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数:${order.size}BTC, 約定価格:${order.price}, id:${id}, SFD:${sfd}`;
                                    util.log(logMessage);
                                    break;
                                }

                                let cancelBody = {
                                    product_code: 'FX_BTC_JPY',
                                    child_order_acceptance_id: id
                                };
                                await bfAPI.cancelChildorder(cancelBody);
				await util.sleep(1000);
                                let posList = await bfAPI.getPositions();
                                if (posList.length && posList.length != numPosition) {
                                    positions.push(order.price);
                                    numPosition++;
                                    currentPosition = position;
                                    whilePositioning = true;
                                    positionExited = false;
                                    logMessage = `シグナル:${signal}, ポジション:${position}, 取引枚数:${order.size}BTC, 約定価格:${order.price}, id:${id}, SFD:${sfd}`;
                                    util.log(logMessage);
                                    break;
                                }
                                let errorMessage = 'エントリー注文が5秒間約定しなかったため再注文します。';
                                util.log(errorMessage);
                            } else {
                                tryOrderCount++;
                                let errorMessage = '何らかエラーにより正常にエントリーできませんでした。\n';
                                if (childOrder.error_mssage) errorMessage += childOrder.error_message;
                                util.log(order);
                                util.log(errorMessage);
                                await util.sleep(1000);
                            }

                            if (tryOrderCount >= 5) {
                                errorMessage = `5回以上注文が通らなかったため今回のエントリーをスルーします。`
                                util.log(errorMessage);
                                break;
                            }
                        }
                    } else if (signal === 'BUY' && sfd >= 4.9) {
                        logMessage = `乖離率が${sfd}%でSFDを徴収される可能性があるためエントリーをスルーしました。`;
                        util.log(logMessage);
                    } else {
                        logMessage = `何らかの原因により注文をスルーしました。`;
                        util.log(order);
                        util.log(logMessage);
                    }
                } else {
                    if (numPosition >= maxPosition) logMessage = '建玉数が限度に達しているのでエントリーをスルーしました。';
                    else logMessage = 'ロスカット中の為エントリーをスルーしました。';
                    if (losscut) losscuttingCount++;
                    util.log(logMessage);
                }
            }
            await util.sleep((interval * CANDLE_SIZE - 1) * 1000);
        }
    } catch (error) {
        util.log(error);
    }
};

const canEntry = (signal, sfd) => {
    if (signal === 'BUY') {
        return sfd < 4.93;
    } else if (signal === 'SELL') {
        return sfd < 4.93 || sfd > 5.0;
    }
    return false;
};

///
/// 現在のorderの状態から注文を行う
/// 指値注文後5秒間待ち約定しなければキャンセルし再注文。
/// 5回再注文をしてダメな場合、forceOrderがtrueの場合は成行注文を行いtrueを、falseの場合はキャンセル後falseを返す。
///
const execOrder = async(forceOrder) => {
    let tryOrderCount = 0;
    let side = order.side;
    while (true) {
        //TODO: SFDのチェックをすること。

        //価格設定
        if (side === 'BUY') {
            order.child_order_type = 'LIMIT';
            order.price = bestAsk;
        } else if (side === 'SELL') {
            order.child_order_type = 'LIMIT';
            order.price = bestBid;
        } else return false;

        //注文実行
        let childOrder = bfAPI.sendChildorder(order);
        tryOrderCount++;
        if (childOrder.child_order_acceptance_id) {
            let id = childOrder.child_order_acceptance_id;
            let result = await waitContractOrderForFiveSec(id);
            if (result) return true;

            let errorMessage = '注文が5秒間約定しなかったため再注文します。';
            util.log(errorMessage);
            let cancelBody = {
                product_code: 'FX_BTC_JPY',
                child_order_acceptance_id: id
            };
            await bfAPI.cancelChildorder(cancelBody);
            let posList = await bfAPI.getPositions();
            if (posList.length && posList.length != numPosition) return true;
        } else {
            let errorMessage = '何らかエラーにより正常に注文ができませんでした。\n';
            if (childOrder.error_mssage) errorMessage += childOrder.error_message;
            util.log(order);
            util.log(errorMessage);
            await util.sleep(5000);
        }

        //TODO: forceOrderの処理を追加
        if (tryOrderCount >= 5) {
            //注文必須の場合は成行で注文
            if (forceORder) {
                order.child_order_type = 'MARKET';
                order.price = 0;
                let marketOrder = bfAPI.sendChildorder(order);
                if (marketOrder.child_order_acceptance_id) {
                    let id = marketOrder.child_order_acceptance_id;
                    let result = await waitContractOrderForFiveSec(id);
                    if (result) return true;
                }
            } else {
                errorMessage = `5回以上注文が通らなかったため今回のエントリーをスルーします。`
                util.log(errorMessage);
                return false;
            }
        }
    }
};

const waitContractOrderForFiveSec = async(id) => {
    let orders = null;
    for (let count = 0; count < 5; count++) {
        orders = await bfAPI.getChildorders(id);
        if (orders.length && orders[0].child_order_state === 'COMPLETED') return true;
        await util.sleep(1000);
    }
};

const vixRSIBot = () => {
    util.log('[稼働開始]');
    vixRSITrade();
};

vixRSIBot();
