// @flow
import getDateString from './getDateString';
// dataset query:
//aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&dereference=true&optionalAspect=dataset-publisher&optionalAspect=source


type temporalCoverage= [];

type dcatDistributionStrings = {
  format: string,
  downloadUrl: string,
  accessUrl: string,
  modified: string,
  license: string,
  description: string,
}


type Distribution = {
  description: string,
  title: string,
  id: string,
  downloadUrl: string,
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

type publisher = {
  id: ?string,
  name:?string,
  aspects:{
    source?: {
      url: string,
      type: string,
    },
    'organization-details'?: {
      name: string,
      title: string,
      imageUrl: string,
      description: string
    }
  }
}


type RawDataset = {
  id: string,
  name: string,
  aspects: {
    'dcat-dataset-strings': dcatDatasetStrings,
    source?: source,
    'dataset-publisher'?: datasetPublisher,
    'dataset-distributions'?: datasetDistributions,
    'temporal-coverage'?: temporalCoverage
  }
}
//aspect=dcat-distribution-strings
type RawDistribution = {
  id: string,
  name: string,
  aspects: {
    'dcat-distribution-strings': dcatDistributionStrings
  }
}

type ParsedDistribution = {
  id: ?string,
  title: ?string,
  description: string,
  format: string,
  downloadUrl: ?string,
  accessUrl: ?string,
  updatedDate: string,
  license: string
};

// all aspects become required and must have value
type ParsedDataset = {
  identifier: string,
  title: string,
  issuedDate: string,
  updatedDate: string,
  landingPage: string,
  tags: Array<string>,
  description: string,
  distribution: Array<datasetDistributions>,
  source: source,
  temporalCoverage: temporalCoverage,
  publisher: publisher,
  catalog: string
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
    downloadUrl: undefined,
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


const defaultDistributionAspect = {
  'dcat-distribution-strings': {
    format: undefined,
    downloadUrl: undefined,
    accessUrl: undefined,
    modified: undefined,
    license: undefined,
    description: undefined,
  }
}

export function parseDistribution(record: RawDistribution) : ParsedDistribution {
  const id = record ? record['id']: null;
  const title = record ? record['name'] : null;

  const aspects = record ? record['aspects'] : defaultDistributionAspect;

  const info = aspects['dcat-distribution-strings'];

  const format = info.format || 'Unknown format';
  const downloadUrl = info.downloadUrl || null;
  const updatedDate = info.modified ? getDateString(info.modified) : 'unknown date';
  const license = info.license || 'License restrictions unknown';
  const description = info.description || 'No description provided';
  const accessUrl = info.accessUrl || null;

  return { id, title, description, format, downloadUrl, accessUrl, updatedDate, license }
};


export function parseDataset(dataset: RawDataset): ParsedDataset {
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
          downloadUrl: info.downloadUrl || 'No download url provided',
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
