(function(){
'use strict';
if(window.top!==window||window.__datoLoaded)return;window.__datoLoaded=true;
var D=window.DatoDetect;
var defaults={secrets:'block',pii:'warn',financial:'warn',source:'warn',contract:'warn',sensitive:'warn'};
var policies=Object.assign({},defaults);
var rank={allow:0,warn:1,redact:2,block:3};
var bypassUntil=0,bypassText='';
chrome.storage.local.get(defaults,function(x){policies=Object.assign({},defaults,x)});
chrome.storage.onChanged.addListener(function(changes,area){if(area!=='local')return;Object.keys(defaults).forEach(function(k){if(changes[k])policies[k]=changes[k].newValue})});

var HOST_SELECTORS={
 'chatgpt.com':['#prompt-textarea','textarea#mobile-composer-prompt','textarea[data-id="root"]','div[contenteditable="true"][data-virtualkeyboard="true"]','div[contenteditable="true"].ProseMirror','form textarea'],
 'claude.ai':['div[contenteditable="true"].ProseMirror','fieldset div[contenteditable="true"]','div[contenteditable="true"]','textarea'],
 'gemini.google.com':['div[contenteditable="true"].ql-editor','rich-textarea div[contenteditable="true"]','rich-textarea textarea','textarea']
};
var EDITABLE_SEL='textarea,[contenteditable="true"],input[type="text"]';
var SEND_SELECTORS=['button[data-testid="send-button"]','button[data-testid*="send" i]','button[aria-label*="send" i]','form button[type="submit"]'];

function visible(e){var r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.bottom>0&&r.top<(window.innerHeight||800)}
function editables(){var out=[];var nodes=document.querySelectorAll(EDITABLE_SEL);for(var i=0;i<nodes.length;i++){if(visible(nodes[i]))out.push(nodes[i])}return out}
function editor(){
 var pref=HOST_SELECTORS[location.hostname]||[];
 for(var i=0;i<pref.length;i++){var e=document.querySelector(pref[i]);if(e&&visible(e))return e}
 // Generic fallback: the visible editable closest to the bottom of the viewport - prompt composers sit at the bottom.
 var all=editables(),best=null,bestBottom=-1;
 for(var j=0;j<all.length;j++){var r=all[j].getBoundingClientRect();if(r.bottom>bestBottom){bestBottom=r.bottom;best=all[j]}}
 return best;
}
function isComposer(el){
 if(!el||!el.matches)return false;
 var ed=editor();
 if(ed&&(ed===el||ed.contains(el)))return true;
 return el.matches(EDITABLE_SEL)&&visible(el);
}
function matchesAny(el,sels){for(var i=0;i<sels.length;i++){try{if(el.matches(sels[i]))return true}catch(e){}}return false}
function isSendButton(b){return b&&!b.disabled&&visible(b)&&matchesAny(b,SEND_SELECTORS)}
function sendButtons(){var out=[];var nodes=document.querySelectorAll(SEND_SELECTORS.join(','));for(var i=0;i<nodes.length;i++){if(!nodes[i].disabled&&visible(nodes[i]))out.push(nodes[i])}return out}
function pickSendButton(ed){
 var btns=sendButtons();if(!btns.length)return null;
 var form=ed&&ed.closest?ed.closest('form'):null;
 for(var i=0;i<btns.length;i++){if(form&&form.contains(btns[i]))return btns[i]}
 if(ed){var er=ed.getBoundingClientRect(),best=null,bestDist=Infinity;
  for(var j=0;j<btns.length;j++){var br=btns[j].getBoundingClientRect();var d=Math.abs(br.top-er.top)+Math.abs(br.left-er.right);if(d<bestDist){bestDist=d;best=btns[j]}}
  return best}
 return btns[0];
}
function textOf(e){return e?(e.tagName==='TEXTAREA'||e.tagName==='INPUT'?e.value:(e.innerText||e.textContent||'')):''}
function setText(e,text){e.focus();if(e.tagName==='TEXTAREA'||e.tagName==='INPUT'){var setter=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}else{e.textContent=text;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}}
function actionFor(findings){var a='allow';findings.forEach(function(f){var p=policies[f.category]||'warn';if(f.tentative&&rank[p]>rank.warn)p='warn';if(rank[p]>rank[a])a=p});return a}
function attempt(e){var ed=editor();if(!ed)return;var text=textOf(ed).trim();if(!text)return;if(Date.now()<bypassUntil&&text===bypassText)return;var findings=D.scan(text).findings;if(!findings.length)return;var action=actionFor(findings);if(action==='allow')return;e.preventDefault();e.stopImmediatePropagation();show(action,findings,text,ed)}

// Send-button clicks (icon clicks land inside the button, so walk up).
document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(b&&isSendButton(b))attempt(e)},true);
// Enter-to-send. window capture runs before the page's own handlers.
window.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&isComposer(e.target))attempt(e)},true);
// Safety nets: newline insertion and any real form submit from the composer.
window.addEventListener('beforeinput',function(e){if(e.inputType==='insertParagraph'&&isComposer(e.target))attempt(e)},true);
document.addEventListener('submit',function(e){var ed=editor();if(ed&&e.target&&e.target.contains&&e.target.contains(ed))attempt(e)},true);

function resume(ed,text){bypassText=text;bypassUntil=Date.now()+1600;var b=pickSendButton(ed);if(b){b.click();return}ed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))}
function show(action,findings,text,ed){close();var wrap=document.createElement('div');wrap.className='dato-backdrop';wrap.id='dato-modal';var labels={block:['Blocked by policy','Remove the flagged data before sending. If you meant to share it, use Send anyway.'],warn:['Confidential data detected','Review the findings before choosing to send.'],redact:['Redaction required','Dato can replace the detected values before sending.']};var rows=findings.slice(0,6).map(function(f){return '<div class="dato-finding"><b>'+esc(f.label)+'</b><code>'+esc(f.masked)+'</code></div>'}).join('');var more=findings.length>6?'<div class="dato-more">+'+(findings.length-6)+' more finding'+(findings.length-6===1?'':'s')+'</div>':'';var buttons='<button class="dato-btn" data-dato="cancel">Go back</button>';
 if(action==='warn'||action==='block')buttons+='<button class="dato-btn dato-btn-danger" data-dato="send">Send anyway</button>';
 if(action==='redact')buttons+='<button class="dato-btn dato-btn-primary" data-dato="redact">Redact &amp; send</button>';
 wrap.innerHTML='<div class="dato-dialog dato-'+action+'" role="dialog" aria-modal="true" aria-labelledby="dato-title"><div class="dato-head"><div class="dato-logo">D</div><div><strong id="dato-title">Dato stopped this prompt</strong><span>Local AI data-leak firewall</span></div></div><div class="dato-verdict"><b>'+labels[action][0]+'</b><div>'+labels[action][1]+'</div></div><div class="dato-findings">'+rows+more+'</div><div class="dato-local">Scanned on this device. Prompt content was not stored or transmitted by Dato.</div><div class="dato-actions">'+buttons+'</div></div>';
 document.body.appendChild(wrap);sentinel('alert',findings.length+' finding'+(findings.length===1?'':'s'));
 wrap.querySelector('[data-dato="cancel"]').addEventListener('click',close);
 var send=wrap.querySelector('[data-dato="send"]');if(send)send.addEventListener('click',function(){if(action==='block'&&!send.dataset.armed){send.dataset.armed='1';send.textContent='Really send flagged data? Click again';setTimeout(function(){if(send.isConnected){delete send.dataset.armed;send.textContent='Send anyway'}},5000);return}close();resume(ed,text)});
 var redact=wrap.querySelector('[data-dato="redact"]');if(redact)redact.addEventListener('click',function(){var safe=D.redact(text,findings);setText(ed,safe);close();setTimeout(function(){resume(ed,safe)},80)});
 wrap.addEventListener('click',function(x){if(x.target===wrap)close()});document.addEventListener('keydown',escapeOnce,true)
}
function escapeOnce(e){if(e.key==='Escape')close()}
function close(){var m=document.getElementById('dato-modal');if(m)m.remove();document.removeEventListener('keydown',escapeOnce,true);sentinel('', 'Protected locally')}
function sentinel(state,label){var s=document.getElementById('dato-sentinel');if(!s){s=document.createElement('div');s.id='dato-sentinel';s.innerHTML='<i></i><span></span>';document.documentElement.appendChild(s)}s.className=state==='alert'?'dato-alert':'';s.querySelector('span').textContent='Dato · '+label}
function esc(v){var d=document.createElement('div');d.textContent=v;return d.innerHTML}
sentinel('','Protected locally');
})();
