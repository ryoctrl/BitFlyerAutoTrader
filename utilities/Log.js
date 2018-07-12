import * as Config from "config";
import * as Path from "path";
import * as Log4js from 'log4js';

let configure = Confog.util.loadFileConfigs(Path.join(__dirname, "config")).log4js;
Log4js.configure(<Log4js.IConfig>configure);


let testMessage = "TEST LOG";

let logger = Log4js.
