export function parseRecord(record) {
  const id = record["id"];
  const title = record["name"];

  const aspect = record["aspects"] || {};

  const datasetInfo = aspect["dcat-dataset-strings"] || {};
  const distributionInfo = aspect["dcat-distribution-strings"] || {};

  const datasetDistribution = aspect["dataset-distributions"] || {};
  const datasetDistributions = datasetDistribution["distributions"] || [];

  const datasetDescription = datasetInfo.description || '';
  const datasetPublisher = datasetInfo.publisher || '';
  const datasetTags = datasetInfo.keywords || [];
  const datasetLandingPage = datasetInfo.landingPage;
  const datasetIssuedDate= datasetInfo.issued;
  const datasetUpdatedDate = datasetInfo.modified;


  const distributionFormat = distributionInfo.format || "";
  const distributionDownloadUrl = distributionInfo.downloadURL || "";
  const distributionUpdatedDate = distributionInfo.modified || "";
  const distributionLicense = distributionInfo.license || "";
  

  const datasetSource = datasetDistributions.map(d=> {
      const distributionAspects = d["aspects"] || {};
      const info = distributionAspects["dcat-distribution-strings"] || {};
      
      return {
          id: d["id"] || "",
          downloadUrl: info.downloadURL || "",
          format: info.format || "unknown format",
          license: info.license || "license unknown",
          title: info.title || "",
          description: info.description || ""
      }
  });
  return {
      id, title, datasetSource, datasetDescription, datasetPublisher, datasetTags, datasetLandingPage, datasetIssuedDate, datasetUpdatedDate, distributionFormat, distributionDownloadUrl, distributionUpdatedDate, distributionLicense
  }
};
