///<reference path="./jsverify.d.ts" />
import jsc = require("jsverify");
import { Record } from "../dist/generated/registry/api";

function fromCode(code: number) {
  return String.fromCharCode(code);
}

function toCode(c: string) {
  return c.charCodeAt(0);
}

export const lowerCaseAlphaCharArb = jsc
  .integer(97, 122)
  .smap(fromCode, toCode);
export const numArb = jsc.integer(48, 57).smap(fromCode, toCode);
export const lcAlphaNumCharArb = jsc.oneof([numArb, lowerCaseAlphaCharArb]);
export const lcAlphaNumStringArb = jsc
  .array(lcAlphaNumCharArb)
  .smap(arr => arr.join(""), string => string.split(""));
export const lcAlphaNumStringArbNe = jsc
  .nearray(lcAlphaNumCharArb)
  .smap(arr => arr.join(""), string => string.split(""));

export const recordArb: jsc.Arbitrary<Record> = jsc.record({
  id: lcAlphaNumStringArb,
  name: jsc.string,
  aspects: jsc.array(jsc.json)
});

export const specificRecordArb = (aspectArbs: {
  [key: string]: jsc.Arbitrary<any>;
}): jsc.Arbitrary<Record> =>
  jsc.record({
    id: jsc.nestring,
    name: jsc.string,
    aspects: jsc.record(aspectArbs)
  });

const urlPartsArb = jsc
  .record({
    scheme: jsc.oneof([
      jsc.constant("http"),
      jsc.constant("https"),
      jsc.constant("ftp")
    ]),
    host: jsc.suchthat(
      lcAlphaNumStringArbNe,
      (string: string) => !string.startsWith("ftp")
    ),
    path: jsc.array(lcAlphaNumStringArbNe)
  })
  .smap(
    partialUrlParts => ({
      ...partialUrlParts,
      host:
        (partialUrlParts.scheme === "ftp" ? "ftp" : "") + partialUrlParts.host,
      port: partialUrlParts.scheme === "ftp" ? 30021 : 80
    }),
    urlParts => ({
      ...urlParts,
      port: undefined
    })
  );

export const distUrlArb = urlPartsArb.smap(
  urlParts =>
    `${urlParts.scheme}://${urlParts.host}.com:${urlParts.port}/${(urlParts.path ||
      [])
      .join("/")}` as string,
  (url: string) => {
    const splitAfterScheme = url.split("://")[0];
    const scheme = splitAfterScheme[0];
    const splitOnDotCom = splitAfterScheme[1].split(".com:");
    const host = splitOnDotCom[0];
    const pathSegments = splitOnDotCom[1].split("/");
    const port: number = parseInt(pathSegments[0]);
    const path = pathSegments.slice(1);
    return { scheme, host, port, path };
  }
);

export const distStringsArb = jsc.record({
  downloadURL: jsc.oneof([distUrlArb, jsc.constant(undefined)]),
  accessURL: jsc.oneof([distUrlArb, jsc.constant(undefined)])
});
