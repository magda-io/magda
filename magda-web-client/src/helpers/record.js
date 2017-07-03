// @flow
import getDateString from './getDateString';

type dcatDistributionStrings = {
  format: string,
  downloadURL: string,
  modified: string,
  license: string,
  description: string,
}


type Distribution = {
  description: string,
  title: string,
  id: string,
  downloadURL: string,
  format: string,
  aspects: {
    'dcat-distribution-strings': dcatDistributionStrings
  }
}

type dcatDatasetStrings = {
  description: string,
  keywords: Array<string>,
  landingPage: string,
  title: string,
  issued: string,
  modified: string
}

type datasetDistributions = {
  distributions: Array<Distribution>
}

type datasetPublisher = {
  publisher: {
    aspects: {
      'organization-details': Object
    }
  }
}



type aspects = {
  'dcat-distribution-strings'?: dcatDistributionStrings,
  'dcat-dataset-strings'?:dcatDatasetStrings,
  'dataset-distributions'?:datasetDistributions,
  'temporal-coverage'?: string,
  'spatial-coverage'?: string,
  'dataset-publisher'?: datasetPublisher
}

type Record = {
  id: string,
  name: string,
  aspects: aspects
}

export function parseDistribution(record: Record) {
  const id = record['id'];
  const title = record['name'];

  const aspects = record['aspects'] || {};

  const info = aspects['dcat-distribution-strings'] || {};

  const format = info.format || 'Unknown format';
  const downloadURL = info.downloadURL || 'No downloads available';
  const updatedDate = info.modified ? getDateString(info.modified) : 'unknown date';
  const license = info.license || 'License restrictions unknown';
  const description = info.description || 'No description provided';

  return { id, title, description, format, downloadURL, updatedDate, license }
};


export function parseDataset(dataset: Record) {
  const aspects = dataset['aspects'] || {};
  const identifier =dataset.id;
  const datasetInfo = aspects['dcat-dataset-strings'] || {};
  const distribution = aspects['dataset-distributions'] || {};
  const distributions = distribution['distributions'] || [];
  const temporalCoverage = aspects['temporal-coverage'];
  const spatialCoverage = aspects['spatial-coverage'];
  const description = datasetInfo.description || 'No description provided';
  const publisher = datasetInfo.publisher || undefined;
  const tags = datasetInfo.keywords || [];
  const landingPage = datasetInfo.landingPage;
  const title = datasetInfo.title;
  const issuedDate= datasetInfo.issued || 'Unknown issued date';
  const updatedDate = datasetInfo.modified ? getDateString(datasetInfo.modified) : 'unknown date';

  const publisherDetails=aspects['dataset-publisher'] && aspects['dataset-publisher']['publisher']['aspects'] ? aspects['dataset-publisher']['publisher']['aspects']['organization-details'] : {}

  const catalog = aspects['source'] ? aspects['source']['name'] : '';

  const source = distributions.map(d=> {
      const distributionAspects = d['aspects'] || {};
      const info = distributionAspects['dcat-distribution-strings'] || {};

      return {
          id: d['id'] || '',
          downloadURL: info.downloadURL || 'No download url provided',
          format: info.format || 'Unknown format',
          license: (!info.license || info.license === 'notspecified') ? 'License restrictions unknown' : info.license,
          title: info.title || '',
          description: info.description || 'No description provided'
      }
  });
  return {
      identifier, title, issuedDate, updatedDate, landingPage, tags, publisher, description, distribution, source, temporalCoverage, spatialCoverage, publisherDetails, catalog
  }
};
