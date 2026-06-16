import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg:"#0a0c10", surface:"#12161c", card:"#181d25", border:"#252c38",
  accent:"#3b82f6", gold:"#f59e0b", red:"#ef4444", success:"#22c55e",
  muted:"#6b7280", text:"#f1f5f9", dim:"#94a3b8",
};

const TOPICS = [
  { id:"road_signs",  icon:"🚦", label:"Road Signs",       desc:"Priority, warning, prohibition & info signs" },
  { id:"priority",    icon:"⚠️",  label:"Priority Rules",   desc:"Right of way, roundabouts, intersections" },
  { id:"speed",       icon:"🏎️", label:"Speed Limits",      desc:"Urban, rural, motorway & special zones" },
  { id:"alcohol",     icon:"🍺", label:"Alcohol & Drugs",   desc:"BAC limits, penalties, testing" },
  { id:"safety",      icon:"🦺", label:"Safety Rules",      desc:"Seatbelts, child seats, phones, visibility" },
  { id:"motorway",    icon:"🛣️", label:"Motorway Rules",    desc:"Lane discipline, entries, exits, breakdown" },
  { id:"environment", icon:"🌿", label:"Environment & LEZ", desc:"Low emission zones, eco-driving" },
  { id:"parking",     icon:"🅿️", label:"Parking Rules",     desc:"Allowed zones, blue zones, fines" },
  { id:"vulnerable",  icon:"🚴", label:"Vulnerable Users",  desc:"Cyclists, pedestrians, motorcycles" },
  { id:"vehicle",     icon:"🔧", label:"Vehicle Tech",      desc:"Lights, tyres, brakes, maintenance" },
];

const SYSTEM_PROMPT = `You are Max, a friendly Belgian driving theory tutor delivering a spoken audio lesson.
The student LISTENS — write natural spoken English only, like a calm radio presenter.
No markdown, no bullet symbols, no dashes. Short sentences.
Keep each explanation under 55 words. Then ask ONE quiz question with 4 options spoken as "Option A ..., Option B ..., Option C ..., Option D ...".

Respond ONLY in raw JSON (no backticks):
{
  "speech": "Full spoken text for this turn",
  "type": "explanation" | "question" | "feedback" | "summary",
  "options": ["A. text","B. text","C. text","D. text"] or null,
  "correct": 0|1|2|3 or null,
  "caption": "3-6 word screen label" or null
}`;

// ── Robust TTS engine ───────────────────────────────────────────────────────
// Splits text into sentences, speaks them one by one with a keep-alive
// interval to prevent the sandbox from pausing speechSynthesis.
function useTTS() {
  const [state, setState]   = useState("idle"); // idle | loading | speaking | paused | done
  const [voices, setVoices] = useState([]);
  const queue   = useRef([]);
  const current = useRef(null);
  const keepAlive = useRef(null);
  const onDoneCb  = useRef(null);
  const stopped   = useRef(false);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { cancelAll(); };
  }, []);

  function pickVoice(vs) {
    // Prefer natural-sounding English voices
    const prefs = ["Google UK English Male","Google US English","Alex","Samantha","Daniel","Karen","Moira","Rishi"];
    for (const p of prefs) {
      const v = vs.find(x => x.name === p);
      if (v) return v;
    }
    return vs.find(v => v.lang.startsWith("en") && !v.name.includes("Compact")) ||
           vs.find(v => v.lang.startsWith("en")) || vs[0] || null;
  }

  function startKeepAlive() {
    stopKeepAlive();
    keepAlive.current = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 9000);
  }
  function stopKeepAlive() {
    if (keepAlive.current) { clearInterval(keepAlive.current); keepAlive.current = null; }
  }

  function cancelAll() {
    stopped.current = true;
    stopKeepAlive();
    window.speechSynthesis?.cancel();
    queue.current = [];
    current.current = null;
    setState("idle");
  }

  function speakNext() {
    if (stopped.current || queue.current.length === 0) {
      stopKeepAlive();
      setState("done");
      onDoneCb.current?.();
      onDoneCb.current = null;
      return;
    }
    const sentence = queue.current.shift();
    const utt = new SpeechSynthesisUtterance(sentence);
    const voice = pickVoice(voices);
    if (voice) utt.voice = voice;
    utt.rate  = 0.9;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    utt.onstart = () => { setState("speaking"); };
    utt.onend   = () => { if (!stopped.current) speakNext(); };
    utt.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      speakNext();
    };
    current.current = utt;
    window.speechSynthesis.cancel(); // clear queue first
    setTimeout(() => {
      if (!stopped.current) window.speechSynthesis.speak(utt);
    }, 80);
  }

  function speak(text, onDone) {
    if (!window.speechSynthesis) { onDone?.(); return; }
    stopped.current = false;
    onDoneCb.current = onDone;
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [text];
    queue.current = sentences;
    setState("loading");
    startKeepAlive();
    // Short delay so voices are available
    setTimeout(() => speakNext(), 120);
  }

  function stop() {
    cancelAll();
  }

  function pause() {
    window.speechSynthesis?.pause();
    setState("paused");
  }

  function resume() {
    window.speechSynthesis?.resume();
    setState("speaking");
  }

  return {
    speak, stop, pause, resume, state,
    speaking: state === "speaking",
    paused:   state === "paused",
    loading:  state === "loading",
    supported: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}

// ── Animated waveform ───────────────────────────────────────────────────────
function Waveform({ active, color = C.accent, bars = 14, height = 36 }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:3, height }}>
      {Array.from({length:bars}).map((_,i) => (
        <div key={i} style={{
          width:3.5, borderRadius:4,
          background: active ? color : C.border,
          height: active ? undefined : 5,
          animation: active ? `wv 1.1s ease-in-out infinite` : "none",
          animationDelay:`${(i*0.07).toFixed(2)}s`,
        }}/>
      ))}
      <style>{`@keyframes wv{0%,100%{height:4px}50%{height:${height-6}px}}`}</style>
    </div>
  );
}

// ── Ring progress ───────────────────────────────────────────────────────────
function Ring({ pct, size=80, stroke=6, color=C.accent, children }) {
  const r = (size-stroke)/2, circ = 2*Math.PI*r;
  return (
    <div style={{ position:"relative", width:size, height:size }}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 0.5s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {children}
      </div>
    </div>
  );
}

// ── Option button ───────────────────────────────────────────────────────────
function Option({ label, text, selected, isCorrect, revealed, onClick }) {
  let bg=C.card, border=C.border, col=C.dim;
  if (revealed) {
    if (isCorrect)        { bg=`${C.success}22`; border=C.success; col=C.success; }
    else if (selected)    { bg=`${C.red}20`;     border=C.red;     col=C.red; }
  } else if (selected)    { bg=`${C.accent}22`;  border=C.accent;  col=C.text; }
  return (
    <button onClick={onClick} disabled={revealed} style={{
      display:"flex", alignItems:"center", gap:12,
      background:bg, border:`1.5px solid ${border}`, borderRadius:14,
      padding:"12px 16px", cursor:revealed?"default":"pointer",
      transition:"all 0.18s", width:"100%", fontFamily:"inherit",
      color:col, fontSize:15, textAlign:"left",
    }}
    onMouseEnter={e=>{ if(!revealed&&!selected){e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=`${C.accent}12`;} }}
    onMouseLeave={e=>{ if(!revealed&&!selected){e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.card;} }}
    >
      <span style={{
        width:30, height:30, borderRadius:9, border:`1.5px solid ${border}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:12, fontWeight:700, flexShrink:0, color:col
      }}>{label}</span>
      <span style={{lineHeight:1.4}}>{text}</span>
    </button>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]       = useState("home");
  const [topic, setTopic]         = useState(null);
  const [caption, setCaption]     = useState("");
  const [subCaption, setSubCaption] = useState("");
  const [options, setOptions]     = useState(null);
  const [selected, setSelected]   = useState(null);
  const [revealed, setRevealed]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [score, setScore]         = useState(0);
  const [qCount, setQCount]       = useState(0);
  const [completed, setCompleted] = useState([]);
  const [totalScore, setTotalScore] = useState(0);
  const [totalQ, setTotalQ]       = useState(0);
  const [pendingSpeech, setPendingSpeech] = useState(null);
  const [pendingCb, setPendingCb] = useState(null);
  const [needsTap, setNeedsTap]   = useState(false);

  const apiHistory = useRef([]);
  const tts = useTTS();

  const topicPct   = qCount  > 0 ? Math.round(score/qCount*100)       : 0;
  const overallPct = totalQ  > 0 ? Math.round(totalScore/totalQ*100)  : 0;

  // Attempt to speak; if blocked, show tap-to-play
  const safeSpeak = useCallback((text, onDone) => {
    setPendingSpeech(text);
    setPendingCb(() => onDone);
    setNeedsTap(false);
    tts.speak(text, () => {
      setPendingSpeech(null);
      setPendingCb(null);
      setNeedsTap(false);
      onDone?.();
    });
    // After 600ms if still not speaking, show tap prompt
    setTimeout(() => {
      if (tts.state === "idle" || tts.state === "loading") {
        setNeedsTap(true);
      }
    }, 700);
  }, [tts]);

  function handleTapToPlay() {
    setNeedsTap(false);
    if (pendingSpeech) {
      tts.speak(pendingSpeech, () => {
        const cb = pendingCb;
        setPendingSpeech(null);
        setPendingCb(null);
        cb?.();
      });
    }
  }

  async function callMax(userContent, history) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("API key not configured");
    const msgs = [...history, { role:"user", content:userContent }];
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:600, system:SYSTEM_PROMPT, messages:msgs }),
    });
    const data = await res.json();
    const raw  = data.content?.[0]?.text || "{}";
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g,"").trim()); }
    catch { parsed = { speech:raw, type:"explanation" }; }
    return { parsed, newHistory:[...msgs,{role:"assistant",content:raw}] };
  }

  async function startTopic(t) {
    tts.stop();
    setTopic(t);
    setScreen("player");
    setOptions(null); setSelected(null); setRevealed(false);
    setScore(0); setQCount(0); setCaption(""); setSubCaption("");
    setPendingSpeech(null); setPendingCb(null); setNeedsTap(false);
    apiHistory.current = [];
    setAiLoading(true);
    try {
      const prompt = `Start a spoken audio lesson on "${t.label}" — ${t.desc}. Introduce yourself as Max briefly, name the topic, teach the first key rule in Belgium, then ask a quiz question with 4 options.`;
      const { parsed, newHistory } = await callMax(prompt, []);
      apiHistory.current = newHistory;
      setCaption(parsed.speech);
      setSubCaption(parsed.caption || t.label);
      if (parsed.type==="question" && parsed.options) {
        setOptions({ items:parsed.options, correct:parsed.correct });
        setQCount(1);
      }
      setAiLoading(false);
      safeSpeak(parsed.speech, undefined);
    } catch(e) {
      console.error("API error:", e);
      setCaption(`Error: ${e.message || "Could not connect. Please check your connection and try again."}`);
      setAiLoading(false);
    }
  }

  async function handleAnswer(idx) {
    if (revealed || aiLoading) return;
    tts.stop();
    setSelected(idx);
    setRevealed(true);
    const isCorrect = idx === options.correct;
    if (isCorrect) setScore(s=>s+1);
    setAiLoading(true);
    try {
      const chosen  = options.items[idx];
      const correct = options.items[options.correct];
      const msg = `User answered: "${chosen}". Correct was: "${correct}". ${isCorrect?"Great — they got it right! Briefly affirm, then teach the next concept and ask another question.":"They got it wrong. Gently explain why, then teach the next concept and ask another question."}`;
      const { parsed, newHistory } = await callMax(msg, apiHistory.current);
      apiHistory.current = newHistory;
      setCaption(parsed.speech);
      setSubCaption(parsed.caption || topic?.label || "");
      if (parsed.type==="question" && parsed.options) {
        const afterSpeak = () => {
          setOptions({ items:parsed.options, correct:parsed.correct });
          setSelected(null); setRevealed(false);
          setQCount(q=>q+1);
        };
        setAiLoading(false);
        safeSpeak(parsed.speech, afterSpeak);
      } else {
        setAiLoading(false);
        safeSpeak(parsed.speech, undefined);
      }
    } catch(e) {
      setAiLoading(false);
      setCaption("Connection error. Tap Replay or try again.");
    }
  }

  async function endLesson() {
    tts.stop();
    setAiLoading(true);
    try {
      const { parsed } = await callMax(
        `End the lesson. User scored ${score} out of ${qCount} on "${topic?.label}". Give a warm 3-sentence spoken summary and encouragement.`,
        apiHistory.current
      );
      setTotalScore(t=>t+score);
      setTotalQ(t=>t+qCount);
      if (!completed.includes(topic?.id)) setCompleted(c=>[...c,topic.id]);
      setCaption(parsed.speech);
      setOptions(null);
      setAiLoading(false);
      safeSpeak(parsed.speech, () => setScreen("results"));
    } catch(e) {
      setAiLoading(false);
      setScreen("results");
    }
  }

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (screen==="home") return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",paddingBottom:40}}>
      <div style={{background:`linear-gradient(160deg,#0d1520,${C.bg} 70%)`,borderBottom:`1px solid ${C.border}`,padding:"28px 20px 24px"}}>
        <div style={{maxWidth:600,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
            <div style={{width:54,height:54,borderRadius:16,background:`linear-gradient(135deg,${C.accent},#1d4ed8)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:`0 0 28px ${C.accent}44`}}>🎧</div>
            <div>
              <div style={{color:C.text,fontSize:21,fontWeight:800,letterSpacing:"-0.4px"}}>Max — Your Audio Tutor</div>
              <div style={{color:C.muted,fontSize:13}}>Belgium Driving Theory · Category B</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14}}>
            <Waveform active={false} color={C.accent} bars={12} height={28}/>
            <span style={{color:C.dim,fontSize:13}}>Pick a topic — Max speaks the lesson & quizzes you</span>
          </div>
          {!tts.supported && (
            <div style={{marginTop:12,padding:"10px 14px",background:`${C.red}18`,border:`1px solid ${C.red}`,borderRadius:10,color:C.red,fontSize:12}}>
              ⚠️ Speech not available in this browser. Captions will still show.
            </div>
          )}
          {totalQ > 0 && (
            <div style={{marginTop:16,display:"flex",alignItems:"center",gap:12}}>
              <Ring pct={overallPct} size={50} stroke={5} color={overallPct>=82?C.success:C.gold}>
                <span style={{color:overallPct>=82?C.success:C.gold,fontSize:11,fontWeight:700}}>{overallPct}%</span>
              </Ring>
              <div>
                <div style={{color:C.text,fontSize:13,fontWeight:600}}>Overall progress</div>
                <div style={{color:C.muted,fontSize:12}}>{completed.length}/{TOPICS.length} topics · {totalScore}/{totalQ} correct</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"22px 18px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:12}}>Choose a Topic</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {TOPICS.map(t => {
            const done = completed.includes(t.id);
            return (
              <button key={t.id} onClick={()=>startTopic(t)} style={{
                background:done?`${C.accent}12`:C.card, border:`1.5px solid ${done?C.accent:C.border}`,
                borderRadius:14,padding:"14px 15px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all 0.16s"
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background=`${C.accent}14`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=done?C.accent:C.border;e.currentTarget.style.background=done?`${C.accent}12`:C.card;}}
              >
                <div style={{fontSize:22,marginBottom:6}}>{t.icon}</div>
                <div style={{color:C.text,fontSize:13.5,fontWeight:600,marginBottom:2}}>
                  {t.label}{done&&<span style={{marginLeft:6,color:C.accent,fontSize:11}}>✓</span>}
                </div>
                <div style={{color:C.muted,fontSize:11.5}}>{t.desc}</div>
              </button>
            );
          })}
        </div>
        <button onClick={()=>startTopic(TOPICS[Math.floor(Math.random()*TOPICS.length)])} style={{
          marginTop:14,width:"100%",padding:14,fontFamily:"inherit",
          background:`linear-gradient(90deg,${C.accent},#1d4ed8)`,
          color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",
          boxShadow:`0 4px 20px ${C.accent}44`
        }}>🎲 Random Lesson</button>
        <div style={{marginTop:14,padding:"12px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",gap:10,alignItems:"center"}}>
          <span style={{fontSize:20}}>🇧🇪</span>
          <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>
            Belgian theory exam needs <strong style={{color:C.gold}}>41/50 (82%)</strong> to pass. Max quizzes you after every concept.
          </div>
        </div>
      </div>
    </div>
  );

  // ── PLAYER ─────────────────────────────────────────────────────────────────
  if (screen==="player") {
    const isSpeaking = tts.speaking || tts.loading;
    return (
      <div style={{height:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
        {/* Top bar */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"11px 16px",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>{tts.stop();setScreen("home");}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:2}}>←</button>
          <span style={{fontSize:20}}>{topic?.icon}</span>
          <div style={{flex:1}}>
            <div style={{color:C.text,fontWeight:700,fontSize:14}}>{topic?.label}</div>
            <div style={{color:C.muted,fontSize:11}}>Audio Lesson · Max</div>
          </div>
          <div style={{textAlign:"right",marginRight:4}}>
            <div style={{color:C.gold,fontWeight:700,fontSize:14}}>{score}/{qCount}</div>
            <div style={{color:C.muted,fontSize:10}}>score</div>
          </div>
          <button onClick={endLesson} disabled={aiLoading} style={{
            background:C.card,border:`1px solid ${C.border}`,color:C.dim,
            padding:"6px 11px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:"inherit"
          }}>Finish</button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 18px 20px"}}>

          {/* Tutor avatar */}
          <div style={{position:"relative",marginBottom:18}}>
            <div style={{
              width:96,height:96,borderRadius:"50%",
              background:`linear-gradient(135deg,${C.accent}33,#1d4ed855)`,
              border:`2.5px solid ${isSpeaking?C.accent:C.border}`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:44,
              boxShadow:isSpeaking?`0 0 36px ${C.accent}66`:"none",
              transition:"box-shadow 0.35s,border-color 0.35s"
            }}>🧑‍🏫</div>
            {isSpeaking&&!tts.paused&&(
              <div style={{
                position:"absolute",bottom:-2,right:-2,width:26,height:26,borderRadius:"50%",
                background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12
              }}>🔊</div>
            )}
          </div>

          {/* Waveform */}
          <Waveform active={tts.speaking&&!tts.paused} color={C.accent} bars={16} height={38}/>

          {/* Status label */}
          <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",marginTop:12,marginBottom:14}}>
            {aiLoading?"Max is thinking…":tts.speaking&&!tts.paused?"Speaking…":tts.paused?"Paused":"Ready"}
          </div>

          {/* TAP TO PLAY button — shown when autoplay is blocked */}
          {needsTap && !tts.speaking && !aiLoading && (
            <button onClick={handleTapToPlay} style={{
              marginBottom:16, padding:"14px 32px",
              background:`linear-gradient(90deg,${C.accent},#1d4ed8)`,
              border:"none",borderRadius:40,color:"#fff",
              fontWeight:700,fontSize:16,cursor:"pointer",fontFamily:"inherit",
              boxShadow:`0 0 28px ${C.accent}66`,
              animation:"tapPulse 1.6s ease-in-out infinite"
            }}>
              ▶  Tap to Hear Max
            </button>
          )}

          {/* Playback controls */}
          {!needsTap && (
            <div style={{display:"flex",justifyContent:"center",gap:14,marginBottom:18,alignItems:"center"}}>
              {/* Replay */}
              <button onClick={()=>{if(caption)safeSpeak(caption,undefined);}} disabled={aiLoading||!caption} title="Replay" style={{
                width:44,height:44,borderRadius:"50%",background:C.card,border:`1.5px solid ${C.border}`,
                color:C.dim,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"
              }}>↺</button>
              {/* Pause / Resume */}
              <button onClick={()=>tts.paused?tts.resume():tts.pause()} disabled={!tts.speaking&&!tts.paused} style={{
                width:58,height:58,borderRadius:"50%",
                background:tts.speaking||tts.paused?C.accent:C.border,
                border:"none",color:"#fff",cursor:(tts.speaking||tts.paused)?"pointer":"default",
                fontSize:24,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:tts.speaking?`0 0 22px ${C.accent}55`:"none",transition:"all 0.2s"
              }}>{tts.paused?"▶":"⏸"}</button>
              {/* Stop */}
              <button onClick={tts.stop} disabled={!tts.speaking&&!tts.paused} style={{
                width:44,height:44,borderRadius:"50%",background:C.card,border:`1.5px solid ${C.border}`,
                color:C.dim,cursor:(tts.speaking||tts.paused)?"pointer":"default",
                fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"
              }}>⏹</button>
            </div>
          )}

          {/* Caption */}
          {caption && (
            <div style={{
              background:C.card,border:`1px solid ${C.border}`,borderRadius:18,
              padding:"16px 20px",width:"100%",maxWidth:520,
              color:C.dim,fontSize:14.5,lineHeight:1.8,textAlign:"left",marginBottom:16
            }}>
              {subCaption && (
                <div style={{color:C.muted,fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>
                  📝 {subCaption}
                </div>
              )}
              {caption}
            </div>
          )}

          {/* Quiz options */}
          {options && (
            <div style={{width:"100%",maxWidth:520,marginBottom:16}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10,textAlign:"center"}}>
                ❓ Tap your answer
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {options.items.map((opt,i)=>(
                  <Option key={i}
                    label={["A","B","C","D"][i]}
                    text={opt.replace(/^[ABCD]\.\s*/,"")}
                    selected={selected===i}
                    isCorrect={i===options.correct}
                    revealed={revealed}
                    onClick={()=>handleAnswer(i)}
                  />
                ))}
              </div>
              {revealed && (
                <div style={{
                  marginTop:10,padding:"10px 14px",
                  background:selected===options.correct?`${C.success}18`:`${C.red}18`,
                  border:`1px solid ${selected===options.correct?C.success:C.red}`,
                  borderRadius:10,color:selected===options.correct?C.success:C.red,
                  fontSize:13,textAlign:"center"
                }}>
                  {selected===options.correct?"✅ Correct! Listen for the next concept…":`❌ Answer was ${["A","B","C","D"][options.correct]}. Max will explain…`}
                </div>
              )}
            </div>
          )}

          {/* AI loading dots */}
          {aiLoading && (
            <div style={{display:"flex",gap:6,padding:"8px 0",alignItems:"center"}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:8,height:8,borderRadius:"50%",background:C.accent,animation:"dot 1.2s ease-in-out infinite",animationDelay:`${i*0.2}s`}}/>
              ))}
            </div>
          )}
        </div>

        {/* Score bar */}
        <div style={{background:C.surface,borderTop:`1px solid ${C.border}`,padding:"10px 20px",flexShrink:0}}>
          <div style={{maxWidth:520,margin:"0 auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",color:C.muted,fontSize:11,marginBottom:5}}>
              <span>Session score</span>
              <span style={{color:topicPct>=82?C.success:C.gold}}>{topicPct}% {topicPct>=82?"✓ On track":""}</span>
            </div>
            <div style={{height:5,background:C.border,borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${topicPct}%`,borderRadius:4,transition:"width 0.4s",background:topicPct>=82?C.success:C.gold}}/>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes dot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
          @keyframes tapPulse{0%,100%{box-shadow:0 0 20px ${C.accent}55}50%{box-shadow:0 0 40px ${C.accent}99}}
        `}</style>
      </div>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────────────────────
  const pass = topicPct >= 82;
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
        <Ring pct={topicPct} size={120} stroke={8} color={pass?C.success:topicPct>=60?C.gold:C.red}>
          <div>
            <div style={{color:pass?C.success:topicPct>=60?C.gold:C.red,fontSize:22,fontWeight:800}}>{topicPct}%</div>
            <div style={{color:C.muted,fontSize:10}}>score</div>
          </div>
        </Ring>
        <div style={{marginTop:18,color:C.text,fontSize:22,fontWeight:700}}>{topic?.icon} {topic?.label}</div>
        <div style={{color:C.muted,fontSize:13,marginTop:4}}>{score} correct · {qCount} questions</div>
        <div style={{margin:"18px 0",padding:"14px 18px",background:pass?`${C.success}14`:`${C.gold}14`,border:`1px solid ${pass?C.success:C.gold}`,borderRadius:14,color:pass?C.success:C.gold,fontSize:13}}>
          {pass?"🎉 Excellent! You're on track to pass this section.":"📚 Keep going — aim for 82% on the real exam!"}
        </div>
        {caption&&(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",marginBottom:18,color:C.dim,fontSize:13,lineHeight:1.7,textAlign:"left"}}>
            {caption}
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>startTopic(topic)} style={{flex:1,padding:13,background:C.accent,color:"#fff",border:"none",borderRadius:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>🔁 Retry</button>
          <button onClick={()=>{tts.stop();setScreen("home");}} style={{flex:1,padding:13,background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>🏠 All Topics</button>
        </div>
        {totalQ>0&&(
          <div style={{marginTop:14,padding:14,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",alignItems:"center",gap:12}}>
            <Ring pct={overallPct} size={48} stroke={5} color={overallPct>=82?C.success:C.gold}>
              <span style={{color:overallPct>=82?C.success:C.gold,fontSize:11,fontWeight:700}}>{overallPct}%</span>
            </Ring>
            <div style={{textAlign:"left"}}>
              <div style={{color:C.text,fontSize:13,fontWeight:600}}>Overall: {totalScore}/{totalQ} correct</div>
              <div style={{color:C.muted,fontSize:12}}>{completed.length} of {TOPICS.length} topics done</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
