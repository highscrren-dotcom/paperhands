---
title: docs/function/listenScheduleEventPerSignal
group: docs
---

# listenScheduleEventPerSignal

```ts
declare function listenScheduleEventPerSignal(filterFn: (event: ScheduleEventContract) => boolean, fn: (event: ScheduleEventContract) => void): () => void;
```

Subscribes to scheduled lifecycle events, delivering the callback once per new signal id.

Deduplicates on `event.data.id`. A scheduled signal may emit both "scheduled"
and "cancelled": filter by `action` to isolate one transition.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
