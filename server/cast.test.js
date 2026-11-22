import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {Script} from 'node:vm';
const html=readFileSync(new URL('./public/cast.html',import.meta.url),'utf8');
const code=readFileSync(new URL('./public/cast.js',import.meta.url),'utf8');
function page(capture){
 const dom=new JSDOM(html,{url:'https://uncle.test/cast.html',runScripts:'outside-only'});
 const win=dom.window;
 Object.defineProperty(win.navigator,'mediaDevices',{value:{getDisplayMedia:capture}});
 win.document.getElementById('feed').play=async()=>{};
 new Script(code).runInContext(dom.getInternalVMContext());
 return {dom,win,$:id=>win.document.getElementById(id)};
}
function stream(){
 const track={stopped:0,stop(){this.stopped++},addEventListener(_type,fn){this.ended=fn}};
 return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};
}
test('viewer plays the selected local video and releases capture on stop or browser end',async()=>{
 let options;const selected=stream();const p=page(async input=>(options=input,selected));
 try{
  assert.equal(p.$('feed').hidden,true);
  await p.$('connect').onclick();
  assert.equal(options.audio,false);assert.equal(options.video.displaySurface,'window');
  assert.equal(p.$('feed').srcObject,selected);assert.equal(p.$('feed').hidden,false);
  assert.equal(p.$('connect').textContent,'Stop viewing');
  selected.track.ended();assert.equal(selected.track.stopped,1);assert.equal(p.$('feed').srcObject,null);
 }finally{p.dom.window.close()}
});
test('cancelled capture leaves a retry button and no video source',async()=>{
 const p=page(async()=>{throw Object.assign(new Error('cancelled'),{name:'NotAllowedError'})});
 try{await p.$('connect').onclick();assert.equal(p.$('connect').disabled,false);assert.equal(p.$('feed').srcObject,null);assert.match(p.$('status').textContent,/cancelled/)}finally{p.dom.window.close()}
});
test('leaving while the picker is pending stops a late capture immediately',async()=>{
 let release;const selected=stream();const p=page(()=>new Promise(resolve=>release=resolve));
 try{const pending=p.$('connect').onclick();p.win.dispatchEvent(new p.win.Event('pagehide'));release(selected);await pending;assert.equal(selected.track.stopped,1);assert.equal(p.$('feed').srcObject,null)}finally{p.dom.window.close()}
});
