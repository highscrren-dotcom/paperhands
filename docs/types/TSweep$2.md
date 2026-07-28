---
title: docs/type/TSweep$2
group: docs
---

# TSweep$2

```ts
type TSweep$2 = {
    [key in keyof ISweep]: any;
};
```

Structural mirror of ISweep: the connection service exposes the
same public surface as the client it manages, with DI-level DTOs.
