(function(){
'use strict';
var defaults={secrets:'block',pii:'warn',financial:'warn',source:'warn',contract:'warn',sensitive:'warn'};
var metadata={
 secrets:['Secrets & credentials','API keys, passwords, tokens'],
 pii:['Personal data','SSNs, cards, emails, phones'],
 financial:['Financial data','Banking and company figures'],
 source:['Source code','Code-density detection'],
 contract:['Contracts & legal','Sensitive agreement language'],
 sensitive:['Sensitive context','Confidential/proprietary markers, partial keys, named credentials']
};
var actions=['allow','warn','redact','block'];
var root=document.getElementById('policies');
function render(policies){root.textContent='';Object.keys(metadata).forEach(function(key){var row=document.createElement('label');row.className='policy';var copy=document.createElement('span');copy.className='policy-label';copy.innerHTML='<strong>'+metadata[key][0]+'</strong><span>'+metadata[key][1]+'</span>';var select=document.createElement('select');select.setAttribute('aria-label',metadata[key][0]+' policy');actions.forEach(function(a){var o=document.createElement('option');o.value=a;o.textContent=a.charAt(0).toUpperCase()+a.slice(1);select.appendChild(o)});select.value=policies[key]||defaults[key];select.addEventListener('change',function(){var update={};update[key]=select.value;chrome.storage.local.set(update)});row.append(copy,select);root.appendChild(row)})}
chrome.storage.local.get(defaults,render);
document.getElementById('reset').addEventListener('click',function(){chrome.storage.local.set(defaults,function(){render(defaults)})});
chrome.tabs.query({active:true,currentWindow:true},function(tabs){var host='';try{host=new URL(tabs[0].url).hostname}catch(e){}var supported=['chatgpt.com','claude.ai','gemini.google.com'].indexOf(host)!==-1;var el=document.getElementById('site-status');el.textContent=supported?'Protecting '+host:'Open ChatGPT, Claude, or Gemini';el.style.color=supported?'#2de2c5':'#ffb020'});
})();
