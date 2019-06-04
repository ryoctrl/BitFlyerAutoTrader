const assert = require('assert');
const moment = require('moment');
const fs = require('fs');
const util = require('../util');

describe('util', function() {
    it('existSleep', function() {
        assert.equal(typeof(util.sleep), 'function');
    });

    it('sleeping', async function() {
        const begin = moment();
        await util.sleep(1000);
        const end = moment();
        const output = end.diff(begin, 'seconds');
        assert.equal(output, 1);
    });

    it('existLog', function() {
        assert.equal(typeof(util.log), 'function');
    });

    it('logging', function() {
        util.log('test-message', err => {
            const logFile = `${moment().format('YYYYMMDD')}.log`;
            const logPath = `logs/${logFile}`;
            const logExits = fs.existsSync(logPath);
            const readed = fs.readFileSync(logPath);
            const logEnds = readed.toString().indexOf('test-message\n') !== -1;
            assert.equal(logExits && logEnds, true);
        });
    });

    it('loggingObject', function() {
        const obj = {
            test: 'object'
        }

        util.log(obj, err => {
            const logFile = `${moment().format('YYYYMMDD')}.log`;
            const logPath = `logs/${logFile}`;
            const logExits = fs.existsSync(logPath);
            const readed = fs.readFileSync(logPath);
            const logEnds = readed.toString().indexOf('}\n') !== -1;
            assert.equal(logExits && logEnds, true);
        });
    });
});
