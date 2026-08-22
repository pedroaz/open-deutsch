import { createDisposableHandoffStore } from "../../scripts/lib/cross-surface-handoff.mjs";

const [dataRoot, id, title] = process.argv.slice(2);
const store = await createDisposableHandoffStore(dataRoot);
await store.createFromMcp({ id, title });
