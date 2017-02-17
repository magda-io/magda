// @flow

export type DatasetDistribution = {
  "format": string,
  "mediaType": string,
  "downloadURL":string,
  "description": string,
  "modified": string,
  "license": {
    "name": string,
    },
  "issued": string,
  "title": string,
}

export type DatasetPublisher = {
  "name": string,
  "extraFields": {
    "description": string
  }
}

export type Dataset = {
  "years": string,
  "catalog": string,
  "spatial": Object,
  "identifier": string,
  "description": string,
  "accrualPeriodicity": Object,
  "landingPage": string,
  "keyword": Array<string>,
  "modified": string,
  "issued": string,
  "contactPoint": Object,
  "temporal": {
    "start": {
      "date": string,
      "text": string
    },
    "end": {
      "date": string,
      "text": string 
    }
  },
  "language": string,
  "distributions": Array<DatasetDistribution>,
  "publisher": DatasetPublisher,
  "title": string,
  "theme": Array<any>
}

export type FacetSearchJson = {
  options: any[],
  regionWmsMap: Object
};



export type DataSearchJson = {
  "query": {
    "quotes": Array<string>,
    "freeText": string,
    "regions": Array<string>,
    "formats": Array<string>,
    "publishers": Array<string>
    },
  "hitCount": number,
  "dataSets": Array<Dataset>,
  "strategy": "match-all",
  "facets": Array<Object>
}


export type FacetAction = {
  type: string,
  generalQuery?: string,
  facetQuery?: string,
  json?: FacetSearchJson
}

export type DataAction = {
  type: string,
  apiQuery? : string,
  errorMessage? : string,
  item?: string,
  json: DataSearchJson
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

export type Action = DataAction | FacetAction;

export type SearchState = {
  isFetching: boolean,
  datasets: Array<Object>,
  hitCount: number,
  progress: number,
  activePublishers: Array<string>,
  activeFormats: Array<string>,
  activeRegion: {
      regionId: ?string,
      regionType: ?string,
      boundingBox: {
      west: number,
      south: number,
      east: number,
      north: number
    }
  },
  activeDateFrom: ?string,
  activeDateTo: ?string,
  freeText: string,
  publisherOptions: Array<Object>,
  temporalOptions: Array<Object>,
  formatOptions: Array<Object>,
  apiQuery: string,
  hasError: boolean,
  strategy: string,
  errorMessage: string
}