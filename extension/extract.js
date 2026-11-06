/* Injected into a page when you capture it; its last value goes back to the extension.
   Every result is a best guess that you check on the board before saving.

   In order of trust:
   1. Text you highlighted is the job description.
   2. Structured job data (schema.org JobPosting), which many job sites publish.
   3. Known portal addresses, for the company name.
   4. The page's own headings, title and largest description block. */
(function () {
  "use strict";

  var MAX_JD = 30000;
  var SELECTION_MIN = 40; // shorter than this, you probably weren't selecting the description
  var JD_MIN = 200;
  var JOB_SITES = /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workday|ziprecruiter|wellfound|built ?in|dice|monster|smartrecruiters|icims)/i;

  var line = function (s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); };
  var meta = function (name) {
    var el = document.querySelector('meta[property="' + name + '"],meta[name="' + name + '"]');
    return el ? line(el.getAttribute("content")) : "";
  };
  function firstText(selectors, max) {
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var t = line(els[j].innerText || els[j].textContent);
        if (t && t.length <= max) return t;
      }
    }
    return "";
  }

  // ---------- structured data ----------
  function isPosting(node) {
    var type = node && node["@type"];
    return type === "JobPosting" || (Array.isArray(type) && type.indexOf("JobPosting") >= 0);
  }
  function findPosting(node, depth) {
    if (!node || typeof node !== "object" || depth > 5) return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var hit = findPosting(node[i], depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    return isPosting(node) ? node : findPosting(node["@graph"], depth + 1);
  }
  function posting() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var hit = findPosting(JSON.parse(scripts[i].textContent), 0);
        if (hit) return hit;
      } catch (e) {}
    }
    return null;
  }
  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    // sites sometimes escape the markup twice
    if (!doc.body.children.length && /<[a-z][^>]*>/i.test(doc.body.textContent)) {
      doc = new DOMParser().parseFromString(doc.body.textContent, "text/html");
    }
    doc.querySelectorAll("script,style").forEach(function (el) { el.remove(); });
    doc.querySelectorAll("br").forEach(function (el) { el.replaceWith("\n"); });
    doc.querySelectorAll("li").forEach(function (el) { el.prepend("• "); });
    doc.querySelectorAll("p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,section,tr").forEach(function (el) { el.append("\n"); });
    return doc.body.textContent.replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // job data often arrives still HTML-escaped: "Emerging &amp; Scaled"
  function plain(s) {
    return line(new DOMParser().parseFromString(String(s == null ? "" : s), "text/html").documentElement.textContent);
  }
  function postingCompany(p) {
    var org = p.hiringOrganization;
    // Workday sites often name the legal entity with its code: "2100 NVIDIA USA"
    return plain(typeof org === "string" ? org : org && org.name).replace(/^\d+\s+/, "");
  }
  function postingLocation(p) {
    var places = [].concat(p.jobLocation || []).map(function (place) {
      var a = place && place.address;
      if (typeof a === "string") return line(a);
      if (!a) return line(place && place.name);
      return [a.addressLocality, a.addressRegion, a.addressLocality || a.addressRegion ? "" : a.addressCountry]
        .map(function (part) { return line(part && part.name ? part.name : part); }).filter(Boolean).join(", ");
    }).filter(Boolean);
    var where = places.slice(0, 2).join("; ") + (places.length > 2 ? " +" + (places.length - 2) + " more" : "");
    return /TELECOMMUTE/i.test(line(p.jobLocationType)) ? (where ? "Remote, " + where : "Remote") : where;
  }
  function money(n, currency) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return "";
    var text = v.toLocaleString("en-US", { maximumFractionDigits: v < 1000 ? 2 : 0 });
    return currency === "USD" || !currency ? "$" + text : text + " " + currency;
  }
  function postingPay(p) {
    var pay = p.baseSalary;
    if (!pay) return "";
    if (typeof pay !== "object") return line(pay);
    var value = pay.value && typeof pay.value === "object" ? pay.value : { value: pay.value };
    var currency = line(pay.currency || pay.salaryCurrency);
    var low = money(value.minValue != null ? value.minValue : value.value, currency);
    var high = money(value.maxValue, currency);
    if (!low && !high) return "";
    var unit = line(value.unitText || pay.unitText).toLowerCase();
    var per = { year: "year", yearly: "year", annual: "year", hour: "hour", hourly: "hour", month: "month", monthly: "month" }[unit];
    return (low && high && low !== high ? low + "–" + high : low || high) + (per ? " / " + per : "");
  }

  // ---------- portals ----------
  var PORTALS = [
    [/^(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io$/, "path"],
    [/^jobs(?:\.eu)?\.lever\.co$/, "path"],
    [/^jobs\.ashbyhq\.com$/, "path"],
    [/^apply\.workable\.com$/, "path"],
    [/^jobs\.smartrecruiters\.com$/, "path"],
    [/^ats\.rippling\.com$/, "path"],
    [/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/, "host"],
    [/^([^.]+)\.bamboohr\.com$/, "host"],
    [/^(?:careers-)?([^.]+)\.icims\.com$/, "host"]
  ];
  function portalCompany() {
    var host = location.hostname.replace(/^www\./, "");
    for (var i = 0; i < PORTALS.length; i++) {
      var match = PORTALS[i][0].exec(host);
      if (!match) continue;
      var slug = PORTALS[i][1] === "host" ? match[1] : location.pathname.split("/")[1];
      if (!slug || slug === "embed") return "";
      return decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
    }
    return "";
  }

  // ---------- the page itself ----------
  // "Job Application for Designer at Acme", "Designer @ Acme", "Designer | Acme | LinkedIn"
  function fromPageTitle() {
    var t = line(document.title).replace(/^job application for\s+/i, "");
    var at = /^(.+?)\s+(?:at|@)\s+(.+?)(?:\s+[|–—-]\s+.*)?$/i.exec(t);
    if (at) return { title: at[1], company: at[2] };
    var parts = t.split(/\s+[|–—]\s+|\s+-\s+/).map(line).filter(Boolean);
    while (parts.length && JOB_SITES.test(parts[parts.length - 1])) parts.pop();
    return { title: parts[0] || "", company: parts.length > 1 ? parts[parts.length - 1] : "" };
  }
  function pageTitle() {
    return firstText([
      ".job-details-jobs-unified-top-card__job-title", ".topcard__title",
      '[data-automation-id="jobPostingHeader"]', ".posting-headline h2",
      '[data-testid="jobsearch-JobInfoHeader-title"]', "h1"
    ], 160);
  }
  function pageCompany() {
    var named = firstText([
      ".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link",
      '[data-testid="inlineHeader-companyName"]', '[data-company-name]'
    ], 120);
    if (named) return named;
    var site = meta("og:site_name");
    return JOB_SITES.test(site) ? "" : site;
  }
  function pageLocation() {
    return firstText([
      ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
      '[data-testid="inlineHeader-companyLocation"]', '[data-automation-id="locations"] dd',
      ".job__location", ".posting-categories .location", ".location",
      '[class*="job-location" i]', '[class*="jobLocation" i]', '[class*="location" i]'
    ], 80).replace(/^location:?\s*/i, "");
  }
  function pagePay(text) {
    var amount = "[$£€]\\s?\\d{2,3}(?:,\\d{3})?(?:\\.\\d+)?\\s?[kK]?";
    var range = new RegExp(amount + "\\s?(?:-|–|—|to)\\s?(?:USD\\s?)?" + amount.replace("[$£€]\\s?", "[$£€]?\\s?"));
    var hit = range.exec(text);
    return hit ? line(hit[0]).replace(/\s?(-|–|—|to)\s?/, "–") : "";
  }
  function descriptionBlock() {
    var groups = [
      '[data-automation-id="jobPostingDescription"],#job-details,.jobs-description__content,#jobDescriptionText,.job__description,.posting-page .content,#content',
      '[class*="job-description" i],[class*="jobDescription" i],[id*="job-description" i],[id*="jobDescription" i]',
      '[class*="description" i],[id*="description" i],[class*="posting" i]',
      'article,main,[role="main"]'
    ];
    for (var i = 0; i < groups.length; i++) {
      var best = "";
      document.querySelectorAll(groups[i]).forEach(function (el) {
        var t = (el.innerText || "").trim();
        if (t.length > best.length) best = t;
      });
      if (best.length >= JD_MIN) return best;
    }
    return (document.body && document.body.innerText || "").trim();
  }

  // ---------- together ----------
  var selected = "";
  try { selected = String(window.getSelection()).trim(); } catch (e) {}
  if (selected.length < SELECTION_MIN) selected = "";

  var data = posting();
  var titleGuess = fromPageTitle();
  var description = data ? htmlToText(data.description) : "";
  var block = !selected && description.length < JD_MIN ? descriptionBlock() : "";

  var title = plain(data && data.title) || pageTitle() || titleGuess.title || meta("og:title");
  var company = (data && postingCompany(data)) || pageCompany() || portalCompany() || titleGuess.company;
  // a heading that also carries the company: "Acme - Designer"
  if (company && title.toLowerCase().indexOf(company.toLowerCase() + " - ") === 0) title = title.slice(company.length + 3);

  return {
    company: company.slice(0, 120),
    title: title.slice(0, 160),
    location: ((data && postingLocation(data)) || pageLocation()).slice(0, 120),
    pay: ((data && postingPay(data)) || pagePay(selected || description || block)).slice(0, 80),
    jd: (selected || (description.length >= JD_MIN ? description : block || description)).slice(0, MAX_JD)
  };
})();
