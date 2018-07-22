const Util = require('../../utilities/Util').Util;
const util = new Util();

const run = async () => {
	let i = 0;	
	while(true) {
		console.log(i++);
		await util.sleepSec(1);
	}
}

run();
