// @flow
import getDateString from './getDateString';
// dataset query:
//aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&dereference=true&optionalAspect=dataset-publisher&optionalAspect=source

export type RecordAction = {
  json?: Object,
  error?: number,
  type?: string
}


type TemporalCoverage = {
  data: {
    intervals: ?Array<Object>
  }
};

type dcatDistributionStrings = {
  format: string,
  downloadURL: string,
  accessURL: string,
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

type DcatDatasetStrings = {
  description: string,
  keywords: Array<string>,
  landingPage: string,
  title: string,
  issued: string,
  modified: string
}

type DatasetPublisher = {
  publisher: Publisher
}


type Publisher = {
  id:string,
  name:string,
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


export type RawDataset = {
  id: string,
  name: string,
  aspects: {
    'dcat-dataset-strings': DcatDatasetStrings,
    source?: {
      "url": string,
      "name": string,
      "type": string,
    },
    'dataset-publisher'?: DatasetPublisher,
    'dataset-distributions'?: {
      distributions: Array<RawDistribution>
    },
    'temporal-coverage'?: TemporalCoverage
  }
}
//aspect=dcat-distribution-strings
export type RawDistribution = {
  id: string,
  name: string,
  aspects: {
    'dcat-distribution-strings': dcatDistributionStrings
  }
}

export type ParsedDistribution = {
  id: string,
  title: string,
  description: string,
  format: string,
  downloadURL: ?string,
  accessURL: ?string,
  updatedDate: string,
  license: string
};

// all aspects become required and must have value
export type ParsedDataset = {
  identifier: string,
  title: string,
  issuedDate: string,
  updatedDate: string,
  landingPage: string,
  tags: Array<string>,
  description: string,
  distributions: Array<ParsedDistribution>,
  temporalCoverage: ? TemporalCoverage,
  publisher: Publisher,
  source: string
}

const defaultPublisher: Publisher = {
  id: '',
  name: '',
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

const defaultDatasetAspects = {
  'dataset-distributions': [],
  'dcat-dataset-strings':{
    description: undefined,
    keywords: [],
    landingPage: undefined,
    title: undefined,
    issued: undefined,
    modified: undefined
  },
  'dataset-distributions':{
    distributions: []
  },
  'temporal-coverage': null,
  'dataset-publisher': {publisher: defaultPublisher},
  'source': {
    "url": '',
    "name": '',
    "type": '',
  }
}


const defaultDistributionAspect = {
  'dcat-distribution-strings': {
    format: null,
    downloadURL: null,
    accessURL: null,
    updatedDate: null,
    license: null,
    description: null,
  }
}

export function parseDistribution(record?: RawDistribution) : ParsedDistribution {
  const id = record ? record['id']: null;
  const title = record ? record['name'] : null;

  const aspects = record ? record['aspects'] : defaultDistributionAspect;

  const info = aspects['dcat-distribution-strings'];

  const format = info.format || 'Unknown format';
  const downloadURL = info.downloadURL || null;
  const accessURL = info.accessURL || null;
  const updatedDate = info.modified ? getDateString(info.modified) : 'unknown date';
  const license = info.license || 'License restrictions unknown';
  const description = info.description || 'No description provided';


  return { id, title, description, format, downloadURL, accessURL, updatedDate, license }
};


export function parseDataset(dataset?: RawDataset): ParsedDataset {
  const aspects = dataset ? dataset['aspects'] : defaultDatasetAspects;
  const identifier =dataset ? dataset.id : null;
  const datasetInfo = aspects['dcat-dataset-strings'];
  const distribution = aspects['dataset-distributions'] || defaultDatasetAspects['dataset-distributions'];
  const temporalCoverage = aspects['temporal-coverage'];
  const description = datasetInfo.description || 'No description provided';
  const tags = datasetInfo.keywords || [];
  const landingPage = datasetInfo.landingPage || '';
  const title = datasetInfo.title || '';
  const issuedDate= datasetInfo.issued || 'Unknown issued date';
  const updatedDate = datasetInfo.modified ? getDateString(datasetInfo.modified) : 'unknown date';
  const publisher =aspects['dataset-publisher'] ? aspects['dataset-publisher']['publisher'] : defaultPublisher;

  const source: string = aspects['source'] ? aspects['source']['name'] : defaultDatasetAspects['source']['name'];

  const distributions = distribution['distributions'].map(d=> {
      const distributionAspects = d['aspects'];
      const info = distributionAspects['dcat-distribution-strings'] || defaultDistributionAspect['dcat-distribution-strings'];
      return {
          id: d['id'],
          title: d['name'],
          downloadURL: info.downloadURL || null,
          accessURL : info.accessURL || null,
          format: info.format || 'Unknown format',
          license: (!info.license || info.license === 'notspecified') ? 'License restrictions unknown' : info.license,
          description: info.description || 'No description provided',
          updatedDate: info.modified ? getDateString(info.modified) : 'unknown date'
      }
  });
  return {
      identifier, title, issuedDate, updatedDate, landingPage, tags, description, distributions, source, temporalCoverage, publisher
  }
};
