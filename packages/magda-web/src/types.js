// @flow

export type JsonData = {
  options: any[],
  regionWmsMap: Object
};

type FacetAction = {
  type: string,
  item?: string
}

type DataAction = {
  type: string,
  generalQuery?: string,
  facetQuery?: string,
  apiQuery? : string,
  errorMessage? : string,
  json?: JsonData
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