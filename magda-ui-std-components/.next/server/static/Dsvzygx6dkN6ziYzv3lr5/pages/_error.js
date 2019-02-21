module.exports = /******/ (function(modules) {
    // webpackBootstrap
    /******/ // The module cache
    /******/ var installedModules = require("../../../ssr-module-cache.js"); // The require function
    /******/
    /******/ /******/ function __webpack_require__(moduleId) {
        /******/
        /******/ // Check if module is in cache
        /******/ if (installedModules[moduleId]) {
            /******/ return installedModules[moduleId].exports;
            /******/
        } // Create a new module (and put it into the cache)
        /******/ /******/ var module = (installedModules[moduleId] = {
            /******/ i: moduleId,
            /******/ l: false,
            /******/ exports: {}
            /******/
        }); // Execute the module function
        /******/
        /******/ /******/ var threw = true;
        /******/ try {
            /******/ modules[moduleId].call(
                module.exports,
                module,
                module.exports,
                __webpack_require__
            );
            /******/ threw = false;
            /******/
        } finally {
            /******/ if (threw) delete installedModules[moduleId];
            /******/
        } // Flag the module as loaded
        /******/
        /******/ /******/ module.l = true; // Return the exports of the module
        /******/
        /******/ /******/ return module.exports;
        /******/
    } // expose the modules object (__webpack_modules__)
    /******/
    /******/
    /******/ /******/ __webpack_require__.m = modules; // expose the module cache
    /******/
    /******/ /******/ __webpack_require__.c = installedModules; // define getter function for harmony exports
    /******/
    /******/ /******/ __webpack_require__.d = function(exports, name, getter) {
        /******/ if (!__webpack_require__.o(exports, name)) {
            /******/ Object.defineProperty(exports, name, {
                enumerable: true,
                get: getter
            });
            /******/
        }
        /******/
    }; // define __esModule on exports
    /******/
    /******/ /******/ __webpack_require__.r = function(exports) {
        /******/ if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            /******/ Object.defineProperty(exports, Symbol.toStringTag, {
                value: "Module"
            });
            /******/
        }
        /******/ Object.defineProperty(exports, "__esModule", { value: true });
        /******/
    }; // create a fake namespace object // mode & 1: value is a module id, require it // mode & 2: merge all properties of value into the ns // mode & 4: return value when already ns object // mode & 8|1: behave like require
    /******/
    /******/ /******/ /******/ /******/ /******/ /******/ __webpack_require__.t = function(
        value,
        mode
    ) {
        /******/ if (mode & 1) value = __webpack_require__(value);
        /******/ if (mode & 8) return value;
        /******/ if (
            mode & 4 &&
            typeof value === "object" &&
            value &&
            value.__esModule
        )
            return value;
        /******/ var ns = Object.create(null);
        /******/ __webpack_require__.r(ns);
        /******/ Object.defineProperty(ns, "default", {
            enumerable: true,
            value: value
        });
        /******/ if (mode & 2 && typeof value != "string")
            for (var key in value)
                __webpack_require__.d(
                    ns,
                    key,
                    function(key) {
                        return value[key];
                    }.bind(null, key)
                );
        /******/ return ns;
        /******/
    }; // getDefaultExport function for compatibility with non-harmony modules
    /******/
    /******/ /******/ __webpack_require__.n = function(module) {
        /******/ var getter =
            module && module.__esModule
                ? /******/ function getDefault() {
                      return module["default"];
                  }
                : /******/ function getModuleExports() {
                      return module;
                  };
        /******/ __webpack_require__.d(getter, "a", getter);
        /******/ return getter;
        /******/
    }; // Object.prototype.hasOwnProperty.call
    /******/
    /******/ /******/ __webpack_require__.o = function(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
    }; // __webpack_public_path__
    /******/
    /******/ /******/ __webpack_require__.p = ""; // Load entry module and return exports
    /******/
    /******/
    /******/ /******/ return __webpack_require__((__webpack_require__.s = 2));
    /******/
})(
    /************************************************************************/
    /******/ {
        /***/ "/+oN": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/get-prototype-of");

            /***/
        },

        /***/ 2: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("vMAA");

            /***/
        },

        /***/ G8SI: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("gHn/");

            /***/
        },

        /***/ GUE2: /***/ function(module, exports) {
            function _classCallCheck(instance, Constructor) {
                if (!(instance instanceof Constructor)) {
                    throw new TypeError("Cannot call a class as a function");
                }
            }

            module.exports = _classCallCheck;

            /***/
        },

        /***/ IJGv: /***/ function(module, exports) {
            function _interopRequireDefault(obj) {
                return obj && obj.__esModule
                    ? obj
                    : {
                          default: obj
                      };
            }

            module.exports = _interopRequireDefault;

            /***/
        },

        /***/ "M/EP": /***/ function(module, exports, __webpack_require__) {
            var _Symbol$iterator = __webpack_require__("G8SI");

            var _Symbol = __webpack_require__("SI4Z");

            function _typeof2(obj) {
                if (
                    typeof _Symbol === "function" &&
                    typeof _Symbol$iterator === "symbol"
                ) {
                    _typeof2 = function _typeof2(obj) {
                        return typeof obj;
                    };
                } else {
                    _typeof2 = function _typeof2(obj) {
                        return obj &&
                            typeof _Symbol === "function" &&
                            obj.constructor === _Symbol &&
                            obj !== _Symbol.prototype
                            ? "symbol"
                            : typeof obj;
                    };
                }
                return _typeof2(obj);
            }

            function _typeof(obj) {
                if (
                    typeof _Symbol === "function" &&
                    _typeof2(_Symbol$iterator) === "symbol"
                ) {
                    module.exports = _typeof = function _typeof(obj) {
                        return _typeof2(obj);
                    };
                } else {
                    module.exports = _typeof = function _typeof(obj) {
                        return obj &&
                            typeof _Symbol === "function" &&
                            obj.constructor === _Symbol &&
                            obj !== _Symbol.prototype
                            ? "symbol"
                            : _typeof2(obj);
                    };
                }

                return _typeof(obj);
            }

            module.exports = _typeof;

            /***/
        },

        /***/ Pnez: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("TUA0");

            /***/
        },

        /***/ Q823: /***/ function(module, exports) {
            // Generated by CoffeeScript 1.10.0
            module.exports = {
                100: "Continue",
                101: "Switching Protocols",
                200: "OK",
                201: "Created",
                202: "Accepted",
                203: "Non-Authoritative Information",
                204: "No Content",
                205: "Reset Content",
                206: "Partial Content",
                207: "Multi Status",
                208: "Already Reported",
                226: "IM Used",
                300: "Multiple Choices",
                301: "Moved Permanently",
                302: "Found",
                303: "See Other",
                304: "Not Modified",
                305: "Use Proxy",
                306: "Switch Proxy",
                307: "Temporary Redirect",
                308: "Permanent Redirect",
                400: "Bad Request",
                401: "Unauthorized",
                402: "Payment Required",
                403: "Forbidden",
                404: "Not Found",
                405: "Method Not Allowed",
                406: "Not Acceptable",
                407: "Proxy Authentication Required",
                408: "Request Time-out",
                409: "Conflict",
                410: "Gone",
                411: "Length Required",
                412: "Precondition Failed",
                413: "Request Entity Too Large",
                414: "Request-URI Too Large",
                415: "Unsupported Media Type",
                416: "Requested Range not Satisfiable",
                417: "Expectation Failed",
                418: "I'm a teapot",
                421: "Misdirected Request",
                422: "Unprocessable Entity",
                423: "Locked",
                424: "Failed Dependency",
                426: "Upgrade Required",
                428: "Precondition Required",
                429: "Too Many Requests",
                431: "Request Header Fields Too Large",
                451: "Unavailable For Legal Reasons",
                500: "Internal Server Error",
                501: "Not Implemented",
                502: "Bad Gateway",
                503: "Service Unavailable",
                504: "Gateway Time-out",
                505: "HTTP Version not Supported",
                506: "Variant Also Negotiates",
                507: "Insufficient Storage",
                508: "Loop Detected",
                510: "Not Extended",
                511: "Network Authentication Required",
                CONTINUE: 100,
                SWITCHING_PROTOCOLS: 101,
                OK: 200,
                CREATED: 201,
                ACCEPTED: 202,
                NON_AUTHORITATIVE_INFORMATION: 203,
                NO_CONTENT: 204,
                RESET_CONTENT: 205,
                PARTIAL_CONTENT: 206,
                MULTI_STATUS: 207,
                ALREADY_REPORTED: 208,
                IM_USED: 226,
                MULTIPLE_CHOICES: 300,
                MOVED_PERMANENTLY: 301,
                FOUND: 302,
                SEE_OTHER: 303,
                NOT_MODIFIED: 304,
                USE_PROXY: 305,
                SWITCH_PROXY: 306,
                TEMPORARY_REDIRECT: 307,
                PERMANENT_REDIRECT: 308,
                BAD_REQUEST: 400,
                UNAUTHORIZED: 401,
                PAYMENT_REQUIRED: 402,
                FORBIDDEN: 403,
                NOT_FOUND: 404,
                METHOD_NOT_ALLOWED: 405,
                NOT_ACCEPTABLE: 406,
                PROXY_AUTHENTICATION_REQUIRED: 407,
                REQUEST_TIMEOUT: 408,
                CONFLICT: 409,
                GONE: 410,
                LENGTH_REQUIRED: 411,
                PRECONDITION_FAILED: 412,
                REQUEST_ENTITY_TOO_LARGE: 413,
                REQUEST_URI_TOO_LONG: 414,
                UNSUPPORTED_MEDIA_TYPE: 415,
                REQUESTED_RANGE_NOT_SATISFIABLE: 416,
                EXPECTATION_FAILED: 417,
                IM_A_TEAPOT: 418,
                MISDIRECTED_REQUEST: 421,
                UNPROCESSABLE_ENTITY: 422,
                UPGRADE_REQUIRED: 426,
                PRECONDITION_REQUIRED: 428,
                LOCKED: 423,
                FAILED_DEPENDENCY: 424,
                TOO_MANY_REQUESTS: 429,
                REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
                UNAVAILABLE_FOR_LEGAL_REASONS: 451,
                INTERNAL_SERVER_ERROR: 500,
                NOT_IMPLEMENTED: 501,
                BAD_GATEWAY: 502,
                SERVICE_UNAVAILABLE: 503,
                GATEWAY_TIMEOUT: 504,
                HTTP_VERSION_NOT_SUPPORTED: 505,
                VARIANT_ALSO_NEGOTIATES: 506,
                INSUFFICIENT_STORAGE: 507,
                LOOP_DETECTED: 508,
                NOT_EXTENDED: 510,
                NETWORK_AUTHENTICATION_REQUIRED: 511
            };

            /***/
        },

        /***/ SI4Z: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("vqFK");

            /***/
        },

        /***/ TUA0: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/define-property");

            /***/
        },

        /***/ U7sd: /***/ function(module, exports) {
            module.exports = require("next-server/head");

            /***/
        },

        /***/ Wk4r: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/set-prototype-of");

            /***/
        },

        /***/ "XMn/": /***/ function(module, exports, __webpack_require__) {
            var _Object$create = __webpack_require__("XYqc");

            var setPrototypeOf = __webpack_require__("bsjJ");

            function _inherits(subClass, superClass) {
                if (typeof superClass !== "function" && superClass !== null) {
                    throw new TypeError(
                        "Super expression must either be null or a function"
                    );
                }

                subClass.prototype = _Object$create(
                    superClass && superClass.prototype,
                    {
                        constructor: {
                            value: subClass,
                            writable: true,
                            configurable: true
                        }
                    }
                );
                if (superClass) setPrototypeOf(subClass, superClass);
            }

            module.exports = _inherits;

            /***/
        },

        /***/ XYqc: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("o5io");

            /***/
        },

        /***/ aPDU: /***/ function(module, exports, __webpack_require__) {
            var _Object$defineProperty = __webpack_require__("Pnez");

            function _defineProperties(target, props) {
                for (var i = 0; i < props.length; i++) {
                    var descriptor = props[i];
                    descriptor.enumerable = descriptor.enumerable || false;
                    descriptor.configurable = true;
                    if ("value" in descriptor) descriptor.writable = true;

                    _Object$defineProperty(target, descriptor.key, descriptor);
                }
            }

            function _createClass(Constructor, protoProps, staticProps) {
                if (protoProps)
                    _defineProperties(Constructor.prototype, protoProps);
                if (staticProps) _defineProperties(Constructor, staticProps);
                return Constructor;
            }

            module.exports = _createClass;

            /***/
        },

        /***/ bsjJ: /***/ function(module, exports, __webpack_require__) {
            var _Object$setPrototypeOf = __webpack_require__("vzQs");

            function _setPrototypeOf(o, p) {
                module.exports = _setPrototypeOf =
                    _Object$setPrototypeOf ||
                    function _setPrototypeOf(o, p) {
                        o.__proto__ = p;
                        return o;
                    };

                return _setPrototypeOf(o, p);
            }

            module.exports = _setPrototypeOf;

            /***/
        },

        /***/ cDcd: /***/ function(module, exports) {
            module.exports = require("react");

            /***/
        },

        /***/ "gHn/": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol/iterator");

            /***/
        },

        /***/ hHLE: /***/ function(module, exports, __webpack_require__) {
            var _Object$getPrototypeOf = __webpack_require__("o+sT");

            var _Object$setPrototypeOf = __webpack_require__("vzQs");

            function _getPrototypeOf(o) {
                module.exports = _getPrototypeOf = _Object$setPrototypeOf
                    ? _Object$getPrototypeOf
                    : function _getPrototypeOf(o) {
                          return o.__proto__ || _Object$getPrototypeOf(o);
                      };
                return _getPrototypeOf(o);
            }

            module.exports = _getPrototypeOf;

            /***/
        },

        /***/ if0H: /***/ function(module, exports, __webpack_require__) {
            var _typeof = __webpack_require__("M/EP");

            var assertThisInitialized = __webpack_require__("v2ln");

            function _possibleConstructorReturn(self, call) {
                if (
                    call &&
                    (_typeof(call) === "object" || typeof call === "function")
                ) {
                    return call;
                }

                return assertThisInitialized(self);
            }

            module.exports = _possibleConstructorReturn;

            /***/
        },

        /***/ "o+sT": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("/+oN");

            /***/
        },

        /***/ o5io: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/create");

            /***/
        },

        /***/ rf6O: /***/ function(module, exports) {
            module.exports = require("prop-types");

            /***/
        },

        /***/ v2ln: /***/ function(module, exports) {
            function _assertThisInitialized(self) {
                if (self === void 0) {
                    throw new ReferenceError(
                        "this hasn't been initialised - super() hasn't been called"
                    );
                }

                return self;
            }

            module.exports = _assertThisInitialized;

            /***/
        },

        /***/ vMAA: /***/ function(module, exports, __webpack_require__) {
            "use strict";

            var _interopRequireDefault = __webpack_require__("IJGv");

            var _classCallCheck2 = _interopRequireDefault(
                __webpack_require__("GUE2")
            );

            var _createClass2 = _interopRequireDefault(
                __webpack_require__("aPDU")
            );

            var _possibleConstructorReturn2 = _interopRequireDefault(
                __webpack_require__("if0H")
            );

            var _getPrototypeOf2 = _interopRequireDefault(
                __webpack_require__("hHLE")
            );

            var _inherits2 = _interopRequireDefault(
                __webpack_require__("XMn/")
            );

            var __importDefault =
                (void 0 && (void 0).__importDefault) ||
                function(mod) {
                    return mod && mod.__esModule
                        ? mod
                        : {
                              default: mod
                          };
                };

            Object.defineProperty(exports, "__esModule", {
                value: true
            });

            var react_1 = __importDefault(__webpack_require__("cDcd"));

            var prop_types_1 = __importDefault(__webpack_require__("rf6O"));

            var http_status_1 = __importDefault(__webpack_require__("Q823"));

            var head_1 = __importDefault(__webpack_require__("U7sd"));

            var Error =
                /*#__PURE__*/
                (function(_react_1$default$Comp) {
                    (0, _inherits2.default)(Error, _react_1$default$Comp);

                    function Error() {
                        (0, _classCallCheck2.default)(this, Error);
                        return (0, _possibleConstructorReturn2.default)(
                            this,
                            (0, _getPrototypeOf2.default)(Error).apply(
                                this,
                                arguments
                            )
                        );
                    }

                    (0, _createClass2.default)(
                        Error,
                        [
                            {
                                key: "render",
                                value: function render() {
                                    var statusCode = this.props.statusCode;
                                    var title =
                                        statusCode === 404
                                            ? "This page could not be found"
                                            : http_status_1.default[
                                                  statusCode
                                              ] ||
                                              "An unexpected error has occurred";
                                    return react_1.default.createElement(
                                        "div",
                                        {
                                            style: styles.error
                                        },
                                        react_1.default.createElement(
                                            head_1.default,
                                            null,
                                            react_1.default.createElement(
                                                "meta",
                                                {
                                                    name: "viewport",
                                                    content:
                                                        "width=device-width, initial-scale=1.0"
                                                }
                                            ),
                                            react_1.default.createElement(
                                                "title",
                                                null,
                                                statusCode,
                                                ": ",
                                                title
                                            )
                                        ),
                                        react_1.default.createElement(
                                            "div",
                                            null,
                                            react_1.default.createElement(
                                                "style",
                                                {
                                                    dangerouslySetInnerHTML: {
                                                        __html:
                                                            "body { margin: 0 }"
                                                    }
                                                }
                                            ),
                                            statusCode
                                                ? react_1.default.createElement(
                                                      "h1",
                                                      {
                                                          style: styles.h1
                                                      },
                                                      statusCode
                                                  )
                                                : null,
                                            react_1.default.createElement(
                                                "div",
                                                {
                                                    style: styles.desc
                                                },
                                                react_1.default.createElement(
                                                    "h2",
                                                    {
                                                        style: styles.h2
                                                    },
                                                    title,
                                                    "."
                                                )
                                            )
                                        )
                                    );
                                }
                            }
                        ],
                        [
                            {
                                key: "getInitialProps",
                                value: function getInitialProps(_ref) {
                                    var res = _ref.res,
                                        err = _ref.err;
                                    var statusCode =
                                        res && res.statusCode
                                            ? res.statusCode
                                            : err
                                                ? err.statusCode
                                                : 404;
                                    return {
                                        statusCode: statusCode
                                    };
                                }
                            }
                        ]
                    );
                    return Error;
                })(react_1.default.Component);

            Error.displayName = "ErrorPage";
            exports.default = Error;

            if (false) {
            }

            var styles = {
                error: {
                    color: "#000",
                    background: "#fff",
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
                    height: "100vh",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center"
                },
                desc: {
                    display: "inline-block",
                    textAlign: "left",
                    lineHeight: "49px",
                    height: "49px",
                    verticalAlign: "middle"
                },
                h1: {
                    display: "inline-block",
                    borderRight: "1px solid rgba(0, 0, 0,.3)",
                    margin: 0,
                    marginRight: "20px",
                    padding: "10px 23px 10px 0",
                    fontSize: "24px",
                    fontWeight: 500,
                    verticalAlign: "top"
                },
                h2: {
                    fontSize: "14px",
                    fontWeight: "normal",
                    lineHeight: "inherit",
                    margin: 0,
                    padding: 0
                }
            };

            /***/
        },

        /***/ vqFK: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol");

            /***/
        },

        /***/ vzQs: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("Wk4r");

            /***/
        }

        /******/
    }
);
