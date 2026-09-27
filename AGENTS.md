# Ailardi game workspace

This workspace contains NovaWing and the sibling Space Chicken project. The projects are deployed independently as Cloudflare Pages apps and are presented through the shared Ailardi Arcade Worker.

## Projects and live routes

- NovaWing source: `/home/adam/rtype-prototype`
- Space Chicken source: `/home/adam/spacechicken`
- NovaWing Pages project: `novawing` → `https://novawing.ailardi.com/`
- Space Chicken Pages project: `space-chicken` → `https://space-chicken.ailardi.com/`
- Arcade landing/router source: `/home/adam/rtype-prototype/hub`
- Arcade landing: `https://ailardi.com/`

The `ailardi-landing` Pages project owns `ailardi.com`. The games use direct Pages custom domains, so they do not pass through a Worker. Keep game source paths root-relative for their own Pages deployments.

## Build and deploy

Before any Cloudflare operation, verify auth with `npx wrangler whoami`.

- NovaWing: from `/home/adam/rtype-prototype`, run `npm run build`, then `npx wrangler pages deploy dist --project-name novawing`.
- Space Chicken: from `/home/adam/spacechicken`, run `npm run check`, then `npm run build:cloudflare`, then `npx wrangler pages deploy dist --project-name space-chicken --branch main`.
- Arcade landing: from `/home/adam/rtype-prototype`, run `npx wrangler pages deploy hub/public --project-name ailardi-landing --branch main`.

Do not deploy the landing merely because a game changed; deploy the affected Pages project. The old `hub/src/index.mjs` Worker router is retained as historical code and is not part of the new public traffic path.

## Assistant workflow

This file is for Codex, Grok, and other coding assistants. Do not add navigation links or setup UI to either game unless explicitly requested; the relationship between the games belongs in these instructions and in the hub/router deployment.

Run the relevant project checks after changes. Preserve unrelated working-tree changes, especially in the Space Chicken sibling repository.
