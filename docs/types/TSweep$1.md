---
title: docs/type/TSweep$1
group: docs
---

# TSweep$1

```ts
type TSweep$1 = {
    [key in keyof ISweep]: any;
};
```

Structural mirror of ISweep: the global service exposes the
same public surface as the client it fronts, with DI-level DTOs.
