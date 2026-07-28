---
title: docs/function/overrideSweepSchema
group: docs
---

# overrideSweepSchema

```ts
declare function overrideSweepSchema(sweepSchema: TSweepSchema): Promise<ISweepSchema>;
```

Overrides an existing sweep configuration in the framework.

This function partially updates a previously registered sweep with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

Note: the connection layer memoizes ClientSweep instances by
sweep name — an override after the first run takes effect for
new instances only (see SweepConnectionService.clear).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `sweepSchema` | Partial sweep configuration object |
