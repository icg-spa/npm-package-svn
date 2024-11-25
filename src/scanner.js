const nodeModulesDir = "node_modules";

const fs = require("fs");
const path = require('path');
const child_process = require("child_process");
const async = require("async");
const rimraf = require("rimraf");
const colors = require('colors/safe');
const svnCommand = require('../scripts/svn-command');

const cacheFile = __dirname + "/../.cache";
const rootDir = path.resolve(__dirname, "../..")
const appDir = path.resolve(rootDir, "../")
const packageJson = require(rootDir + "/../package.json");
const svnDependencies = packageJson.svnDependencies || {};
const svnOptions = packageJson.svnOptions || {};
const svnDependencyObject = {};
const errors = [];
const CACHEBUFFER = [];

let numDependencies;

Object.keys(svnDependencies).forEach(
	function (svnDependency) {
    	svnDependencyObject[svnDependency] = buildDepObj(svnDependency, svnDependencies);
	}
);

numDependencies = Object.keys(svnDependencyObject).length;

async.each(svnDependencyObject,
	function (svnDependency, callback) {
		async.series(
			[
				mkdirs(svnDependency),
				checkout(svnDependency),
				cleanup(svnDependency),
				update(svnDependency),
				cleanup(svnDependency),
				npmInstall(svnDependency)
			],
			info(svnDependency, callback)
		);
	},
	function () {
    	writeBufferToCache();
	}
);

function mkdirs(svnDependency) {
    return function (callback) {
        if (svnDependency.latest) {
			callback(null);
		} else async.waterfall(
			[
                function (callback) {
					// --- controllo se esiste la cartella node_modules
					let pathNodeModule = rootDir
					if(rootDir.indexOf(nodeModulesDir) < 0){
						pathNodeModule = path.resolve(rootDir, nodeModulesDir)
					}
                    fs.access(
						pathNodeModule,
						fs.constants.F_OK,
						function (error) {
                        	callback(null, !error);
                    	}
					);
                },
                function (exists, callback) {
					// --- se non esiste creo la cartella node_modules
                    if (!exists){

						let pathNodeModule = rootDir
						if(rootDir.indexOf(nodeModulesDir) < 0){
							pathNodeModule = path.resolve(rootDir, nodeModulesDir)
						}
                        fs.mkdir(
							pathNodeModule,
							function (error) {
                            	callback(error);
                        	}
						);
					} else {
                        callback(null);
					}
                },
                function (callback) {
					// --- controllo se esiste la cartella del modulo
					const pathModule = path.resolve(rootDir, svnDependency.installDir)
					fs.access(
						pathModule,
						fs.constants.F_OK,
						function (error) {
                        	callback(null, !error);
                    	}
					);
                },
                function (exists, callback) {
					// --- se esiste la cancello
                    if (exists){
						const pathModule = path.resolve(rootDir, svnDependency.installDir)
                        rimraf(
							pathModule,
							function (error) {
                            	callback(error);
                        	}
						);
					} else {
						callback(null);
					}
                }
            ],
            function (error) {
                callback(error);
            }
        );
    };
}

function buildDepObj(svnDependency, packageJsonDeps) {
    let out = {};
    out.repo = packageJsonDeps[svnDependency];

	// --- verifico se c'è la revision
	if (svnDependency.indexOf("|") > 0) {
        svnDependency = /^(.*)\|(.*)$/.exec(svnDependency);
        out.name = svnDependency[1];
        out.rev = svnDependency[2];

	// --- se nel link trovo il trunk o altro imposto la revision come HEAD
    } else {
        out.name = svnDependency;
        out.rev = "HEAD";
    }
    out.COPath = out.repo;

    out.installDir = "."+out.name+"-package";
    // out.installDir = "../."+out.name+"-package";

	return out;
}

function checkout(svnDependency) {
	return function (callback) {
		console.log(
			colors.green("START Checkout "),
			colors.yellow(svnDependency.name),
			"rev=" + svnDependency.rev,
			"from", svnDependency.COPath
		)

        if (svnDependency.latest) {
			callback(null);
		} else {

			const svnUrl = svnDependency.COPath
			const svnPath = path.resolve(rootDir, svnDependency.installDir)
			const svnOption = Object.assign({ revision: svnDependency.rev }, svnOptions)

			// --- svn interface
			svnCommand.checkout(
				svnUrl,
				svnPath,
				svnOption,
				function (error, result) {
					console.log(
						colors.green("Checkout finished!"),
						colors.yellow(svnDependency.name),
						"rev=" + svnDependency.rev,
						"from", svnDependency.COPath,
						"installDirPath=", svnPath
					);
					return callback(error ? result : null)
				}
			)

			// --- svn ultimate
			// const svnOption = {
			// 	trustServerCert: true,
			// 	username: svnOptions.username,
			// 	password: svnOptions.password,
			// 	quiet: true,
			// 	force: true,
			// 	revision: svnDependency.rev,
			// 	ignoreExternals: false,
			// 	depth: '', // Valore valido
			// };

			// svnCommand.commands.checkout(
			// 	svnUrl,
			// 	svnPath,
			// 	svnOption,
			// 	function( error ) {
			// 		console.log(
			// 			colors.green("Checkout finished!"),
			// 			colors.yellow(svnDependency.name),
			// 			"rev=" + svnDependency.rev,
			// 			"from", svnDependency.COPath
			// 		);
			// 		return callback(error || null)
			// 	}
			// )
		}
    }
}

function update(svnDependency) {
	return function (callback) {

		const svnPath = path.normalize(path.join(rootDir, svnDependency.installDir))
		const svnOption = Object.assign({ revision: svnDependency.rev }, svnOptions)

		console.log(
			colors.magenta("START Update "),
			colors.yellow(svnDependency.name),
			"rev=" + svnDependency.rev,
			"installDirPath=", svnPath
		)

		// --- svn interface
		svnCommand.update(
			svnPath,
            svnOption,
            function (error, result) {
				console.log(
					colors.magenta("Update finished!"),
					colors.yellow(svnDependency.name),
					"rev=" + svnDependency.rev,
					"installDirPath=", svnPath
				)
				return callback(error ? result : null)
        	}
		)
		// --- svn ultimate
		// const svnOption = {
		// 	trustServerCert: true,	// same as --trust-server-cert
		// 	username: svnOptions.username,	// same as --username
		// 	password: svnOptions.password,	// same as --password
		// 	quiet: true,			// provide --quiet to commands that accept it
		// 	force: true,			// provide --force to commands that accept it
		// 	revision: svnDependency.rev,		// provide --revision to commands that accept it,
		// 	ignoreExternals: false,
		// 	depth: ''
		// }
		// return svnCommand.commands.update(
		// 	svnPath,
		// 	svnOption,
		// 	function (error) {
		// 		console.log(
		// 			colors.magenta("Update finished!"),
		// 			colors.yellow(svnDependency.name),
		// 			"rev=" + svnDependency.rev,
		// 			"installDirPath=", svnPath
		// 		)

		// 		return callback(error || null)
		// 	}
		// )
    }
}

function cleanup(svnDependency) {
    return function (callback) {
		const svnPath = path.normalize(path.join(rootDir, svnDependency.installDir))

		console.log(
			colors.cyan("START Cleanup "),
			colors.yellow(svnDependency.name),
			"installDirPath=", svnPath
		);

		// --- svn interface
		svnCommand.cleanup(
			svnPath,
			svnOptions,
			function (error, result) {
				console.log(
					colors.cyan("Cleanup finished!"),
					colors.yellow(svnDependency.name),
					"installDirPath=", svnPath
				);
				return callback(error ? result : null)
        	}
		)

		// --- svn ultimate
		// const svnOption = {
		// 	username: svnOptions.username,	// same as --username
		// 	password: svnOptions.password,	// same as --password
		// }
		// return svnCommand.commands.cleanup(
		// 	svnPath,
		// 	svnOption,
		// 	function (error) {
				// console.log(
				// 	colors.cyan("Cleanup finished!"),
				// 	colors.yellow(svnDependency.name),
				// 	"installDirPath=", svnPath
				// );

		// 		return callback(error || null)
		// 	}
		// )
    }
}

function npmInstall(svnDependency) {
    return function (callback) {

		const eKeys = Object.keys(process.env), env = {};
		let i;

		console.log(colors.bgWhite.black("Running `npm install` on "), svnDependency.name, "...");


        for (i = eKeys.length; i--;) {
            if (!/^npm_/i.test(eKeys[i])) {
                env[eKeys[i]] = process.env[eKeys[i]];
            }
        }

		const directoryPath = path.normalize(path.join(rootDir, svnDependency.installDir))

		console.log(colors.bgWhite.blue("START Install " + directoryPath));

		let fileTgz = ""
		const files = fs.readdirSync(directoryPath);
		files.forEach(
			(file) => {
				const filePath = path.join(directoryPath, file);
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					fileTgz = filePath
				}
			}
		);

		console.log(colors.bgWhite.blue("Install command = npm install --no-save --no-package-lock --legacy-peer-deps " + fileTgz));

		child_process.exec(
			"npm install --no-save --no-package-lock --legacy-peer-deps " + fileTgz,
			{
				stdio: "inherit",
				cwd: appDir,
				env: env
			},
			function (error) {
				console.log(colors.bgWhite.blue("Install finished, " + error));
				const pathModule = path.resolve(rootDir, svnDependency.installDir)
				rimraf(
					pathModule,
					function (error) {
						callback(error ? "npm install failed" : null);
					}
				);
			}
		);
    };
}

function info(svnDependency, callback) {
    return function (error) {
        if (error) {
            console.log(colors.red("Failed to install " + svnDependency.name));
            errors.push(svnDependency.name + " (" + error + ")");
        }

        if (!error) {
			console.log(colors.green("\nInstalled ") + colors.yellow(svnDependency.name) + "|" + svnDependency.rev);
		}

        if (0 === --numDependencies) {
            if (errors.length) {
                console.log(colors.red("\nEncountered errors installing svn dependencies:"));
                errors.forEach(
					function (err) {
                    	console.log(colors.red(" * " + err));
                	}
				);
                console.log("\n");
            } else {
                console.log(colors.green("\nFinished installing svn dependencies"));
            }
        }
        callback();
    };
}

function writeToCache(svnDependency) {
    return function (callback) {
        CACHEBUFFER.push(svnDependency);
        callback(null);
    }
}

function writeBufferToCache() {
    const cacheJson = _readCache();
    CACHEBUFFER.forEach(
		function (dep) {
        	cacheJson[dep.name] = dep;
    	}
	);

	return writeCache(cacheJson)( function () {} );
}

function writeCache(data) {
    return function (callback) {
        fs.writeFile(
			cacheFile,
			JSON.stringify(data),
			function (error) {
            	callback(error)
        	}
		)
    }
}

function _readCache() {
    return fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
}

function validateCache(dep) {
    return function (callback) {
        const cacheJson = _readCache();
        const svnDependencyCached = cacheJson[dep.name];
        if (svnDependencyCached) {
            dep.latest = svnDependencyCached.rev === dep.rev;
        }

        return callback(null);
    }
}