# INKWELL - The cutover runbook

THE TOOL STANDARD section 7. The order is not negotiable: **DNS is created LAST**,
after the distribution already serves. Resolvers negative-cache NXDOMAIN for about
thirty minutes, so a record created early against a distribution that is not ready
poisons the name for everyone who looked (RULE 23, DNS-before-links).

The served page is `inkwell/web/`, which syncs to the BUCKET ROOT. Everything the
page references is root-absolute, so the tool only works mounted at `/`.

## State as of 2026-08-14

| Surface | State |
|---|---|
| Repo | `github.com/cubedivisiondev/inkwell` PUBLIC, mirrored by `bin/mirror-apps.sh` |
| GitHub Pages | **DISABLED 2026-08-14** - See below |
| Dev host | `inkwell.puddy.dev` LIVE, behind the shared PUDDY dev password gate |
| Prod host | `inkwell.puddystudios.com` LIVE, ungated |
| Port | 5199, claimed in RULE 20 |

### Why GitHub Pages was switched off

A project repo on GitHub Pages always serves at `/<repo>/`, never at `/`. These
tools are root-absolute by design, which is what the standard requires, so every
reference on the page resolved against the origin and missed: the stylesheet, the
chrome script, the app module and the starfield all returned 404. The live page
rendered in Times with no styling and the tool never initialised.

The verifier said forty passes while that was true, because GATE 5 joined each
reference onto the base path instead of resolving it against the origin the way a
browser does. Both are fixed. GATE 5 now resolves against the origin and a
companion gate asserts the page is mounted at the root, so this class of mount
mismatch fails loudly instead of reading green.

A custom domain is the only way Pages could serve at a root, and that domain is
`inkwell.puddystudios.com`, which is step 4 below. Until the host exists the tool
runs locally on port 5199 and from the repo.

## Step 1 - Dev infrastructure (no founder approval needed; RULE 9 gates PROD only)

```bash
aws s3api create-bucket --bucket inkwell-dev --region us-east-1
aws s3api put-public-access-block --bucket inkwell-dev \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

Origin access is OAC, never a public bucket. Copy the OAC and the password-gate
CloudFront Function from the SUNMAP dev distribution, which is the closest twin:
same shared `puddy` cookie, same gate behavior. Distribution identifiers live in
the private monorepo's deploy notes rather than here, because this file is public
and an identifier in a runbook is an inventory of the estate for anyone reading.

## Step 2 - Sync and verify BEFORE the name exists

```bash
aws s3 sync inkwell/web/ s3://inkwell-dev/ --exclude ".env*" --exclude "scripts/*" --exclude "PROD_RUNBOOK.md" --exclude "PUDDY_INTEGRATION.md"
aws cloudfront create-invalidation --distribution-id <DEV_ID> --paths "/*"
python3 inkwell/web/scripts/seo_check.py https://<dev-distribution-domain>
```

The verifier must exit 0 against the distribution domain before any DNS record is
created. Forty eight gates, all of them watched to fail once (GATE-FAILS).

## Step 3 - DNS, last

Cloudflare, `puddy.dev` zone, CNAME `inkwell` to the distribution domain, proxied
off. Reference the scoped token as `$CLOUDFLARE_DNS_TOKEN`; never a global key.

```bash
python3 inkwell/web/scripts/seo_check.py https://inkwell.puddy.dev
```

## Step 4 - Prod cutover (REQUIRES EXPLICIT FOUNDER APPROVAL, RULE 9)

Executed 2026-08-14. The bucket is `inkwell-puddystudios`, not `inkwell`: that
name is taken by another account, and the longer form matches what STARMAP and
SUNMAP already use. The distribution carries no gate function, OAC origin access,
a bucket policy scoped to that one distribution ARN, and 403 and 404 both
answering `/404.html`. The record went on the `puddystudios.com` Cloudflare zone
LAST, after the verifier had already passed against the distribution domain.

The canonical tag in the served HTML already points at the prod origin regardless
of where the page is mounted, which is deliberate: it means the dev mount can
never be indexed in place of prod.

## What must not be deployed

`scripts/`, `PROD_RUNBOOK.md`, and `PUDDY_INTEGRATION.md`. The first is build
tooling and the other two are operator documents, so none of them belongs on a
public origin. The sync excludes carry this; check them if a sync command is ever
rewritten.

`_og_gallery.html` IS deployed, deliberately. It is the review affordance the
card pipeline exists to feed, SQUISH serves its own the same way, and it carries
a noindex so it never enters an index.
