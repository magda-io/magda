import { Arguments } from "yargs";

export default function addJwtSecretFromEnvVar(
    argv: Arguments,
    required = true
): Arguments {
    const newArgv = {
        ...argv,
        jwtSecret:
            argv.jwtSecret ||
            process.env.JWT_SECRET ||
            process.env.npm_package_config_jwtSecret
    };

    if (required && !newArgv.jwtSecret) {
        throw new Error(
            "jwtSecret argument or JWT_SECRET environment variable is required"
        );
    }

    return newArgv;
}
