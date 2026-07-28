---
title: docs/function/listSweepSchema
group: docs
---

# listSweepSchema

```ts
declare function listSweepSchema(): Promise<ISweepSchema[]>;
```

Returns a list of all registered sweep schemas.

Retrieves all sweeps that have been registered via addSweepSchema().
Useful for debugging, documentation, or building dynamic UIs.
