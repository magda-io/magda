// @flow

export type DatasetDistribution = {
  format: string,
  mediaType: string,
  downloadURL:string,
  description: string,
  modified: string,
  license: {
    name: string,
    },
  issued: string,
  title: string,
}

export type DatasetPublisher = {
  name: string,
  extraFields: {
    description: string
  }
}

export type Dataset = {
  years: string,
  catalog: string,
  spatial: Object,
  identifier: string,
  description: string,
  accrualPeriodicity: ?Object,
  landingPage: string,
  keyword: Array<string>,
  modified: string,
  issued: string,
  contactPoint: Object,
  temporal: {
    start: {
      date: string,
      text: string
    },
    end: {
      date: string,
      text: string
    }
  },
  language: string,
  distributions: Array<DatasetDistribution>,
  publisher: DatasetPublisher,
  title: string,
  theme: Array<any>
}


export type FacetSearchJson = {
  options?: Array<Object>,
  regions? : Array<Object>,
  regionWmsMap?: Object
};

export type FacetOption = {
    value: string,
    hitCount: number,
    matched: bool,
    lowerBound? : string,
    upperBound? : string
}


export type FacetAction = {
  type: string,
  generalQuery?: string,
  facetQuery?: string,
  json?: FacetSearchJson,
}


export type SearchAction = {
  type: string,
  apiQuery? : string,
  item?: FacetOption,
  json?: DataSearchJson,
  error?: number
}


type Facet = {
  id: string,
  options: Array<FacetOption>
}

export type Region = {
    regionId: ?string,
    regionType: ?string,
    regionName?: string,
    boundingBox: {
      west: number,
      south: number,
      east: number,
      north: number
  }
}

export type Query ={
    quotes: Array<string>,
    freeText: string,
    regions: (?Region)[],
    formats: Array<string>,
    publishers: Array<string>,
    dateFrom? : string,
    dateTo? : string
}

export type DataSearchJson = {
  query: Query,
  hitCount: number,
  dataSets: Array<Dataset>,
  strategy: string,
  facets: Array<Facet>
}


export type FacetSearchState = {
  data: Array<Object>,
  facetQuery?: string,
  generalQuery?: string,
  isFetching?: boolean,
}

export type RegionMappingState = {
  data: Object,
  isFetching?: boolean
}


export type SearchState = {
  isFetching: boolean,
  datasets: Array<Object>,
  hitCount: number,
  progress: number,
  activePublishers: Array<FacetOption>,
  activeFormats: Array<FacetOption>,
  activeRegion: Region,
  activeDateFrom: ?number,
  activeDateTo: ?number,
  freeText: string,
  publisherOptions: Array<Object>,
  temporalOptions: Array<Object>,
  formatOptions: Array<Object>,
  apiQuery: string,
  error: ?number,
  strategy: string,
}


export type FeaturedAction = {
  type: string,
  json: Array<Object>,
  error: ?number,
}

export type WMSParser = {
  read: (text: string) => Object
}


export type StateRecord = {
  dataset: Dataset,
  distribution: DatasetDistribution,
  datasetIsFetching: boolean,
  distributionIsFetching: boolean,
  datasetFetchError: ?number,
  distributionFetchError: ?number
}


export type StatsAction = {
  type: string,
  error: ?number,
  payload: number
}



export type Stats = {
  datasetCount: number,
  isFetchingDatasetCount: boolean,
  fetchDatasetCountError: ?number
}



export type Dispatch = ()=> Function
export type GetState = () => Object
