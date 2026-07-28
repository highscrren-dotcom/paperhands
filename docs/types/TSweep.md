---
title: docs/type/TSweep
group: docs
---

# TSweep

```ts
type TSweep = {
    [key in keyof ISweep]: any;
};
```

Structural mirror of ISweep: the core service exposes the same
public surface as the client it fronts, with DI-level DTOs.
