import { Arguments } from "yargs";

/**
 * Checks to see whether the passed argv has a jwtSecret object. If not,
 * tries to add one by looking at the JWT_SECRET env var and failing that,
 * the jwtSecret value in package.json config.
 *
 * If it can't find one and required is true (or unprovided), this will
 * throw an Error.
 */
export default function addJwtSecretFromEnvVar<T>(
    argv: { [key in keyof Arguments<T>]: Arguments<T>[key] },
    required = true
): { [key in keyof Arguments<T>]: Arguments<T>[key] } {
    const newArgv = Object.assign({}, argv, {
        jwtSecret:
            argv.jwtSecret ||
            process.env.JWT_SECRET ||
            process.env.npm_package_config_jwtSecret
    });

    // const newArgv = {
    //     ...argv,
    // };

    if (required && !newArgv.jwtSecret) {
        throw new Error(
            "jwtSecret argument or JWT_SECRET environment variable is required"
        );
    }

    return newArgv;
}
