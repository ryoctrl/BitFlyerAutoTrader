const { Deal } = require('../../models/Deal');
const Trader = require('../../models/Trader');
Trader.trader = new Trader(process.env.API_KEY, process.env.API_SECRET);

const test = async () => {
    const deal = new Deal('BUY', 0.01);
    let price = await deal.deal()
    console.log(price);

    price = await deal.settle();
    console.log(price);
}

test();




