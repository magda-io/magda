const path = require("path");
const fse = require("fs-extra");

function copyFile(filename) {
    fse.copyFileSync(
        require.resolve("@magda/scripts/" + filename),
        path.resolve(__dirname, "./bin/" + filename)
    );
}

fse.mkdirSync(path.resolve(__dirname, "./bin"));
copyFile("create-docker-context-for-node-component.js");
copyFile("retag-and-push.js");
copyFile("docker-util.js");
