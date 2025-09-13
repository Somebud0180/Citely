(function(){
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const sortBtn = document.getElementById('sortBtn');
  const clearBtn = document.getElementById('clearBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const ignoreArticlesEl = document.getElementById('ignoreArticles');
  const caseInsensitiveEl = document.getElementById('caseInsensitive');
  const removeDupesEl = document.getElementById('removeDupes');
  const autoFixApaEl = document.getElementById('autoFixApa');
  const checkApaBtn = document.getElementById('checkApaBtn');
  const apaReport = document.getElementById('apaReport');
  const apaIssuesList = document.getElementById('apaIssues');
  const statsEl = document.getElementById('stats');
  const formatRefListEl = document.getElementById('formatRefList');
  const outputRich = document.getElementById('outputRich');

  function splitCitations(text){
    if(!text) return [];
    // Normalize new lines and bullets
    const normalized = text
      .replace(/\r\n?/g, '\n')
      // Convert bullet/numbered list markers to line breaks
      .replace(/\n\s*[•\-*]\s+/g, '\n')
      .replace(/\n\s*\d+\.?\s+/g, '\n')
      // Split also on semicolons if surrounded by spaces (common in inline lists)
      .replace(/\s*;\s*/g, '\n');

    return normalized
      .split(/\n+/)
      .map(s => s.replace(/[\s\u00A0]+/g, ' ').trim())
      .filter(Boolean);
  }

  function stripLeadingArticle(str){
    const m = str.match(/^\s*(?:the|a|an)\b[\s,]+/i);
    return m ? str.slice(m[0].length) : str;
  }

  function sortCitations(items, { ignoreArticles = true, caseInsensitive = true } = {}){
    const collator = new Intl.Collator(undefined, { sensitivity: caseInsensitive ? 'accent' : 'variant' });
    return items.slice().sort((a,b)=>{
      const aa = ignoreArticles ? stripLeadingArticle(a) : a;
      const bb = ignoreArticles ? stripLeadingArticle(b) : b;
      return collator.compare(aa, bb);
    });
  }

  function dedupePreserveOrder(items){
    const seen = new Set();
    const out = [];
    for(const it of items){
      const key = it.toLowerCase();
      if(!seen.has(key)){
        seen.add(key);
        out.push(it);
      }
    }
    return out;
  }

  function updateStats(original, parsed, sorted, { removedDupes = 0 } = {}){
    const parts = [
      `${parsed.length} parsed`,
      removedDupes ? `${removedDupes} duplicates removed (case-insensitive)` : null,
      `${sorted.length} in output`
    ].filter(Boolean);
    statsEl.textContent = parts.join(' • ');
  }

  function runSort(){
  const entries = splitCitations(input.value);
  // Only keep lines containing citations (e.g., [1], (Smith, 2020), etc.)
  // Adjust regex as needed for your citation style
  const citationRegex = /\[(\d+)\]|\(([^)]+,\s*\d{4})\)/;
  const filtered = entries.filter(line => citationRegex.test(line));
  const maybeDeduped = removeDupesEl && removeDupesEl.checked ? dedupePreserveOrder(filtered) : filtered;
  const maybeFixed = autoFixApaEl && autoFixApaEl.checked ? maybeDeduped.map(autoFixApaBasics) : maybeDeduped;
  const removedDupes = filtered.length - maybeDeduped.length;
  const sorted = sortCitations(maybeFixed, {
      ignoreArticles: !!ignoreArticlesEl.checked,
      caseInsensitive: !!caseInsensitiveEl.checked
    });
    const useRich = !!(formatRefListEl && formatRefListEl.checked);
    if(useRich){
      output.hidden = true;
      if(outputRich) outputRich.hidden = false;
      renderRefList(sorted);
    }else{
      output.hidden = false;
      if(outputRich) outputRich.hidden = true;
  // Just join lines normally; spacing will be handled by CSS
  output.value = sorted.join('\n');
      if(outputRich) outputRich.innerHTML = '';
    }
    const has = sorted.length > 0;
    copyBtn.disabled = !has;
    downloadBtn.disabled = !has;
  updateStats(input.value, entries, sorted, { removedDupes });
  hideApaReport();
  }

  sortBtn.addEventListener('click', runSort);
  clearBtn.addEventListener('click', ()=>{
    input.value = '';
    output.value = '';
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
    statsEl.textContent = '';
    input.focus();
  });
  copyBtn.addEventListener('click', async ()=>{
    try{
      const useRich = !!(formatRefListEl && formatRefListEl.checked);
      const text = useRich ? getRefListText() : output.value;
      await navigator.clipboard.writeText(text);
      flash(copyBtn, 'Copied');
    }catch{
      // Fallback: select and prompt
      const useRich = !!(formatRefListEl && formatRefListEl.checked);
      if(useRich){
        const ta = document.createElement('textarea');
        ta.value = getRefListText();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }else{
        output.select();
        document.execCommand('copy');
      }
      flash(copyBtn, 'Copied');
    }
  });
  downloadBtn.addEventListener('click', ()=>{
    const useRich = !!(formatRefListEl && formatRefListEl.checked);
    const text = useRich ? getRefListText() : output.value;
    const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = useRich ? 'citations-sorted-formatted.txt' : 'citations-sorted.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function flash(btn, text){
    const original = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(()=>{ btn.textContent = original; btn.disabled = false; }, 900);
  }

  // Improve UX: auto-run when options change or input pasted
  ignoreArticlesEl.addEventListener('change', runSort);
  caseInsensitiveEl.addEventListener('change', runSort);
  removeDupesEl.addEventListener('change', runSort);
  autoFixApaEl.addEventListener('change', runSort);
  if(formatRefListEl){ formatRefListEl.addEventListener('change', runSort); }
  input.addEventListener('paste', ()=> setTimeout(runSort, 0));

  // --- APA 7 utilities ---
  function autoFixApaBasics(s){
    let out = s;
    // collapse multiple spaces
    out = out.replace(/[\s\u00A0]+/g, ' ').trim();
    // replace ' and ' between last two authors with & if likely authors list
    out = out.replace(/\b(,\s+and| and)\s+(?=[A-Z][^,]+,\s*\d{4}|\()/g, ' & ');
    // ensure year like 2020 appears in parentheses when followed by period and space later
    out = out.replace(/\b(\d{4})\b(?!\))/g, '($1)');
  // ensure there is a period at the end (unless already punctuation)
  out = out.replace(/([^.?!])\s*$/, '$1.');
    return out;
  }

  function checkApa7Line(s){
    const issues = [];
    const original = s;
    const str = s.trim();

    // 1) Year in parentheses e.g., (2020)
    if(!/\(\d{4}[a-z]?\)/i.test(str)){
      issues.push('Missing year in parentheses, e.g., (2020).');
    }
    // 2) Ends with period
    if(!/[.]\s*$/.test(str)){
      issues.push('Citation should end with a period.');
    }
    // 3) Ampersand between last two authors
    if(/\b\w+\s+and\s+\w+\b/.test(str) && !/&/.test(str)){
      issues.push('Use & between last two authors (e.g., Smith & Lee).');
    }
    // 4) Excess internal spaces
    if(/\s{2,}/.test(original)){
      issues.push('Contains extra spaces; collapse to single spaces.');
    }
    // 5) Author initials heuristic: "Lastname, A. A." shape (very heuristic)
    // If there is a comma early and uppercase initials without spaces
    if(/^[^()]+\(\d{4}/.test(str)){
      // Likely author list exists
      const authorPart = str.split(/\(\d{4}[a-z]?\)/i)[0];
      if(!/\b[A-Z]\.(?:\s?[A-Z]\.)?/.test(authorPart)){
        issues.push('Author initials may be missing periods (e.g., A. A.).');
      }
    }
    return issues;
  }

  function runApaCheck(){
    const entries = splitCitations(input.value);
    const issuesAll = entries.map((line, idx) => ({ idx, line, issues: checkApa7Line(line) }))
      .filter(x => x.issues.length > 0);
    renderApaReport(issuesAll);
  }

  function renderApaReport(items){
    apaIssuesList.innerHTML = '';
    if(items.length === 0){
      const li = document.createElement('li');
      li.textContent = 'No obvious issues found (heuristic).';
      apaIssuesList.appendChild(li);
    }else{
      for(const item of items){
        const li = document.createElement('li');
        li.textContent = `Line ${item.idx+1}: ${item.issues.join(' | ')}`;
        apaIssuesList.appendChild(li);
      }
    }
    apaReport.hidden = false;
    apaReport.open = true;
  }

  function hideApaReport(){
    apaReport.hidden = true;
    apaReport.open = false;
    apaIssuesList.innerHTML = '';
  }

  checkApaBtn.addEventListener('click', runApaCheck);

  // --- Reference list rendering (hanging indent) ---
  function renderRefList(items){
    if(!outputRich) return;
    outputRich.innerHTML = '';
    for(const line of items){
      const div = document.createElement('div');
      div.className = 'ref-item';
      div.textContent = line;
      outputRich.appendChild(div);
    }
  }
  function getRefListText(){
    if(!outputRich) return '';
    return Array.from(outputRich.querySelectorAll('.ref-item')).map(n=>n.textContent).join('\n');
  }
})();
