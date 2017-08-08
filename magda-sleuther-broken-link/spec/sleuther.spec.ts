import {} from "mocha";
// import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
///<reference path="@magda/typescript-common/spec/jsverify.d.ts" />
import jsc = require("jsverify");
import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import { onRecordFound } from "../src/sleuther";
import {
  specificRecordArb,
  distStringsArb
} from "@magda/typescript-common/spec/arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/spec/util";
// import setupFtp from "./setup-ftp";
const setupFtp = require("./setup-ftp");
// const overrideDNS = require("./override-dns");
// import overrideDNS from "./override-dns";
const dns = require("dns");

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
  this.timeout(5000);
  nock.disableNetConnect();
  const registryUrl = "http://example.com";
  // let dnsOverride: any;
  let ftp: any;

  before(() => {
    // dnsOverride = overrideDNS();
    const originalDns = dns.lookup;

    sinon.stub(dns, "lookup").callsFake((hostname, options, callback) => {
      if (hostname.startsWith("ftp")) {
        console.log("DNSING:" + hostname);

        callback(null, "127.0.0.1", 4);
      } else {
        console.log("NOT DNSING:" + hostname);
        originalDns(hostname, options, callback);
      }
    });

    sinon.stub(console, "info");

    ftp = setupFtp();
  });

  after(() => {
    dns.lookup.restore();

    // if (dnsOverride) {
    //   dnsOverride.close();
    // }

    ftp.close();
  });

  const recordArb = specificRecordArb({
    "dataset-distributions": jsc.record({
      distributions: jsc.array(
        specificRecordArb({
          "dcat-distribution-strings": distStringsArb
        })
      )
    })
  });

  jsc.property("Should do a thing", recordArb, (record: Record) => {
    const registryScope = nock(registryUrl);

    const allDists = record.aspects["dataset-distributions"].distributions;

    const allDistStrings = _(allDists)
      .map((dist: any) => dist.aspects["dcat-distribution-strings"])
      .value();

    const httpDistUrls = _(allDistStrings)
      .map(_.values)
      .flatten()
      .filter(x => !!x)
      .filter((x: string) => !x.startsWith("ftp"))
      .map(x => x as string)
      .value();

    console.log(`Dist urls: ${httpDistUrls}`);

    const distScopes = httpDistUrls.map(url =>
      nock(url).head(url.endsWith("/") ? "/" : "").reply(200)
    );

    // const allDistsWithUrls = allDists.filter((dist: any) => {
    //   const strings = dist.aspects["dcat-distribution-strings"];
    //   return strings.downloadURL || strings.accessURL;
    // });

    allDists.forEach((dist: Record) => {
      console.log(
        `/records/${encodeURIComponentWithApost(
          dist.id
        )}/aspects/source-link-status`
      );
      registryScope
        .put(
          `/records/${encodeURIComponentWithApost(
            dist.id
          )}/aspects/source-link-status`,
          () => true
        )
        .reply(201);
    });

    if (allDists.length > 0) {
      console.log(
        `/records/${encodeURIComponentWithApost(
          record.id
        )}/aspects/dataset-quality-rating`
      );
      registryScope
        .patch(
          `/records/${encodeURIComponentWithApost(
            record.id
          )}/aspects/dataset-quality-rating`,
          () => true
        )
        .reply(201);
    }

    const registry = new Registry({
      baseUrl: registryUrl,
      maxRetries: 0
    });

    return onRecordFound(registry, record).then(() => {
      registryScope.done();
      distScopes.forEach(scope => scope.done());

      return true;
    });
  });

  const emptyRecordArb = jsc.oneof([
    specificRecordArb({
      "dataset-distributions": jsc.constant(undefined)
    }),
    specificRecordArb({
      "dataset-distributions": jsc.record({
        distributions: jsc.constant([])
      })
    })
  ]);

  jsc.property(
    "Should do nothing if no distributions",
    emptyRecordArb,
    record => {
      const registryScope = nock(registryUrl);

      const registry = new Registry({
        baseUrl: registryUrl
      });

      return onRecordFound(registry, record).then(() => {
        registryScope.done();
        return true;
      });
    }
  );
});
