#!/usr/bin/env node
const _ = require("lodash");
const yargs = require("yargs");
const fs = require("fs");
const request = require("request");
const StreamArray = require("stream-json/streamers/StreamArray");

function getDefaultRegionSourceConfig() {
    try {
        const fileName = "package.json";
        if (!fs.existsSync(fileName)) {
            return null;
        }
        const data = JSON.parse(
            fs.readFileSync(fileName, { encoding: "utf-8" })
        );
        if (!data || !data["config"] || !data["config"]["regionSources"]) {
            return null;
        }
        return data["config"]["regionSources"];
    } catch (e) {
        console.log(e);
        return null;
    }
}

const argv = yargs
    .config()
    .help()
    .option("outputFile", {
        describe: "The output file path",
        type: "string",
        demand: true,
        default: process.env.OUTPUT_FILE || "regionSynonyms.txt"
    })
    .option("regionSources", {
        describe: "regionSources config",
        type: "string",
        demand: true,
        default: process.env.REGION_SOURCES || getDefaultRegionSourceConfig()
    }).argv;

function escapeSolrSpecialChar(str) {
    return str
        .replace(",", "\\,")
        .replace("=", "\\=")
        .replace(">", "\\>");
}

// --- convert region name from: campbelltown (nsw)
// --- to: campbelltown (nsw), campbelltown
function expandRegionWithSurfix(regionName) {
    const r = /\([^(]+\)$/;
    const matches = regionName.match(r);
    if (!matches) {
        return regionName;
    }
    const regionNameWithoutSurfix = regionName.replace(r, "").trim();
    if (!regionNameWithoutSurfix) {
        return regionName;
    }
    return [regionName, regionNameWithoutSurfix].join(", ");
}

function createLineFromRegionData(regionConfig, item) {
    const data = item.value.properties;
    const regionId = `${regionConfig.type.toLowerCase()}/${data[
        regionConfig.idField
    ].toLowerCase()}`;
    let regionName = data[regionConfig.nameField].trim().toLowerCase();
    // --- skip pure number region name
    if (!regionName.match(/[a-z]/)) {
        return "";
    }
    regionName = expandRegionWithSurfix(escapeSolrSpecialChar(regionName));
    const regionShortName =
        regionConfig.shortNameField && data[regionConfig.shortNameField]
            ? data[regionConfig.shortNameField].trim().toLowerCase()
            : "";
    const regionNames = [regionName];
    if (regionShortName) {
        regionNames.push(escapeSolrSpecialChar(regionShortName));
    }
    const line = `${regionNames.join(", ")} => ${escapeSolrSpecialChar(
        regionId
    )}`;
    return line;
}

async function getRemoteDataFileStream(url) {
    return new Promise((resolve, reject) => {
        request
            .get(url)
            .on("error", e => reject(e))
            .on("response", response => {
                try {
                    if (
                        response.statusCode >= 200 &&
                        response.statusCode <= 299
                    ) {
                        resolve(response.pipe(StreamArray.withParser()));
                    } else {
                        throw new Error(
                            `Request failed ${url}, statusCode: ${
                                response.statusCode
                            }`
                        );
                    }
                } catch (e) {
                    console.error(e);
                    reject(e);
                }
            });
    });
}

async function processRegionDataPipeline(regionConfig, targetStream) {
    const remoteDataStream = await getRemoteDataFileStream(regionConfig["url"]);
    await new Promise((resolve, reject) => {
        remoteDataStream.on("data", data => {
            try {
                const line = createLineFromRegionData(regionConfig, data);
                if (!line) {
                    return;
                }
                console.log(`writing ${line}`);
                targetStream.write(line + "\n", "utf-8");
            } catch (e) {
                reject(e);
            }
        });
        remoteDataStream.on("error", e => {
            reject(e);
        });
        remoteDataStream.on("end", resolve);
    });
}

async function createFile(outputFile, regionSources) {
    const targetFileStream = fs.createWriteStream(outputFile, {
        encoding: "utf-8",
        autoClose: true,
        flags: "w"
    });
    for (const regionType in regionSources) {
        console.log(`Processing region ${regionType}...`);
        const regionConfig = { ...regionSources[regionType], type: regionType };
        targetFileStream.write(
            `\n\n# Region Type: ${regionType}\n# From: ${regionConfig.url}\n\n`,
            "utf-8"
        );
        await processRegionDataPipeline(regionConfig, targetFileStream);
    }
    targetFileStream.end();
    // --- wait until all data goes into underlying system
    return new Promise((resolve, reject) => {
        targetFileStream.on("error", e => reject(e));
        targetFileStream.on("finish", resolve);
    });
}

try {
    if (!argv.regionSources)
        throw new Error("Cannot locate `regionSources` parameter");
    if (!argv.outputFile)
        throw new Error("Cannot locate `outputFile` parameter");
    createFile(argv.outputFile, argv.regionSources)
        .then(() => {
            console.error(
                `Successfully created region synonym file: ${argv.outputFile}.`
            );
            process.exit(0);
        })
        .catch(e => {
            console.error(`Error: ${e}`);
            process.exit(1);
        });
} catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
}
