/**
 * The browser entry point.
 *
 * This module exists so that `main.ts` can be imported without booting. A
 * top-level `void boot()` in `main.ts` meant that merely importing it created a
 * PixiJS application, grabbed `#app` and attached window listeners — which is
 * why the integration layer had no test at all: there was no way to import it
 * and not run it. Importing is now free; running is this file, and this file is
 * the only thing `index.html` loads.
 */

import { boot } from './main.js';

void boot();
