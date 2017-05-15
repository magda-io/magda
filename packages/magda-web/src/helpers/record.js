import getDateString from './getDateString';

export function parseDistribution(record) {
  const id = record["id"];
  const title = record["name"];

  const aspect = record["aspects"] || {};

  const info = aspect["dcat-distribution-strings"] || {};

  const format = info.format || "Unknown format";
  const downloadUrl = info.downloadURL || "No downloads available";
  const updatedDate = info.modified ? getDateString(info.modified) : "unknown date";
  const license = info.license || "License restrictions unknown";
  const description = info.description || "No description provided";

  return { id, title, description, format, downloadUrl, updatedDate, license }
};


export function parseDataset(dataset) {
  const aspect = dataset["aspects"] || {};
  const datasetInfo = aspect["dcat-dataset-strings"] || {};
  const distribution = aspect["dataset-distributions"] || {};
  const distributions = distribution["distributions"] || [];
  const temporalCoverage = aspect["temporal-coverage"];
  const spatialCoverage = aspect["spatial-coverage"];

  const description = datasetInfo.description || 'No description provided';
  const publisher = datasetInfo.publisher || 'Unknown publisher';
  const tags = datasetInfo.keywords || [];
  const landingPage = datasetInfo.landingPage;
  const title = datasetInfo.title;
  const issuedDate= datasetInfo.issued || 'Unknown issued date';
  const updatedDate = datasetInfo.modified ? getDateString(datasetInfo.modified) : 'unknown date';

  const source = distributions.map(d=> {
      const distributionAspects = d["aspects"] || {};
      const info = distributionAspects["dcat-distribution-strings"] || {};

      return {
          id: d["id"] || "",
          downloadUrl: info.downloadURL || "No download url provided",
          format: info.format || "Unknown format",
          license: (!info.license || info.license === "notspecified") ? "License restrictions unknown" : info.license,
          title: info.title || "",
          description: info.description || "No description provided"
      }
  });
  return {
      title,issuedDate, updatedDate, landingPage, tags, publisher, description, distribution, source, temporalCoverage, spatialCoverage
  }
};
