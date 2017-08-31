var express = require('express');
var graphqlHTTP = require('express-graphql');
var {
  graphql,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLID,
  GraphQLNonNull
} = require('graphql');

var Registry = require('@magda/typescript-common/dist/Registry').default;
// var AsyncPage, { forEachAsync } = require('@magda/typescript-common/dist/AsyncPage');

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
});


// Construct a schema, using GraphQL schema language

const SourceLinkStatus_Status = new GraphQLEnumType({
  name: 'SourceLinkStatus_Status',
  values: {
    ACTIVE: {},
    BROKEN: {}
  }
});

const SourceLinkStatus = new GraphQLObjectType({
  name: 'SourceLinkStatus',
  fields: {
    status: {
      type: SourceLinkStatus_Status,
      resolve(parent) {
        return parent.status.toUpperCase();
      }
    },
    httpStatusCode: {type: GraphQLInt}
  }
});

const DatasetDistributions = new GraphQLObjectType({
  name: 'DatasetDistributions',
  fields: () => ({
    distributions: {
      type: new GraphQLList(Record),
      resolve(parent) {
        return parent.distributions.map(id => ({id}));
      }
    }
  })
});

const Record = new GraphQLObjectType({
  // Works only when Record is a child of allRecords
  // When Record is a child of an aspect, need to add resolvers to name & aspects (probably using facebook/dataloader or calebmer/graphql-resolve-batch)
  name: 'Record',
  fields: {
    id: {type: GraphQLID},
    name: {
      // Need to move this getRecord into dataloader or similar
      type: GraphQLString,
      async resolve(parent) {
        return parent.name || (await registry.getRecord(encodeURIComponent(parent.id))).name;
      }
    },
    aspects: {
      // Need to move this getRecord into dataloader or similar
      type: new GraphQLList(GraphQLString),
      async resolve(parent) {
        return parent.aspects || (await registry.getRecord(encodeURIComponent(parent.id))).aspects;
      }
    },
    source_link_status: {
      type: SourceLinkStatus,
      async resolve(parent) {
        const record = await registry.getRecord(encodeURIComponent(parent.id), undefined, ['source-link-status']);
        return record.aspects['source-link-status'] || null;
      }
    },
    dataset_distributions: {
      type: DatasetDistributions,
      async resolve(parent) {
        const record = await registry.getRecord(encodeURIComponent(parent.id), undefined, ['dataset-distributions']);
        return record.aspects['dataset-distributions'] || null;
      }
    }
  }
});

const Query = new GraphQLObjectType({
  name: 'Query',
  fields: {
    allRecords: {
      type: new GraphQLObjectType({
        name: 'AllRecordsResponse',
        fields: {
          nextToken: {type: GraphQLString},
          records: {type: new GraphQLList(Record)},
        }
      }),
      args: {
        limit: {type: new GraphQLNonNull(GraphQLInt)},
        token: {type: GraphQLString}
      },
      async resolve(parent, {limit, token}) {
        let records = [];
        let originalOffset = 0;
        let nextPageToken = undefined;
        if (token) {
          [, originalOffset, nextPageToken] = token.match(/^([0-9])+:(.*)$/);
        }
        while (true) {
          // Fetch next page
          const page = await registry.getRecords(undefined, undefined, nextPageToken, undefined);
          if (originalOffset > 0) {
            page.records = page.records.slice(originalOffset);
          }
          if (page.records.length === 0) {
            return {nextToken: `0:${page.nextPageToken}`, records};
          }
          // Get up to limit-records.length items
          const numToAdd = Math.min(limit - records.length, page.records.length);
          records = records.concat(page.records.slice(0, numToAdd));
          if (records.length === limit) {
            return {nextToken: `${numToAdd}:${nextPageToken || 0}`, records};
          }
          nextPageToken = page.nextPageToken;
        }
      }
    }
  }
});

const schema = new GraphQLSchema({
  query: Query
});

// var schema = buildSchema(`
//   type Query {
//     allRecords(limit: Int!, token: String!): [Record!]!
//     Record(id: ID): Record
//   }

//   type Record {
//     id: ID!
//     name: String!
//     aspects: [String!]!
//     source_link_status: SourceLinkStatus
//   }

//   type SourceLinkStatus {
//     status: SourceLinkStatus_Status!,
//     httpStatusCode: Int
//   }

//   enum SourceLinkStatus_Status {
//     ACTIVE
//     BROKEN
//   }
// `);

// The root provides a resolver function for each API endpoint
// var root = {
//   allRecords: ({limit, token}) => {
//     return 'Hello world!';
//   },
// };

var app = express();
app.use('/graphql', graphqlHTTP({
  schema: schema,
//   rootValue: root,
  graphiql: true,
}));
app.listen(4000);
console.log('Running a GraphQL API server at localhost:4000/graphql');
