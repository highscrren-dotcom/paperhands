---
title: docs/interface/ISweep
group: docs
---

# ISweep

Public surface of a sweep client.

## Methods

### run

```ts
run: (symbol: string, ideas: ISweepIdea[]) => Promise<ISweepResult>
```

Runs the full simulation for a symbol over the given ideas:
profiles -&gt; author filter -&gt; grid evaluation -&gt; rankings.
