/// <reference types="node" />
import { NodeFileTraceReasons } from "@zeit/node-file-trace";
import { OriginRequestDefaultHandlerManifest, OriginRequestApiHandlerManifest } from "../types";
export declare const DEFAULT_LAMBDA_CODE_DIR = "default-lambda";
export declare const API_LAMBDA_CODE_DIR = "api-lambda";
declare type BuildOptions = {
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    cmd?: string;
    useServerlessTraceTarget?: boolean;
    logLambdaExecutionTimes?: boolean;
};
declare class Builder {
    nextConfigDir: string;
    dotNextDir: string;
    serverlessDir: string;
    outputDir: string;
    buildOptions: BuildOptions;
    constructor(nextConfigDir: string, outputDir: string, buildOptions?: BuildOptions);
    readPublicFiles(): Promise<string[]>;
    readPagesManifest(): Promise<{
        [key: string]: string;
    }>;
    copyLambdaHandlerDependencies(fileList: string[], reasons: NodeFileTraceReasons, handlerDirectory: string): Promise<void>[];
    buildDefaultLambda(buildManifest: OriginRequestDefaultHandlerManifest): Promise<void[]>;
    buildApiLambda(apiBuildManifest: OriginRequestApiHandlerManifest): Promise<void[]>;
    prepareBuildManifests(): Promise<{
        defaultBuildManifest: OriginRequestDefaultHandlerManifest;
        apiBuildManifest: OriginRequestApiHandlerManifest;
    }>;
    cleanupDotNext(): Promise<void>;
    build(debugMode: boolean): Promise<void>;
}
export default Builder;
