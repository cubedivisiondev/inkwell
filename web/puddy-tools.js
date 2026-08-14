/* PUDDY TOOLS - shared chrome (header + footer)
 * Reusable across every PUDDY TOOL (squish, star-map, number-game, ...).
 * One-line include in any static tool page:
 *     <script src="/puddy-tools.js" defer></script>
 *
 * TWO MODES, chosen per tool via the script tag:
 *   (default)             Minimal tool bar: PUDDY brand + "PUDDY TOOLS" label, and a
 *                         one-line footer ("A PUDDY STUDIOS TOOL"). What Starmap uses.
 *   data-nav="studios"    The FULL puddystudios.com chrome, replicated from the live
 *                         site: fixed 64px nav (logo + PUDDY wordmark left, bordered
 *                         APPS dropdown right with SPLAT/SQUISH/STARMAP) and the
 *                         studios footer (Research/About/Contact/Privacy/Terms +
 *                         copyright). Sets --pt-nav-h:64px on :root and gives body
 *                         64px top padding so content clears the fixed nav.
 *
 * Optional per-tool footer claims (MINIMAL mode only) via:
 *     <script src="/puddy-tools.js" data-claims="APPROVED COPY A|APPROVED COPY B" defer></script>
 * Defaults to NO claims. Claims require explicit approval per tool; the retired
 * 2026-06-09 defaults ("100% IN YOUR BROWSER" / "NOTHING IS UPLOADED") must not
 * come back as defaults (SQUISH carries an approved variant inside its own UI).
 *
 * Env awareness: links resolve to the matching studios environment. Dev tool
 * subdomains (label endsWith "-dev", or legacy "dev-" prefix) and localhost link
 * to dev.puddystudios.com and the dev tool subdomains; everything else links to
 * prod. Built with safe DOM methods (no innerHTML).
 *
 * Portability: tools mounted at a different subpath reference this file
 * relatively as ../puddy-tools.js?v=N with puddy-logo.svg next to it (the logo
 * resolves against this script's own URL). A missing chrome script degrades
 * gracefully: the tool still works, just chromeless.
 */
(function () {
  if (document.getElementById('pt-chrome-style')) return; // idempotent

  var host = location.hostname;
  var sub = host.split('.')[0];
  // Dev consolidated onto *.puddy.dev (2026-07-08). puddy.dev IS the dev env.
  var isPuddyDev = (host === 'puddy.dev' || host.endsWith('.puddy.dev'));
  var onStudios = (host === 'puddystudios.com' || host === 'www.puddystudios.com' || host === 'dev.puddystudios.com' || host === 'puddy.dev');
  var isDev = (isPuddyDev || host === 'dev.puddystudios.com' || host === 'localhost' || host === '127.0.0.1' ||
    (host.endsWith('.puddystudios.com') && (sub.indexOf('dev-') === 0 || sub.endsWith('-dev'))));
  var HOME = onStudios ? location.origin : (isDev ? 'https://puddy.dev' : 'https://puddystudios.com');
  var STARMAP_URL = isDev ? 'https://starmap.puddy.dev' : 'https://starmap.puddystudios.com';
  // DEV-only app switcher. Ordered by importance, not alphabetically (Colton,
  // 2026-07-09). NETWORK is deliberately absent - ENTER THE GRID on the homepage
  // is the way into /network. Keep this list identical to the DEV_APPS arrays in
  // the two React Navigation.tsx copies.
  var DEV_APPS = [
    ['DECK', 'https://deck.puddy.dev'],
    ['DEMO', 'https://demo.puddy.dev'],
    ['STARMAP', 'https://starmap.puddy.dev'],
    ['SQUISH', 'https://squish.puddy.dev'],
    ['SPLAT', 'https://splat.puddy.dev'],
    ['SCRAPECHAIN', 'https://scrapechain.puddy.dev'],
    ['GEMS', 'https://gems.puddy.dev'],
    ['BUDDY', 'https://buddy.puddy.dev'],
    ['ASK EPSTEIN', 'https://askepstein.puddy.dev'],
    ['NUMBER GAME', 'https://numbers.puddy.dev'],
    ['THE BUTTON', 'https://button.puddy.dev']
  ];

  var tag = document.querySelector('script[src*="puddy-tools.js"]');
  var navMode = tag && tag.getAttribute('data-nav');
  var claimsAttr = tag && tag.getAttribute('data-claims');
  var claims = claimsAttr ? claimsAttr.split('|') : [];
  var LOGO = tag && tag.src ? new URL('puddy-logo.svg', tag.src).href : '/puddy-logo.svg';

  function el(tagName, cls, text) {
    var e = document.createElement(tagName);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function insertHeader(header) {
    // After a leading skip link, if any, so it stays the first focusable.
    var first = document.body.firstElementChild;
    var anchor = (first && first.classList.contains('skip')) ? first.nextSibling : document.body.firstChild;
    document.body.insertBefore(header, anchor);
  }

  var st = document.createElement('style');
  st.id = 'pt-chrome-style';

  if (navMode === 'studios') {
    // ----- FULL studios chrome (replicates puddystudios.com's nav + footer) -----
    st.textContent =
      ":root{--pt-nav-h:64px}" +
      "body{padding-top:var(--pt-nav-h)}" +
      ".pt-nav{position:fixed;top:0;left:0;right:0;z-index:50;height:var(--pt-nav-h);" +
      "background:rgba(0,0,0,.85);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);box-sizing:border-box}" +
      ".pt-nav-in{max-width:80rem;margin:0 auto;padding:0 16px;height:100%;display:flex;align-items:center;justify-content:space-between;gap:16px}" +
      ".pt-nav-brand{display:flex;align-items:center;gap:10px;text-decoration:none}" +
      ".pt-nav-brand img{display:block;width:36px;height:36px;flex-shrink:0}" +
      ".pt-nav-brand span{font-family:'Futura PT','Futura',ui-sans-serif,sans-serif;font-weight:700;" +
      "font-size:19px;letter-spacing:.15em;text-transform:uppercase;color:#fff}" +
      ".pt-cta{display:flex;align-items:center;gap:16px}" +
      ".pt-grid-btn{display:inline-flex;align-items:center;justify-content:center;border:2px solid #fff;color:#fff;" +
      "padding:8px 20px;font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;" +
      "font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif;transition:background .2s,color .2s}" +
      ".pt-grid-btn:hover,.pt-grid-btn:focus-visible{background:#fff;color:#000;outline:none}" +
      ".pt-dev{position:relative}" +
      ".pt-dev-btn{display:inline-flex;align-items:center;gap:6px;border:2px solid rgba(251,191,36,.6);background:transparent;" +
      "color:rgba(251,191,36,.9);padding:6px 10px;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;" +
      "font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:border-color .2s,color .2s}" +
      ".pt-dev-btn:hover,.pt-dev.open .pt-dev-btn{border-color:#fbbf24;color:#fcd34d;outline:none}" +
      ".pt-dev-menu{position:absolute;right:0;top:100%;margin-top:8px;min-width:12rem;" +
      "background:rgba(0,0,0,.95);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border:2px solid rgba(251,191,36,.6);" +
      "visibility:hidden;opacity:0;transition:opacity .15s}" +
      ".pt-dev.open .pt-dev-menu{visibility:visible;opacity:1}" +
      ".pt-dev-hd{padding:8px 16px;font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:rgba(251,191,36,.7)}" +
      ".pt-dev-menu a{display:flex;align-items:center;padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:.2em;" +
      "text-transform:uppercase;color:rgba(255,255,255,.9);text-decoration:none;border-top:1px solid rgba(251,191,36,.15);" +
      "font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif;transition:background .15s,color .15s}" +
      ".pt-dev-menu a:hover,.pt-dev-menu a:focus-visible{background:#fbbf24;color:#000;outline:none}" +
      ".pt-sfoot{position:relative;z-index:10;padding:16px;background:#000;text-align:center}" +
      ".pt-sfoot-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;column-gap:16px;row-gap:4px;margin-bottom:4px}" +
      ".pt-sfoot-nav a{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.5);" +
      "text-decoration:none;white-space:nowrap;transition:color .2s;font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif}" +
      ".pt-sfoot-nav a:hover{color:#fff}" +
      ".pt-sfoot-c{font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.3);margin:0;" +
      "font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif}" +
      "@media(max-width:640px){.pt-nav-in{padding:0 14px}.pt-nav-brand span{font-size:17px}.pt-cta{gap:10px}" +
      ".pt-grid-btn{padding:7px 14px;font-size:10px}.pt-dev-menu a{font-size:10px;padding:9px 14px}}";
    document.head.appendChild(st);

    // Nav
    var nav = el('nav', 'pt-nav');
    var navIn = el('div', 'pt-nav-in');
    var brand = el('a', 'pt-nav-brand');
    brand.href = HOME;
    brand.setAttribute('aria-label', 'Puddy Studios home');
    var logo = document.createElement('img');
    logo.src = LOGO; logo.alt = ''; logo.width = 36; logo.height = 36;
    brand.appendChild(logo);
    brand.appendChild(el('span', null, 'PUDDY'));
    navIn.appendChild(brand);

    var cta = el('div', 'pt-cta');

    // DEV-only app switcher (left of ENTER THE GRID), rendered only on dev hosts
    // so it never appears in prod chrome.
    if (isDev) {
      var dev = el('div', 'pt-dev');
      var devBtn = el('button', 'pt-dev-btn');
      devBtn.type = 'button';
      devBtn.setAttribute('aria-haspopup', 'true');
      devBtn.setAttribute('aria-expanded', 'false');
      devBtn.setAttribute('aria-label', 'In-development apps (dev only)');
      devBtn.appendChild(document.createTextNode('DEV'));
      devBtn.appendChild(el('span', null, '▾'));
      var devMenu = el('div', 'pt-dev-menu');
      devMenu.setAttribute('role', 'menu');
      devMenu.setAttribute('aria-label', 'In-development apps');
      devMenu.appendChild(el('div', 'pt-dev-hd', 'DEV ONLY'));
      DEV_APPS.forEach(function (it) {
        var a = el('a', null, it[0]);
        a.href = it[1];
        a.setAttribute('role', 'menuitem');
        devMenu.appendChild(a);
      });
      devBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var open = dev.classList.toggle('open');
        devBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (ev) {
        if (dev.classList.contains('open') && !dev.contains(ev.target)) {
          dev.classList.remove('open');
          devBtn.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && dev.classList.contains('open')) {
          dev.classList.remove('open');
          devBtn.setAttribute('aria-expanded', 'false');
          devBtn.focus();
        }
      });
      dev.appendChild(devBtn);
      dev.appendChild(devMenu);
      cta.appendChild(dev);
    }

    // ENTER THE GRID -> the main-site /network thesis page (PLAY SPLAT's old slot).
    var grid = el('a', 'pt-grid-btn', 'ENTER THE GRID');
    grid.href = HOME + '/network';
    cta.appendChild(grid);
    navIn.appendChild(cta);
    nav.appendChild(navIn);
    insertHeader(nav);

    // Footer (studios)
    var sfoot = el('footer', 'pt-sfoot');
    var sin = el('div');
    var fnav = el('nav', 'pt-sfoot-nav');
    [['About', '/about'], ['Contact', '/contact'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Starmap', STARMAP_URL, true]].forEach(function (l) {
      var a = el('a', null, l[0]);
      a.href = l[2] ? l[1] : HOME + l[1];
      fnav.appendChild(a);
    });
    sin.appendChild(fnav);
    sin.appendChild(el('p', 'pt-sfoot-c', '© 2026 PUDDY INC. - ALL RIGHTS RESERVED'));
    sfoot.appendChild(sin);
    document.body.appendChild(sfoot);
    return;
  }

  // ----- MINIMAL tool chrome (default; what Starmap uses) -----
  st.textContent =
    ".pt-masthead{display:flex;align-items:center;justify-content:space-between;" +
    "padding:16px 20px;border-bottom:2px solid #fff;box-sizing:border-box;" +
    "font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif;background:#000;position:relative;z-index:2}" +
    ".pt-brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;" +
    "font-family:'Futura PT','Futura',sans-serif;letter-spacing:.22em;font-size:18px}" +
    ".pt-brand img{display:block}" +
    ".pt-tool{font-family:'Space Mono',ui-monospace,Menlo,monospace;font-size:11px;" +
    "letter-spacing:.28em;color:rgba(255,255,255,.55)}" +
    ".pt-foot{border-top:2px solid #fff;padding:18px 20px;text-align:center;box-sizing:border-box;" +
    "font-family:'Space Mono',ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.16em;" +
    "color:rgba(255,255,255,.55);display:flex;gap:10px;justify-content:center;flex-wrap:wrap;" +
    "background:#000;position:relative;z-index:2;line-height:1.6}" +
    ".pt-foot a{color:#fff}" +
    ".pt-foot .pt-dot{color:rgba(255,255,255,.2)}" +
    "@media(max-width:680px){.pt-foot{flex-direction:column;gap:5px}.pt-foot .pt-dot{display:none}}";
  document.head.appendChild(st);

  var mBrand = el('a', 'pt-brand');
  mBrand.href = HOME;
  mBrand.setAttribute('aria-label', 'Puddy Studios home');
  var mLogo = document.createElement('img');
  mLogo.src = LOGO; mLogo.alt = ''; mLogo.width = 28; mLogo.height = 28;
  mBrand.appendChild(mLogo);
  mBrand.appendChild(el('span', null, 'PUDDY'));
  var header = el('header', 'pt-masthead');
  header.appendChild(mBrand);
  header.appendChild(el('span', 'pt-tool', 'PUDDY TOOLS'));
  insertHeader(header);

  var footer = el('footer', 'pt-foot');
  var lead = document.createElement('span');
  lead.appendChild(document.createTextNode('A '));
  var a = el('a', null, 'PUDDY STUDIOS');
  a.href = HOME;
  lead.appendChild(a);
  lead.appendChild(document.createTextNode(' TOOL'));
  footer.appendChild(lead);
  for (var i = 0; i < claims.length; i++) {
    footer.appendChild(el('span', 'pt-dot', '·'));
    footer.appendChild(el('span', null, claims[i]));
  }
  document.body.appendChild(footer);
})();
