/* How well a job description fits your saved experience.

   Built-in: free and instant, done here from word overlap and simple rules. It can't tell
   that "led AI governance" covers "drove responsible AI policy", so it's a rough read.
   Claude: optional, with your own API key. It reads for meaning, line by line, and its
   verdicts replace the built-in ones. Pay and location always come from the rules here. */
(function (root) {
  "use strict";

  // ---------- words ----------
  var STOP = words("a an and or the of in on at to for with by from as is are be been being this that these those it its our your you we they their them us i me my will would can could should may might must shall do does did have has had not no nor but if than then so such into over under about across within per via etc eg ie e.g i.e also both each any all more most other some own same very just only who whom which what when where why how while");
  var GENERIC = words("build builds building production engineers engineer users user customers customer tool tools improve improving available full-time designed foster program programs partner partnering collaborate collaborating closely cross-functional cross-functionally stakeholder stakeholders experience experienced years year ability able strong strongly excellent exceptional work working worked team teams teammate skills skill knowledge understanding including include includes plus preferred required require requirement requirements responsibilities responsibility role roles position candidate candidates proven track record demonstrated demonstrate familiarity familiar proficiency proficient expertise expert solid deep good great well highly high level levels new across using use used based related relevant similar equivalent field fields environment fast paced help helping make making ensure ensuring support supporting provide providing drive driving deliver delivering minimum qualifications qualification bonus nice ideal ideally someone people company business opportunity opportunities day days week weeks month months time join looking seeking want love passion passionate join");
  // Same thing, said differently: both sides are rewritten to the right-hand words
  var ALIASES = {
    "ml": "machine learning", "ai": "artificial intelligence", "genai": "generative ai", "gen ai": "generative ai",
    "llm": "large language models", "llms": "large language models", "nlp": "natural language processing",
    "bi": "business intelligence", "k8s": "kubernetes", "js": "javascript", "ts": "typescript",
    "postgres": "postgresql", "gcp": "google cloud", "aws": "amazon web services", "pm": "product management",
    "a/b": "ab testing", "a/b testing": "ab testing", "go-to-market": "gtm", "go to market": "gtm", "ci/cd": "continuous integration", "okrs": "okr", "kpis": "kpi"
  };
  var TECH = ["python", "sql", "java", "javascript", "typescript", "react", "node", "golang", "rust", "c++", "c#", "scala", "kotlin", "swift", "ruby", "php", "r",
    "amazon web services", "azure", "google cloud", "kubernetes", "docker", "terraform", "linux", "git", "api", "apis", "rest", "graphql", "microservices", "continuous integration",
    "spark", "airflow", "dbt", "snowflake", "databricks", "bigquery", "redshift", "kafka", "hadoop", "etl", "data pipelines", "data warehouse", "postgresql", "mysql", "mongodb",
    "tableau", "power bi", "looker", "excel", "pandas", "numpy", "pytorch", "tensorflow", "scikit-learn", "machine learning", "deep learning", "large language models",
    "generative ai", "artificial intelligence", "natural language processing", "computer vision", "rag", "embeddings", "statistics", "statistical", "modeling", "algorithms",
    "data science", "ab testing", "experimentation", "backend", "frontend", "full stack", "distributed systems", "infrastructure", "security", "cloud", "devops", "sre"];
  var CODING = /\b(write|writing|ship|shipping)\s+(production\s+)?code\b|\bcoding\b|\bprogramming\b|\bsoftware engineer|\bhands-on (technical|coding|engineering)\b|\bcode reviews?\b/;

  function words(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = true; }); return o; }
  function lower(s) { return String(s == null ? "" : s).toLowerCase(); }
  function clean(s) { return lower(s).replace(/[“”"’']/g, "").replace(/[^a-z0-9+#/.\s-]/g, " ").replace(/\s+/g, " ").trim(); }
  var IRREGULAR = { built: "build", ran: "run", led: "lead", wrote: "write", written: "write", grew: "grow", grown: "grow", drove: "drive", driven: "drive", made: "make", taught: "teach", thought: "think", won: "win" };
  function stem(w) {
    if (IRREGULAR[w]) return IRREGULAR[w];
    if (w.length > 8 && /ations?$/.test(w)) return w.replace(/ations?$/, "");
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function aliased(text) {
    var t = " " + clean(text) + " ";
    Object.keys(ALIASES).forEach(function (k) {
      t = t.split(" " + k + " ").join(" " + ALIASES[k] + " ");
    });
    return t;
  }
  // The terms in a line worth checking: known multi-word terms first, then single words.
  // Each is compared by its stem; shown keeps a word as written, for notes.
  var shown = {};
  function terms(text) {
    var t = aliased(text);
    var found = [];
    TECH.forEach(function (p) {
      if (p.indexOf(" ") < 0) return;
      if (t.indexOf(" " + p + " ") >= 0) { found.push(p); t = t.split(" " + p + " ").join(" "); }
    });
    t.split(/[\s/.,-]+/).forEach(function (w) {
      w = w.replace(/^[.#/]+|[./]+$/g, "");
      if (!w || STOP[w] || GENERIC[w] || /^\d+\+?$/.test(w)) return;
      if (w.length < 3 && TECH.indexOf(w) < 0) return;
      var key = stem(w);
      if (!shown[key]) shown[key] = w;
      found.push(key);
    });
    return found.filter(function (w, i) { return found.indexOf(w) === i; });
  }
  // Words that name a skill or tool weigh more than ordinary words: known tech terms, and
  // words written with a capital mid-sentence or in capitals (Rust, Kubernetes, SQL, HubSpot)
  function weights(text) {
    var named = {};
    String(text || "").replace(/^[\s•\-–*]+/, "").split(/(?<=[.:;!?])\s+/).forEach(function (sentence) {
      sentence.split(/[\s,()/]+/).slice(1).forEach(function (raw) {
        var w = raw.replace(/[^A-Za-z0-9+#]/g, "");
        if (/^[A-Z][a-z]+[A-Z]?\w*$|^[A-Z0-9+#]{2,}$/.test(w)) named[stem(w.toLowerCase())] = true;
      });
    });
    return function (k) { return TECH.indexOf(k) >= 0 || named[k] ? 3 : 1; };
  }

  // ---------- you ----------
  function monthsBetween(a, b) {
    var x = /^(\d{4})(?:-(\d{2}))?/.exec(a || ""), y = /^(\d{4})(?:-(\d{2}))?/.exec(b || "");
    if (!x || !y) return 0;
    return (+y[1] - +x[1]) * 12 + ((+y[2] || 1) - (+x[2] || 1));
  }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  // Saved years if you gave a number, otherwise your jobs' dates with overlaps counted once
  function yourYears(p) {
    var said = /(\d+(?:\.\d+)?)/.exec((p.texts && p.texts.yearsExp) || "");
    if (said) return +said[1];
    var spans = p.jobs.map(function (j) { return [j.start, j.current || !j.end ? today() : j.end]; })
      .filter(function (s) { return /^\d{4}/.test(s[0] || ""); }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var months = 0, endAt = "";
    spans.forEach(function (s) {
      var from = endAt && endAt > s[0] ? endAt : s[0];
      if (s[1] > from) months += monthsBetween(from, s[1]);
      if (s[1] > endAt) endAt = s[1];
    });
    return Math.round(months / 12 * 10) / 10;
  }
  function corpusOf(p) {
    var text = [];
    p.jobs.forEach(function (j) { text.push(j.title, j.description); });
    p.education.forEach(function (e) { text.push(e.degree, e.field, e.school); });
    text.push(p.texts && p.texts.skills, p.texts && p.texts.summary);
    (p.saved || []).forEach(function (s) { if ((s.a || "").length > 80) text.push(s.a); });
    var have = {};
    terms(text.filter(Boolean).join("\n")).forEach(function (w) { have[w] = true; });
    return have;
  }
  function degreeLevel(s) {
    var t = lower(s);
    if (/ph\.?d|doctor/.test(t)) return 4;
    if (/master|m\.?s\.?\b|mba|m\.?eng/.test(t)) return 3;
    if (/bachelor|b\.?s\.?\b|b\.?a\.?\b|undergraduate|b\.?eng|bcomm?|degree/.test(t)) return 2;
    return 0;
  }

  // ---------- the description ----------
  var HEADINGS = [
    ["pref", /^(preferred( qualifications)?|nice[- ]to[- ]haves?|bonus( points)?|pluses|it('s| is|'d be) (a )?(plus|great|bonus)|extra credit|preferred skills|strong candidates (may|might) also|you might also|ideally you('ll)? also|even better)\b/],
    ["req", /^(requirements?|qualifications?|minimum qualifications?|basic qualifications?|required|must[- ]haves?|what you('ll)? (bring|need|have)|who you are|you have|you are|about you|skills|what we('re)? looking for|what we need|you may be a good fit|you('ll| will)? (be|are)? ?a (great|good) fit|you might thrive|ideal candidate|the ideal candidate|you should|we('d| would) love|we('re| are) looking for)\b/],
    ["resp", /^(responsibilities|what you('ll)? do|the role|your role|in this role|day[- ]to[- ]day|key responsibilities|what you will do|duties|the job|you will|you'll|what you'll work on|what you'll own|your impact|the opportunity)\b/],
    ["skip", /^(benefits|perks|what we offer|compensation|salary|pay|annual salary|about\b|who we are|our (mission|values|culture|team|story)|equal (employment )?opportunity|eeo|diversity|how to apply|location|logistics|the team|why join|why (you'll love|work)|life at|how we('re| are) different|come work with us|visa|deadline|role[- ]specific (policy|location)|interview process)\b/]
  ];
  // Legal text, and where the job is (the Location tile covers that)
  var BOILER = /equal opportunity|regardless of (race|age)|reasonable accommodation|e-?verify|privacy (policy|notice)|background check|at[- ]will|\b(is|are) based in\b|\bthis role is (located|based)|\b(days|times) (a|per) week in (the|our) office|\brelocation\b/i;
  // "Requirements" or "What you'll bring:" - short, or ending in a colon, never a sentence
  function headingOf(line) {
    var raw = line.replace(/^[•\-–*\s]+/, "").trim();
    var t = lower(raw).replace(/[:]\s*$/, "").trim();
    var colon = /:\s*$/.test(raw);
    if (t.length > 60 || /[.!?]/.test(t) || (!colon && t.split(/\s+/).length > 5)) return "";
    for (var i = 0; i < HEADINGS.length; i++) if (HEADINGS[i][1].test(t)) return HEADINGS[i][0];
    return "";
  }
  function splitLines(jd) {
    return String(jd || "").split(/\n+/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean).slice(0, 240);
  }
  var YEARS = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2}\s*)?\+?\s*years?/i;
  var CUES = /\b(experience|proficien|knowledge of|familiar|degree|background in|expertise|track record|fluent|skilled)/i;

  // Known skills first in notes, then the rest as written
  function say(keys) {
    var sorted = keys.slice().sort(function (a, b) { return (TECH.indexOf(b) >= 0) - (TECH.indexOf(a) >= 0); });
    return sorted.map(function (k) { return shown[k] || k; }).join(", ");
  }
  function readLines(jd, p, posting) {
    var company = {};
    terms((posting && posting.company) || "").forEach(function (w) { company[w] = true; });
    var have = corpusOf(p);
    var years = yourYears(p);
    var level = Math.max.apply(null, [0].concat(p.education.map(function (e) { return degreeLevel(e.degree); })));
    var section = "";
    return splitLines(jd).map(function (text, i) {
      shown = {}; // notes quote this line's own words
      var head = headingOf(text);
      if (head) { section = head; return { i: i, text: text, kind: "heading", verdict: "", note: "" }; }
      var kind = section;
      if (BOILER.test(text) || text.length < 20) kind = "skip";
      // Outside a known section, only short or bulleted lines that ask for something
      if (!kind) kind = (CUES.test(text) || YEARS.test(text)) && (/^[•\-–*]/.test(text) || text.length < 220) ? "req" : "other";
      var out = { i: i, text: text, kind: kind, verdict: "", note: "" };
      if (kind === "skip" || kind === "other") return out;

      var found = terms(text).filter(function (w) { return !company[w]; });
      var weigh = weights(text);
      var hit = found.filter(function (w) { return have[w]; });
      var miss = found.filter(function (w) { return !have[w]; });
      var sum = function (list) { return list.reduce(function (n, w) { return n + weigh(w); }, 0); };
      var ratio = found.length ? sum(hit) / sum(found) : 0;
      var asked = YEARS.exec(text);
      var wantsDegree = /\b(bachelor|master|ph\.?d|degree)\b/i.test(text) ? degreeLevel(text) : 0;

      if (asked && +asked[1] > years + 0.5) {
        out.verdict = "gap";
        out.note = "Asks for " + asked[1] + "+ years; you have about " + years + ".";
        out.years = +asked[1];
      } else if (wantsDegree && level >= wantsDegree && ratio < 0.6) {
        out.verdict = "strong";
        out.note = "Your education covers this.";
      } else if (!found.length) {
        out.verdict = asked ? "strong" : "";
        if (asked) out.note = "You have about " + years + " years.";
      } else if (ratio >= 0.55) {
        out.verdict = "strong";
        out.note = "In your experience: " + say(hit.slice(0, 4)) + ".";
      } else if (ratio >= 0.25) {
        out.verdict = "partial";
        out.note = "You have " + say(hit).split(", ").slice(0, 3).join(", ") + "; not " + say(miss).split(", ").slice(0, 3).join(", ") + ".";
      } else if (miss.some(function (w) { return weigh(w) > 1; })) {
        out.verdict = "gap";
        out.note = "Not in your saved experience: " + say(miss.filter(function (w) { return weigh(w) > 1; }).concat(miss.filter(function (w) { return weigh(w) === 1; })).slice(0, 4)) + ".";
      }
      // Otherwise it's about how you work ("lead with humility"): word matching can't judge that
      if (asked) out.years = out.years || +asked[1];
      return out;
    });
  }

  // ---------- pay ----------
  function amount(s) {
    var m = /([\d,.]+)\s*([kK])?/.exec(s);
    if (!m) return 0;
    var n = parseFloat(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  }
  function parsePay(text) {
    var t = String(text || "");
    var m = /([$£€])\s?([\d,.]+\s?[kK]?)\s*(?:-|–|—|to)\s*(?:[$£€]|USD|CAD|GBP|EUR)?\s?([\d,.]+\s?[kK]?)(?:\s*(?:\/|per|an?)\s*(hour|hr|year|yr|annum|month))?/i.exec(t);
    var single = !m && /([$£€])\s?([\d,.]+\s?[kK]?)(?:\s*(?:\/|per|an?)\s*(hour|hr|year|yr|annum|month))/i.exec(t);
    if (!m && !single) return null;
    var cur = (m || single)[1];
    var low = amount((m || single)[2]);
    var high = m ? amount(m[3]) : low;
    var per = lower((m ? m[4] : single[3]) || "");
    if (!per && high < 1000) per = "hour";
    var times = /hour|hr/.test(per) ? 2080 : /month/.test(per) ? 12 : 1;
    if (!low || !high) return null;
    return { low: low * times, high: high * times, currency: { "$": "USD", "£": "GBP", "€": "EUR" }[cur], hourly: times === 2080 };
  }
  function payVerdict(pay, prefs) {
    var min = Number(prefs.payMin) || 0, max = Number(prefs.payMax) || 0;
    if (!pay) return { state: "unknown", text: "Not listed" };
    if (!min && !max) return { state: "unknown", text: "Set your range in My info to compare" };
    if (pay.currency && prefs.currency && pay.currency !== prefs.currency) return { state: "unknown", text: "Listed in " + pay.currency + ", your range is " + prefs.currency };
    if (min && pay.high < min) return { state: "bad", text: "Below your range" };
    if (min && pay.low >= min) return { state: "good", text: max && pay.low > max ? "Above your range" : "In your range" };
    return { state: "warn", text: "Overlaps your range: the top end reaches it" };
  }

  // ---------- where ----------
  function styleOf(text) {
    var t = lower(text);
    if (/\bhybrid\b/.test(t)) return "hybrid";
    if (/\b(fully |100% )?remote\b/.test(t) && !/\bnot (a )?remote\b|\bno remote\b/.test(t)) return "remote";
    if (/\bon-?site\b|\bin[- ]office\b|\bin person\b|\bdays (a|per) week in\b/.test(t)) return "onsite";
    return "";
  }
  function placeVerdict(location, jd, prefs) {
    var style = styleOf(location) || styleOf(jd);
    var styles = prefs.styles || {};
    var places = String(prefs.places || "").split(/[,;\n]/).map(function (s) { return lower(s).trim(); }).filter(Boolean);
    var where = lower(location);
    var inPlace = places.some(function (p) { return where.indexOf(p.split(/\s+/)[0]) >= 0; });
    var label = (style ? { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[style] : "") + (location && style !== "remote" ? (style ? ", " : "") + location : "");
    if (!label) label = location || "Not stated";
    if (!style && !location) return { state: "unknown", label: label, text: "Not stated" };
    if (style === "remote") return styles.remote === false ? { state: "bad", label: label, text: "You'd rather not be remote" } : { state: "good", label: label, text: "Remote suits you" };
    if (style && styles[style] === false) return { state: "bad", label: label, text: (style === "hybrid" ? "Hybrid" : "On-site") + " isn't one of your work styles" };
    if (!places.length) return { state: "unknown", label: label, text: "Add the places you'd work in My info" };
    return inPlace ? { state: "good", label: label, text: "Where you want to be" } : { state: "bad", label: label, text: "Not one of your places" };
  }

  // ---------- level ----------
  var LEVELS = ["Entry", "Mid", "Senior", "Lead", "Director+"];
  function titleLevel(title) {
    var t = lower(title);
    if (/\b(vp|vice president|chief|head of|director)\b/.test(t)) return 5;
    if (/\b(principal|staff|lead|manager)\b/.test(t)) return 4;
    if (/\b(senior|sr\.?)\b/.test(t)) return 3;
    if (/\b(intern|junior|jr\.?|graduate|entry|associate|assistant)\b/.test(t)) return 1;
    return 2;
  }
  function yearsLevel(y) { return y >= 12 ? 5 : y >= 8 ? 4 : y >= 5 ? 3 : y >= 2 ? 2 : 1; }

  // ---------- together ----------
  var WEIGHT = { req: 1, pref: 0.5, resp: 0.6 };
  var SCORE = { strong: 1, partial: 0.5, gap: 0 };
  function scoreLines(lines) {
    var total = 0, got = 0;
    lines.forEach(function (l) {
      if (!l.verdict || !WEIGHT[l.kind]) return;
      total += WEIGHT[l.kind];
      got += WEIGHT[l.kind] * SCORE[l.verdict];
    });
    return total ? Math.round(100 * got / total) : null;
  }
  function technicalOf(lines, jd) {
    var counted = lines.filter(function (l) { return l.kind !== "heading" && l.kind !== "skip"; });
    if (!counted.length) return 0;
    var techy = counted.filter(function (l) {
      var t = aliased(l.text);
      return TECH.some(function (w) { return t.indexOf(" " + w + " ") >= 0; });
    }).length;
    var score = Math.min(1, techy / counted.length * 1.25) * 100 + (CODING.test(lower(jd)) ? 15 : 0);
    return Math.round(Math.min(100, score));
  }
  function technicalLabel(n) { return n < 25 ? "Light" : n < 50 ? "Some" : n < 75 ? "Technical" : "Deeply technical"; }
  function callbackOf(fit, levelGap, placeBad, yearsGap) {
    if (fit == null) return null;
    var s = fit - (levelGap >= 2 ? 20 : levelGap === 1 ? 8 : levelGap <= -1 ? 5 : 0) - (placeBad ? 10 : 0) - (yearsGap ? 10 : 0);
    return s >= 70 ? "high" : s >= 45 ? "medium" : "low";
  }

  // posting: { title, company, location, pay, jd, url }
  function analyze(posting, p) {
    var prefs = p.prefs || {};
    var lines = readLines(posting.jd, p, posting);
    var years = yourYears(p);
    var asked = Math.max.apply(null, [0].concat(lines.map(function (l) { return l.years || 0; })));
    // The title leads; years asked can lift it one step, or set it when the title doesn't say
    var named = titleLevel(posting.title);
    var fromYears = asked ? yearsLevel(asked) : 0;
    var jobLevel = Math.min(5, named === 2 ? Math.max(2, fromYears) : Math.max(named, Math.min(fromYears, named + 1)));
    var latest = p.jobs[0] ? titleLevel(p.jobs[0].title) : 1;
    var youLevel = Math.min(5, Math.max(yearsLevel(years), Math.min(latest, yearsLevel(years) + 1)));
    var fit = scoreLines(lines);
    var place = placeVerdict(posting.location, posting.jd, prefs);
    var pay = parsePay(posting.pay) || parsePay(posting.jd);
    var technical = technicalOf(lines, posting.jd);
    var yearsGap = lines.some(function (l) { return l.verdict === "gap" && l.years; });
    return {
      source: "built-in",
      posting: { title: posting.title, company: posting.company, location: posting.location, url: posting.url },
      lines: lines,
      fit: fit,
      years: { asked: asked, yours: years },
      level: { job: jobLevel, you: youLevel, gap: jobLevel - youLevel },
      technical: technical,
      pay: pay, payVerdict: payVerdict(pay, prefs), prefs: { payMin: Number(prefs.payMin) || 0, payMax: Number(prefs.payMax) || 0 },
      place: place,
      callback: callbackOf(fit, jobLevel - youLevel, place.state === "bad", yearsGap)
    };
  }

  // ---------- Claude ----------
  var MODELS = {
    "claude-opus-5-5": { name: "Claude Opus 5.5", input: 4, output: 20, fallbacks: true },
    "claude-sonnet-5-5": { name: "Claude Sonnet 5.5", input: 2, output: 10, fallbacks: true },
    "claude-haiku-5-5": { name: "Claude Haiku 5.5", input: 0.1, output: 0.5, fallbacks: false }
  };
  var DEFAULT_MODEL = "claude-opus-5-5";
  // A typical posting: about 5,000 tokens in, 4,000 out once thinking is counted
  function estimate(model) {
    var m = MODELS[model] || MODELS[DEFAULT_MODEL];
    return (5000 * m.input + 4000 * m.output) / 1e6;
  }
  function money(d) { return d < 0.01 ? "under 1¢" : d < 1 ? Math.round(d * 100) + "¢" : "$" + d.toFixed(2); }

  var SCHEMA = {
    type: "object", additionalProperties: false,
    required: ["fit", "callback", "callbackWhy", "level", "technical", "summary", "lines"],
    properties: {
      fit: { type: "integer", description: "0 to 100: how well the candidate's experience covers what the job asks, weighting must-haves most." },
      callback: { type: "string", enum: ["low", "medium", "high"], description: "Candid chance a recruiter would call back, from fit, seniority and must-haves." },
      callbackWhy: { type: "string", description: "One sentence on the main reason for that callback chance." },
      level: { type: "integer", description: "The job's seniority: 1 entry, 2 mid, 3 senior, 4 lead or manager, 5 director or above." },
      technical: { type: "integer", description: "0 to 100: how hands-on technical the job is. 0 is no technical skill, 100 is deep engineering." },
      summary: { type: "string", description: "Two sentences: the strongest match and the biggest gap." },
      lines: {
        type: "array", description: "One entry per line that states a requirement, qualification or responsibility. Leave out headings, company background, benefits and legal text.",
        items: {
          type: "object", additionalProperties: false, required: ["i", "verdict", "note"],
          properties: {
            i: { type: "integer", description: "The line's number from the list." },
            verdict: { type: "string", enum: ["strong", "partial", "gap"] },
            note: { type: "string", description: "Under 15 words: the evidence from the candidate's history, or what's missing." }
          }
        }
      }
    }
  };
  var SYSTEM = "You compare a job description with one candidate's work history and give a candid, specific read. " +
    "Judge by meaning, not keywords: experience that does the same job under other words counts. " +
    "Call a line a gap only when nothing in the history supports it, and partial when some of it is covered. " +
    "Be honest about stretches; the candidate uses this to decide where to apply. Notes are short and plain.";

  function digest(p) {
    var out = [];
    out.push("Years of experience: about " + yourYears(p));
    p.jobs.forEach(function (j) {
      out.push("\n" + [j.title, j.company].filter(Boolean).join(" at ") + " (" + [j.start || "?", j.current ? "present" : j.end || "?"].join(" to ") + ")" + (j.location ? ", " + j.location : ""));
      if (j.description) out.push(j.description);
    });
    if (p.education.length) {
      out.push("\nEducation:");
      p.education.forEach(function (e) { out.push("- " + [e.degree, e.field, e.school].filter(Boolean).join(", ")); });
    }
    if (p.texts && p.texts.skills) out.push("\nSkills: " + p.texts.skills);
    if (p.texts && p.texts.summary) out.push("\nSummary: " + p.texts.summary);
    return out.join("\n");
  }
  // Sends only work history, education, skills and summary: never contact details or self-ID answers
  async function askClaude(posting, p, settings) {
    var model = MODELS[settings.claudeModel] ? settings.claudeModel : DEFAULT_MODEL;
    var lines = splitLines(posting.jd).map(function (l, i) { return i + ". " + l.slice(0, 500); });
    var text = "<candidate>\n" + digest(p) + "\n</candidate>\n\n<job title=\"" + (posting.title || "").replace(/"/g, "'") + "\" company=\"" + (posting.company || "").replace(/"/g, "'") + "\">\n" + lines.join("\n") + "\n</job>";
    var body = {
      model: model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: text }]
    };
    var headers = {
      "content-type": "application/json",
      "x-api-key": settings.claudeKey,
      "anthropic-version": "2026-10-21",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    if (MODELS[model].fallbacks) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }
    var res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: headers, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error("Couldn't reach Claude. Check your connection.");
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var why = data.error && data.error.message;
      if (res.status === 401) throw new Error("Claude didn't accept that API key. Check it in My info.");
      if (res.status === 429) throw new Error("Claude is rate limiting this key. Try again in a minute.");
      throw new Error("Claude returned an error" + (why ? ": " + why : " (" + res.status + ")."));
    }
    if (data.stop_reason === "refusal") throw new Error("Claude declined to analyze this posting.");
    if (data.stop_reason === "max_tokens") throw new Error("The analysis ran too long. Try a shorter selection of the description.");
    var block = (data.content || []).filter(function (b) { return b.type === "text"; }).pop();
    var parsed;
    try { parsed = JSON.parse(block.text); } catch (e) { throw new Error("Claude's answer couldn't be read."); }
    var used = MODELS[data.model] || MODELS[model];
    var cost = data.usage ? ((data.usage.input_tokens || 0) * used.input + (data.usage.output_tokens || 0) * used.output) / 1e6 : 0;
    return { result: parsed, cost: cost, model: data.model || model };
  }
  // Claude's reading in place of the built-in one, keeping pay and location from the rules
  function merge(base, ai) {
    var r = ai.result;
    var byLine = {};
    (Array.isArray(r.lines) ? r.lines : []).forEach(function (l) {
      if (l && typeof l.i === "number" && SCORE[l.verdict] != null) byLine[l.i] = l;
    });
    var lines = base.lines.map(function (l) {
      var x = byLine[l.i];
      if (l.kind === "heading") return l;
      return Object.assign({}, l, { verdict: x ? x.verdict : "", note: x ? String(x.note || "").slice(0, 200) : "", kind: x ? (l.kind === "skip" || l.kind === "other" ? "req" : l.kind) : l.kind });
    });
    var level = Math.max(1, Math.min(5, Math.round(Number(r.level) || base.level.job)));
    return Object.assign({}, base, {
      source: "claude",
      model: ai.model, cost: ai.cost,
      lines: lines,
      fit: Math.max(0, Math.min(100, Math.round(Number(r.fit)))),
      technical: Math.max(0, Math.min(100, Math.round(Number(r.technical)))),
      level: { job: level, you: base.level.you, gap: level - base.level.you },
      callback: ["low", "medium", "high"].indexOf(r.callback) >= 0 ? r.callback : base.callback,
      callbackWhy: String(r.callbackWhy || "").slice(0, 300),
      summary: String(r.summary || "").slice(0, 600)
    });
  }

  root.Fit = {
    analyze: analyze, askClaude: askClaude, merge: merge, parsePay: parsePay, yourYears: yourYears, terms: terms,
    LEVELS: LEVELS, MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL, estimate: estimate, money: money, technicalLabel: technicalLabel, splitLines: splitLines
  };
})(typeof window !== "undefined" ? window : globalThis);
