import { ToolError, bool, num, str, type Result, type SpecModule, type View } from "./types";

/* Colour, SVG, SEO and JSON-LD helpers are small and pure; they load lazily with each run. */
const color = () => import("./lib/F-color");

/* ── shared helpers ──────────────────────────────────────────────────── */

const utf8Len = (s: string) => new TextEncoder().encode(s).length;
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 2 : 1)} KB`);

async function gzipSize(s: string): Promise<number | null> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return null;
  try {
    const stream = new Blob([s]).stream().pipeThrough(new CS("gzip"));
    return (await new Response(stream).arrayBuffer()).byteLength;
  } catch {
    return null;
  }
}

/* ── SVG examples ────────────────────────────────────────────────────── */

const SVG_ICON = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: hand-written icon, 24px grid -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <g id="icon-cloud-download" fill-opacity="1" opacity="1">
    <path d="M 8.000000 17.000000 L 12.000000 21.000000 L 16.000000 17.000000" />
    <line x1="12.000" y1="12.000" x2="12.000" y2="21.000" stroke-dasharray="none" />
    <path d="M 20.880000 18.090000 A 5.000000 5.000000 0 0 0 18.000000 9.000000 L 16.740000 9.000000 A 8.000000 8.000000 0 1 0 3.000000 16.290000" />
  </g>
  <g></g>
</svg>`;

const SVG_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80">
  <defs>
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00BBEE" stop-opacity="1"/>
      <stop offset="100%" stop-color="#D6006C" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="unused-shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.5"/></filter>
  </defs>
  <rect x="0" y="0" width="240" height="80" rx="16" fill="rgb(20, 22, 30)"/>
  <circle cx="40" cy="40" r="22" fill="url(#brand)" filter="url(#soft)" opacity="0.35"/>
  <circle cx="40" cy="40" r="20" fill="url(#brand)"/>
  <path d="M31.5 40.25 L38.125 46.875 L50.333333 33.666667" fill="none" stroke="#FFFFFF" stroke-width="4.0000" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="74" y="28" width="140" height="10" rx="5" fill="#FFFFFF" fill-opacity="0.92"/>
  <rect x="74" y="46" width="96" height="8" rx="4" fill="#FFFFFF" fill-opacity="0.45"/>
</svg>`;

const SVG_CHART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180" font-family="system-ui, sans-serif" font-size="11">
  <title>Monthly signups, Q1–Q2</title>
  <style>
    .bar { fill: #0088b0; }
    .bar.peak { fill: #d6006c; }
    .axis { stroke: #888; stroke-width: 1; }
    text { fill: #444; }
  </style>
  <line class="axis" x1="30" y1="150" x2="310" y2="150"/>
  <line class="axis" x1="30" y1="10" x2="30" y2="150"/>
  <g transform="translate(40.000000, 0.000000)">
    <rect class="bar" x="0" y="96.00" width="30" height="54.00"/><text x="15" y="166" text-anchor="middle">Jan</text>
    <rect class="bar" x="45" y="78.50" width="30" height="71.50"/><text x="60" y="166" text-anchor="middle">Feb</text>
    <rect class="bar" x="90" y="60.25" width="30" height="89.75"/><text x="105" y="166" text-anchor="middle">Mar</text>
    <rect class="bar peak" x="135" y="24.00" width="30" height="126.00"/><text x="150" y="166" text-anchor="middle">Apr</text>
    <rect class="bar" x="180" y="52.00" width="30" height="98.00"/><text x="195" y="166" text-anchor="middle">May</text>
    <rect class="bar" x="225" y="44.75" width="30" height="105.25"/><text x="240" y="166" text-anchor="middle">Jun</text>
  </g>
  <text x="26" y="154" text-anchor="end">0</text>
  <text x="26" y="28" text-anchor="end">140</text>
</svg>`;

const SVG_INKSCAPE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg
   width="64mm"
   height="64mm"
   viewBox="0 0 64 64"
   version="1.1"
   id="svg5"
   inkscape:version="1.3.2 (091e20e, 2023-11-25)"
   sodipodi:docname="badge.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <sodipodi:namedview
     id="namedview7"
     pagecolor="#ffffff"
     bordercolor="#000000"
     borderopacity="0.25"
     inkscape:showpageshadow="2"
     inkscape:pageopacity="0.0"
     inkscape:document-units="mm"
     inkscape:zoom="2.8284271"
     inkscape:cx="120.20815"
     inkscape:cy="113.13709"
     inkscape:window-width="1512"
     inkscape:window-height="916"
     inkscape:current-layer="layer1" />
  <defs
     id="defs2" />
  <metadata
     id="metadata5">
    <rdf:RDF>
      <cc:Work
         rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:type
           rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
        <dc:title>Badge</dc:title>
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g
     inkscape:label="Layer 1"
     inkscape:groupmode="layer"
     id="layer1">
    <circle
       style="fill:#ffcc00;fill-opacity:1;stroke:#aa7700;stroke-width:1.5875;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"
       id="path111"
       cx="32.000000"
       cy="32.000000"
       r="28.574999" />
    <path
       style="fill:#ffffff;fill-opacity:1;stroke:none;stroke-width:0.264583px;stroke-opacity:1"
       d="m 32.000001,14.816406 5.290859,10.719774 11.830077,1.719035 -8.560467,8.344384 2.020866,11.782175 L 32.000001,41.819142 21.418665,47.381774 23.439531,35.599599 14.879064,27.255215 26.709141,25.53618 Z"
       id="path222"
       inkscape:transform-center-y="-1.2345678" />
  </g>
</svg>`;

/* ── SEO examples ────────────────────────────────────────────────────── */

const SEO_ARTICLE = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How to Brew Pour-Over Coffee at Home | Field Notes</title>
  <meta name="description" content="A step-by-step pour-over guide: grind size, water temperature, bloom timing and the 1:16 ratio that makes a clean, sweet cup every morning.">
  <link rel="canonical" href="https://fieldnotes.example.com/guides/pour-over-coffee">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="article">
  <meta property="og:title" content="How to Brew Pour-Over Coffee at Home">
  <meta property="og:description" content="Grind size, water temperature, bloom timing and the 1:16 ratio.">
  <meta property="og:image" content="https://fieldnotes.example.com/img/pour-over-1200x630.jpg">
  <meta property="og:url" content="https://fieldnotes.example.com/guides/pour-over-coffee">
  <meta property="og:site_name" content="Field Notes">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"How to Brew Pour-Over Coffee at Home","image":["https://fieldnotes.example.com/img/pour-over-1200x630.jpg"],"datePublished":"2026-03-02T08:00:00+00:00","dateModified":"2026-05-10T09:30:00+00:00","author":{"@type":"Person","name":"Maya Chen","url":"https://fieldnotes.example.com/authors/maya"},"publisher":{"@type":"Organization","name":"Field Notes"}}
  </script>
</head>
<body>
  <nav><a href="/">Home</a> <a href="/guides/">Guides</a></nav>
  <article>
    <h1>How to Brew Pour-Over Coffee at Home</h1>
    <p>Pour-over is the simplest way to taste what a coffee really is. With a cone, a filter and a kettle you control every variable — and small changes make a big difference. This guide walks through the method we use every morning, with the reasons behind each step so you can adjust it to your beans.</p>
    <img src="/img/pour-over-setup.jpg" alt="A ceramic dripper on a glass carafe with a gooseneck kettle" width="1200" height="800">
    <h2>What you need</h2>
    <p>A cone dripper, paper filters, a burr grinder, a scale and a kettle — ideally a gooseneck for a steady pour. Fresh beans matter more than any gadget: buy whole beans roasted within the last month and grind just before brewing. A scale removes guesswork and makes a good cup repeatable from day to day.</p>
    <h2>The recipe</h2>
    <h3>Ratio and grind</h3>
    <p>Start with 20 grams of coffee to 320 grams of water, a 1:16 ratio. Grind medium-fine, like coarse sand. If the brew runs faster than three minutes, grind finer; if it stalls past four, go coarser. Change one thing at a time and write it down so you learn what each adjustment does.</p>
    <h3>Water temperature</h3>
    <p>Use water just off the boil, around 93–96°C. Lighter roasts like hotter water because they are denser and harder to extract; darker roasts can taste bitter above 94°C. Rinse the paper filter with hot water first to remove papery flavours and warm the dripper and carafe.</p>
    <h3>Bloom, then pour</h3>
    <p>Pour twice the coffee's weight in water, about 40 grams, and wait 30–45 seconds while trapped carbon dioxide escapes. Then pour in slow circles, keeping the level steady, until the scale reads 320 grams. Give the cone a gentle swirl to flatten the bed so the water drains evenly through the grounds.</p>
    <h2>Troubleshooting</h2>
    <p>Sour and thin means under-extracted: grind finer or use hotter water. Bitter and drying means over-extracted: grind coarser or pour faster. Read our <a href="/guides/grind-size">grind size chart</a> or the <a href="https://www.example.org/brewing-control-chart" rel="nofollow">brewing control chart</a> for more.</p>
  </article>
  <footer><a href="/about">About</a> · <a href="/privacy">Privacy</a></footer>
</body>
</html>`;

const SEO_POOR = `<html>
<head>
  <title>Home</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="keywords" content="shoes, cheap shoes, best shoes, shoes online">
</head>
<body>
  <h1>Welcome</h1>
  <h1>Our Shoes</h1>
  <h4>Great deals</h4>
  <img src="banner.jpg">
  <img src="shoe1.jpg">
  <p>We sell shoes. Click <a href="/shop">here</a>.</p>
  <a href="/sale"><img src="sale.png"></a>
  <script type="application/ld+json">{"@context": "https://schema.org", "@type": "Organization", "name": "Shoe Shop",}</script>
</body>
</html>`;

const SEO_PRODUCT = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trailrunner GTX Waterproof Running Shoe – Men's | Summit Outfitters</title>
<meta name="description" content="The Trailrunner GTX keeps your feet dry on wet trails with a Gore-Tex membrane, 6 mm lugs and a rock plate. Free returns within 60 days.">
<link rel="canonical" href="https://www.summit.example.com/p/trailrunner-gtx-mens">
<link rel="icon" href="/favicon.ico">
<meta property="og:type" content="product">
<meta property="og:title" content="Trailrunner GTX Waterproof Running Shoe">
<meta property="og:description" content="Dry feet, sure footing, 60-day free returns.">
<meta property="og:image" content="https://www.summit.example.com/img/trailrunner-gtx.jpg">
<meta property="og:url" content="https://www.summit.example.com/p/trailrunner-gtx-mens">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Trailrunner GTX Men's","image":"https://www.summit.example.com/img/trailrunner-gtx.jpg","description":"Waterproof trail running shoe with Gore-Tex membrane.","sku":"TR-GTX-M","brand":{"@type":"Brand","name":"Summit"},"offers":{"@type":"Offer","price":"149.00","priceCurrency":"USD","availability":"https://schema.org/InStock","url":"https://www.summit.example.com/p/trailrunner-gtx-mens"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6","reviewCount":"214"}}
</script>
</head>
<body>
<nav><a href="/">Home</a> › <a href="/c/running">Running</a> › <a href="/c/trail">Trail</a></nav>
<main>
<h1>Trailrunner GTX Waterproof Running Shoe</h1>
<img src="/img/trailrunner-gtx.jpg" alt="Trailrunner GTX in slate blue, side view" width="800" height="600">
<img src="/img/trailrunner-sole.jpg" alt="" width="800" height="600">
<img src="/img/trailrunner-lifestyle.jpg">
<p>$149.00 · In stock · Free shipping over $75</p>
<h2>Features</h2>
<ul><li>Gore-Tex waterproof membrane</li><li>6 mm multi-directional lugs</li><li>Flexible rock plate</li><li>8 mm drop, 310 g (US 9)</li></ul>
<h2>Reviews</h2>
<p>4.6 out of 5 from 214 reviews. "Kept my feet dry through a full day of spring mud." — Alex R.</p>
<a href="/p/trailrunner-gtx-womens">Women's version</a>
</main>
</body>
</html>`;

const SEO_LANDING = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Nordlicht – Projektmanagement-Software für Teams | Kostenlos testen</title>
<meta name="description" content="Planen, priorisieren und liefern: Nordlicht verbindet Aufgaben, Zeitpläne und Dokumente. 30 Tage kostenlos testen, ohne Kreditkarte.">
<link rel="canonical" href="https://nordlicht.example.com/de/">
<link rel="alternate" hreflang="de" href="https://nordlicht.example.com/de/">
<link rel="alternate" hreflang="en" href="https://nordlicht.example.com/en/">
<link rel="alternate" hreflang="fr-FR" href="https://nordlicht.example.com/fr/">
<link rel="alternate" hreflang="es_ES" href="/es/">
<link rel="apple-touch-icon" href="/icons/180.png">
<meta property="og:title" content="Nordlicht – Projektmanagement für Teams">
<meta property="og:description" content="30 Tage kostenlos testen.">
<meta property="og:image" content="/og/nordlicht-de.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Nordlicht GmbH","url":"https://nordlicht.example.com","logo":"https://nordlicht.example.com/logo.png"},{"@type":"SoftwareApplication","name":"Nordlicht","applicationCategory":"BusinessApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","ratingCount":"1290"}}]}
</script>
</head>
<body>
<header><a href="/de/"><img src="/logo.svg" alt="Nordlicht"></a><a href="/de/preise">Preise</a><a href="/de/login">Anmelden</a></header>
<h1>Projekte, die pünktlich landen</h1>
<p>Nordlicht bringt Aufgaben, Zeitpläne und Dokumente an einen Ort. Teams sehen sofort, was als Nächstes wichtig ist.</p>
<a href="/de/testen" class="cta">30 Tage kostenlos testen</a>
<h3>Warum Teams wechseln</h3>
<p>Weniger Statusmeetings, klare Prioritäten und Integrationen mit den Tools, die ihr schon nutzt.</p>
<img src="/img/dashboard.webp" alt="Nordlicht Dashboard mit Zeitplan" width="1440" height="900" loading="lazy">
<a href="https://www.linkedin.com/company/nordlicht-example" rel="noopener">LinkedIn</a>
</body>
</html>`;

/* ── JSON-LD examples ────────────────────────────────────────────────── */

const LD_PRODUCT = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Aeropress Clear Coffee Maker",
  "image": [
    "https://shop.example.com/img/aeropress-clear-1x1.jpg",
    "https://shop.example.com/img/aeropress-clear-4x3.jpg"
  ],
  "description": "Shatterproof, clear Tritan coffee press. Brews 1–3 cups in about a minute.",
  "sku": "AP-CLR-01",
  "gtin13": "0085276001272",
  "brand": { "@type": "Brand", "name": "AeroPress" },
  "offers": {
    "@type": "Offer",
    "url": "https://shop.example.com/aeropress-clear",
    "price": "39.95",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "priceValidUntil": "2027-12-31"
  },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "reviewCount": "1824" },
  "review": [
    {
      "@type": "Review",
      "author": { "@type": "Person", "name": "Jordan P." },
      "datePublished": "2026-06-14",
      "reviewRating": { "@type": "Rating", "ratingValue": "5" },
      "reviewBody": "Clean cup, easy to rinse, survives camping trips."
    }
  ]
}`;

const LD_ARTICLE_HTML = `<!-- Multiple blocks in one page: an article, breadcrumbs and a site graph -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "City Council Approves Riverside Cycle Path After Two-Year Debate",
  "image": ["https://news.example.com/img/cycle-path-16x9.jpg"],
  "datePublished": "2026-09-18T07:30:00+01:00",
  "dateModified": "2026-09-18T11:05:00+01:00",
  "author": [{ "@type": "Person", "name": "Priya Nair", "url": "https://news.example.com/staff/priya-nair" }],
  "publisher": { "@type": "Organization", "name": "Riverside Gazette", "logo": { "@type": "ImageObject", "url": "https://news.example.com/logo.png" } }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "News", "item": "https://news.example.com/news" },
    { "@type": "ListItem", "position": 2, "name": "Local", "item": "https://news.example.com/news/local" },
    { "@type": "ListItem", "position": 3, "name": "Riverside cycle path approved" }
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://news.example.com/#org", "name": "Riverside Gazette", "url": "https://news.example.com", "logo": "https://news.example.com/logo.png", "sameAs": ["https://x.com/riversidegazette", "https://www.facebook.com/riversidegazette"] },
    { "@type": "WebSite", "name": "Riverside Gazette", "url": "https://news.example.com", "potentialAction": { "@type": "SearchAction", "target": "https://news.example.com/search?q={search_term_string}", "query-input": "required name=search_term_string" } }
  ]
}
</script>`;

const LD_RECIPE = `{
  "@context": "https://schema.org/",
  "@type": "Recipe",
  "name": "Weeknight Shakshuka",
  "image": ["https://cook.example.com/img/shakshuka-1x1.jpg"],
  "author": { "@type": "Person", "name": "Leila Haddad" },
  "datePublished": "2026-02-11",
  "description": "Eggs poached in a smoky, garlicky tomato and pepper sauce — dinner in 30 minutes.",
  "prepTime": "PT10M",
  "cookTime": "PT20M",
  "totalTime": "PT30M",
  "recipeYield": "4 servings",
  "recipeCategory": "Dinner",
  "recipeCuisine": "Middle Eastern",
  "keywords": "eggs, tomatoes, one-pan",
  "nutrition": { "@type": "NutritionInformation", "calories": "270 calories" },
  "recipeIngredient": ["2 tbsp olive oil", "1 onion, sliced", "2 red peppers, sliced", "3 garlic cloves", "1 tsp smoked paprika", "800 g chopped tomatoes", "6 eggs", "Feta and parsley to serve"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Soften the onion and peppers in oil for 8 minutes." },
    { "@type": "HowToStep", "text": "Add garlic and paprika, then tomatoes; simmer 10 minutes." },
    { "@type": "HowToStep", "text": "Make six wells, crack in the eggs, cover and cook 6–8 minutes." }
  ],
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "ratingCount": "312" }
}`;

const LD_EVENT_JOB = `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Event",
      "name": "Offline-First Web Conf 2026",
      "startDate": "2026-11-12T09:00:00+01:00",
      "endDate": "2026-11-13T17:30:00+01:00",
      "eventAttendanceMode": "https://schema.org/MixedEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "location": { "@type": "Place", "name": "Kulturbrauerei", "address": { "@type": "PostalAddress", "streetAddress": "Schönhauser Allee 36", "addressLocality": "Berlin", "postalCode": "10435", "addressCountry": "DE" } },
      "image": ["https://conf.example.com/og.png"],
      "description": "Two days on service workers, sync and local-first apps.",
      "offers": { "@type": "Offer", "url": "https://conf.example.com/tickets", "price": "349", "priceCurrency": "EUR", "availability": "https://schema.org/InStock", "validFrom": "2026-05-01T10:00:00+01:00" },
      "organizer": { "@type": "Organization", "name": "Local-First Collective", "url": "https://conf.example.com" }
    },
    {
      "@type": "JobPosting",
      "title": "Senior Frontend Engineer (Offline & Sync)",
      "description": "<p>Build the sync engine behind our offline-first editor. You will own conflict resolution, IndexedDB storage and service worker caching, and mentor two engineers.</p>",
      "datePosted": "2026-09-01",
      "validThrough": "2026-12-31T23:59",
      "employmentType": "FULL_TIME",
      "hiringOrganization": { "@type": "Organization", "name": "Local-First Collective", "sameAs": "https://conf.example.com" },
      "jobLocationType": "TELECOMMUTE",
      "applicantLocationRequirements": { "@type": "Country", "name": "Germany" },
      "baseSalary": { "@type": "MonetaryAmount", "currency": "EUR", "value": { "@type": "QuantitativeValue", "minValue": 80000, "maxValue": 95000, "unitText": "YEAR" } }
    }
  ]
}`;

const LD_LOCAL_FAQ = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "Blue Door Bakery",
  "image": "https://bluedoor.example.com/storefront.jpg",
  "address": { "@type": "PostalAddress", "streetAddress": "14 Harbour St", "addressLocality": "Whitby", "postalCode": "YO21 3PU", "addressCountry": "GB" },
  "geo": { "@type": "GeoCoordinates", "latitude": 54.48621, "longitude": -0.61442 },
  "telephone": "+44 1947 000000",
  "priceRange": "££",
  "servesCuisine": "Bakery",
  "url": "https://bluedoor.example.com",
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "07:30", "closes": "16:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "8am", "closes": "14:00" }
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "Do you bake gluten-free bread?", "acceptedAnswer": { "@type": "Answer", "text": "Yes — a gluten-free loaf every Friday, baked first thing in a cleaned oven." } },
    { "@type": "Question", "name": "Can I pre-order a celebration cake?", "acceptedAnswer": { "@type": "Answer", "text": "Please order at least 72 hours ahead by phone or in the shop." } },
    { "@type": "Question", "name": "Is there parking nearby?" }
  ]
}
</script>`;

const LD_BROKEN = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Wireless Earbuds X2",
  "offers": {
    "@type": "Offer",
    "price": "$59.99",
    "priceCurrency": "dollars",
    "priceValidUntil": "2024-01-01"
  },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "6.2" },
  "review": { "@type": "Review", "reviewBody": "Great bass" }
}`;

const LD_SOFTWARE = `{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "Formatter", "operatingSystem": "Any (browser)", "applicationCategory": "DeveloperApplication", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }, "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "ratingCount": "940" } },
    { "@type": "VideoObject", "name": "Formatter in 90 seconds", "description": "A tour of offline pipelines and workspaces.", "thumbnailUrl": ["https://formatter.example.com/video/thumb.jpg"], "uploadDate": "2026-07-01T12:00:00+00:00", "duration": "PT1M30S", "contentUrl": "https://formatter.example.com/video/tour.mp4" },
    { "@type": "Course", "name": "Structured Data Fundamentals", "description": "Learn JSON-LD, schema.org types and Google rich results in six short lessons.", "provider": { "@type": "Organization", "name": "Formatter Academy", "sameAs": "https://formatter.example.com" } },
    { "@type": "HowTo", "name": "Validate JSON-LD offline", "totalTime": "PT2M", "step": [ { "@type": "HowToStep", "text": "Paste your page source." }, { "@type": "HowToStep", "text": "Read the Issues tab." }, { "@type": "HowToStep", "text": "Fix and re-check." } ] },
    { "@type": "Person", "name": "Ada Lovelace", "jobTitle": "Analyst", "url": "https://example.com/ada", "sameAs": ["https://en.wikipedia.org/wiki/Ada_Lovelace"] }
  ]
}`;

/* ── image toolkit samples (small SVG and PNG data URLs) ─────────────── */

const svgUrl = (svg: string) => "data:image/svg+xml;base64," + btoa(svg);

// A 480×320 JPEG (30 KB) rendered from a noisy vector scene — photo-like enough to show re-encoding savings.
const SAMPLE_PHOTO =
  "data:image/jpeg;base64,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";

const SAMPLE_LOGO = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00bbee"/><stop offset="1" stop-color="#d6006c"/></linearGradient></defs><rect x="56" y="56" width="400" height="400" rx="96" fill="url(#g)"/><path d="M168 262 L230 324 L350 196" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

// 16×16 pixel-art heart (PNG, transparent background) — shows nearest-neighbour upscaling and PNG vs WebP.
const SAMPLE_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR42mNgoBaw4dL4D8Mky4MEn8lFwTG6IrzyyJL/7zzDUISuGacByJphimCYKANIwdQ1gFRDcMUSUYbg1EyMIQQ14zOEaM3YDCFZM3rSZRj+AADQbe0EmcOA0wAAAABJRU5ErkJggg==";

/* ── specs ───────────────────────────────────────────────────────────── */

const FORMAT_CHOICES: [string, string][] = [
  ["all", "All formats"],
  ["hex", "HEX"],
  ["hex8", "HEX8"],
  ["rgb", "RGB"],
  ["rgba", "RGB(A) legacy"],
  ["hsl", "HSL"],
  ["hwb", "HWB"],
  ["hsv", "HSV / HSB"],
  ["cmyk", "CMYK"],
  ["lab", "CIE Lab"],
  ["lch", "CIE LCH"],
  ["oklab", "OKLab"],
  ["oklch", "OKLCH"],
  ["p3", "Display P3"],
  ["named", "Nearest CSS name"],
];

const specs: SpecModule = {
  "color-picker": {
    inputs: [{ id: "color", label: "Colour", kind: "text", placeholder: "#d6006c, rebeccapurple, oklch(70% 0.15 200)…" }],
    options: [{ id: "to", label: "Convert to", type: "select", choices: FORMAT_CHOICES, default: "all", hint: "Pipelines: convert each input line to one format" }],
    custom: () => import("./ui/F-ColorPicker"),
    async run({ inputs, opts }) {
      const C = await color();
      const lines = str(inputs.color).split(/\n|;(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
      if (!lines.length) throw new ToolError("Type a colour — hex, rgb(), hsl(), oklch(), a CSS name…");
      const to = str(opts.to, "all");
      const out: string[] = [];
      const rows: string[][] = [];
      for (const l of lines) {
        const c = C.parseColor(l);
        if (!c) throw new ToolError(`"${l}" is not a CSS colour. Try #ff8800, rgb(255 136 0), hsl(32 100% 50%) or a name like tomato.`);
        const f = C.allFormats(c);
        if (to === "all") {
          out.push((lines.length > 1 ? `# ${l}\n` : "") + f.map((x) => `${x.label.padEnd(18)} ${x.value}`).join("\n") + (c.outOfGamut ? "\n(outside sRGB — gamut-mapped for the sRGB formats)" : ""));
        } else out.push(f.find((x) => x.id === to)!.value);
        rows.push([l, ...f.map((x) => x.value)]);
      }
      const text = out.join(to === "all" ? "\n\n" : "\n");
      const first = C.parseColor(lines[0])!;
      const views: View[] = [
        { label: "Formats", out: { kind: "text", text, lang: "css" } },
        { label: "Table", out: { kind: "table", columns: ["Input", ...C.allFormats(first).map((x) => x.label)], rows } },
      ];
      return { text, views };
    },
    examples: [
      { label: "Magenta", inputs: { color: "#d6006c" }, note: "A hex colour in every CSS format, with its tint scale and harmonies." },
      { label: "Named colour", inputs: { color: "rebeccapurple" }, note: "CSS named colours are recognised; the nearest name is shown for any colour." },
      { label: "OKLCH (wide gamut)", inputs: { color: "oklch(70% 0.25 145)" }, note: "Outside sRGB: the swatch is gamut-mapped the way CSS Color 4 specifies." },
      { label: "Translucent", inputs: { color: "rgb(0 136 176 / 60%)" }, note: "Alpha is kept through every format (HEX8, rgba, / alpha)." },
      { label: "Display P3", inputs: { color: "color(display-p3 1 0.5 0)" }, note: "color() in display-p3, rec2020, a98-rgb, prophoto-rgb and xyz is understood." },
      { label: "HWB", inputs: { color: "hwb(200 10% 25%)" }, note: "Hue–whiteness–blackness, the most intuitive way to mix tints and shades." },
      { label: "List → OKLCH", inputs: { color: "#0088b0\ntomato\nhsl(45 100% 50%)" }, opts: { to: "oklch" }, note: "Several colours (one per line) converted to a single format — handy in pipelines." },
      { label: "Not a colour", inputs: { color: "rgb(300, banana)" }, error: true, note: "Unparseable input gives a readable error." },
    ],
    steps: ["Type or paste any CSS colour, or use the native picker / eyedropper.", "Drag the HSL, RGB or OKLCH sliders to fine-tune.", "Click a format to copy it; click a scale or harmony swatch to switch to it.", "Save swatches you like — they stay in this browser."],
    tips: ["The eyedropper samples anywhere on screen in Chromium browsers.", "The 50–950 scale is built in OKLCH so steps look evenly spaced."],
  },

  "color-contrast-converter": {
    inputs: [
      { id: "fg", label: "Foreground (text)", kind: "text", placeholder: "#1f2937 — or “#fff on #0088b0”" },
      { id: "bg", label: "Background", kind: "text", placeholder: "#ffffff" },
      { id: "palette", label: "Palette (one colour per line)", lang: "css", rows: 6, placeholder: "#0f172a\n#ffffff\n#0088b0\n…" },
    ],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["pair", "Pair"], ["matrix", "Palette matrix"]], default: "pair" },
      { id: "target", label: "Target", type: "segment", choices: [["aa", "AA"], ["aaa", "AAA"], ["large", "AA large"]], default: "aa", hint: "Level used for suggestions and matrix highlighting" },
    ],
    custom: () => import("./ui/F-Contrast"),
    async run({ inputs, opts }) {
      const C = await color();
      const target = str(opts.target) === "aaa" ? 7 : str(opts.target) === "large" ? 3 : 4.5;
      if (str(opts.mode) === "matrix") {
        const list = str(inputs.palette).split(/\n/).map((s) => s.replace(/\/\/.*$|^[-*]\s*/g, "").trim()).filter(Boolean);
        if (list.length < 2) throw new ToolError("Paste at least two colours, one per line, to build a contrast matrix.");
        const cols = list.map((l, i) => {
          const c = C.parseColor(l.replace(/^[\w\s-]+:\s*/, ""));
          if (!c) throw new ToolError(`Line ${i + 1}: "${l}" is not a colour.`);
          return { label: l, c: { ...c, a: 1 } };
        });
        const rows = cols.map((fg) => [fg.label, ...cols.map((bg) => (fg === bg ? "—" : `${C.fmt(C.contrastRatio(fg.c, bg.c), 2)}${C.contrastRatio(fg.c, bg.c) >= target ? " ✓" : ""}`))]);
        const pairs = cols.flatMap((a, i) => cols.slice(i + 1).map((b) => ({ a: a.label, b: b.label, r: C.contrastRatio(a.c, b.c) }))).sort((x, y) => y.r - x.r);
        const passing = pairs.filter((p) => p.r >= target);
        const text = `Contrast matrix (✓ ≥ ${target}:1)\n\n${passing.length} of ${pairs.length} pairs pass:\n${pairs.map((p) => `${p.r >= target ? "✓" : "✗"} ${C.fmt(p.r, 2).padStart(5)}:1  ${p.a}  ↔  ${p.b}`).join("\n")}`;
        return {
          text,
          views: [
            { label: "Matrix", out: { kind: "table", columns: ["fg \\ bg", ...cols.map((c) => c.label)], rows, caption: `✓ = at least ${target}:1` } },
            { label: "Pairs", out: { kind: "text", text } },
          ],
        };
      }
      let fgS = str(inputs.fg).trim(), bgS = str(inputs.bg).trim();
      const on = fgS.match(/^(.*?)\s+(?:on|over|\/\/|vs\.?)\s+(.*)$/i);
      if (on && !bgS) [fgS, bgS] = [on[1], on[2]];
      if (!fgS) throw new ToolError("Enter a foreground colour (or “#fff on #0088b0”).");
      const fg0 = C.parseColor(fgS), bg0 = C.parseColor(bgS || "#ffffff");
      if (!fg0) throw new ToolError(`Foreground "${fgS}" is not a CSS colour.`);
      if (!bg0) throw new ToolError(`Background "${bgS}" is not a CSS colour.`);
      const white = { r: 1, g: 1, b: 1, a: 1 };
      const bg = bg0.a < 1 ? C.blend(bg0, white) : { ...bg0, a: 1 };
      const fg = fg0.a < 1 ? C.blend(fg0, bg) : { ...fg0, a: 1 };
      const ratio = C.contrastRatio(fg, bg);
      const grades = C.wcagGrades(ratio);
      const lc = C.apca(fg, bg);
      const fix = ratio < target ? C.suggestContrast(fg, bg, target) : null;
      const fixBg = ratio < target ? C.suggestContrast(bg, fg, target) : null;
      const lines = [
        `Foreground ${C.toHex(fg)}  on  background ${C.toHex(bg)}`,
        `Contrast ratio  ${C.fmt(ratio, 2)}:1`,
        ...grades.map((g) => `${g.pass ? "✓ pass" : "✗ fail"}  ${g.label.padEnd(26)} (needs ${g.need}:1)`),
        `APCA Lc  ${C.fmt(lc, 1)} — ${C.apcaVerdict(lc)}`,
      ];
      if (fg0.a < 1 || bg0.a < 1) lines.push("Note: translucent colours were composited (background over white, text over background).");
      if (fix) lines.push(`Nearest passing text colour: ${C.toHex(fix.color)} (${C.fmt(fix.ratio, 2)}:1${fix.flips ? ", flips polarity" : ""})`);
      if (fixBg) lines.push(`Nearest passing background: ${C.toHex(fixBg.color)} (${C.fmt(fixBg.ratio, 2)}:1${fixBg.flips ? ", flips polarity" : ""})`);
      for (const [k, label] of C.CVD_KINDS) {
        const r = C.contrastRatio(C.simulate(fg, k), C.simulate(bg, k));
        lines.push(`${label.split(" (")[0].padEnd(14)} ${C.toHex(C.simulate(fg, k))} on ${C.toHex(C.simulate(bg, k))}  ${C.fmt(r, 2)}:1`);
      }
      const text = lines.join("\n");
      return {
        text,
        views: [
          { label: "Report", out: { kind: "text", text } },
          {
            label: "Grades",
            out: {
              kind: "stats",
              items: [
                { label: "Contrast ratio", value: `${C.fmt(ratio, 2)}:1`, tone: ratio >= 4.5 ? "ok" : ratio >= 3 ? "warn" : "bad" },
                ...grades.map((g) => ({ label: g.label, value: g.pass ? "Pass" : "Fail", tone: (g.pass ? "ok" : "bad") as "ok" | "bad" })),
                { label: "APCA Lc", value: C.fmt(lc, 1), tone: Math.abs(lc) >= 75 ? "ok" : Math.abs(lc) >= 45 ? "warn" : "bad" },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Brand on white", inputs: { fg: "#0088b0", bg: "#ffffff" }, note: "Cyan text on white passes large-text AA but not body-text AA — see the suggested fix." },
      { label: "Dark mode", inputs: { fg: "#e5e7eb", bg: "#111827" }, note: "Light grey on near-black: passes AAA; APCA reports a negative Lc for light-on-dark." },
      { label: "Grey placeholder", inputs: { fg: "#9ca3af", bg: "#ffffff" }, opts: { target: "aa" }, note: "A typical placeholder grey fails AA — the nearest passing grey is suggested." },
      { label: "Red on green", inputs: { fg: "#d32f2f", bg: "#388e3c" }, note: "Poor contrast that gets even worse for people with deuteranopia — check the simulations." },
      { label: "Translucent text", inputs: { fg: "rgb(255 255 255 / 70%)", bg: "#0088b0" }, note: "Alpha is composited over the background before measuring." },
      { label: "One-liner", inputs: { fg: "#fff on #d6006c" }, note: "“X on Y” in the first field is handy in pipelines." },
      {
        label: "Palette matrix",
        inputs: { palette: "ink: #0f172a\npaper: #ffffff\nbrand: #0088b0\naccent: #d6006c\nmuted: #64748b\nsand: #f5efe6" },
        opts: { mode: "matrix" },
        note: "Every pair of a palette, with the pairs that pass AA ticked.",
      },
      { label: "Bad input", inputs: { fg: "#12345", bg: "#fff" }, error: true, note: "Five hex digits is not a colour." },
    ],
    steps: ["Pick or type foreground and background colours (any CSS format).", "Read the ratio, WCAG badges and APCA Lc; check the live preview.", "Apply a suggested fix to reach the target level.", "Switch to Palette matrix to test every pair of a palette."],
    tips: ["Large text means 24px regular or 18.66px (14pt) bold and up.", "WCAG 1.4.11 asks for 3:1 for icons, borders and focus rings."],
  },

  "svg-preview": {
    inputs: [{ id: "svg", label: "SVG", lang: "xml", placeholder: "Paste SVG markup or drop an .svg file" }],
    options: [
      { id: "optimize", label: "Optimise", type: "toggle", default: true, hint: "Run SVGO-lite passes" },
      { id: "precision", label: "Decimals", type: "number", default: 2, min: 0, max: 6, show: (o) => bool(o.optimize) },
      { id: "ids", label: "Remove unused IDs", type: "toggle", default: true, show: (o) => bool(o.optimize) },
      { id: "title", label: "Keep <title>", type: "toggle", default: true, show: (o) => bool(o.optimize), hint: "Titles and descriptions are the SVG's accessible name" },
      { id: "pretty", label: "Pretty", type: "toggle", default: false, hint: "Indent the output instead of minifying" },
      {
        id: "out",
        label: "Output",
        type: "select",
        choices: [["svg", "SVG"], ["b64", "Data URI (base64)"], ["mini", "Data URI (URL-encoded, mini)"], ["jsx", "JSX component"], ["css", "CSS background-image"]],
        default: "svg",
      },
    ],
    async run({ inputs, opts }) {
      const S = await import("./lib/F-svgo");
      const src = str(inputs.svg);
      const doOpt = bool(opts.optimize);
      const { svg, log, doc } = doOpt
        ? S.optimizeSvg(src, { precision: num(opts.precision, 2), removeIds: bool(opts.ids), pretty: bool(opts.pretty), keepTitle: bool(opts.title) })
        : (() => {
            const d = S.parseSvg(src);
            return { svg: bool(opts.pretty) ? S.serialize(d.documentElement, true) : src.trim(), log: [], doc: d };
          })();
      const info = S.svgInfo(S.parseSvg(src));
      const after = S.svgInfo(doc);
      const out = str(opts.out, "svg");
      let text = svg;
      let lang: "xml" | "text" | "js" | "css" = "xml";
      if (out === "b64") [text, lang] = [`data:image/svg+xml;base64,${S.toBase64Utf8(svg)}`, "text"];
      else if (out === "mini") [text, lang] = [S.miniDataUri(svg), "text"];
      else if (out === "jsx") [text, lang] = [S.toJsx(S.parseSvg(svg).documentElement, "Icon"), "js"];
      else if (out === "css") [text, lang] = [`.icon {\n  background-image: url("${S.miniDataUri(svg).replace(/"/g, "\\\"")}");\n  background-repeat: no-repeat;\n  background-size: contain;\n}`, "css"];
      const before = utf8Len(src), aft = utf8Len(svg);
      const [gzB, gzA] = await Promise.all([gzipSize(src), gzipSize(svg)]);
      const notes: string[] = [];
      if (info.hasScripts) notes.push("This SVG contains scripts or event handlers — they are stripped from the preview.");
      if (info.hasRaster) notes.push("Embedded <image> elements found — raster data inside SVG rarely compresses well.");
      if (!info.viewBox) notes.push("No viewBox: the graphic will not scale cleanly. Add viewBox=\"0 0 W H\".");
      const views: View[] = [
        { label: "Preview", out: { kind: "svg", svg, name: "image" } },
        { label: out === "svg" ? "Optimised SVG" : "Output", out: { kind: "text", text, lang, wrap: out !== "svg" && out !== "jsx" } },
        {
          label: "Savings",
          out: {
            kind: "stats",
            items: [
              { label: "Original", value: kb(before) },
              { label: "Optimised", value: kb(aft), tone: "info" },
              { label: "Saved", value: `${before ? Math.round((1 - aft / before) * 100) : 0}%`, tone: aft < before ? "ok" : "warn" },
              ...(gzB != null && gzA != null ? [{ label: "Gzip before → after", value: `${kb(gzB)} → ${kb(gzA)}` }] : []),
              { label: "Elements before → after", value: `${info.elements} → ${after.elements}` },
              ...(out !== "svg" ? [{ label: "Output length", value: kb(utf8Len(text)), tone: "info" as const }] : []),
            ],
          },
        },
        {
          label: "Info",
          out: {
            kind: "table",
            columns: ["Property", "Value"],
            rows: [
              ["width", info.width ?? "(not set)"],
              ["height", info.height ?? "(not set)"],
              ["viewBox", info.viewBox ?? "(not set)"],
              ["elements", info.elements],
              ["ids", info.ids],
              ...Object.entries(info.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`<${k}>`, v] as [string, number]),
            ],
          },
        },
      ];
      if (doOpt) views.push({ label: `Passes (${log.length})`, out: { kind: "table", columns: ["Pass", "Count"], rows: log.map((l) => [l.pass, l.count]) } });
      return { text, views, notes, filename: out === "jsx" ? "Icon.jsx" : out === "css" ? "icon.css" : out === "svg" ? "optimized.svg" : "svg-data-uri.txt" };
    },
    examples: [
      { label: "Stroke icon", inputs: { svg: SVG_ICON }, note: "Defaults (opacity=1, stroke-dasharray=none), an empty group, the XML prolog and trailing zeros are removed." },
      { label: "Gradient logo", inputs: { svg: SVG_LOGO }, note: "The unused gradient disappears, colours shorten (#FFFFFF → #fff) and coordinates round." },
      { label: "Inline chart", inputs: { svg: SVG_CHART }, opts: { pretty: true }, note: "A chart with <style>, <title> and text — pretty-printed so you can read the result." },
      { label: "Inkscape export", inputs: { svg: SVG_INKSCAPE }, note: "Editor namespaces, <sodipodi:namedview>, RDF metadata and default styles vanish — usually 60%+ smaller." },
      { label: "As JSX", inputs: { svg: SVG_ICON }, opts: { out: "jsx" }, note: "A React component: camelCase attributes, props spread onto the root." },
      { label: "CSS background", inputs: { svg: SVG_LOGO }, opts: { out: "css", precision: 1 }, note: "The URL-encoded 'mini' data URI is smaller than base64 and readable." },
      { label: "Invalid SVG", inputs: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n  <rect width="10" height="10">\n  <circle r="4"/>\n</svg>' }, error: true, note: "An unclosed <rect> — the XML parser reports where." },
    ],
    steps: ["Paste SVG or drop a file.", "Preview it (zoom, checker background, PNG export at 2×).", "Toggle optimisation passes and precision; watch the Savings tab.", "Pick an output: SVG, data URI, JSX or CSS."],
    tips: ["Two decimals is plenty for icons on a 24px grid; logos may want three.", "The preview is sanitised — scripts and event handlers never run."],
  },

  "image-toolkit": {
    inputs: [
      { id: "image", label: "Image", kind: "file", accept: "image/*", read: "dataurl", placeholder: "Drop, paste or pick an image" },
      { id: "edits", label: "Edits (JSON)", kind: "text" },
    ],
    custom: () => import("./ui/F-ImageToolkit"),
    skipNodeTest: true,
    pipe: false,
    async run({ inputs }) {
      const { processImage } = await import("./lib/F-image");
      return processImage(str(inputs.image), str(inputs.edits));
    },
    examples: [
      { label: "Photo → WebP", inputs: { image: SAMPLE_PHOTO, "image:name": "sunset.jpg · 30 KB sample", edits: JSON.stringify({ format: "image/webp", quality: 0.75 }) }, note: "Same pixels, WebP at 75%: typically a third smaller than the JPEG original." },
      { label: "Resize + target size", inputs: { image: SAMPLE_PHOTO, "image:name": "sunset.jpg · 30 KB sample", edits: JSON.stringify({ width: 320, format: "image/jpeg", quality: 0.9, maxKB: 8 }) }, note: "320px wide JPEG, with quality lowered automatically until it fits in 8 KB." },
      { label: "Logo → WebP", inputs: { image: SAMPLE_LOGO, "image:name": "logo.svg · sample", edits: JSON.stringify({ width: 256, format: "image/webp", quality: 0.9 }) }, note: "Transparency survives in WebP and PNG; JPEG would fill it with the background colour." },
      { label: "Square crop + B&W", inputs: { image: SAMPLE_PHOTO, "image:name": "sunset.jpg · 30 KB sample", edits: JSON.stringify({ crop: { preset: "1:1" }, grayscale: 100, contrast: 125, width: 240, format: "image/jpeg", quality: 0.85 }) }, note: "Centre 1:1 crop, grayscale and a contrast boost, 240px square." },
      { label: "Pixel art ×16", inputs: { image: SAMPLE_PIXEL, "image:name": "heart.png · 16×16", edits: JSON.stringify({ width: 256, smoothing: false, format: "image/png" }) }, note: "Nearest-neighbour upscaling keeps pixel art crisp." },
      { label: "Rotate & flip", inputs: { image: SAMPLE_LOGO, "image:name": "logo.svg · sample", edits: JSON.stringify({ rotate: 90, flipH: true, width: 300, format: "image/png", sepia: 60 }) }, note: "Rotation, mirroring and a sepia filter in one pass." },
    ],
    steps: ["Drop, paste or pick an image — it never leaves the tab.", "Resize, crop, rotate/flip and adjust colours.", "Choose PNG, JPEG, WebP or AVIF and a quality; optionally a target size.", "Compare before/after and download."],
    tips: ["Re-encoding through a canvas drops EXIF metadata (including GPS location).", "WebP is usually 25–35% smaller than JPEG at the same quality."],
  },

  "seo-inspector-paste-only": {
    inputs: [{ id: "html", label: "Page HTML", lang: "html", placeholder: "Paste the page source (View Source → Select all → Copy)" }],
    options: [{ id: "site", label: "Site host", type: "text", default: "", placeholder: "example.com", hint: "Used to classify links as internal/external when there is no canonical" }],
    async run({ inputs, opts }) {
      const src = str(inputs.html);
      if (!src.trim()) throw new ToolError("Paste a page's HTML source to audit it.");
      if (!/<[a-z!]/i.test(src)) throw new ToolError("That does not look like HTML — paste the page source, starting at <!doctype html> or <head>.");
      const S = await import("./lib/F-seo");
      const r = S.auditHtml(src, str(opts.site).trim());
      const outline = r.headings.length
        ? r.headings.map((h) => `${"  ".repeat(h.level - 1)}H${h.level}  ${h.text}${h.skipped ? "   ⚠ skipped a level" : ""}`).join("\n")
        : "(no headings)";
      const text = [
        `SEO score: ${r.score}/100`,
        "",
        ...r.checks.map((c) => `${{ pass: "✓", warn: "!", fail: "✗", info: "i" }[c.status]} ${c.label}: ${c.detail}`),
        "",
        "Headings:",
        outline,
      ].join("\n");
      const failing = r.checks.filter((c) => c.status === "fail" || c.status === "warn");
      return {
        text,
        views: [
          { label: `Score ${r.score}`, out: { kind: "html", html: S.reportHtml(r), css: S.SEO_CSS } },
          { label: `Issues (${failing.length})`, out: { kind: "issues", items: failing.map((c) => ({ level: c.status === "fail" ? "error" : "warning", message: `${c.label}: ${c.detail}` })) } },
          { label: "Google preview", out: { kind: "html", html: S.serpHtml(r), css: S.SEO_CSS } },
          { label: "Social card", out: { kind: "html", html: S.socialHtml(r), css: S.SEO_CSS } },
          { label: "Headings", out: { kind: "text", text: outline } },
          { label: `Meta tags (${r.metas.length})`, out: { kind: "table", columns: ["Type", "Name", "Content"], rows: r.metas } },
          { label: `Links (${r.links.length})`, out: { kind: "table", columns: ["Href", "Anchor text", "Kind", "rel"], rows: r.links.map((l) => [l.href, l.text || "(none)", l.kind, l.rel]) } },
          { label: `Images (${r.images.length})`, out: { kind: "table", columns: ["src", "alt", "width", "height", "loading"], rows: r.images.map((i) => [i.src, i.alt === null ? "⚠ missing" : i.alt || '"" (decorative)', i.width, i.height, i.loading]) } },
          ...(r.jsonld.values.length ? [{ label: "JSON-LD", out: { kind: "tree" as const, value: r.jsonld.values.length === 1 ? r.jsonld.values[0] : r.jsonld.values } }] : []),
        ],
      };
    },
    examples: [
      { label: "Optimised article", inputs: { html: SEO_ARTICLE }, note: "A well-built article: every core check passes — compare the score breakdown." },
      { label: "Poor page", inputs: { html: SEO_POOR }, note: "noindex, two H1s, a skipped heading level, missing alt text, no description and broken JSON-LD." },
      { label: "Product page", inputs: { html: SEO_PRODUCT }, note: "A long title, one image without alt, a twitter summary card and Product structured data." },
      { label: "Multilingual landing", inputs: { html: SEO_LANDING }, note: "hreflang with an invalid code (es_ES), a relative URL and no x-default; zoom disabled in the viewport." },
      { label: "Site host option", inputs: { html: SEO_POOR.replace('<a href="/shop">', '<a href="https://shop.example.com/shop">') }, opts: { site: "shop.example.com" }, note: "Without a canonical, the host option decides which absolute links count as internal." },
    ],
    steps: ["Open the page, View Source, copy everything and paste it here.", "Read the score and the failing checks first.", "Check the Google and social previews.", "Use the Headings, Meta tags, Links and Images tabs to fix details."],
    tips: ["Nothing is fetched — og:image is shown as a placeholder.", "Scores weight the signals that matter most: title, description, H1, indexability."],
  },

  "jsonld-inspector": {
    inputs: [{ id: "src", label: "JSON-LD or HTML", lang: "json", placeholder: 'Paste JSON-LD, or HTML containing <script type="application/ld+json"> blocks' }],
    options: [{ id: "level", label: "Show", type: "segment", choices: [["all", "All"], ["problems", "Errors & warnings"], ["errors", "Errors only"]], default: "all" }],
    async run({ inputs, opts }) {
      const src = str(inputs.src);
      if (!src.trim()) throw new ToolError("Paste JSON-LD or an HTML page to inspect its structured data.");
      const J = await import("./lib/F-jsonld");
      const blocks = J.extractBlocks(src);
      if (!blocks.length) throw new ToolError('No JSON-LD found. Paste a JSON object, or HTML with <script type="application/ld+json"> blocks.');
      const issues: { level: "error" | "warning" | "info" | "ok"; message: string; line?: number }[] = [];
      for (const b of blocks) if (b.error) issues.push({ level: "error", message: `Block ${b.index + 1} is not valid JSON: ${b.error}`, line: b.errorLine ?? b.line });
      const ents = J.entitiesOf(blocks);
      const perEntity = ents.map((e) => ({ e, issues: J.validateEntity(e, blocks) }));
      for (const p of perEntity) for (const i of p.issues) issues.push({ level: i.level, message: `${p.e.type} — ${i.message}${i.path !== p.e.path ? ` (${i.path.replace(p.e.path + ".", "")})` : ""}`, line: i.line });
      const lvl = str(opts.level);
      const shown = issues.filter((i) => lvl === "all" || i.level === "error" || (lvl === "problems" && i.level === "warning"));
      const errors = issues.filter((i) => i.level === "error").length;
      const warnings = issues.filter((i) => i.level === "warning").length;
      const summary = `${blocks.length} block${blocks.length === 1 ? "" : "s"}, ${ents.length} entit${ents.length === 1 ? "y" : "ies"} — ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}${errors ? " (invalid for rich results)" : ""}`;
      const text = [summary, "", ...shown.map((i) => `${{ error: "✗", warning: "!", info: "i", ok: "✓" }[i.level]} ${i.message}`)].join("\n");
      const values = blocks.filter((b) => b.value !== undefined).map((b) => b.value);
      const views: View[] = [
        { label: `Issues (${errors + warnings})`, out: { kind: "issues", items: shown } },
        {
          label: `Entities (${ents.length})`,
          out: {
            kind: "table",
            columns: ["Type", "Path", "Errors", "Warnings", "Key properties"],
            rows: perEntity.map((p) => [p.e.type, p.e.path, p.issues.filter((i) => i.level === "error").length, p.issues.filter((i) => i.level === "warning").length, J.keyProps(p.e.node)]),
          },
        },
        { label: "Rich preview", out: { kind: "html", html: perEntity.map((p) => J.richPreview(p.e)).join("") || "<p>No entities.</p>", css: J.RICH_CSS } },
      ];
      if (values.length) views.push({ label: "Tree", out: { kind: "tree", value: values.length === 1 ? values[0] : values } });
      views.push({
        label: "Stats",
        out: {
          kind: "stats",
          items: [
            { label: "Blocks", value: blocks.length },
            { label: "Entities", value: ents.length },
            { label: "Errors", value: errors, tone: errors ? "bad" : "ok" },
            { label: "Warnings", value: warnings, tone: warnings ? "warn" : "ok" },
            { label: "Types", value: [...new Set(ents.map((e) => e.type))].join(", ") || "—", tone: "info" },
          ],
        },
      });
      const res: Result = { text, views };
      if (errors) res.notes = ["Errors make the entity ineligible for rich results; warnings only limit what is shown."];
      return res;
    },
    examples: [
      { label: "Product", inputs: { src: LD_PRODUCT }, note: "A complete Product with Offer, AggregateRating and a Review — see the rich preview." },
      { label: "News page (HTML)", inputs: { src: LD_ARTICLE_HTML }, note: "Three <script> blocks: NewsArticle, BreadcrumbList and an @graph with Organization and WebSite." },
      { label: "Recipe", inputs: { src: LD_RECIPE }, note: "Durations must be ISO 8601 (PT30M); instructions as HowToStep items." },
      { label: "Event + Job (@graph)", inputs: { src: LD_EVENT_JOB }, note: "A hybrid event with an offer, and a remote JobPosting with a salary range." },
      { label: "Bakery + FAQ", inputs: { src: LD_LOCAL_FAQ }, opts: { level: "problems" }, note: "A LocalBusiness with a bad opening time (8am) and a FAQ question without an answer." },
      { label: "App, video, course…", inputs: { src: LD_SOFTWARE }, note: "SoftwareApplication, VideoObject, Course, HowTo and Person in one graph." },
      { label: "Broken product", inputs: { src: LD_BROKEN }, note: "Currency symbol in price, a non-ISO currency, rating out of range, expired priceValidUntil, review without author." },
      { label: "Invalid JSON", inputs: { src: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Acme",\n}\n</script>' }, error: true, note: "A trailing comma makes the whole block invisible to search engines." },
    ],
    steps: ["Paste JSON-LD, or the HTML of a page.", "Read errors first — they block rich results.", "Check the rich preview and the entities table.", "Explore the raw data in the Tree tab."],
    tips: ["Nested objects (offers, author, address) are validated with their parent.", "Rules follow Google's rich-result documentation for each type."],
  },
};

export default specs;
