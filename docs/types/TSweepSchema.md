---
title: docs/type/TSweepSchema
group: docs
---

# TSweepSchema

```ts
type TSweepSchema = {
    sweepName: ISweepSchema["sweepName"];
} & Partial<ISweepSchema>;
```

Partial sweep schema for override operations.

Requires only the sweep name identifier, all other fields are optional.
Used by overrideSweepSchema() to perform partial updates without replacing entire configuration.
