///<reference path="./jsverify.d.ts" />
import jsverify = require("jsverify");
const { curried2 } = require("jsverify/lib/utils");
import { Record } from "../../src/generated/registry/api";
const lazyseq = require("lazy-seq");
import uuid = require("uuid/v4");
import * as _ from "lodash";

function fromCode(code: number) {
  return String.fromCharCode(code);
}

function toCode(c: string) {
  return c.charCodeAt(0);
}

export type jsc = {
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
  shrink: jsverify.ShrinkFunctions;
  generator: jsverify.GeneratorFunctions;
  show: jsverify.ShowFunctions;
  bless<U>(arb: jsverify.ArbitraryLike<U>): jsverify.Arbitrary<U>;
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

const uuidArb: (jsc: jsc) => jsverify.Arbitrary<string> = (jsc: jsc) =>
  jsc.bless({
    generator: jsc.generator.bless(x => uuid()),
    shrink: jsc.shrink.bless(x => [uuid()]),
    show: (x: string) => x
  });

export const recordArb = (jsc: jsc) =>
  jsc.record<Record>({
    id: uuidArb(jsc), //lcAlphaNumStringArb(jsc),
    name: jsc.string,
    aspects: jsc.array(jsc.json)
  });

export const specificRecordArb = (jsc: jsc) => (aspectArbs: {
  [key: string]: jsverify.Arbitrary<any>;
}) =>
  jsc.record<Record>({
    id: uuidArb(jsc), //lcAlphaNumStringArbNe(jsc),
    name: jsc.string,
    aspects: jsc.record(aspectArbs)
  });

const defaultSchemeArb = (jsc: jsc) =>
  jsc.oneof([
    jsc.constant("http"),
    jsc.constant("https"),
    jsc.constant("ftp"),
    lcAlphaNumStringArbNe(jsc)
  ]);

type urlArbOptions = {
  schemeArb?: jsverify.Arbitrary<string>;
  hostArb?: jsverify.Arbitrary<string>;
};

function shrinkArrayWithMinimumSize<T>(
  jsc: jsc,
  size: number
): (x: jsverify.Shrink<T>) => jsverify.Shrink<T[]> {
  function shrinkArrayImpl(...args: any[]) {
    const shrink: (x: any) => Array<any> = args[0];
    const result: any = jsc.shrink.bless(function(arr: Array<any>) {
      if (arr.length <= size) {
        return lazyseq.nil;
      } else {
        var x = arr[0];
        var xs = arr.slice(1);

        return lazyseq
          .cons(xs, lazyseq.nil)
          .append(
            shrink(x).map(function(xp: any) {
              return [xp].concat(xs);
            })
          )
          .append(
            shrinkArrayImpl(shrink, xs).map(function(xsp: any) {
              return [x].concat(xsp);
            })
          );
      }
    });

    return curried2(result, args);
  }

  return shrinkArrayImpl;
}

export type MonadicArb<T> = jsverify.Arbitrary<T> & {
  flatMap<U>(
    arbForward: (t: T) => jsverify.Arbitrary<U>,
    backwards: (u: U) => T
  ): MonadicArb<U>;
};

/** Sometimes jsverify returns a lazy-seq when it should return an array, this makes sure it's an array. */
function unSeq<T>(maybeArray: any): T[] {
  return maybeArray.toArray ? maybeArray.toArray() : maybeArray;
}

export function arbFlatMap<T, U>(
  jsc: jsc,
  arb: jsverify.Arbitrary<T>,
  arbForward: (t: T) => jsverify.Arbitrary<U>,
  backwards: (u: U) => T,
  show: (u: U) => string = u => JSON.stringify(u)
): MonadicArb<U> {
  const x = jsc.bless<U>({
    generator: arb.generator.flatmap((t: T) => {
      return arbForward(t).generator;
    }),
    show,
    shrink: jsc.shrink.bless((u: U) => {
      const t = backwards(u);
      const ts = unSeq<T>(arb.shrink(t));
      const us = _.flatMap(ts, thisT => unSeq<U>(arbForward(thisT).shrink(u)));
      return us;
    })
  });

  return {
    ...x,
    flatMap<V>(
      arbForward: (u: U) => jsverify.Arbitrary<V>,
      backwards: (v: V) => U
    ): MonadicArb<V> {
      return arbFlatMap<U, V>(jsc, x, arbForward, backwards);
    }
  };
}

function generateArrayOfSize<T>(
  jsc: jsc,
  arrSize: number,
  gen: jsverify.Generator<T>
): jsverify.Generator<T[]> {
  var result = jsc.generator.bless(function(size: number) {
    var arr = new Array(arrSize);
    for (var i = 0; i < arrSize; i++) {
      arr[i] = gen(size);
    }
    return arr;
  });

  return curried2(result, arguments);
}

export function arrayOfSizeArb<T>(
  jsc: jsc,
  size: number,
  arb: jsverify.Arbitrary<T>
): jsverify.Arbitrary<T[]> {
  return jsc.bless<T[]>({
    generator: generateArrayOfSize(jsc, size, arb.generator),
    shrink: shrinkArrayWithMinimumSize<T>(jsc, size)(arb.shrink),
    show: x => x.toString()
  });
}

const urlPartsArb = (jsc: jsc, options: urlArbOptions) =>
  jsc.record({
    scheme: options.schemeArb,
    host: jsc.suchthat(
      options.hostArb,
      (string: string) => !string.startsWith("ftp")
    ),
    port: jsc.oneof([
      jsc.integer(1, 65000),
      jsc.constant(80),
      jsc.constant(21)
    ]),
    path: jsc.array(lcAlphaNumStringArbNe(jsc))
  });

export const distUrlArb = (
  jsc: jsc,
  {
    schemeArb = defaultSchemeArb(jsc),
    hostArb = lcAlphaNumStringArbNe(jsc)
  }: urlArbOptions = {}
) =>
  urlPartsArb(jsc, { schemeArb, hostArb }).smap(
    urlParts => {
      const port =
        (urlParts.scheme === "http" && urlParts.port === 80) ||
        (urlParts.scheme === "ftp" && urlParts.port === 21)
          ? ""
          : ":" + urlParts.port;

      return `${urlParts.scheme}://${urlParts.host}.com${port}/${(urlParts.path ||
        [])
        .join("/")}` as string;
    },
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

export const distStringsArb = (
  jsc: jsc,
  customDistUrlArb: jsverify.Arbitrary<String> = jsc.oneof([
    distUrlArb(jsc),
    jsc.constant(undefined)
  ])
) =>
  jsc.record({
    downloadURL: customDistUrlArb,
    accessURL: customDistUrlArb
  });
