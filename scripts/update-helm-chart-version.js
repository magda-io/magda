#!/usr/bin/env node
const path = require("path");
const recursive = require("recursive-readdir");
const fse = require("fs-extra");
const YAML = require("yaml");

const cwdPath = process.cwd();
const pkg = fse.readJsonSync(path.join(cwdPath, "package.json"));
if (!pkg || !pkg["version"]) {
    console.err("Cannot find package.json at: " + cwdPath);
    process.exit(-1);
}

const pkgVersion = pkg["version"];

function updateChartVersion(chartFilePath) {
    try {
        const chartDir = path.dirname(chartFilePath);
        const chartFileContent = fse.readFileSync(chartFilePath, {
            encoding: "utf8"
        });
        if (!chartFileContent) {
            throw new Error("Failed to read Chart.yaml");
        }
        const chart = YAML.parseDocument(chartFileContent);
        const chartVersion = chart.getIn(["version"], true);
        if (chartVersion) {
            chartVersion.value = pkgVersion;
        } else {
            chart.setIn(["version"], pkgVersion);
        }
        const deps = chart.getIn(["dependencies"]);
        if (deps && deps.items && deps.items.length) {
            for (let i = 0; i < deps.items.length; i++) {
                const repoStr = chart.getIn(["dependencies", i, "repository"]);
                if (
                    typeof repoStr === "string" &&
                    repoStr.indexOf("file://") === 0
                ) {
                    const version = chart.getIn(
                        ["dependencies", i, "version"],
                        true
                    );
                    if (version) {
                        version.value = pkgVersion;
                    } else {
                        chart.setIn(["dependencies", i, "version"], pkgVersion);
                    }
                }
            }
        }
        fse.writeFileSync(chartFilePath, chart.toString(), {
            encoding: "utf8"
        });
    } catch (e) {
        console.err(`Failed to process ${chartFilePath}: ${e}`);
        process.exit(-1);
    }
}

recursive(
    cwdPath,
    [
        (file, stats) =>
            stats.isDirectory() ||
            path.basename(file).toLowerCase() === "chart.yaml"
                ? false
                : true
    ],
    function (err, files) {
        if (err) {
            console.err(err);
            process.exit(-1);
        }
        files.forEach(updateChartVersion);
    }
);
