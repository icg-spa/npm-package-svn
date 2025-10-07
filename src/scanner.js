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

async.eachSeries(
    Object.values(svnDependencyObject),
    function (svnDependency, callback) {
        async.series(
            [
                mkdirs(svnDependency),
                checkout(svnDependency),
                cleanup(svnDependency),
                update(svnDependency),
                cleanup(svnDependency),
                writeToCache(svnDependency)
            ],
            function (error) {
                if (error) {
                    console.log(colors.red("Failed to process " + svnDependency.name));
                    errors.push(svnDependency.name + " (" + error + ")");
                } else {
                    console.log(colors.green("\nProcessed ") + colors.yellow(svnDependency.name));
					console.log("\n----------\n");
                }
                callback(error);
            }
        );
    },
    function (error) {
        if (error) {
            console.error("Errore generale durante il processo:", error);
        } else {
            console.log("Tutte le dipendenze sono state elaborate con successo.");
			console.log("\n--------------\n");
			copyTgzFile();
			console.log("\n--------------\n");
            installAllPackages();
        }
    }
);

function copyTgzFile() {
	const targetPath = path.resolve(rootDir, ".icg-package");
	// --- creo la cartella .icg-package
	if (!fs.existsSync(targetPath)) {
		fs.mkdirSync(targetPath);
	}

	console.log("Eseguo la copia dei file .tgz nella cartella .icg-package");
	console.log("\n--------------\n");
	Object.values(svnDependencyObject).forEach(
		function (svnDependency) {
			const sourcePath = path.resolve(rootDir, svnDependency.installDir);

			const files = fs.readdirSync(sourcePath);
			files.forEach(
				function (file) {
					const filePath = path.join(sourcePath, file);
					const stats = fs.statSync(filePath);
					if (stats.isFile() && file.endsWith(".tgz")) {
						const targetFilePath = path.join(targetPath, file);
						fs.copyFileSync(filePath, targetFilePath);
					}
				}
			);
		}
	)
}
function installAllPackages() {

	console.log(colors.bgWhite.black("START Installing all packages from .icg-package"));

	const packageDir = path.resolve("node_modules/.icg-package");

    // Trova tutti i file .tgz nella directory
    const tgzFiles = fs.readdirSync(packageDir)
        .filter(file => file.endsWith(".tgz"))
        .map(file => path.join(packageDir, file));

    if (tgzFiles.length === 0) {
        console.error(colors.red("Nessun file .tgz trovato nella directory: "), packageDir);
        return;
    }

    console.log(colors.bgWhite.black("Installing all packages from: "), tgzFiles.join(" "));

    // Crea il comando per installare tutti i file .tgz
    const command = `npm install ${tgzFiles.join(" ")} --no-save --no-package-lock`;

	console.log(colors.bgWhite.black("Installing command -> "), command);
    child_process.exec(command, { stdio: "inherit" }, (error) => {
        if (error) {
            console.error(colors.red("Installazione pacchetti fallita: "), error);
        } else {
			console.log("\n--------------\n");
            console.log(colors.green("Tutti i pacchetti sono stati installati correttamente."));
			console.log("\n--------------\n");
			cleanPackages();
        }
    });
}

function cleanPackages() {
	console.log("Eseguo pulizia dei packages");
	console.log("\n--------------\n");
	Object.values(svnDependencyObject).forEach(
		function (svnDependency) {
			const packagePath = path.resolve(rootDir, svnDependency.installDir);
			console.log(colors.yellow("Pulizia della cartella: "), packagePath);

			// --- elimino cartella della dipendenza
			rimraf(packagePath, function (error) {
					if (error) {
						console.error(colors.red("Errore durante l'eliminazione della directory: "), packagePath);
					}
				}
			)
		}
	)

	const packageDir = path.resolve("node_modules/.icg-package");

	console.log(colors.yellow("Pulizia packageDir: "), packageDir);
	console.log("\n--------------\n");
	rimraf(packageDir, function (error) {
			if (error) {
				console.error(colors.red("Errore durante l'eliminazione della directory: "), packageDir);
			}
		}
	)
	console.log("\n--------------\n");
}

function mkdirs(svnDependency) {
    return function (callback) {
        if (svnDependency.latest) {
            callback(null);
        } else async.waterfall(
            [
                function (callback) {
                    // Controlla se esiste node_modules
                    let pathNodeModule = rootDir;
                    if (rootDir.indexOf(nodeModulesDir) < 0) {
                        pathNodeModule = path.resolve(rootDir, nodeModulesDir);
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
                    // Crea node_modules se non esiste
                    if (!exists) {
                        let pathNodeModule = rootDir;
                        if (rootDir.indexOf(nodeModulesDir) < 0) {
                            pathNodeModule = path.resolve(rootDir, nodeModulesDir);
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
                    // Controlla se esiste la directory del modulo
                    const pathModule = path.resolve(rootDir, svnDependency.installDir);
                    fs.access(
                        pathModule,
                        fs.constants.F_OK,
                        function (error) {
                            callback(null, !error);
                        }
                    );
                },
                function (exists, callback) {
                    // Elimina solo se necessario (es. aggiornamenti SVN)
                    if (exists) {
                        const pathModule = path.resolve(rootDir, svnDependency.installDir);
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
	// out.installDir = ".icg-package";

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

    }
}

function npmInstall(svnDependency) {
    return function (callback) {
        const env = { ...process.env };

        console.log(colors.bgWhite.black("Running `npm install` on "), svnDependency.name, "...");

        const directoryPath = path.normalize(path.join(rootDir, svnDependency.installDir));

        // Trova il file .tgz nella directory del pacchetto
        let fileTgz = "";
        const files = fs.readdirSync(directoryPath);
        files.forEach((file) => {
            const filePath = path.join(directoryPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile() && file.endsWith(".tgz")) {
                fileTgz = filePath;
            }
        });

        if (!fileTgz) {
            console.error(colors.red("No .tgz file found in " + directoryPath));
            return callback("No .tgz file found");
        }

		console.log(colors.bgWhite.blue("--------- "));
        console.log(colors.bgWhite.blue("Install command = npm install --no-save --no-package-lock " + fileTgz));

        child_process.exec(
            `npm install ${fileTgz} --no-save --no-package-lock`,
            {
                stdio: "inherit",
                cwd: appDir,
                env: env
            },
            function (error) {
                if (error) {
                    console.error(colors.red("Install failed for " + svnDependency.name + ": " + error));
                } else {
                    console.log(colors.green(`Pacchetto ${svnDependency.name} installato correttamente.`));
                }

                // Verifica se il pacchetto è presente in node_modules/@icg/<name>
                const targetPath = path.join(appDir, "node_modules", "@icg", svnDependency.name);
                if (!fs.existsSync(targetPath)) {
                    console.error(colors.red(`Pacchetto ${svnDependency.name} non trovato in ${targetPath}`));
                } else {
                    console.log(colors.green(`Pacchetto ${svnDependency.name} presente in ${targetPath}`));
                }

                callback(error ? "npm install failed" : null);
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
			console.log("\n-------\n");
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
