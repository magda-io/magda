export default class CkanConnectionResult {
    public aspectDefinitionsConnected: number = 0;
    public datasetsConnected: number = 0;
    public distributionsConnected: number = 0;
    public organizationsConnected: number = 0;
    public errors: { aspectDefinitionId?: string, datasetId?: string, resourceId?: string, organizationId?: string, error: Error }[] = [];
}
