---
title: docs/interface/ISweepAbsorbedIdea
group: docs
---

# ISweepAbsorbedIdea

An idea absorbed by a busy slot — a signal that never traded
because THAT AUTHOR'S prior position still held his slot (slots
are per-author, so absorbedIdea.author always equals the holding
trade's author). Carries the author as well as the id so
per-author analysis reads straight off the artifact, no feed join.

## Properties

### ideaId

```ts
ideaId: number
```

Identifier of the absorbed idea.

### author

```ts
author: string
```

Author of the absorbed idea.
