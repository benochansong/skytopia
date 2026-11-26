# SKYTOPIA development policies

- Keep gameplay rules in pure TypeScript modules under `src/game`. Rendering must not determine occupancy, connections, mass, or mission results.
- Facility capabilities and build limits belong in `src/data/rules.ts`.
- Preserve Korean and English UI strings. Do not present future-phase features as implemented.
- Validate saves at the boundary. Schema changes need a version and an explicit migration or safe rejection.
- Run `npm test`, `npm run build`, and the relevant browser flows after gameplay changes. Report unverified cases honestly.

## Development domain and DNS

- Recorded on 2026-08-29 (Asia/Seoul). The development domain is `benochansong.shop`.
- Registration/renewal is managed in Gabia; DNS is managed in Cloudflare. The user described a one-year registration term. Do not assume permanence or an exact expiration date.
- Never hardcode this domain or a replacement in application source code. Use environment-specific `APP_DOMAIN` and, when needed, `APP_ORIGIN` in one central configuration module. Framework-required naming conventions may take precedence.
- URLs, redirects, OAuth callbacks, CORS, cookie domains, canonical metadata, email links, webhooks, tests, and deployment configuration must consume the environment-backed domain/origin.
- Update `.env.example` and deployment environment documentation when domain configuration becomes necessary. Never commit secrets. Required production configuration must fail clearly when missing.
- Supplied Cloudflare nameservers: `kai.ns.cloudflare.com` and `rosalyn.ns.cloudflare.com`. The misspelling `rosalyn.ns.clouudflare.com` must never be used.
- Before changing registrar nameservers, DNS, certificates, or production routing, verify the current Cloudflare zone assignments and Gabia domain status/expiration.
- If the user supplies a replacement domain/nameservers, update environment configuration, documentation, and this policy.
