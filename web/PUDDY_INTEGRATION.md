# INKWELL inside the PUDDY Mac app

RULE 25, the dual-target rule: INKWELL ships to the website AND into the Mac app,
and an update is not done until both are current. The canonical procedure is
`puddy-notes/docs/SUBAPP_SYNC_PROTOCOL.md`; this file is the INKWELL recipe.

## Why INKWELL is the easiest embed in the set

The other tools need work in the copy. Squish rewrites three CDN constants and
vendors two WASM engines. Star Map carries an ephemeris and a geocoder that has to
be patched Photon-first.

INKWELL needs none of it. **It already makes no network request of any kind.** The
fonts are self-hosted, the engine is plain JavaScript over Canvas and typed arrays,
and there is no corpus to ship. The embed is a copy.

## The recipe

```bash
cp -R inkwell/web/ puddy-notes/resources/apps/inkwell/
```

Then remove what the app must not serve:

```
scripts/  PROD_RUNBOOK.md  PUDDY_INTEGRATION.md  package.json
```

Load it as `app://inkwell/index.html?nosw`.

**The `?nosw` flag is load-bearing.** The app serves the tool over its own
privileged scheme, where a service worker adds nothing and its cache would shadow
the bundle the app actually shipped. The registration in `index.html` already
honours the flag.

## The one thing to check after copying

The chrome script is `/puddy-tools.js?v=15`, a LOCAL copy at the tool root. It
resolves under the privileged scheme. If a future version of the chrome ever
reaches for something off-origin, the embed degrades to chromeless rather than
breaking, which is the graceful path the standard specifies (section 4).

## Ownership

MARKETING re-stages INKWELL into `resources/apps/inkwell/`. The PUDDY App agent
rebuilds the DMG and tags `puddy-v<version>`. Neither crosses into the other's
files.
