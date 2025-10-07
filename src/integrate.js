const read = require("fs").readFileSync;
const write = require("fs").writeFileSync;
const check = require("fs").existsSync;
const join = require("path").join;
const relative = require("path").relative;

const moduleName = "npm-package-svn";
const installAction = "install";

const path = __dirname + "/../../../";

const mainScript = "scanner.js";
const mainScriptPrefix = "node ./";

const pkgFileName = "package.json";
const pkgFile = join(path, pkgFileName);

const errorMessage = "--> " + moduleName + " did not find your app's " + pkgFileName + " file";

module.exports = function (action) {
    let pkg, scripts, helperScript;
    if (check(pkgFile)) {
        scripts = [];
        pkg = JSON.parse(read(pkgFile).toString());
        pkg.scripts = pkg.scripts || {};
        pkg.scripts.install = pkg.scripts.install || "";
        pkg.scripts.install.split("&&").forEach(
			function (script) {
				if (-1 === script.indexOf(moduleName)) {
					script = script.trim();
					if (script.length > 0) scripts.push(script);
				}
        	}
		);
        if (installAction === action) {
            helperScript = mainScriptPrefix + relative(path, join(__dirname, mainScript));
            scripts.push(helperScript);
        }
        pkg.scripts.install = scripts.join(" && ");
        write(pkgFile, JSON.stringify(pkg, null, "\t"));
    } else {
        console.log(errorMessage);
    }
};