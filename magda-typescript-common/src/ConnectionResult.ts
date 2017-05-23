import CreationFailure from './CreationFailure';

export default class ConnectionResult {
    public aspectDefinitionsConnected = 0;
    public organizationsConnected = 0;
    public datasetsConnected = 0;
    public distributionsConnected = 0;

    public aspectDefinitionFailures = Array<CreationFailure>();
    public organizationFailures = Array<CreationFailure>();
    public datasetFailures = Array<CreationFailure>();
    public distributionFailures = Array<CreationFailure>();

    public static combine(...results: ConnectionResult[]): ConnectionResult {
        const total = new ConnectionResult();

        results.forEach(result => {
            total.aspectDefinitionsConnected += result.aspectDefinitionsConnected;
            total.organizationsConnected += result.organizationsConnected;
            total.datasetsConnected += result.datasetsConnected;
            total.distributionsConnected += result.distributionsConnected;

            total.aspectDefinitionFailures.push(...result.aspectDefinitionFailures);
            total.organizationFailures.push(...result.organizationFailures);
            total.datasetFailures.push(...result.datasetFailures);
            total.distributionFailures.push(...result.distributionFailures);
        });

        return total;
    }
}
