#!/usr/bin/env node
const path = require("path");
const recursive = require("recursive-readdir");
const fse = require("fs-extra");
const YAML = require("yaml");

const cwdPath = process.cwd();
const pkg = fse.readJsonSync(path.join(cwdPath, "package.json"));
if (!pkg || !pkg["version"]) {
    console.error("Cannot find package.json at: " + cwdPath);
    process.exit(-1);
}

const pkgVersion = pkg["version"];
// a list of helm chart that we want to exclude from auto update version
const excludedCharts =
    pkg["versionUpdateExclude"] && pkg["versionUpdateExclude"].length
        ? pkg["versionUpdateExclude"]
        : [];

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
        const chartName = chart.getIn(["name"]);
        if (excludedCharts.length && excludedCharts.indexOf(chartName) !== -1) {
            // skip update version of excluded charts
            return;
        }

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
                const nameStr = chart.getIn(["dependencies", i, "name"]);
                if (
                    typeof repoStr === "string" &&
                    repoStr.indexOf("file://") === 0 &&
                    excludedCharts.length &&
                    excludedCharts.indexOf(nameStr) === -1
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
        console.error(`Failed to process ${chartFilePath}: ${e}`);
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
            console.error(err);
            process.exit(-1);
        }
        files.forEach(updateChartVersion);
    }
);
