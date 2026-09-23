/**
 * Dexie needs a global IndexedDB. `fake-indexeddb` provides a spec-compliant
 * in-memory implementation, which lets the persistence layer be tested exactly
 * as the browser runs it (same migrations, same transactions).
 */
import "fake-indexeddb/auto";
