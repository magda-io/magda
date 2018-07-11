#!/usr/bin/env node
const childProcess = require("child_process");
const process = require("process");
const yargs = require("yargs");

const argv = yargs
    .options({
        configuration: {
            description: "The Kubernetes configuration to apply.",
            type: "string",
            demand: true
        },
        selector: {
            description:
                "The selector to use to find the pod to forward into, such as `service=combined-db`.",
            type: "string",
            demand: true
        },
        port: {
            description: "The pod port to which to forward.",
            type: "number",
            demand: true
        },
        localPort: {
            description:
                "The local port to forward into the pod.  If not specified, the local port is the same as the pod port.",
            type: "number"
        }
    })
    .help().argv;

const dockerEnvProcess = childProcess.execSync(
    "minikube docker-env --shell bash",
    { encoding: "utf8" }
);
const dockerEnv = dockerEnvProcess
    .split("\n")
    .filter(line => line.indexOf("export ") === 0)
    .reduce(function(env, line) {
        const match = /^export (\w+)="(.*)"$/.exec(line);
        if (match) {
            env[match[1]] = match[2];
        }
        return env;
    }, {});

const env = Object.assign({}, process.env, dockerEnv);

childProcess.execSync("kubectl config use-context minikube", {
    stdio: "inherit",
    env: env
});
childProcess.execSync("yarn run docker-build-local", {
    stdio: "inherit",
    env: env
});
childProcess.execSync(`kubectl apply -f ${argv.configuration}`, {
    stdio: "inherit",
    env: env
});

console.log("Waiting for the pod to start...");

let status;
const endTime = Date.now() + 90 * 1000;
do {
    status = childProcess
        .execSync(
            `kubectl get pods -l ${
                argv.selector
            } -o=custom-columns=NAME:.status.phase --no-headers`,
            { encoding: "utf8", env: env }
        )
        .trim();
} while (status !== "Running" && Date.now() < endTime);

if (status !== "Running") {
    console.log(
        `Pod failed to start within 90 seconds.  The last status was: ${status}.`
    );
    process.exit(1);
}

console.log("Pod is running!");

const podName = childProcess
    .execSync(
        `kubectl get pods -l ${
            argv.selector
        } -o=custom-columns=NAME:.metadata.name --no-headers`,
        { encoding: "utf8", env: env }
    )
    .trim();
const portSpec =
    argv.localPort !== undefined
        ? `${argv.localPort}:${argv.port}`
        : argv.port.toString();
const portForwardProcess = childProcess.spawn(
    "kubectl",
    ["port-forward", podName, portSpec],
    {
        stdio: "inherit",
        env: env,
        shell: true
    }
);

const logsProcess = childProcess.spawn("kubectl", ["logs", "-f", podName], {
    stdio: "inherit",
    env: env,
    shell: true
});
