const fs = require("fs");

function preloadConfig(configStore, executeOption) {
    return Promise.resolve().then(function() {
        if (executeOption === true) {
            console.log(
                chalk.yellow(
                    `Loading config data from \`${configStore.path}\`...`
                )
            );
            // --- trigger config file read
            configStore.all;
            if (!configStore.size) {
                throw new Error(`Error: loaded config object is empty!`);
            }
            console.log(
                chalk.green(
                    `Successfully loaded config data from \`${
                        configStore.path
                    }\`.`
                )
            );
        } else if (executeOption === "-") {
            return readConfigFromStdin(configStore);
        } else {
            return readConfigFromFile(configStore, executeOption);
        }
    });
}

function readConfigFromStdin(configStore) {
    console.log(chalk.yellow(`Loading config data from STDIN ...`));
    const configContent = "";
    return new Promise(function(resolve, reject) {
        process.stdin.setEncoding("utf8");

        process.stdin.on("readable", () => {
            try {
                const chunk = process.stdin.read();
                if (chunk !== null) {
                    configContent += chunk;
                }
            } catch (e) {
                reject(e);
            }
        });

        process.stdin.on("end", () => {
            try {
                const data = JSON.parse(configContent);
                if (
                    !data ||
                    typeof data !== "object" ||
                    !Object.keys(data).length
                ) {
                    throw new Error("Loaded config object is empty!");
                }
                console.log(
                    chalk.green(`Successfully loaded config data from STDIN.`)
                );
                resolve(data);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function readConfigFromFile(configStore, executeOption) {
    console.log(chalk.yellow(`Loading config data from ${executeOption}...`));
    const configContent = "";
    return new Promise(function(resolve, reject) {
        try {
            const filePath = trim(executeOption);
            if (!fs.existsSync(filePath)) {
                throw new Error(
                    "The config file path specified does not exist or cannot read."
                );
            }
            const content = fs.readFileSync(filePath, {
                encoding: "utf-8"
            });
            const data = JSON.parse(content);
            if (
                !data ||
                typeof data !== "object" ||
                !Object.keys(data).length
            ) {
                throw new Error("Loaded config object is empty!");
            }
            console.log(
                chalk.green(
                    `Successfully loaded config data from \`${filePath}\`.`
                )
            );
            resolve(data);
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = preloadConfig;
