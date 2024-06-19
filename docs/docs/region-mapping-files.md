### Region Mapping Files

Magda allow users to supply a list of region mapping files that contains a list of regions available as region search filter options. The region mapping files will be fetched via HTTP protocol by Magda's [indexer](https://github.com/magda-io/magda/tree/main/deploy/helm/internal-charts/indexer) module when it's required to create region index in search engine (e.g. for the first deployment).

The default config will pull region mapping files from [the `magda-region-mappings` repo release download area](https://github.com/magda-io/magda-region-mappings/releases).

For production deployment, you might want to host those region mapping files yourself in a more reliable way (e.g. put into a storage bucket).

To config indexer to use different region mapping files or if you want to host region mapping files in your own facility, please check this repo for more details: https://github.com/magda-io/magda-region-mappings
