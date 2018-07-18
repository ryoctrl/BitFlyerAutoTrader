const BitFlyer = require('../api/bitflyer').BitFlyer;

const api = new BitFlyer();
const LOSSCUT_PERCENTAGE = 3;

const run = async () =>  {
	let collateral = await api.getCollateral();
	let amount = collateral.collateral;
	let pnl = collateral.open_position_pnl;
	console.log(pnl <= -(amount * (LOSSCUT_PERCENTAGE / 100)));
};

run();
