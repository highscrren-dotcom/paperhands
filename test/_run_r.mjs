import "./config/setup.mjs"

import { run } from 'worker-testbed'

import "./r/per_signal.test.mjs";
import "./r/alias.test.mjs";

run(import.meta.url, () => {
    console.log("All tests are finished");
    // Give tape a beat to finalize the LAST test record: an immediate exit
    // races its onEnd tick and reports "test exited without ending"
    setTimeout(() => process.exit(-1), 250);
});
