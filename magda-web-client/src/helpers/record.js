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

type source = {
  "url": string,
  "name": string,
  "type": string,
}

type aspects = {
  'dcat-distribution-strings'?: dcatDistributionStrings,
  'dcat-dataset-strings'?:dcatDatasetStrings,
  'dataset-distributions'?:datasetDistributions,
  'temporal-coverage'?: string,
  'spatial-coverage'?: string,
  'dataset-publisher'?: {publisher: datasetPublisher},
  'source'?: source
}

type publisher = {
  id: string,
  name: string,
  aspects:{
    source: {
      url: string,
      type: string,
    },
    'organization-details': {
      name: string,
      title: string,
      imageUrl: string,
      description: string
    }
  }
}

const defaultPublisher: publisher = {
  id: null,
  name: null,
  aspects:{
    source: {
      url: '',
      type: '',
    },
    'organization-details': {
      name: '',
      title: '',
      imageUrl: '',
      description: ''
    }
  }
}

const defaultAspects = {
  'dcat-distribution-strings': {
    format: undefined,
    downloadURL: undefined,
    modified: undefined,
    license: undefined,
    description: undefined,
  },
  'dcat-dataset-strings':{
    description: undefined,
    keywords: [],
    landingPage: undefined,
    title: undefined,
    issued: undefined,
    modified: undefined
  },
  'dataset-distributions':[],
  'temporal-coverage': undefined,
  'spatial-coverage': undefined,
  'dataset-publisher': {publisher: defaultPublisher},
  'catalog': {
    "url": undefined,
    "name": undefined,
    "type": undefined,
  }
}



type Record = {
  id: string,
  name: string,
  aspects: aspects
}

const defaultDistributionAspect = {
  'dcat-distribution-strings': {
    format: undefined,
    downloadURL: undefined,
    modified: undefined,
    license: undefined,
    description: undefined,
  }
}

export function parseDistribution(record: Record) {
  const id = record ? record['id']: null;
  const title = record ? record['name'] : null;

  const aspects = record ? record['aspects'] : defaultDistributionAspect;

  const info = aspects['dcat-distribution-strings'] || {};

  const format = info.format || 'Unknown format';
  const downloadURL = info.downloadURL || 'No downloads available';
  const updatedDate = info.modified ? getDateString(info.modified) : 'unknown date';
  const license = info.license || 'License restrictions unknown';
  const description = info.description || 'No description provided';

  return { id, title, description, format, downloadURL, updatedDate, license }
};


export function parseDataset(dataset: Record) {
  const aspects = dataset ? dataset['aspects'] : defaultAspects;
  const identifier =dataset ? dataset.id : null;
  const datasetInfo = aspects['dcat-dataset-strings'] || {};
  const distribution = aspects['dataset-distributions'] || {};
  const distributions = distribution['distributions'] || [];
  const temporalCoverage = aspects['temporal-coverage'];
  const spatialCoverage = aspects['spatial-coverage'];
  const description = datasetInfo.description || 'No description provided';
  const tags = datasetInfo.keywords || [];
  const landingPage = datasetInfo.landingPage;
  const title = datasetInfo.title;
  const issuedDate= datasetInfo.issued || 'Unknown issued date';
  const updatedDate = datasetInfo.modified ? getDateString(datasetInfo.modified) : 'unknown date';
  const publisher=aspects['dataset-publisher'] ? aspects['dataset-publisher']['publisher'] : defaultPublisher

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
      identifier, title, issuedDate, updatedDate, landingPage, tags, description, distribution, source, temporalCoverage, spatialCoverage, publisher, catalog
  }
};
