class Util {
	async sleepSec (seconds) {
		let  milliSeconds = 1000 * seconds;
		return new Promise(resolve => setTimeout(resolve, milliSeconds));
	}
}

module.exports.Util = Util;
