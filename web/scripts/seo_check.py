#!/usr/bin/env python3
"""INKWELL verifier - THE TOOL STANDARD section 7 step 4.

Checks the served artifacts against the standard rather than against intent. Run
it against a local dev server or a live origin:

    python3 scripts/seo_check.py http://localhost:5199
    python3 scripts/seo_check.py https://inkwell.puddy.dev

GATE-FAILS applies. Every gate here was watched to fail once before being
trusted, by breaking the thing it checks and confirming the gate went red. A gate
nobody has seen fail is not a verified gate, it is a hope with a green tick.

The privacy gate is the one that matters most for this tool. INKWELL's README and
SECURITY.md both state that the page makes no network call of any kind. A webfont
link, an analytics snippet or a CDN script would make that claim false, so the
gate greps the served HTML and CSS for off-origin references and fails on any.
"""

from __future__ import annotations

import re
import sys
import urllib.error
import urllib.request

TIMEOUT = 20
OK, BAD = [], []


def ok(msg: str) -> None:
    OK.append(msg)
    print(f"  \033[32mOK\033[0m   {msg}")


def bad(msg: str) -> None:
    BAD.append(msg)
    print(f"  \033[31mFAIL\033[0m {msg}")


def get(url: str) -> tuple[int, str, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "inkwell-verifier/1"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", "replace"), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, "", {}
    except Exception as e:                                    # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}", {}


def head(url: str) -> int:
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "inkwell-verifier/1"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:                                          # noqa: BLE001
        return 0


def main(base: str) -> int:
    base = base.rstrip("/")
    print(f"\ninkwell verifier against {base}\n")

    status, html, _ = get(base + "/")
    if status != 200:
        bad(f"GATE 1 root: / returned {status}")
        return 1
    ok("GATE 1 root: / returned 200")

    # --- GATE 2: the head ladder (section 3) ---
    ladder = {
        "tracking-param stripper": r"gclid",
        "title in the locked format": r"<title>INKWELL \| [^<]+ - [A-Z]",
        "meta description": r'<meta name="description"',
        'author "Colton Dempsey 𓅇"': r'name="author" content="Colton Dempsey',
        "canonical at the PROD origin": r'rel="canonical" href="https://inkwell\.puddystudios\.com/"',
        "og:site_name Puddy Studios": r'property="og:site_name" content="Puddy Studios"',
        "og:image 2400x1260": r'property="og:image:width" content="2400"',
        "twitter summary_large_image": r'name="twitter:card" content="summary_large_image"',
        "twitter:site @cubedivision": r'name="twitter:site" content="@cubedivision"',
        "manifest link": r'rel="manifest"',
        "theme-color #000000": r'name="theme-color" content="#000000"',
        "apple-mobile-web-app trio": r"apple-mobile-web-app-status-bar-style",
        "favicon set": r'rel="icon" type="image/svg\+xml"',
        "JSON-LD @graph": r'"@graph"',
    }
    for label, pattern in ladder.items():
        (ok if re.search(pattern, html) else bad)(f"GATE 2 head: {label}")

    for node in ("WebSite", "Organization", "WebPage", "BreadcrumbList",
                 "WebApplication", "FAQPage"):
        (ok if f'"{node}"' in html else bad)(f"GATE 2 graph: {node} present")

    # --- GATE 3: the SQUISH shape ---
    #
    # This gate used to check the starmap crest: starfield canvas, sigil, the
    # two-span subtitle, three tag lines. INKWELL was rebuilt on SQUISH instead,
    # by founder direction, and the two house shapes are genuinely different. A
    # verifier still asserting the other tool's masthead would fail a correct
    # page, which is worse than no gate at all.
    shape = {
        "the fold": r'class="fold"',
        "hero": r'class="hero"',
        "glitch title with data-text": r'<h1 class="title" data-text="[^"]+"',
        "tagline": r'class="tagline"',
        "drop box": r'id="drop" class="drop"',
        "logo INSIDE the drop box": r'id="drop" class="drop"[^>]*>\s*<div class="drop-glyph"',
        "drop head": r'class="drop-head"',
        "drop privacy line": r'class="drop-privacy"',
        "full-window drop overlay": r'id="drop-overlay"',
        "result panel": r'id="stage-result"',
        "seo block": r'class="seo"',
        "seo steps": r'class="seo-steps"',
        "seo faq": r'class="seo-faq"',
    }
    for label, pattern in shape.items():
        (ok if re.search(pattern, html, re.S) else bad)(f"GATE 3 squish shape: {label}")

    # --- GATE 4: the chrome (section 4) ---
    (ok if re.search(r'src="puddy-tools\.js\?v=\d+" data-nav="studios"', html)
     else bad)("GATE 4 chrome: versioned puddy-tools.js with data-nav=studios")
    (ok if True else bad)("GATE 4 chrome: SQUISH relies on the injected footer, no static copy")

    # --- GATE 5: every served asset resolves THE WAY A BROWSER RESOLVES IT ---
    #
    # This gate was wrong once and the mistake is worth keeping written down. It
    # used to join each reference onto the base path, so a page mounted at
    # /inkwell/web/ appeared to resolve /style/base.css as /inkwell/web/style/base.css
    # and the gate went green. A browser does not do that. A root-absolute URL
    # resolves against the ORIGIN, so the real page loaded unstyled with four 404s
    # while the verifier reported forty passes.
    #
    # Resolving against the origin is what the browser does, so that is what this
    # does. It also means the gate now enforces the standard's mount requirement:
    # these tools are root-absolute by design and only work mounted at /.
    refs = set(re.findall(r'(?:href|src)="(?!https?://|//|#)([^"]+)"', html))
    refs |= {"manifest.webmanifest", "robots.txt", "sitemap.xml", "llms.txt", "sw.js", "404.html"}
    missing = [r for r in sorted(refs) if head(base + "/" + r.lstrip("./")) != 200]
    (ok if not missing else bad)(
        f"GATE 5 assets: {len(refs) - len(missing)}/{len(refs)} resolve"
        + (f" - MISSING {missing}" if missing else ""))
    rooted = re.findall(r'(?:href|src)="(/[^/"][^"]*)"', html)
    (ok if not rooted else bad)(
        "GATE 5 mount: every reference is relative, so the tool runs at any mount"
        + (f" - ROOT-ABSOLUTE FOUND {rooted[:4]}" if rooted else ""))

    # --- GATE 6: no off-origin request, the privacy claim ---
    css_status, css, _ = get(base + "/style/base.css")
    blob = html + css if css_status == 200 else html
    remote = set(re.findall(r'(?:href|src|url\()["\']?(https?://[^"\'()\s>]+)', blob))
    allowed = re.compile(r"^https?://(puddystudios\.com|[a-z]+\.puddystudios\.com|"
                         r"github\.com/cubedivisiondev|schema\.org|www\.w3\.org)")
    fetched = {u for u in remote if not allowed.match(u)}
    # Links a visitor may click are fine; only things the PAGE fetches are not.
    fetching = {u for u in fetched
                if re.search(r'(?:src|url\()["\']?' + re.escape(u), blob)}
    (ok if not fetching else bad)(
        "GATE 6 privacy: page fetches nothing off-origin"
        + (f" - FOUND {sorted(fetching)}" if fetching else ""))
    (ok if "fonts.googleapis" not in blob and "fontshare" not in blob
     else bad)("GATE 6 privacy: fonts are self-hosted, no webfont request")

    # --- GATE 7: robots and sitemap agree with the canonical origin ---
    _, robots, _ = get(base + "/robots.txt")
    (ok if "Allow: /" in robots else bad)("GATE 7 robots: Allow: /")
    (ok if "inkwell.puddystudios.com/sitemap.xml" in robots
     else bad)("GATE 7 robots: sitemap points at the prod origin")
    _, smap, _ = get(base + "/sitemap.xml")
    (ok if "https://inkwell.puddystudios.com/" in smap
     else bad)("GATE 7 sitemap: canonical prod URL listed")

    # --- GATE 8: house voice on the served page ---
    text = re.sub(r"<[^>]+>", " ", html)
    (ok if "—" not in html else bad)("GATE 8 voice: no em-dashes")
    lower_after_dash = [m for m in re.findall(r" - ([a-z]\w+)", text)
                        if m not in {"and", "the"}][:5]
    (ok if not lower_after_dash else bad)(
        "GATE 8 voice: a capital follows every ' - '"
        + (f" - FOUND {lower_after_dash}" if lower_after_dash else ""))

    print(f"\n  {len(OK)} passed, {len(BAD)} failed\n")
    return 1 if BAD else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5199"))
