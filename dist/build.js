"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_LAMBDA_CODE_DIR = exports.DEFAULT_LAMBDA_CODE_DIR = void 0;
const node_file_trace_1 = __importDefault(require("@zeit/node-file-trace"));
const execa_1 = __importDefault(require("execa"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = require("path");
const getAllFilesInDirectory_1 = __importDefault(require("./lib/getAllFilesInDirectory"));
const path_2 = __importDefault(require("path"));
const sortedRoutes_1 = require("./lib/sortedRoutes");
const isDynamicRoute_1 = __importDefault(require("./lib/isDynamicRoute"));
const pathToPosix_1 = __importDefault(require("./lib/pathToPosix"));
const expressifyDynamicRoute_1 = __importDefault(require("./lib/expressifyDynamicRoute"));
const pathToRegexStr_1 = __importDefault(require("./lib/pathToRegexStr"));
const normalizeNodeModules_1 = __importDefault(require("./lib/normalizeNodeModules"));
const createServerlessConfig_1 = __importDefault(require("./lib/createServerlessConfig"));
exports.DEFAULT_LAMBDA_CODE_DIR = "default-lambda";
exports.API_LAMBDA_CODE_DIR = "api-lambda";
const defaultBuildOptions = {
    args: [],
    cwd: process.cwd(),
    env: {},
    cmd: "./node_modules/.bin/next",
    useServerlessTraceTarget: false,
    logLambdaExecutionTimes: false
};
class Builder {
    constructor(nextConfigDir, outputDir, buildOptions) {
        this.buildOptions = defaultBuildOptions;
        this.nextConfigDir = path_2.default.resolve(nextConfigDir);
        this.dotNextDir = path_2.default.join(this.nextConfigDir, ".next");
        this.serverlessDir = path_2.default.join(this.dotNextDir, "serverless");
        this.outputDir = outputDir;
        if (buildOptions) {
            this.buildOptions = buildOptions;
        }
    }
    readPublicFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const dirExists = yield fs_extra_1.default.pathExists(path_1.join(this.nextConfigDir, "public"));
            if (dirExists) {
                return getAllFilesInDirectory_1.default(path_1.join(this.nextConfigDir, "public"))
                    .map((e) => e.replace(this.nextConfigDir, ""))
                    .map((e) => e.split(path_2.default.sep).slice(2).join("/"));
            }
            else {
                return [];
            }
        });
    }
    readPagesManifest() {
        return __awaiter(this, void 0, void 0, function* () {
            const path = path_1.join(this.serverlessDir, "pages-manifest.json");
            const hasServerlessPageManifest = yield fs_extra_1.default.pathExists(path);
            if (!hasServerlessPageManifest) {
                return Promise.reject("pages-manifest not found. Check if `next.config.js` target is set to 'serverless'");
            }
            const pagesManifest = yield fs_extra_1.default.readJSON(path);
            const pagesManifestWithoutDynamicRoutes = Object.keys(pagesManifest).reduce((acc, route) => {
                if (isDynamicRoute_1.default(route)) {
                    return acc;
                }
                acc[route] = pagesManifest[route];
                return acc;
            }, {});
            const dynamicRoutedPages = Object.keys(pagesManifest).filter(isDynamicRoute_1.default);
            const sortedDynamicRoutedPages = sortedRoutes_1.getSortedRoutes(dynamicRoutedPages);
            const sortedPagesManifest = pagesManifestWithoutDynamicRoutes;
            sortedDynamicRoutedPages.forEach((route) => {
                sortedPagesManifest[route] = pagesManifest[route];
            });
            return sortedPagesManifest;
        });
    }
    copyLambdaHandlerDependencies(fileList, reasons, handlerDirectory) {
        return fileList
            .filter((file) => {
            return ((!reasons[file] || reasons[file].type !== "initial") &&
                file !== "package.json");
        })
            .map((filePath) => {
            const resolvedFilePath = path_2.default.resolve(filePath);
            const dst = normalizeNodeModules_1.default(path_2.default.relative(this.serverlessDir, resolvedFilePath));
            return fs_extra_1.default.copy(resolvedFilePath, path_1.join(this.outputDir, handlerDirectory, dst));
        });
    }
    buildDefaultLambda(buildManifest) {
        return __awaiter(this, void 0, void 0, function* () {
            let copyTraces = [];
            if (this.buildOptions.useServerlessTraceTarget) {
                const ignoreAppAndDocumentPages = (page) => {
                    const basename = path_2.default.basename(page);
                    return basename !== "_app.js" && basename !== "_document.js";
                };
                const allSsrPages = [
                    ...Object.values(buildManifest.pages.ssr.nonDynamic),
                    ...Object.values(buildManifest.pages.ssr.dynamic).map((entry) => entry.file)
                ].filter(ignoreAppAndDocumentPages);
                const ssrPages = Object.values(allSsrPages).map((pageFile) => path_2.default.join(this.serverlessDir, pageFile));
                const { fileList, reasons } = yield node_file_trace_1.default(ssrPages, {
                    base: process.cwd()
                });
                copyTraces = this.copyLambdaHandlerDependencies(fileList, reasons, exports.DEFAULT_LAMBDA_CODE_DIR);
            }
            return Promise.all([
                ...copyTraces,
                fs_extra_1.default.copy(require.resolve("@sls-next/lambda-at-edge/dist/default-handler.js"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "index.js")),
                fs_extra_1.default.writeJson(path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "manifest.json"), buildManifest),
                fs_extra_1.default.copy(path_1.join(this.serverlessDir, "pages"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "pages"), {
                    filter: (file) => {
                        const isNotPrerenderedHTMLPage = path_2.default.extname(file) !== ".html";
                        const isNotStaticPropsJSONFile = path_2.default.extname(file) !== ".json";
                        const isNotApiPage = pathToPosix_1.default(file).indexOf("pages/api") === -1;
                        return (isNotApiPage &&
                            isNotPrerenderedHTMLPage &&
                            isNotStaticPropsJSONFile);
                    }
                }),
                fs_extra_1.default.copy(path_1.join(this.dotNextDir, "prerender-manifest.json"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "prerender-manifest.json")),
                fs_extra_1.default.copy(path_1.join(this.dotNextDir, "routes-manifest.json"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "routes-manifest.json"))
            ]);
        });
    }
    buildApiLambda(apiBuildManifest) {
        return __awaiter(this, void 0, void 0, function* () {
            let copyTraces = [];
            if (this.buildOptions.useServerlessTraceTarget) {
                const allApiPages = [
                    ...Object.values(apiBuildManifest.apis.nonDynamic),
                    ...Object.values(apiBuildManifest.apis.dynamic).map((entry) => entry.file)
                ];
                const apiPages = Object.values(allApiPages).map((pageFile) => path_2.default.join(this.serverlessDir, pageFile));
                const { fileList, reasons } = yield node_file_trace_1.default(apiPages, {
                    base: process.cwd()
                });
                copyTraces = this.copyLambdaHandlerDependencies(fileList, reasons, exports.API_LAMBDA_CODE_DIR);
            }
            return Promise.all([
                ...copyTraces,
                fs_extra_1.default.copy(require.resolve("@sls-next/lambda-at-edge/dist/api-handler.js"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "index.js")),
                fs_extra_1.default.copy(path_1.join(this.serverlessDir, "pages/api"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "pages/api")),
                fs_extra_1.default.writeJson(path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "manifest.json"), apiBuildManifest),
                fs_extra_1.default.copy(path_1.join(this.dotNextDir, "routes-manifest.json"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "routes-manifest.json"))
            ]);
        });
    }
    prepareBuildManifests() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const pagesManifest = yield this.readPagesManifest();
            const buildId = yield fs_extra_1.default.readFile(path_2.default.join(this.dotNextDir, "BUILD_ID"), "utf-8");
            const { logLambdaExecutionTimes = false } = this.buildOptions;
            const defaultBuildManifest = {
                buildId,
                logLambdaExecutionTimes,
                pages: {
                    ssr: {
                        dynamic: {},
                        nonDynamic: {}
                    },
                    html: {
                        dynamic: {},
                        nonDynamic: {}
                    }
                },
                publicFiles: {},
                trailingSlash: false
            };
            const apiBuildManifest = {
                apis: {
                    dynamic: {},
                    nonDynamic: {}
                }
            };
            const ssrPages = defaultBuildManifest.pages.ssr;
            const htmlPages = defaultBuildManifest.pages.html;
            const apiPages = apiBuildManifest.apis;
            const isHtmlPage = (path) => path.endsWith(".html");
            const isApiPage = (path) => path.startsWith("pages/api");
            Object.entries(pagesManifest).forEach(([route, pageFile]) => {
                const dynamicRoute = isDynamicRoute_1.default(route);
                const expressRoute = dynamicRoute ? expressifyDynamicRoute_1.default(route) : null;
                if (isHtmlPage(pageFile)) {
                    if (dynamicRoute) {
                        const route = expressRoute;
                        htmlPages.dynamic[route] = {
                            file: pageFile,
                            regex: pathToRegexStr_1.default(route)
                        };
                    }
                    else {
                        htmlPages.nonDynamic[route] = pageFile;
                    }
                }
                else if (isApiPage(pageFile)) {
                    if (dynamicRoute) {
                        const route = expressRoute;
                        apiPages.dynamic[route] = {
                            file: pageFile,
                            regex: pathToRegexStr_1.default(route)
                        };
                    }
                    else {
                        apiPages.nonDynamic[route] = pageFile;
                    }
                }
                else if (dynamicRoute) {
                    const route = expressRoute;
                    ssrPages.dynamic[route] = {
                        file: pageFile,
                        regex: pathToRegexStr_1.default(route)
                    };
                }
                else {
                    ssrPages.nonDynamic[route] = pageFile;
                }
            });
            const publicFiles = yield this.readPublicFiles();
            publicFiles.forEach((pf) => {
                defaultBuildManifest.publicFiles["/" + pf] = pf;
            });
            const nextConfigPath = path_2.default.join(this.nextConfigDir, "next.config.js");
            if (yield fs_extra_1.default.pathExists(nextConfigPath)) {
                const nextConfig = yield require(nextConfigPath);
                let normalisedNextConfig;
                if (typeof nextConfig === "object") {
                    normalisedNextConfig = nextConfig;
                }
                else if (typeof nextConfig === "function") {
                    normalisedNextConfig = nextConfig("phase-production-server", {});
                }
                defaultBuildManifest.trailingSlash = (_a = normalisedNextConfig === null || normalisedNextConfig === void 0 ? void 0 : normalisedNextConfig.trailingSlash) !== null && _a !== void 0 ? _a : false;
            }
            return {
                defaultBuildManifest,
                apiBuildManifest
            };
        });
    }
    cleanupDotNext() {
        return __awaiter(this, void 0, void 0, function* () {
            const exists = yield fs_extra_1.default.pathExists(this.dotNextDir);
            if (exists) {
                const fileItems = yield fs_extra_1.default.readdir(this.dotNextDir);
                yield Promise.all(fileItems
                    .filter((fileItem) => fileItem !== "cache")
                    .map((fileItem) => fs_extra_1.default.remove(path_1.join(this.dotNextDir, fileItem))));
            }
        });
    }
    build(debugMode) {
        return __awaiter(this, void 0, void 0, function* () {
            const { cmd, args, cwd, env, useServerlessTraceTarget } = Object.assign(defaultBuildOptions, this.buildOptions);
            yield this.cleanupDotNext();
            yield fs_extra_1.default.emptyDir(path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR));
            yield fs_extra_1.default.emptyDir(path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR));
            const { restoreUserConfig } = yield createServerlessConfig_1.default(cwd, path_2.default.join(this.nextConfigDir), useServerlessTraceTarget);
            try {
                const subprocess = execa_1.default(cmd, args, {
                    cwd,
                    env
                });
                if (debugMode) {
                    subprocess.stdout.pipe(process.stdout);
                }
                yield subprocess;
            }
            finally {
                yield restoreUserConfig();
            }
            const { defaultBuildManifest, apiBuildManifest } = yield this.prepareBuildManifests();
            yield this.buildDefaultLambda(defaultBuildManifest);
            const hasAPIPages = Object.keys(apiBuildManifest.apis.nonDynamic).length > 0 ||
                Object.keys(apiBuildManifest.apis.dynamic).length > 0;
            if (hasAPIPages) {
                yield this.buildApiLambda(apiBuildManifest);
            }
        });
    }
}
exports.default = Builder;
