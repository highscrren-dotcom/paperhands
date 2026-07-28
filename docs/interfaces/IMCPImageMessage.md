---
title: docs/interface/IMCPImageMessage
group: docs
---

# IMCPImageMessage

Image message for the MCP agent (e.g. a rendered chart).
Payload is base64-encoded binary data with its mime type.

## Properties

### type

```ts
type: "image"
```

Discriminator for type-safe union

### mimeType

```ts
mimeType: string
```

Mime type of the encoded payload (e.g., "image/png")

### data

```ts
data: string
```

Base64-encoded binary data of the image
