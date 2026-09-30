# Map Preview & Full Map: Content Security Policy

The map preview and the built-in full map ("Open full map" on a dataset page) are both served by the [magda-preview-map](https://github.com/magda-io/magda-preview-map) module under `/preview-map/`. The Magda gateway sets their Content Security Policy (CSP) through the per-path config `gateway.helmetPerPath."/preview-map/*"` in the `magda-core` chart.

This page lists what that policy allows and why, which features stay off by default, and how to enable more.

## One policy, set by the gateway

The gateway is the only source of the `/preview-map/*` policy. By default, preview-map's `terriajs-server` adds its own report-only CSP whose violation reports go to `/csp-report` at the site root, where nothing receives them behind the gateway. `magda-core` turns that header off:

```yaml
preview-map:
  serverConfig:
    securityHeaders:
      contentSecurityPolicy: false
```

`terriajs-server`'s other security headers (for example `Referrer-Policy`) are unaffected.

## What the policy allows

| Directive | Source | Needed for |
| --- | --- | --- |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline' blob:` | TerriaJS / Cesium runtime code, web workers and the built client's inline bootstrap |
| `worker-src` | `'self' blob:` | Cesium web workers |
| `style-src` | `'self' blob: 'unsafe-inline' fonts.googleapis.com` | TerriaJS styles and web fonts |
| `img-src` | `* data:` | Map tiles and legends from any host |
| `connect-src` | `'self'` | The app itself, the Magda APIs, and external data loaded through preview-map's proxy |
| | `*.cesium.com` | Cesium ion (location search; terrain when a token is set) |
| | `https://tile.openstreetmap.org`, `https://*.tile.openstreetmap.org` | Default OpenStreetMap base map |
| | `blob:` | **Upload data**: local files are read through a same-origin `blob:` URL |
| | `https://tiles.terria.io`, `https://vector-tiles.terria.io` | **Region-mapped CSVs** (state, LGA, SA2, ... columns): region definitions and boundary vector tiles |
| | `https://storage.googleapis.com/terria-datasets-public/` | **Natural Earth II** base map (Map Settings); the path limits it to Terria's public base map bucket |

The global gateway policy supplies the other directives (for example `default-src 'self'`).

## Features that stay off by default

| Feature | Why it's blocked | How to enable |
| --- | --- | --- |
| **Add web data** from a host that isn't proxied | TerriaJS fetches a host that preview-map won't proxy directly, and `connect-src` blocks it | Add the host to `preview-map.serverConfig.allowProxyFor`. The data then loads through the same-origin proxy, with no CSP change. Prefer this to widening `connect-src`. |
| **Help video** (Help → Getting started) | The video is a YouTube (`youtube-nocookie.com`) iframe, and the policy has no `frame-src` for it | Add `frameSrc: ["'self'", "https://www.youtube-nocookie.com"]` to `gateway.helmetPerPath."/preview-map/*"` |
| **3D Terrain** | Not a CSP issue: Cesium ion terrain needs an access token (`cesiumIonAccessToken` in the preview-map app config). Without one, `api.cesium.com` returns 401 and the map falls back to no terrain. | Configure a Cesium ion token |
| **Feedback** and **share short links** | Not configured on preview-map's server by default. The gateway also only proxies `GET` to `/preview-map/*`. | Configure them in `preview-map.serverConfig`, and give the `preview-map` gateway web route the `POST` method |

## Verifying a change

After changing the policy, open a dataset's map preview and the full map, try the features you care about, and check the browser console for `Content Security Policy` / `Refused to` messages.

Response headers show the policy in effect:

```bash
curl -sI https://<your-magda-host>/preview-map/ | grep -i content-security-policy
```

With the defaults above there should be exactly one `Content-Security-Policy` header and no `content-security-policy-report-only` header.

Related: [magda-preview-map#56](https://github.com/magda-io/magda-preview-map/issues/56).
