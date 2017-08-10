///<reference path="./jsverify.d.ts" />
import jsverify = require("jsverify");
import { Record } from "../dist/generated/registry/api";

function fromCode(code: number) {
  return String.fromCharCode(code);
}

function toCode(c: string) {
  return c.charCodeAt(0);
}

type jsc = {
  integer: jsverify.Arbitrary<number> &
    jsverify.integerFn &
    jsverify.integerFn2;

  oneof: <T>(x: jsverify.Arbitrary<T>[]) => jsverify.Arbitrary<T>;
  array: <T>(arb: jsverify.Arbitrary<T>) => jsverify.Arbitrary<T[]>;
  nearray: <T>(arb: jsverify.Arbitrary<T>) => jsverify.Arbitrary<T[]>;
  record<T>(
    arbs: { [P in keyof T]: jsverify.Arbitrary<T[P]> }
  ): jsverify.Arbitrary<T>;
  string: jsverify.Arbitrary<string>;
  json: jsverify.Arbitrary<any>;
  constant<T>(x: T): jsverify.Arbitrary<T>;
  suchthat<U>(
    arb: jsverify.Arbitrary<U>,
    predicate: (u: U) => boolean
  ): jsverify.Arbitrary<U>;
};

export const lowerCaseAlphaCharArb = ({ integer }: jsc) =>
  integer(97, 122).smap(fromCode, toCode);
export const numArb = ({ integer }: jsc) =>
  integer(48, 57).smap(fromCode, toCode);
export const lcAlphaNumCharArb = (jsc: jsc) =>
  jsc.oneof([numArb(jsc), lowerCaseAlphaCharArb(jsc)]);
export const lcAlphaNumStringArb = (jsc: jsc) =>
  jsc
    .array(lcAlphaNumCharArb(jsc))
    .smap((arr: any) => arr.join(""), (string: string) => string.split(""));
export const lcAlphaNumStringArbNe = (jsc: jsc) =>
  jsc
    .nearray(lcAlphaNumCharArb(jsc))
    .smap((arr: any) => arr.join(""), (string: string) => string.split(""));

export const recordArb = (jsc: jsc) =>
  jsc.record<Record>({
    id: lcAlphaNumStringArb(jsc),
    name: jsc.string,
    aspects: jsc.array(jsc.json)
  });

export const specificRecordArb = (jsc: jsc) => (aspectArbs: {
  [key: string]: jsverify.Arbitrary<any>;
}) =>
  jsc.record<Record>({
    id: lcAlphaNumStringArbNe(jsc),
    name: jsc.string,
    aspects: jsc.record(aspectArbs)
  });

const urlPartsArb = (jsc: jsc) =>
  jsc
    .record({
      scheme: jsc.oneof([
        jsc.constant("http"),
        jsc.constant("https"),
        jsc.constant("ftp")
      ]),
      host: jsc.suchthat(
        lcAlphaNumStringArbNe(jsc),
        (string: string) => !string.startsWith("ftp")
      ),
      path: jsc.array(lcAlphaNumStringArbNe(jsc))
    })
    .smap(
      partialUrlParts => ({
        ...partialUrlParts,
        host:
          (partialUrlParts.scheme === "ftp" ? "ftp" : "") +
          partialUrlParts.host,
        port: partialUrlParts.scheme === "ftp" ? 30021 : 80
      }),
      urlParts => ({
        ...urlParts,
        port: undefined
      })
    );

export const distUrlArb = (jsc: jsc) =>
  urlPartsArb(jsc).smap(
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

export const distStringsArb = (jsc: jsc) =>
  jsc.record({
    downloadURL: jsc.oneof([distUrlArb(jsc), jsc.constant(undefined)]),
    accessURL: jsc.oneof([distUrlArb(jsc), jsc.constant(undefined)])
  });
