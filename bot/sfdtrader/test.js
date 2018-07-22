const Util = require('../../utilities/util').Util;
const util = new Util();

const run = async () => {
	let i = 0, j = 0;;	
	while(true) {
		console.log(i++);
		while(true) {
			j++;
			if(j > 5) break;
			console.log('breakします');
			await util.sleepSec(1);
		}
		await util.sleepSec(1);
	}
}

run();
