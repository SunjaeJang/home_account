"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

type Tx = { id: string; date: string; title: string; category: string; amount: number; member: string; method: string; note: string; type: "expense" | "income" };
const seed: Tx[] = [];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const money = (n: number) => `${Math.abs(n).toLocaleString("ko-KR")}원`;
const aliases = { date: ["날짜", "거래일", "거래일시", "일자", "사용일", "승인일", "date", "datetime"], title: ["내용", "내역", "가맹점", "사용처", "거래내용", "항목", "적요", "title", "memo"], category: ["분류", "카테고리", "대분류", "항목분류", "category"], amount: ["금액", "결제금액", "거래금액", "사용금액", "수입금액", "지출금액", "amount"], method: ["결제수단", "결제방법", "수단", "카드", "결제", "method"], note: ["메모", "비고", "상세", "note"], type: ["유형", "거래유형", "수입/지출", "입출금", "type"] };
const cats = ["식비", "카페", "교통", "쇼핑", "주거", "공과금", "의료", "문화", "생활", "급여", "기타"];
const fromDb = (row: Record<string, unknown>): Tx => ({ id: String(row.id), date: String(row.date), title: String(row.title), category: String(row.category), amount: Number(row.amount), member: String(row.member_name), method: String(row.method ?? ""), note: String(row.note ?? ""), type: row.type === "income" ? "income" : "expense" });
async function householdFor(userId: string) {
  if (!supabase) throw new Error("Supabase 연결 정보가 없습니다.");
  const { data, error } = await supabase.from("household_members").select("household_id, member_name").eq("user_id", userId).single();
  if (error || !data) throw new Error("이 계정은 가계부 멤버로 등록되지 않았어요. 설정 안내를 확인해 주세요.");
  return data as { household_id: string; member_name: string };
}
async function fetchLedger(userId: string) {
  if (!supabase) throw new Error("Supabase 연결 정보가 없습니다.");
  const member = await householdFor(userId);
  const { data, error } = await supabase.from("transactions").select("id,date,title,category,amount,member_name,method,note,type").eq("household_id", member.household_id).order("date", { ascending: false });
  if (error) throw error;
  return { items: (data ?? []).map(row => fromDb(row as Record<string, unknown>)), member: member.member_name };
}

export default function Home() {
  const [items, setItems] = useState<Tx[]>(seed);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [accountMember, setAccountMember] = useState("선재");
  const [member, setMember] = useState("전체 멤버");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("2026-10");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({ title: "", amount: "", category: "식비", member: "선재", date: "2026-10-23", method: "", type: "expense" as "expense" | "income" });
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshCloud = useCallback(async (userId: string) => {
    const result = await fetchLedger(userId);
    setItems(result.items);
    setAccountMember(result.member);
    setForm(current => ({ ...current, member: result.member }));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    const path = `${basePath}/sw.js`;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(path).catch(() => {});
    const captureInstall = (event: Event) => { event.preventDefault(); (window as Window & { deferredPrompt?: Event }).deferredPrompt = event; };
    window.addEventListener("beforeinstallprompt", captureInstall);
    if (!supabase) {
      const timer = window.setTimeout(() => {
        try {
          const raw = localStorage.getItem("duri-ledger");
          if (raw) {
            const saved = JSON.parse(raw) as Tx[];
            setItems(saved.filter(row => !["1", "2", "3", "4", "5", "6"].includes(row.id)));
          }
        } catch { setItems([]); }
        setLoaded(true);
      }, 0);
      return () => { active = false; clearTimeout(timer); window.removeEventListener("beforeinstallprompt", captureInstall); };
    }
    const { data: auth } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) window.setTimeout(() => { if (active) void refreshCloud(nextSession.user.id).catch(error => { setAuthError(error instanceof Error ? error.message : "가계부 데이터를 불러오지 못했어요."); setLoaded(true); }); }, 0);
      else { setItems([]); setLoaded(true); }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) void refreshCloud(data.session.user.id).catch(error => { setAuthError(error instanceof Error ? error.message : "가계부 데이터를 불러오지 못했어요."); setLoaded(true); });
      else setLoaded(true);
    });
    return () => { active = false; auth.subscription.unsubscribe(); window.removeEventListener("beforeinstallprompt", captureInstall); };
  }, [refreshCloud]);

  useEffect(() => {
    if (!supabase || !session) return;
    const channel = supabase.channel(`ledger-${session.user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => { void refreshCloud(session.user.id).catch(() => {}); }).subscribe();
    const onFocus = () => { void refreshCloud(session.user.id).catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); void supabase.removeChannel(channel); };
  }, [session, refreshCloud]);

  useEffect(() => { const timer = window.setTimeout(() => { const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()); setMonth(today.slice(0, 7)); setForm(current => ({ ...current, date: today })); }, 0); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (!supabase && loaded) localStorage.setItem("duri-ledger", JSON.stringify(items)); }, [items, loaded]);
  const filtered = useMemo(() => items.filter(x => x.date.startsWith(month) && (member === "전체 멤버" || x.member === member) && `${x.title} ${x.category} ${x.member} ${x.method}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)), [items, month, member, query]);
  const monthly = items.filter(x => x.date.startsWith(month));
  const expense = monthly.filter(x => x.type === "expense").reduce((a,x)=>a+x.amount,0);
  const income = monthly.filter(x => x.type === "income").reduce((a,x)=>a+x.amount,0);
  const budget = 2500000; const percent = Math.min(100, Math.round(expense / budget * 100));
  const catTotals = cats.slice(0,5).map(c=>({ name:c, amount: monthly.filter(x=>x.category===c&&x.type==="expense").reduce((a,x)=>a+x.amount,0) })).filter(x=>x.amount>0).sort((a,b)=>b.amount-a.amount);
  const notify = (s:string) => { setToast(s); setTimeout(()=>setToast(""),3200); };
  const exportExcel = () => { const rows = items.map(x=>({ 날짜:x.date, 내용:x.title, 분류:x.category, 유형:x.type==="income"?"수입":"지출", 금액:x.amount, 사용한사람:x.member, 결제수단:x.method, 메모:x.note })); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"가계부 내역"); XLSX.writeFile(wb,`우리집가계부_${month}.xlsx`); notify("엑셀 파일을 저장했어요."); };
  const importExcel = async (file?:File) => { if(!file)return; try { const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true}); const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:""}); if(!rows.length)throw new Error("내역이 있는 첫 번째 시트를 찾지 못했어요."); const keys=Object.keys(rows[0]); const keyFor=(field:keyof typeof aliases)=>keys.find(k=>aliases[field].some(a=>k.replace(/\s/g,"").toLowerCase().includes(a.toLowerCase()))); const dk=keyFor("date"),tk=keyFor("title"),ak=keyFor("amount"),ck=keyFor("category"),mk=keyFor("method"),nk=keyFor("note"),ik=keyFor("type"); if(!tk||!ak)throw new Error("내용과 금액 열을 찾지 못했어요. 뱅크샐러드 엑셀인지 확인해 주세요."); const parsed:Tx[]=rows.map(r=>{ const dv=r[dk??""]; let d=""; if(dv instanceof Date)d=dv.toISOString().slice(0,10); else if(typeof dv==="number"&&dv>1000)d=XLSX.SSF.format("yyyy-mm-dd",dv); else { const s=String(dv||new Date().toISOString().slice(0,10)); const m=s.match(/(20\d{2})[.\-/년 ]+([01]?\d)[.\-/월 ]+([0-3]?\d)/); d=m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:new Date().toISOString().slice(0,10); } const raw=String(r[ak!]??"0").replace(/[^\d.-]/g,""); const amt=Math.abs(Number(raw)||0); const label=String(r[tk!]??"내역").trim(); return { id:crypto.randomUUID(),date:d,title:label,category:String(ck ? r[ck] : "기타"),amount:amt,member:member==="전체 멤버"?accountMember:member,method:String((mk ? r[mk] : "")||""),note:String((nk ? r[nk] : "")||""),type:(String(ik ? r[ik] : "").includes("수입") || String(ck ? r[ck] : "").includes("수입") ? "income" : "expense") as Tx["type"] }; }).filter(x=>x.amount>0&&x.title); const seen=new Set(items.map(x=>`${x.date}|${x.title}|${x.amount}|${x.member}`)); const fresh=parsed.filter(x=>!seen.has(`${x.date}|${x.title}|${x.amount}|${x.member}`)); if (supabase && session) { const household=await householdFor(session.user.id); if (fresh.length) { const { error }=await supabase.from("transactions").insert(fresh.map(({member: memberName, ...x})=>({...x,member_name:memberName,household_id:household.household_id,created_by:session.user.id}))); if(error)throw error; } await refreshCloud(session.user.id); } else setItems(old=>[...fresh,...old]); notify(`${parsed.length}건 중 ${fresh.length}건을 추가했어요. (중복 ${parsed.length-fresh.length}건 제외)`); } catch(e){notify(e instanceof Error?e.message:"엑셀 파일을 읽지 못했어요.");} finally { if(fileRef.current)fileRef.current.value=""; } };
  const add = async () => { if(!form.title||!form.amount){notify("내용과 금액을 입력해 주세요.");return;} try { if(supabase&&session){const household=await householdFor(session.user.id);const {error}=await supabase.from("transactions").insert({date:form.date,title:form.title,category:form.category,amount:Number(form.amount),member_name:form.member,method:form.method,note:"",type:form.type,household_id:household.household_id,created_by:session.user.id});if(error)throw error;await refreshCloud(session.user.id);}else setItems(old=>[{id:crypto.randomUUID(),...form,amount:Number(form.amount),method:form.method,note:""},...old]);setModal(false);setForm(f=>({...f,title:"",amount:"",method:""}));notify("내역을 추가했어요.");}catch(e){notify(e instanceof Error?e.message:"내역 저장에 실패했어요.");} };
  const remove = async (id:string) => { try {if(supabase&&session){const {error}=await supabase.from("transactions").delete().eq("id",id);if(error)throw error;await refreshCloud(session.user.id);}else setItems(old=>old.filter(x=>x.id!==id));notify("내역을 삭제했어요.");}catch(e){notify(e instanceof Error?e.message:"내역 삭제에 실패했어요.");} };
  const install = async () => { const promptEvt=(window as Window & {deferredPrompt?: {prompt:()=>Promise<void>}}).deferredPrompt; if(promptEvt){await promptEvt.prompt();delete (window as Window & {deferredPrompt?:unknown}).deferredPrompt;} else notify("브라우저 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요."); };
  const signIn = async (event:FormEvent<HTMLFormElement>) => { event.preventDefault(); if(!supabase)return;setAuthBusy(true);setAuthError("");const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setAuthError("이메일 또는 비밀번호를 확인해 주세요.");setAuthBusy(false); };
  const signOut = async () => { if(supabase){await supabase.auth.signOut();setPassword("");setMember("전체 멤버");} };

  if (supabase && !session) return <main className="login-page"><form className="login-card" onSubmit={signIn}><div className="brand-icon login-logo">두</div><p className="eyebrow">PRIVATE HOUSEHOLD LEDGER</p><h1>우리집 가계부</h1><p className="sub">선재와 혜빈만 로그인할 수 있어요.</p><label>이메일<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{authError&&<p className="auth-error">{authError}</p>}<button className="primary login-submit" disabled={authBusy}>{authBusy?"로그인 중…":"로그인"}</button><small>계정은 관리자에게 받은 이메일과 비밀번호를 입력해 주세요.</small></form></main>;

  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-icon">두</div><div><b>두리 가계부</b><small>우리 둘의 살림 기록</small></div></div><div className="nav-label">메뉴</div><button className="nav active"><span>▦</span> 대시보드</button><button className="nav" onClick={()=>setModal(true)}><span>＋</span> 내역 추가</button><button className="nav" onClick={()=>fileRef.current?.click()}><span>⇧</span> 엑셀 가져오기</button><button className="nav" onClick={exportExcel}><span>⇩</span> 엑셀 내보내기</button><div className="side-bottom"><div className="couple"><div className="avatar mint">선</div><div className="avatar peach">혜</div><div className="couple-copy"><b>우리집</b><small>멤버 2명 · 선재, 혜빈</small></div><span className="online">●</span></div><button className="install" onClick={install}>↗　앱 설치하기</button><small className="local-note">{supabase&&session?"온라인 동기화 중":"이 기기 브라우저에 저장 중"}</small></div></aside><section className="content"><header className="topbar"><div className="mobile-brand"><div className="brand-icon">두</div><b>두리 가계부</b></div><span className="breadcrumb">우리집 <i>/</i> 대시보드</span><div className="top-actions"><button className="icon-btn" aria-label="알림">♧</button><div className="profile"><div className="avatar mint">{accountMember.slice(0,1)}</div><span>{accountMember}</span><span className="chev">⌄</span></div>{supabase&&session&&<button className="logout-btn" onClick={signOut}>로그아웃</button>}</div></header><div className="page"><div className="heading"><div><p className="eyebrow">HOUSEHOLD OVERVIEW</p><h1>우리집 대시보드 <span>✳</span></h1><p className="sub">함께 쓰고, 함께 모으는 우리 둘의 가계부예요.</p></div><div className="head-buttons"><button className="outline" onClick={()=>fileRef.current?.click()}>⇧ <span>엑셀 가져오기</span></button><button className="primary" onClick={()=>setModal(true)}>＋ <span>내역 추가</span></button></div></div><div className="monthbar"><div className="month"><button onClick={()=>{const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}}>‹</button><b>{Number(month.slice(0,4))}년 {Number(month.slice(5,7))}월</b><button onClick={()=>{const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);}}>›</button><span className="month-tag">이번 달</span></div><button className="outline export" onClick={exportExcel}>⇩ <span>엑셀로 저장</span></button></div><div className="stats"><article className="stat-card dark-card"><div className="stat-top"><span>이번 달 지출</span><span className="stat-symbol">↗</span></div><strong>{money(expense)}</strong><div className="stat-foot"><span className="soft-pill">이번 달</span><span>예산의 {percent}% 사용</span></div><div className="progress"><i style={{width:`${percent}%`}} /></div><div className="budget-caption"><span>월 예산 {money(budget)}</span><span>남은 예산 {money(Math.max(0,budget-expense))}</span></div></article><article className="stat-card"><div className="stat-top"><span>이번 달 수입</span><span className="stat-icon green">↙</span></div><strong>{money(income)}</strong><div className="stat-foot"><span className="plain-pill">수입 합계</span><span className="muted">수입 내역 기준</span></div></article><article className="stat-card"><div className="stat-top"><span>이번 달 잔액</span><span className="stat-icon violet">⌁</span></div><strong>{money(income-expense)}</strong><div className="stat-foot"><span className="plain-pill">수입 − 지출</span><span className="muted">함께 모으고 있어요</span></div></article></div><div className="lower"><article className="panel transaction-panel"><div className="panel-head"><div><h2>최근 내역</h2><p>우리집의 수입과 지출을 모아봤어요.</p></div><button className="text-button" onClick={()=>setQuery("")}>전체 보기 <span>→</span></button></div><div className="filters"><div className="tabs">{["전체 멤버","선재","혜빈","함께"].map(m=><button key={m} className={member===m?"selected":""} onClick={()=>setMember(m)}>{m}</button>)}</div><label className="search">⌕ <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="내역 검색" /></label></div><div className="tx-list">{filtered.length?filtered.map(x=><div className="tx-row" key={x.id}><div className={`tx-icon ${x.type}`}>{x.type==="income"?"↙":x.category==="식비"?"◉":x.category==="주거"?"⌂":x.category==="공과금"?"ϟ":"◇"}</div><div className="tx-info"><b>{x.title}</b><span>{x.category} <i>·</i> {x.date.slice(5).replace("-",".")} <i>·</i> {x.member}</span></div><div className={`tx-amount ${x.type}`}>{x.type==="income"?"+":"−"}{money(x.amount)}</div><button className="delete" onClick={()=>remove(x.id)} aria-label="내역 삭제">×</button></div>):<div className="empty">이 달의 내역이 없어요. 첫 내역을 추가해 보세요.</div>}</div><div className="panel-foot">총 <b>{filtered.length}건</b>의 내역 <span>지출 <b>{money(filtered.filter(x=>x.type==="expense").reduce((s,x)=>s+x.amount,0))}</b></span></div></article><div className="right-col"><article className="panel category-panel"><div className="panel-head"><div><h2>지출 카테고리</h2><p>어디에 가장 많이 썼을까요?</p></div><span className="dots">···</span></div>{catTotals.length?<div className="category-list">{catTotals.map((c,i)=><div className="category-row" key={c.name}><div className="cat-label"><span className={`cat-dot c${i}`} />{c.name}<b>{money(c.amount)}</b></div><div className="cat-track"><i className={`c${i}`} style={{width:`${Math.max(6,Math.round(c.amount/Math.max(...catTotals.map(v=>v.amount))*100))}%`}} /></div></div>)}</div>:<div className="empty small-empty">아직 지출 내역이 없어요.</div>}<div className="category-foot">총 지출 <b>{money(expense)}</b></div></article><article className="tip-card"><div className="tip-spark">✳</div><div><b>이번 달도 잘하고 있어요!</b><p>둘의 기록이 모이면<br/>우리집 흐름이 보여요.</p></div><span className="tip-heart">♡</span></article><article className="import-card"><div className="import-icon">⇧</div><div><b>뱅크샐러드 내역 가져오기</b><p>두 사람의 엑셀을 차례대로 불러오세요.</p><button onClick={()=>fileRef.current?.click()}>엑셀 파일 선택 <span>→</span></button></div></article></div></div><footer>두리 가계부 <span>함께 기록해서 더 든든한 살림</span><button onClick={exportExcel}>엑셀 백업 ↗</button></footer></div><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e=>importExcel(e.target.files?.[0])}/>{toast&&<div className="toast">{toast}</div>}{modal&&<div className="modal-backdrop" onClick={()=>setModal(false)}><section className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setModal(false)}>×</button><p className="eyebrow">NEW TRANSACTION</p><h2>내역 추가</h2><div className="type-toggle"><button className={form.type==="expense"?"on":""} onClick={()=>setForm({...form,type:"expense"})}>지출</button><button className={form.type==="income"?"on":""} onClick={()=>setForm({...form,type:"income"})}>수입</button></div><label>내용<input placeholder="예: 장보기" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><div className="form-grid"><label>금액<input inputMode="numeric" placeholder="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value.replace(/[^\d]/g,"")})}/></label><label>날짜<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>카테고리<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{cats.map(c=><option key={c}>{c}</option>)}</select></label><label>사용한 사람<select value={form.member} onChange={e=>setForm({...form,member:e.target.value})}><option>선재</option><option>혜빈</option><option>함께</option></select></label><label className="wide">결제수단<input placeholder="예: 신한카드" value={form.method} onChange={e=>setForm({...form,method:e.target.value})}/></label></div><button className="primary submit" onClick={add}>내역 저장하기</button></section></div>}</section></main>;
}




