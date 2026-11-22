import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { HeadScan, headsetLink } from "./public/head-scan.js";

const html = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const main = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*?;\s*/, "");
const savedHead = { id: "saved-older", name: "Test person", createdAt: "2026-11-21T20:00:00Z" };
const newHead = { id: "scan-from-this-job", name: "Test person", createdAt: "2026-11-21T21:00:00Z" };

async function until(predicate, message) {
  const end = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > end) assert.fail(message); await delay(10); }
}

function page({ mirror = false, saved = [savedHead], library = [savedHead, {id:"isaac-face",name:"Isaac",createdAt:"2026-11-21T20:30:00Z"}], enabled = true, uploadError, jobStatus = "building" } = {}) {
  const dom = new JSDOM(html, { url: "https://uncle.test/", runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window, calls = [], state = { jobStatus, stopped: 0 };
  const $ = id => win.document.getElementById(id);
  const result = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  win.matchMedia = () => ({ matches: true });
  win.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/pairings/watch/viewer-token") return result({opened:true});
    if (url === "/api/pairings") return result({code:"ABCD",...(mirror ? {watchToken:"viewer-token",viewerUrl:"/xr/?voice=live&head=isaac&spectate=1&mirror=viewer-token"} : {}),expiresAt:new Date(Date.now()+600000).toISOString()},201);
    if (url.startsWith("/api/heads?")) return result({heads:saved});
    if (url === "/api/heads") return result({heads:library});
    if (url === "/api/head-jobs/config") return result({enabled});
    if (url === "/api/head-sessions") return result({sessionToken:"automatic-test-session"},201);
    if (url.startsWith("/api/head-jobs?") && options.method === "POST") return uploadError ? result({error:uploadError},401) : result({job:{id:"job-this-session",name:"Test person",status:"queued",stage:"queued"}},202);
    if (url === "/api/head-jobs/job-this-session") return result({workerOnline:false,job:{id:"job-this-session",name:"Test person",status:state.jobStatus,stage:"assemble",head:state.jobStatus === "completed" ? newHead : null,error:state.jobStatus === "failed" ? "Not enough face views. Film a full turn." : null}});
    if (url.startsWith("/api/voice/clone?")) return result({ok:true});
    if (url === "/api/interview/extract") return result({transcript:"Synthetic test interview",heard:{age:22,sex:"female",province:"ON"},rejected:[]});
    if (url === "/api/interview/confirm") return result({ok:true});
    throw new Error("Unexpected request " + url);
  };
  win.HeadScan = class extends HeadScan { constructor() { super(win.fetch); } };
  win.headsetLink = headsetLink;
  const node = () => ({gain:{value:0,linearRampToValueAtTime(){}},frequency:{value:0},Q:{value:0},detune:{value:0},connect(){},start(){}});
  win.AudioContext = class { currentTime=0; destination={}; createGain=node; createOscillator=node; createBiquadFilter=node; };
  Object.defineProperty(win.navigator, "mediaDevices", { value: { getUserMedia: async () => ({getTracks:()=>[{stop(){state.stopped++;}}]}) } });
  win.HTMLMediaElement.prototype.play = async () => {};
  win.MediaRecorder = class {
    static isTypeSupported() { return true; }
    state="inactive"; mimeType="audio/webm";
    constructor(_stream, options) { this.mimeType=options?.mimeType || "audio/webm"; }
    start(){this.state="recording";}
    stop(){this.state="inactive";this.ondataavailable?.({data:new win.Blob(["synthetic audio"])});this.onstop?.();}
  };
  const originalTimeout = win.setTimeout.bind(win);
  win.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 3000 ? 40 : ms, ...args);
  new Script(main, { filename:"landing-onboarding.js" }).runInContext(dom.getInternalVMContext());
  async function begin() {
    $("begin").click(); $("name").value="Test person"; $("to-record").click();
    await until(()=>!$("new-scan-options").hidden || !$("saved-scan-choice").hidden || $("scan-options-status").textContent.includes("unavailable"),"scan choices did not load");
  }
  function answerQuestions() {
    for (let i = 0; i < 10; i++) {
      if (i === 0) { $("q-num").value = "21"; $("q-num").dispatchEvent(new win.Event("input")); }
      else if (i === 1) { const opts = $("q-opts").querySelectorAll("button"); if (opts[1]) opts[1].click(); }
      else { const opts = $("q-opts").querySelectorAll("button"); if (opts.length) opts[0].click(); }
      $("q-next").click();
    }
  }
  async function interview() {
    answerQuestions();
    await until(()=>$("s-record").classList.contains("on"),"recording step did not appear after questions");
    $("rec-start").click();
    await until(()=>!$("rec-stop").disabled,"recording did not start");
    $("rec-stop").click();
    await until(()=>$("s-confirm").classList.contains("on"),"confirmation did not appear");
    $("confirm").click();
  }
  function chooseFile() {
    $("new-scan-options").open = true;
    const file = new win.File(["synthetic video"],"test.mov",{type:"video/quicktime"});
    Object.defineProperty($("scan-video"),"files",{value:[file],configurable:true});
    $("scan-video").dispatchEvent(new win.Event("change"));
  }
  return {dom,win,$,state,calls,begin,interview,chooseFile};
}

test("main Begin flow reuses a chosen saved head and still hands off when QR loading fails", async () => {
  const p = page();
  try {
    await p.begin();
    p.$("scan-use-saved").click();
    assert.ok(p.$("s-ask").classList.contains("on"));
    await p.interview();
    await until(()=>p.$("s-done").classList.contains("on"),"ready screen did not appear");
    await until(()=>p.$("pair-ready").textContent === "ABCD","pairing code missing");
    const target = new URL(p.$("open-xr").href);
    assert.equal(JSON.parse(p.calls.find(c=>c.url==="/api/pairings").options.body).url,target.href);
    assert.equal(target.searchParams.get("head"), savedHead.id);
    assert.equal(target.searchParams.get("name"),"Test person");
    assert.equal(target.searchParams.get("sex"),"female");
    assert.equal(new URL(p.$("qr").src).searchParams.get("url"),target.href);
    p.$("qr").dispatchEvent(new p.win.Event("error"));
    assert.ok(p.$("s-done").classList.contains("on"));
    assert.equal(p.$("open-xr").href,target.href);
    assert.match(p.$("done-note").textContent,/QR code is unavailable/);
    assert.ok(!p.calls.some(c=>c.url.startsWith("/api/head-jobs?")),"saved heads need no new upload or code");
  } finally {p.dom.window.close();}
});

test("face library searches all names and uses another face with the person's own voice/profile", async () => {
  const p=page();
  try {
    await p.begin();p.$("scan-library").click();
    await until(()=>p.$("face-list").children.length===2,"full face library unavailable");
    p.$("face-search").value="isaac";p.$("face-search").dispatchEvent(new p.win.Event("input"));
    assert.equal(p.$("face-list").children.length,1);
    p.$("face-list").querySelector("button").click();
    assert.equal(p.$("face-use").disabled,false);
    await until(()=>p.$("face-status").textContent.includes("Preview unavailable"),"selection did not survive unavailable preview");
    p.$("face-use").click();
    await p.interview();
    await until(()=>p.$("s-done").classList.contains("on"),"selected library face did not hand off");
    const target=new URL(p.$("open-xr").href);
    assert.equal(target.searchParams.get("head"),"isaac-face");
    assert.equal(target.searchParams.get("name"),"Test person");
    const confirmed=p.calls.find(c=>c.url==="/api/interview/confirm");
    assert.equal(JSON.parse(confirmed.options.body).name,"Test person");
    assert.ok(p.calls.some(c=>c.url.startsWith("/api/voice/clone?name=Test%20person")));
    assert.ok(!p.calls.some(c=>c.url.startsWith("/api/head-jobs?")));
  } finally {p.dom.window.close();}
});

test("library selection works without scan upload access and handles empty/no-match results", async () => {
  const p=page({saved:[],enabled:false});
  try {
    await p.begin();p.$("scan-library").click();
    await until(()=>p.$("face-list").children.length===2,"read-only library unavailable");
    assert.equal(p.$("face-use").disabled,true);
    p.$("face-search").value="unknown person";p.$("face-search").dispatchEvent(new p.win.Event("input"));
    assert.equal(p.$("face-list").children.length,0);
    assert.match(p.$("face-status").textContent,/No saved faces match/);
  } finally {p.dom.window.close();}
  const empty=page({saved:[],library:[]});
  try {
    await empty.begin();empty.$("scan-library").click();
    await until(()=>empty.$("face-status").textContent.includes("No faces saved yet"),"empty library not explained");
    assert.equal(empty.$("face-use").disabled,true);
  } finally {empty.dom.window.close();}
});

test("uploaded scan builds during interview, waits after confirmation, and uses that job's exact head", async () => {
  const p = page();
  try {
    await p.begin(); p.chooseFile(); p.$("scan-upload").click();
    await until(()=>p.$("s-ask").classList.contains("on"),"questions did not follow upload");
    assert.match(p.$("scan-progress-note").textContent,/queued|builder|texture/i);
    await p.interview();
    await until(()=>p.$("s-head-wait").classList.contains("on"),"profile did not wait for head");
    assert.ok(!p.$("s-done").classList.contains("on"));
    p.state.jobStatus="completed";
    await until(()=>p.$("s-done").classList.contains("on"),"finished head was not handed off");
    assert.equal(new URL(p.$("open-xr").href).searchParams.get("head"),newHead.id);
    assert.equal(p.$("scan-code"),null,"no access-code field is required");
    assert.ok(p.calls.find(c=>c.url.startsWith("/api/head-jobs?name=")).options.headers.Authorization.includes("automatic-test-session"));
  } finally {p.dom.window.close();}
});

test("rejected uploads stay on scan step with retry controls", async () => {
  const p = page({uploadError:"Upload unavailable"});
  try {
    await p.begin(); p.chooseFile(); p.$("scan-upload").click();
    await until(()=>p.$("e-scan").textContent.includes("Upload unavailable"),"upload error was hidden");
    assert.ok(p.$("s-scan").classList.contains("on"));
    assert.equal(p.$("scan-upload").disabled,false);
    assert.equal(p.$("scan-skip").disabled,false);
  } finally {p.dom.window.close();}
});

test("failed head build lets the confirmed interview continue with a saved fallback", async () => {
  const p = page({jobStatus:"failed"});
  try {
    await p.begin(); p.chooseFile(); p.$("scan-upload").click();
    await until(()=>p.$("s-ask").classList.contains("on"),"questions did not follow upload");
    await p.interview();
    await until(()=>p.$("s-head-wait").classList.contains("on"),"failed head state not shown");
    assert.match(p.$("e-head-wait").textContent,/full turn/);
    p.$("head-fallback").click();
    assert.equal(new URL(p.$("open-xr").href).searchParams.get("head"),savedHead.id);
  } finally {p.dom.window.close();}
});

test("retrying a failed scan preserves the confirmed interview", async () => {
  const p = page({jobStatus:"failed"});
  try {
    await p.begin(); p.chooseFile(); p.$("scan-upload").click();
    await until(()=>p.$("s-ask").classList.contains("on"),"questions did not start");
    await p.interview();
    await until(()=>p.$("s-head-wait").classList.contains("on"),"failed scan not shown");
    assert.equal(p.$("head-rescan").hidden,false);
    p.$("head-rescan").click();
    await until(()=>!p.$("new-scan-options").hidden,"retry scan controls unavailable");
    p.state.jobStatus="completed";
    p.chooseFile(); p.$("scan-upload").click();
    await until(()=>p.$("s-done").classList.contains("on"),"retried scan did not hand off");
    assert.equal(new URL(p.$("open-xr").href).searchParams.get("head"),newHead.id);
    assert.equal(p.calls.filter(c=>c.url === "/api/interview/confirm").length,1);
    assert.equal(p.calls.filter(c=>c.url.startsWith("/api/voice/clone?")).length,1);
  } finally {p.dom.window.close();}
});

test("scanning disabled or skipped still leads to an explicit stand-in handoff", async () => {
  const p = page({saved:[],enabled:false});
  try {
    await p.begin();
    assert.equal(p.$("new-scan-options").hidden,true);
    p.$("scan-skip").click(); await p.interview();
    await until(()=>p.$("s-done").classList.contains("on"),"stand-in handoff unavailable");
    assert.equal(new URL(p.$("open-xr").href).searchParams.has("head"),false);
    assert.match(p.$("head-note").textContent,/stand-in/);
  } finally {p.dom.window.close();}
});

test("cancelling camera capture turns off all video tracks", async () => {
  const p = page();
  try {
    await p.begin(); p.$("scan-record").click();
    await until(()=>!p.$("scan-preview").hidden,"camera preview never started");
    p.$("scan-cancel").click();
    assert.equal(p.state.stopped,1);
    assert.equal(p.$("scan-preview").srcObject,null);
    assert.equal(p.$("scan-skip").disabled,false);
    assert.ok(!p.calls.some(c=>c.url.startsWith("/api/head-jobs?")),"cancelled capture must not upload");
  } finally {p.dom.window.close();}
});

test("camera capture counts down, stops, uploads video and advances to the interview", async () => {
  const p = page();
  try {
    await p.begin();
    let clock = Date.now();
    p.win.Date.now = () => clock;
    const setTimer = p.win.setTimeout.bind(p.win), setInterval = p.win.setInterval.bind(p.win);
    p.win.setTimeout = (fn, ms, ...args) => setTimer(fn, ms === 1000 ? 5 : ms, ...args);
    p.win.setInterval = (fn, ms, ...args) => ms === 250 ? setInterval(()=>{clock+=1000;fn();},5) : setInterval(fn,ms,...args);
    p.$("new-scan-options").open=true;
    p.$("scan-record").click();
    await until(()=>p.$("s-ask").classList.contains("on"),"recorded scan did not advance to questions");
    const request=p.calls.find(c=>c.url.startsWith("/api/head-jobs?"));
    assert.equal(new URL(request.url,"https://uncle.test").searchParams.get("extension"),"mp4");
    assert.match(request.options.headers["Content-Type"],/video\/mp4/);
    assert.equal(p.state.stopped,1);
    assert.equal(p.$("scan-preview").srcObject,null);
  } finally {p.dom.window.close();}
});

test("an in-flight old job cannot overwrite a later saved-head selection", async () => {
  let resolve;
  const scan = new HeadScan(()=>new Promise(done=>{resolve=done;}));
  scan.saved=[savedHead]; scan.job={id:"old-job",status:"building"};scan.key="test";
  const poll=scan.poll(); scan.selectSaved(savedHead.id);
  resolve(new Response(JSON.stringify({job:{id:"old-job",status:"completed",head:newHead}})));
  assert.equal(await poll,null);
  assert.equal(scan.head.id,savedHead.id);
});

test("Quest pairing entry opens without onboarding and explains invalid codes", async()=>{
  const p=page();
  try {
    p.$("pair-open").click();
    assert.ok(p.$("s-pair").classList.contains("on"));
    p.$("pair-code").value="bad";
    p.$("pair-form").dispatchEvent(new p.win.Event("submit",{cancelable:true}));
    await until(()=>p.$("pair-error").textContent.includes("four-letter"),"missing invalid-code feedback");
    assert.equal(p.$("pair-submit").disabled,false);
    assert.equal(p.calls.length,0);
    p.$("pair-back").click();
    assert.ok(p.$("s-hero").classList.contains("on"));
  } finally {p.dom.window.close();}
});

test("Ready automatically shows a read-only laptop mirror after Quest opens its code", async()=>{
  const p=page({mirror:true});
  try {
    await p.begin();p.$("scan-use-saved").click();await p.interview();
    await until(()=>p.win.document.querySelector('iframe[title="Live headset session"]'),"laptop mirror did not open");
    const frame=p.win.document.querySelector('iframe');
    assert.equal(new URL(frame.src).searchParams.get("spectate"),"1");
    assert.equal(new URL(frame.src).searchParams.get("mirror"),"viewer-token");
    assert.ok(p.calls.some(c=>c.url==="/api/pairings/watch/viewer-token"));
  } finally {p.dom.window.close();}
});
