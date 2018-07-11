import { Arguments } from "yargs";

/**
 * Checks to see whether the passed argv has a jwtSecret object. If not,
 * tries to add one by looking at the JWT_SECRET env var and failing that,
 * the jwtSecret value in package.json config.
 *
 * If it can't find one and required is true (or unprovided), this will
 * throw an Error.
 */
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
