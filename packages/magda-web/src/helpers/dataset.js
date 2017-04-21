export function parseDataset(dataset) {
  const aspect = dataset["aspects"] || {};
  const datasetInfo = aspect["dcat-dataset-strings"] || {};
  const distribution = aspect["dataset-distributions"] || {};
  const distributions = distribution["distributions"] || [];

  const description = datasetInfo.description || '';
  const publisher = datasetInfo.publisher || '';
  const tags = datasetInfo.keywords || [];
  const landingPage = datasetInfo.landingPage;
  const title = datasetInfo.title;
  const issuedDate= datasetInfo.issued;
  const updatedDate = datasetInfo.modified;

  const source = distributions.map(d=> {
      const distributionAspects = d["aspects"] || {};
      const info = distributionAspects["dcat-distribution-strings"] || {};
      return {
          id: distributionAspects["id"] || "",
          downloadUrl: info.downloadURL || "",
          format: info.format || "unknown format",
          license: info.license || "license unknown",
          title: info.title || "",
          description: info.description || ""
      }
  });
  debugger

  return {
      title,issuedDate, updatedDate, landingPage, tags, publisher, description, distribution, source
  }
};
