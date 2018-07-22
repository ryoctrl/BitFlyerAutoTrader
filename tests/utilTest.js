const workDir = process.cwd();
const Util = require(`${workDir}/utilities/util`).Util;

const util = new Util();

const name = 'UtilTest';
const message = 'testing';

util.logging(name, message);
