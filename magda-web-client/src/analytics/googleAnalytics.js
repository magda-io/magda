/**
 * Call Google Analytics such that any calls go to both terria tracker and data.gov.au tracker.
 */
export default function ga(...args) {
    if (typeof window !== "undefined" && window.ga) {
        // Clone a terria version of the args
        var terriaArgs = args.concat();

        terriaArgs[0] = "terria." + terriaArgs[0];

        window.ga(...args);
        window.ga(...terriaArgs);
    }
}
