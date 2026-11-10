/* Works out what a form field is asking, then ranks your saved info for it. Nothing here
   touches a page: it only turns a description of a field into a list of suggestions. */
(function (root) {
  "use strict";

  // ---------- questions with a fixed set of answers ----------
  var YESNO = [["yes", "Yes"], ["no", "No"]];
  var CHOICES = {
    workAuth: { title: "Authorized to work where you're applying", choices: YESNO },
    sponsorship: { title: "Need visa sponsorship, now or later", choices: YESNO },
    relocate: { title: "Willing to relocate", choices: YESNO },
    over18: { title: "At least 18 years old", choices: YESNO },
    previouslyWorked: { title: "Worked at this company before", choices: YESNO },
    gender: { title: "Gender", self: true, choices: [["female", "Woman"], ["male", "Man"], ["nonbinary", "Non-binary"], ["decline", "Prefer not to say"]] },
    transgender: { title: "Transgender", self: true, choices: [["yes", "Yes"], ["no", "No"], ["decline", "Prefer not to say"]] },
    lgbtq: { title: "LGBTQ+", self: true, choices: [["yes", "Yes"], ["no", "No"], ["decline", "Prefer not to say"]] },
    hispanic: { title: "Hispanic or Latino", self: true, choices: [["yes", "Yes"], ["no", "No"], ["decline", "Prefer not to say"]] },
    race: { title: "Race or ethnicity", self: true, choices: [["asian", "Asian"], ["black", "Black or African American"], ["hispanic", "Hispanic or Latino"], ["native", "American Indian or Alaska Native"], ["pacific", "Native Hawaiian or Pacific Islander"], ["white", "White"], ["two", "Two or more races"], ["decline", "Prefer not to say"]] },
    veteran: { title: "Protected veteran", self: true, choices: [["no", "I am not a protected veteran"], ["yes", "I am a protected veteran"], ["decline", "Prefer not to say"]] },
    disability: { title: "Disability", self: true, choices: [["no", "No, I don't have a disability"], ["yes", "Yes, I have a disability"], ["decline", "Prefer not to say"]] }
  };
  var DECLINE = /decline|prefer not|not (to )?wish|don.?t wish|do not wish|do not want|don.?t want|choose not|not to (say|answer|disclose|specify)|rather not/;

  // Which saved answer a form's own wording means: "I am not a protected veteran" -> no
  function choiceOf(kind, text) {
    var t = norm(text);
    if (DECLINE.test(t)) return CHOICES[kind] && CHOICES[kind].choices.some(function (c) { return c[0] === "decline"; }) ? "decline" : "";
    switch (kind) {
      case "veteran":
        if (/\bnot\b.*veteran|^no\b|\bam not\b/.test(t)) return "no";
        return /veteran|^yes\b|identify as one|classification/.test(t) ? "yes" : "";
      case "disability":
        if (/^no\b|do not have|don.?t have|have not had/.test(t)) return "no";
        return /^yes\b|have a disability|have had/.test(t) ? "yes" : "";
      case "gender":
        if (/non.?binary|genderqueer/.test(t)) return "nonbinary";
        if (/\bfemale\b|\bwoman\b/.test(t)) return "female";
        return /\bmale\b|\bman\b/.test(t) ? "male" : "";
      case "race":
        t = t.replace(/\(not hispanic.*?\)/, "");
        if (/two or more|multiracial/.test(t)) return "two";
        if (/pacific|hawaiian/.test(t)) return "pacific";
        if (/american indian|alaska|indigenous|first nations/.test(t)) return "native";
        if (/hispanic|latin/.test(t)) return "hispanic";
        if (/asian/.test(t)) return "asian";
        if (/black|african/.test(t)) return "black";
        return /white|caucasian/.test(t) ? "white" : "";
      case "hispanic":
        if (/^no\b|\bnot\b/.test(t)) return "no";
        return /^yes\b|hispanic|latin/.test(t) ? "yes" : "";
      default:
        if (/^yes\b/.test(t)) return "yes";
        if (/^no\b/.test(t)) return "no";
        if (/\b(am|do|will|have) not\b|\b(don|won).?t\b/.test(t)) return "no";
        return /\bi (am|do|will|have)\b/.test(t) ? "yes" : "";
    }
  }

  // ---------- reading a field ----------
  // z: only in that part of the form. q: may be a full question ("Are you...").
  // n: never when the label also matches this. max: longer labels are something else.
  var RULES = [
    { k: "preferredName", l: /prefer.*name|nick ?name|\bgo by\b|name.*prefer/, q: true, max: 90 },
    { k: "firstName", l: /\b(first|given)\s*name|forename/, n: /prefer/, a: /first[-_ ]?name|given[-_ ]?name|\bfname\b/, ac: ["given-name"] },
    { k: "lastName", l: /\b(last|family)\s*name|surname/, a: /last[-_ ]?name|family[-_ ]?name|\blname\b/, ac: ["family-name"] },
    { k: "fullName", l: /^(full |legal |your |candidate |applicant )*name$/, a: /^(full[-_ ]?name|name|_systemfield_name)\b/, ac: ["name"] },
    { k: "pronouns", l: /pronoun/ },
    { k: "email", l: /e-?mail/, a: /email/, ac: ["email"] },
    { k: "phone", l: /phone|mobile|\bcell\b|contact number/, n: /type|code|extension|device|country/, a: /\bphone\b|\bmobile\b/, ac: ["tel", "tel-national"] },
    { k: "street", l: /street|^(home |mailing |postal )?address( line)?( ?1)?$/, n: /e-?mail|line ?2/, ac: ["street-address", "address-line1"] },
    { k: "city", l: /\bcity\b|\btown\b/, n: /where|why/, ac: ["address-level2"], max: 40 },
    { k: "region", l: /\b(state|province|region)\b/, n: /united states|statement/, ac: ["address-level1"], max: 40 },
    { k: "postal", l: /\bzip\b|postal|post ?code/, ac: ["postal-code"] },
    { k: "country", l: /\bcountry\b/, n: /phone|code|authori|sponsor|work in/, ac: ["country", "country-name"] },
    { k: "location", l: /\blocation\b|where are you (currently )?(based|located)|where do you live|where.*intend to work|current city/, n: /\bare you\b.*located in|willing|open to|relocat|select locations|prefer/, q: false, max: 70 },
    { k: "linkedin", l: /linked ?in/, a: /linked ?in/, max: 60 },
    { k: "github", l: /git ?hub/, a: /git ?hub/, max: 60 },
    { k: "portfolio", l: /portfolio/, a: /portfolio/, max: 60 },
    { k: "website", l: /web ?site|personal (site|url|link)|\bblog\b|^url$|other (link|url)|^link$|online (profile|presence)/, a: /website|urls\[other\]/, max: 60 },

    { k: "company", l: /^(current |present |most recent |latest |previous |your )*(company|employer|organi[sz]ation)( name)?$/, a: /\b(org|company|employer)\b/ },
    { k: "jobTitle", l: /^(current |most recent |latest |your |job |position |role )*(title|position|role)( title| name)?$|job title/, a: /job[-_]?title/ },
    { k: "jobLocation", l: /location|city/, z: "work", max: 40 },
    { k: "jobStart", l: /\bstart|\bfrom\b/, z: "work", max: 40 },
    { k: "jobEnd", l: /\bend\b|\bto\b|until/, n: /start|from/, z: "work", max: 40 },
    { k: "jobDesc", l: /description|responsibilit|duties|achievement|role summary/, z: "work", max: 60 },

    { k: "school", l: /school|university|college|institution|alma mater/, a: /\bschool\b/, max: 60 },
    { k: "degree", l: /\bdegree\b|qualification|level of education|highest.*education|education level/, a: /\bdegree\b/, max: 60 },
    { k: "major", l: /discipline|\bmajor\b|field of study|area of study|concentration|specializ/, a: /discipline|\bmajor\b/, max: 60 },
    { k: "gpa", l: /\bgpa\b|grade point|grade average/ },
    { k: "eduStart", l: /\bstart|\bfrom\b/, z: "edu", max: 40 },
    { k: "eduEnd", l: /\bend\b|\bto\b|graduat|completion/, n: /start|from/, z: "edu", max: 40 },
    { k: "eduEnd", l: /graduation (date|year|month)/, max: 40 },

    { k: "salary", l: /salary|compensation|pay (expectation|requirement)|desired pay|expected pay/, q: true, max: 120 },
    { k: "availability", l: /earliest.*start|when can you start|available to start|availability|notice period/, q: true, max: 120 },
    { k: "yearsExp", l: /years? of .*experience|how many years/, q: true, max: 120 },
    { k: "hearAbout", l: /how did you (hear|find|learn)|where did you (hear|find)|referral source|^source$/, q: true, max: 120 },
    { k: "skills", l: /^(key |top |relevant |your )?skills/, max: 60 },
    { k: "summary", l: /professional summary|^summary$|about (you|yourself)|^bio$|short bio/, q: true, max: 90 },

    { k: "workAuth", l: /authori[sz]ed|authori[sz]ation|legally (eligible|permitted|allowed|able)|right to work|eligible to work|work permit/, q: true, max: 260 },
    { k: "sponsorship", l: /sponsor|\bvisa\b/, q: true, max: 260 },
    { k: "relocate", l: /relocat/, q: true, max: 260 },
    { k: "over18", l: /\b18\b|legal age/, q: true, max: 160 },
    { k: "previouslyWorked", l: /\b(previously|ever|before|formerly)\b.*\b(worked|employed|consulted|employee)\b|\b(worked|employed|consulted)\b.*\b(previously|before|in the past)\b/, n: /restriction|agreement|compete|relative|family/, q: true, max: 200 },
    { k: "veteran", l: /veteran|military/, q: true, max: 200 },
    { k: "disability", l: /disabilit/, q: true, max: 200 },
    { k: "transgender", l: /transgender/, q: true, max: 200 },
    { k: "lgbtq", l: /lgbt|sexual orientation/, q: true, max: 200 },
    { k: "gender", l: /\bgender\b|\bsex\b/, n: /transgender|pay gap/, q: true, max: 120 },
    { k: "hispanic", l: /hispanic|latino|latinx/, n: /\brace\b/, q: true, max: 160 },
    { k: "race", l: /\brace\b|ethnic/, q: true, max: 160 }
  ];
  var QUESTION = /^(do|did|does|are|is|have|has|will|would|can|could|should|may|were|was|why|what|how|tell|describe|please)\b/;
  // Saved info that often also suits a field, a step below the exact kind
  var ALSO = { portfolio: ["website"], website: ["portfolio", "github"], preferredName: ["firstName"], location: ["city"], city: ["location"], company: [], jobLocation: ["location"] };

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[*✱]/g, "").replace(/\s+/g, " ").trim(); }

  function zoneOf(f) {
    var s = norm(f.section);
    var attr = norm((f.name || "") + " " + (f.idAttr || ""));
    if (/education|academic|school|qualification/.test(s) || /\b(school|degree|discipline|education)/.test(attr)) return "edu";
    if (/experience|employment|work history|job history|career history/.test(s) || /work[-_]?exp|employment/.test(attr)) return "work";
    return "";
  }

  function classify(f) {
    // "What is your location?" asks the same thing as "Location"
    var label = norm(f.label).replace(/[?:.]+$/, "").replace(/^(what is|what's|please (enter|provide)|enter) (your |the )?/, "");
    var attr = norm((f.name || "") + " " + (f.idAttr || ""));
    var ac = norm(f.autocomplete).split(" ").pop();
    var zone = zoneOf(f);
    var isQuestion = QUESTION.test(label);
    var best = {};
    RULES.forEach(function (r) {
      if (r.z && r.z !== zone) return;
      var score = 0;
      if (r.ac && r.ac.indexOf(ac) >= 0) score = 100;
      else if (r.l && r.l.test(label) && !(r.n && r.n.test(label)) && label.length <= (r.max || 60) && (r.q || !isQuestion)) score = r.z ? 90 : 80;
      else if (r.a && r.a.test(attr) && !label) score = 60;
      else if (r.a && r.a.test(attr) && !isQuestion && label.length <= 40) score = 50;
      if (r.k === "email" && f.inputType === "email") score = Math.max(score, 90);
      if (r.k === "phone" && f.inputType === "tel") score = Math.max(score, 85);
      if (score > (best[r.k] || 0)) best[r.k] = score;
    });
    var hits = Object.keys(best).map(function (k) { return { kind: k, score: best[k] }; });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.filter(function (h) { return hits[0].score - h.score < 40; });
  }

  // ---------- dates ----------
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function two(n) { return (n < 10 ? "0" : "") + n; }
  // A saved date ("2024-11") in the form this field wants
  function formatDate(value, f) {
    var m = /^(\d{4})(?:-(\d{2}))?$/.exec(value || "");
    if (!m) return { text: value || "" };
    var year = m[1], month = m[2] ? +m[2] : 0;
    var name = month ? MONTH_NAMES[month - 1] : "";
    var ph = norm(f.placeholder);
    var words = norm(f.label + " " + (f.idAttr || "") + " " + (f.name || "")).replace(/[-_]/g, " ");
    if (f.inputType === "month") return { text: year + "-" + two(month || 1) };
    if (f.inputType === "date") return { text: year + "-" + two(month || 1) + "-01" };
    var wantsMonth = ph === "mm" || ph === "month" || (/\bmonth\b/.test(words) && !/\byear\b/.test(words));
    var wantsYear = ph === "yyyy" || ph === "year" || (/\byear\b/.test(words) && !/\bmonth\b/.test(words));
    if (wantsMonth && month) return { text: f.options && f.options.length ? name : two(month), variants: [name, name.slice(0, 3), two(month), String(month)] };
    if (wantsYear) return { text: year };
    if (/mm\s*\/\s*dd\s*\/\s*yyyy/.test(ph)) return { text: two(month || 1) + "/01/" + year };
    if (/mm\s*\/\s*yyyy/.test(ph)) return { text: two(month || 1) + "/" + year };
    if (/mm\s*\/\s*yy\b/.test(ph)) return { text: two(month || 1) + "/" + year.slice(2) };
    if (/yyyy\s*-\s*mm/.test(ph)) return { text: year + "-" + two(month || 1) };
    return { text: month ? name.slice(0, 3) + " " + year : year };
  }
  function dateLabel(value) {
    var m = /^(\d{4})(?:-(\d{2}))?$/.exec(value || "");
    if (!m) return value || "";
    return m[2] ? MONTH_NAMES[+m[2] - 1].slice(0, 3) + " " + m[1] : m[1];
  }

  // ---------- your saved info as a flat list ----------
  function items(p, ctx) {
    var list = [];
    function add(key, kind, label, value, extra) {
      if (!value) return;
      var it = { key: key, kind: kind, label: label, value: String(value) };
      if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
      list.push(it);
    }
    var b = p.basics;
    var job = ctx && ctx.job;
    if (job && job.links) {
      var who = job.company ? " for " + job.company : "";
      add("link.tracked", "portfolio", "Tracked portfolio link" + who, job.links.home, { boost: 30 });
      add("link.tracked", "website", "Tracked portfolio link" + who, job.links.home, { boost: 30 });
      add("link.trackedResume", "website", "Tracked resume link" + who, job.links.resume, { boost: -5 });
    }
    add("firstName", "firstName", "First name", b.firstName);
    add("lastName", "lastName", "Last name", b.lastName);
    add("fullName", "fullName", "Full name", [b.firstName, b.lastName].filter(Boolean).join(" "));
    add("preferredName", "preferredName", "Preferred name", b.preferredName);
    add("pronouns", "pronouns", "Pronouns", b.pronouns);
    add("email", "email", "Email", b.email);
    add("phone", "phone", "Phone", b.phone);
    add("street", "street", "Street address", b.street);
    add("city", "city", "City", b.city);
    add("region", "region", "State or province", b.region);
    add("postal", "postal", "Zip or postal code", b.postal);
    add("country", "country", "Country", b.country);
    add("location", "location", "Location", b.location || [b.city, b.region].filter(Boolean).join(", "));
    add("linkedin", "linkedin", "LinkedIn", b.linkedin);
    add("github", "github", "GitHub", b.github);
    add("portfolio", "portfolio", "Portfolio", b.portfolio);
    add("website", "website", "Website", b.website);
    p.jobs.forEach(function (j, i) {
      var where = j.company || "job " + (i + 1);
      var e = { entry: i };
      add("job." + i + ".company", "company", "Company", j.company, e);
      add("job." + i + ".title", "jobTitle", "Title, " + where, j.title, e);
      add("job." + i + ".location", "jobLocation", "Location, " + where, j.location, e);
      add("job." + i + ".start", "jobStart", "Start date, " + where, j.start, { entry: i, date: true });
      if (j.current) add("job." + i + ".end", "jobEnd", "End date, " + where, "Present", e);
      else add("job." + i + ".end", "jobEnd", "End date, " + where, j.end, { entry: i, date: true });
      add("job." + i + ".description", "jobDesc", "Description, " + where, j.description, e);
    });
    p.education.forEach(function (x, i) {
      var where = x.school || "school " + (i + 1);
      var e = { entry: i };
      add("edu." + i + ".school", "school", "School", x.school, e);
      add("edu." + i + ".degree", "degree", "Degree, " + where, x.degree, e);
      add("edu." + i + ".field", "major", "Field of study, " + where, x.field, e);
      add("edu." + i + ".gpa", "gpa", "GPA, " + where, x.gpa, e);
      add("edu." + i + ".start", "eduStart", "Start date, " + where, x.start, { entry: i, date: true });
      add("edu." + i + ".end", "eduEnd", "End date, " + where, x.end, { entry: i, date: true });
    });
    var T = { salary: "Pay expectations", availability: "When you can start", yearsExp: "Years of experience", hearAbout: "How you heard about jobs", skills: "Skills", summary: "Summary" };
    Object.keys(T).forEach(function (k) { add("text." + k, k, T[k], (p.texts || {})[k]); });
    Object.keys(CHOICES).forEach(function (k) {
      var chosen = (p.answers || {})[k];
      var c = CHOICES[k].choices.filter(function (x) { return x[0] === chosen; })[0];
      if (c) add("answer." + k, k, CHOICES[k].title, c[1], { choice: chosen });
    });
    (p.saved || []).forEach(function (s, i) { add("saved." + i, "saved", s.q, s.a, { question: s.q }); });
    return list;
  }

  // ---------- matching against a form's options ----------
  var ALIASES = { "us": "united states", "usa": "united states", "u.s.": "united states", "united states of america": "united states", "uk": "united kingdom" };
  function words(s) {
    return norm(s).replace(/['’]s\b/g, "").split(/[^a-z0-9+]+/).filter(function (w) {
      return w && ["a", "an", "and", "of", "the", "in", "or", "for", "to", "at", "on", "your", "you", "this", "with", "do", "is", "are", "we", "our", "us", "me", "my", "i"].indexOf(w) < 0;
    });
  }
  function bestOption(value, options, variants) {
    var tries = (variants && variants.length ? variants : [value]).map(norm);
    tries = tries.map(function (t) { return ALIASES[t] || t; });
    var i, t, texts = options.map(function (o) { return norm(o.text); });
    for (t = 0; t < tries.length; t++) { i = texts.indexOf(tries[t]); if (i >= 0) return i; }
    for (t = 0; t < tries.length; t++) {
      for (i = 0; i < texts.length; i++) if (texts[i] && (texts[i].indexOf(tries[t] + " ") === 0 || texts[i].indexOf(tries[t] + " -") === 0)) return i;
    }
    if (variants && variants.length) return -1; // dates must match outright
    var want = words(value);
    var top = -1, topScore = 0, tie = false;
    texts.forEach(function (text, idx) {
      var have = words(text);
      var score = have.filter(function (w) { return want.indexOf(w) >= 0; }).length;
      if (!score) return;
      score = score / Math.max(have.length, 1) + score / Math.max(want.length, 1);
      if (score > topScore + 1e-6) { top = idx; topScore = score; tie = false; }
      else if (Math.abs(score - topScore) < 1e-6) tie = true;
    });
    return tie ? -1 : top;
  }
  function similarity(a, b) {
    var x = words(a), y = words(b);
    if (!x.length || !y.length) return 0;
    var shared = x.filter(function (w) { return y.indexOf(w) >= 0; }).length;
    return shared / (x.length + y.length - shared);
  }

  // ---------- suggestions ----------
  // ctx: { job, picks: { sectionName: entryIndex } }
  function suggest(f, p, ctx) {
    ctx = ctx || {};
    var kinds = classify(f);
    var all = items(p, ctx);
    var options = f.options || [];
    var hasOptions = options.length > 0;
    var out = [];
    var unset = "";

    function push(it, score, shown, optionIndex) {
      out.push({ key: it.key, label: it.label, value: shown, option: optionIndex, score: score, kind: it.kind });
    }
    function offer(it, score) {
      var shown = it.value, variants;
      if (it.date) {
        var d = formatDate(it.value, f);
        shown = d.text; variants = d.variants;
      }
      if (!hasOptions) return push(it, score, shown);
      var idx = bestOption(shown, options, variants);
      if (idx >= 0) push(it, score, options[idx].text, idx);
    }

    var section = norm(f.section);
    var preferred = ctx.picks && ctx.picks[section] != null ? ctx.picks[section] : (typeof f.sectionIndex === "number" ? f.sectionIndex : 0);

    kinds.forEach(function (h) {
      if (CHOICES[h.kind]) {
        var chosen = (p.answers || {})[h.kind];
        if (!chosen) { unset = unset || h.kind; return; }
        var it = all.filter(function (x) { return x.key === "answer." + h.kind; })[0];
        if (!it) return;
        if (!hasOptions) return push(it, h.score, it.value);
        options.forEach(function (o, i) {
          if (choiceOf(h.kind, o.text) === chosen) push(it, h.score, o.text, i);
        });
        return;
      }
      var kindsHere = [{ k: h.kind, s: h.score }].concat((ALSO[h.kind] || []).map(function (k) { return { k: k, s: h.score - 15 }; }));
      if (h.kind === "location" && hasOptions) kindsHere.push({ k: "country", s: h.score });
      kindsHere.forEach(function (one) {
        all.forEach(function (it) {
          if (it.kind !== one.k) return;
          var s = one.s + (it.boost || 0);
          if (it.entry != null) s += it.entry === preferred ? 8 : -it.entry * 0.5;
          offer(it, s);
        });
      });
    });

    // Answers you saved to similar questions
    all.forEach(function (it) {
      if (it.kind !== "saved") return;
      var sim = similarity(it.question, f.label);
      if (sim >= 0.5) offer(it, 60 + sim * 40);
    });

    // What you picked for this exact question before
    var learned = (p.learned || {})[norm(f.label)];
    if (learned) {
      var seen = all.filter(function (x) { return x.key === learned; });
      if (seen.length) seen.forEach(function (it) { offer(it, 200); });
    }

    out.sort(function (a, b) { return b.score - a.score; });
    var used = {}, usedOption = {};
    var suggestions = out.filter(function (s) {
      var id = s.option != null ? "o" + s.option : "v" + s.value;
      if (used[id]) return false;
      used[id] = true;
      if (s.option != null) usedOption[s.option] = true;
      return true;
    }).slice(0, 8);
    var others = options.map(function (o, i) { return { value: o.text, option: i, checked: !!o.checked }; }).filter(function (o) { return !usedOption[o.option]; });
    return { kinds: kinds, suggestions: suggestions, others: others, unset: unset };
  }

  // For filling in one go: the top suggestion, only when it's a clear answer to an empty field.
  // Anything less is left for you, with the reason.
  function confident(f, found) {
    var top = found.suggestions[0];
    if (f.value) return { why: "Already answered" };
    if (f.type === "checkbox" && !f.multi) return { why: "Tick it yourself" };
    if (!top) {
      if (found.unset) return { why: "No saved answer" };
      return { why: found.others.length ? "Pick one" : "Nothing saved fits" };
    }
    if (top.score < 75) return { why: "Check the suggestion" };
    return { pick: top };
  }

  function search(query, p, ctx) {
    var q = norm(query);
    if (!q) return [];
    return items(p, ctx).filter(function (it) {
      return norm(it.label).indexOf(q) >= 0 || norm(it.value).indexOf(q) >= 0;
    }).slice(0, 20);
  }

  // ---------- which job is this page for? ----------
  function cleanUrl(u) {
    try {
      var url = new URL(u);
      var path = url.pathname.replace(/\/+$/, "");
      // The posting, its form and its thank-you page are one job
      while (/\/(apply|application|confirmation|thanks|thank-you|thankyou|submitted|success|review)$/i.test(path)) path = path.replace(/\/[^/]+$/, "");
      return (url.hostname.replace(/^www\./, "") + path).toLowerCase();
    } catch (e) { return ""; }
  }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, ""); }
  function jobForPage(url, jobs) {
    var page = cleanUrl(url);
    if (!page) return null;
    var open = (jobs || []).filter(function (j) { return j.stage !== "closed"; });
    var hit = open.filter(function (j) {
      var u = cleanUrl(j.url);
      return u && (page === u || page.indexOf(u + "/") === 0 || u.indexOf(page + "/") === 0);
    })[0];
    if (hit) return hit;
    var parts = page.split(/[./]/).map(slug);
    return open.filter(function (j) { return j.company && parts.indexOf(slug(j.company)) >= 0; })[0] || null;
  }

  root.Match = { CHOICES: CHOICES, classify: classify, suggest: suggest, confident: confident, search: search, items: items, choiceOf: choiceOf, bestOption: bestOption, formatDate: formatDate, dateLabel: dateLabel, jobForPage: jobForPage, cleanUrl: cleanUrl, norm: norm, zoneOf: zoneOf };
})(typeof window !== "undefined" ? window : globalThis);
