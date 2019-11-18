package input.registry
# Can only be accessed if not expired.
# In magda-esri-portal-connector/src/setup.ts, if a) esriUpdateInterval = 10; b) esriExpirationOverlap = 10;
# c) the esri portal crawl takes less than 4 hours to complete; d) the "last crawl expiration" is calculated by
#    time of crawl completion + esriUpdateInterval + esriExpirationOverlap
# The esri dataset access control will be up-to-date for at least 24 hours.
#
# "nsw-portal" is a connector id.
nsw_portal_expiration {
    input.extra["nsw-portal"]["last crawl expiration"] > input.timestamp
}
