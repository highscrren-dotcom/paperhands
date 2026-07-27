import "./main/entry";

export { 
    setLogger,
} from "./functions/setup.function";

export {
    getRouter,
    serve,
} from "./functions/serve.function";

export {
    setConfig,
    getConfig,
} from "./config/params";

export { ioc as lib } from "./lib";
