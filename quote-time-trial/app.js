const $=id=>document.getElementById(id);let report='',csv='';function save(name,text,type='text/plain;charset=utf-8'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}$('form').addEventListener('input',event=>{$('result').hidden=true;$('error').textContent='';report='';csv='';invalidateHandoff(event);});$('txt').onclick=()=>{if(report)save('確認票.txt',report)};$('csv').onclick=()=>{if(csv)save('候補一覧.csv','\ufeff'+csv,'text/csv;charset=utf-8')};const days=['','月','火','水','木','金','土','日'];const fmt=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
$('form').onsubmit=e=>{e.preventDefault();try{run();$('report').textContent=report;$('result').hidden=false;$('error').textContent='';}catch(err){$('result').hidden=true;report='';csv='';$('error').textContent=err.message;}};
function run(){const r=quote({current:[0,1,2].map(i=>$('old'+i).value),candidate:[0,1,2].map(i=>$('new'+i).value),target:$('target').value,count:$('count').value,fee:$('fee').value,same:$('same').checked});report=r.rows.map(x=>'案件'+x.case+'：現在'+x.current+'秒 → 候補'+x.candidate+'秒 ／差 '+x.saved.toFixed(2)+'秒').join('\n')+'\n\n3件平均の削減：'+r.avg.toFixed(2)+'秒\n必要値：'+r.target+'秒 ／'+(r.meets?'今回3件の平均は必要値以上':'今回3件の平均は必要値未満')+'\n遅くなった案件：'+r.negativeCases+'件\n同等'+r.count+'件なら差 '+(r.monthlySeconds/60).toFixed(2)+'分/月（仮定の計算）\n追加月額：'+(r.fee===null?'未確認':r.fee+'円')+'\n\n3件は将来の性能・時間単価・収益を保証しません。初期費用・契約期間・税・解約・範囲を確認して判断してください。';csv='案件,現在秒,候補秒,差秒\r\n'+r.rows.map(x=>[x.case,x.current,x.candidate,x.saved.toFixed(2)].join(',')).join('\r\n');updateHandoff(r);}
function createQuoteHandoff() {
  const ROOT = 'https://quote-revision-check.pages.dev/';
  const TRIAL = 'https://tomoka-uzumaki-ai.github.io/qualified-task-decisions-jp/quote-time-trial/';
  const PREFIX = '#quote-handoff=';
  const TTL = 30 * 60 * 1000;
  const numeric = (x, min, max, integer = false) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x));
  const tenth = x => Math.abs(x * 10 - Math.round(x * 10)) < 1e-7;
  function target(count, minutes, rate) {
    return Math.round((Math.ceil((10780 * 60 / (count * rate)) * 10 - 1e-9) / 10) * 600) / 10;
  }
  function validate(p, destination, now) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
    if (p.kind !== 'trial' && p.kind !== 'return') return false;
    const keys = ['v','kind','at','from','to','count','minutes','rate','target'].concat(p.kind === 'return' ? ['saved'] : []);
    if (Object.keys(p).length !== keys.length || !Object.keys(p).every(k => keys.includes(k))) return false;
    if (p.v !== 1 || !Number.isSafeInteger(p.at) || now < p.at || now - p.at > TTL) return false;
    const from = p.kind === 'trial' ? ROOT : TRIAL;
    const to = p.kind === 'trial' ? TRIAL : ROOT;
    if (p.from !== from || p.to !== to || destination !== to) return false;
    if (!numeric(p.count,1,100000,true) || !numeric(p.minutes,0.1,10000) || !tenth(p.minutes) || !numeric(p.rate,1,1000000,true)) return false;
    if (!numeric(p.target,0,9999999.99) || p.target !== target(p.count,p.minutes,p.rate)) return false;
    return p.kind !== 'return' || (numeric(p.saved,0,p.minutes) && tenth(p.saved));
  }
  function outgoing(count, minutes, rate, now) {
    const p = {v:1,kind:'trial',at:now,from:ROOT,to:TRIAL,count,minutes,rate,target:target(count,minutes,rate)};
    return validate(p,TRIAL,now) ? p : null;
  }
  function read(hash, destination, now) {
    if (!hash.startsWith(PREFIX)) return {present:false, packet:null};
    if (hash.length > 2048) return {present:true, packet:null};
    try {
      const p = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length)));
      return {present:true, packet:validate(p,destination,now) ? p : null};
    } catch (_) { return {present:true, packet:null}; }
  }
  function link(p) { return p.to + PREFIX + encodeURIComponent(JSON.stringify(p)); }
  function returning(p, result, now) {
    if (!validate(p,TRIAL,now) || p.kind !== 'trial' || result.count !== p.count || result.target !== p.target || !Number.isFinite(result.avg)) return null;
    const saved = Math.floor((result.avg / 60) * 10) / 10;
    if (result.avg < 0 || saved < 0 || saved > p.minutes) return null;
    const next = {...p,kind:'return',from:TRIAL,to:ROOT,saved};
    return validate(next,ROOT,now) ? next : null;
  }
  return {ROOT,TRIAL,PREFIX,TTL,target,validate,outgoing,read,link,returning};
}

const quoteHandoff = createQuoteHandoff();
let importedHandoff = null, handoffInvalid = false;
function clearHandoffReturn() {
  $('handoff-return').hidden=true;
  $('handoff-return').href=quoteHandoff.ROOT;
  $('handoff-return-note').hidden=true;
  $('handoff-return-note').textContent='';
}
function invalidateHandoff(event) {
  clearHandoffReturn();
  const id=event && event.target && event.target.id;
  if (/^(old[0-2]|new[0-2]|target|count)$/.test(id || '')) $('same').checked=false;
  if (importedHandoff && (id==='count' || id==='target') && (Number($('count').value)!==importedHandoff.count || Number($('target').value)!==importedHandoff.target || !$('count').value.trim() || !$('target').value.trim())) {
    handoffInvalid=true;
    $('handoff-status').textContent='月件数または必要短縮を変更したため、元の条件への引継ぎは解除しました。通常の確認票・戻りリンクは使えます。';
  }
}
function updateHandoff(result) {
  clearHandoffReturn();
  if (!importedHandoff) return;
  const back=!handoffInvalid && $('same').checked ? quoteHandoff.returning(importedHandoff,result,Date.now()) : null;
  if (!back) {
    $('handoff-return-note').hidden=false;
    $('handoff-return-note').textContent='元の条件への数値引継ぎはできません。測定範囲・月件数・期限と元の1件時間を照合し、必要なら通常の確認先で入力し直してください。';
    return;
  }
  $('handoff-return').href=quoteHandoff.link(back);
  $('handoff-return').hidden=false;
  $('handoff-return-note').hidden=false;
  $('handoff-return-note').textContent='元の月件数・1件時間・時間単価と、今回3件の平均短縮だけを戻します。平均短縮は0.1分単位で切り捨て、元の想定時間と実測は別に扱います。追加費用・帳票・担当の確認は引き継ぎません。';
}
$('form').addEventListener('reset',()=>{
  importedHandoff=null; handoffInvalid=true;
  $('same').checked=false; $('result').hidden=true; $('error').textContent=''; report=''; csv='';
  $('handoff-status').textContent=''; clearHandoffReturn();
});
const incomingHandoff=quoteHandoff.read(location.hash,location.origin+location.pathname,Date.now());
if (incomingHandoff.packet && incomingHandoff.packet.kind==='trial') {
  importedHandoff=incomingHandoff.packet;
  $('count').value=String(importedHandoff.count);
  $('target').value=String(importedHandoff.target);
  $('same').checked=false;
  history.replaceState(null,'',location.pathname+location.search);
  $('handoff-status').textContent='月'+importedHandoff.count+'件・元の1件'+importedHandoff.minutes+'分・時間単価'+importedHandoff.rate+'円から、必要短縮'+importedHandoff.target+'秒を引き継ぎました。元の時間は想定条件です。同じ3案件を計り、作業範囲を確認してください。';
} else if (incomingHandoff.present) {
  $('handoff-status').textContent='引継ぎの期限または条件を確認できないため反映していません。通常の入力は利用できます。';
}
