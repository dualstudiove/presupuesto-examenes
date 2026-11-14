// Parrilla de Contenido de un cliente (Planifica).
// Portada del artefacto «Parrilla de Contenido» de claude.ai casi sin cambios: habla con el servidor a través de
// window.claude, que aquí ofrece js/conexion.js sobre la API de Planifica. Cambios respecto al artefacto:
//  · las imágenes de referencia se piden a la API (window.PLANIFICA.img + id) y se comprimen a 1080 px en WebP;
//  · los textos de «sin conexión» y «solo lectura» hablan de Planifica.
(function(){
'use strict';

/* ---------- Constants ---------- */
var MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var MON3=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var DOW=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
var DOW_LONG=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
var FORMATS={
  reel:{label:'Reel',plural:'Reels',list:'Clips a grabar'},
  carrusel:{label:'Carrusel',plural:'Carruseles',list:'Slides y material'},
  foto:{label:'Foto',plural:'Fotos',list:'Fotos a tomar'},
  historia:{label:'Historia',plural:'Historias',list:'Historias a grabar'},
  diseno:{label:'Diseño',plural:'Diseños',list:'Elementos del diseño'}
};
var FICON={"reel": "data:image/png;base64,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", "foto": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocKAAADAFBMVEVMaXE2NjbLzc5WVlYUFBTIycnBwcE7OzoZGRn+mhMJCQn+oxyLi4xRUVFycXD9nxP7hhleX2D2dBLv8fFFRUb9oBq8vsD+nBbN1+J7fH67vb0XFxf8lBT9nBWboaL9oBf9ixB9fn8EBAT9lBV1eXkSExT+oRv+oRiXmJh8foP6mBcyMjLExcago6bgvJOChYn/mhZoc35oamt3eHnFxMeeoaT8kA9NTU4wMTL+mxi2ubt1dXagqrdWWFmwsrSSiXz9pBnjegDOoW5AP0A6Ojo4ODgAAAAwMDAuLi4/P0A8PDwlJSV9f4ErKytFRUZHR0g1NjYyMzMnJycpKSl7fH6AgoQeHh8+Pj5AQUI1NTVLS0s2Nzf/hQFCQkM0NDQiIiIyMTJISUp4enxDRERRUVHW2NnZ2txTU1TU1tfT1NWDhIbd3t8bGxtoamxOTk5XWVpkZGRmZmirrK5gYGJ4eHlZXGH/fwEXFxdvb3DOz9D/iAGur7FzdXf///z/jQF6fYBKTU+HioxcXFxfZGjQ0tNxcnNCQkKEh4np6ur/lwn/sB9RVVkLCwwHBwf/0AGlpqdtbGzQ09W1t7n/oxNMT1WVjIO5u73/qR3/1gJaYmjDxMV7e3o4PEGoqaqxs7WLjpCbnZ9ESU+YmZuclIv/owH+nA9qbnBYVVUoMTsRERKKjI2goqT/3wX/kgT/xgPk5OX6hQWwqKOTlZf/qRRBRUr/6m7rgw3DzNf/jAn/3me7trH/7EapZhT/71q2r6r/sAH/vAT5vDijmpP/9sv/6DOqopvgrnX//Ov/8rT/2Tpzf4zykynBvbn/3iXyzm3ppFX/yjn/8IOyej3/1Rv/8Jc3Qk8UHCfbgx/Dr5OwucT/9mqNkZXPv67vmz37kRe9w8v6zVPJfy3QdQ6xg1FnUTuWXyNbQh/Ny8iTgm6DbFNOQDFsRh3Vl0NjYFj3+PnFnh//3FFPSER2WTn9ozmFViNeQwXW0s2/bhM0JQDb19O1nHTWxINBMyXWybu9lGImGQDviyIpAAAA73RSTlMA5v70HP77Ai0CNP3v9zT8F/AL/vCzrsL+SuYmPnkc5CzvNGIdE8/w4UmY5+es/pmk/u/cJ0BT7TmKne3+xnZt2Eu3+////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////kSUwFMAAAAJcEhZcwAACxIAAAsSAdLdfvwAABUhSURBVGje7Zp3WBtnmsA5EuzluATH2cS5xD4758ROnE3PJdv37p4ZNDPSjGbUZkZipJFGWCBQQ3TLSAgQFtj0ADadGIMxtjG4gEvc4xZ3O3Z6r5vdZHu79s4I7PWz+1ec3HP3PPsC6ry/7+3ffJCU9Df5fySp37B6kG+Wt3jRN2pDatL8JXP+nDBnzo1vfw3wJX9GSE16dsF1nalJc+fPvXkTFtTOu0aAZ3f9OeB7C27ahNSkRUuvE1KT7lo4d+Yx6F865+Z9BDrbZwjgkyXt8xM6Ibu+V7vsa4hBatLi2rRpgmLOgmlW6rLatPlfC2DOwva02rvmKimzuL39rgRq7hO17Uvm3iwgsdYnatMShNSkZbXtC+fID+beVZvWvuBriEBi2WkJghyCNMUvc0B/2tKbrsHUOakzPkpLlwmLloK3FkC5zQP94Kybj+9d81MTPjrTDoSkZ9tlUNKiJbXp6Wnti7+aAXJ3mz3z5In2eYvnJM1vH3znfHp67bJlEwcPtvzr/CW18YPtLQtvpghSlS4KsZxXO7FwwaIlE2mXdgymt6cNvvNOPG1pe/zgVPrEVyyCuc8uvtZggLFo4cTExMKFLYNTl6YG09PiU1Pxlpb4wfMH4+lftQgWLUtfOu+JBc8uSkT42ZaW9JaWlsGD589PDQ627NjRMhg/d35fesu8uUmz/4qkyq/+FbWzp39kmT9vonaiJX0hYMCaBS3p6e2DcVD92pfxtNdea9987rV95+Iti79yBGYnzf63eRPyuicmWuIL56XD8r+sldW+9uW5ffsOntu3Z097fOlPHv7HhDz8sPzz8MPK83+R5fYHpvX8+G5FHn300ccffzBp9k8e/f61p8uWtgympw+214JH4nHQfuLEvks79uzbAdp3HDk9uPnsPcuX5y4HyVquSFbW8qzs5FltPStWzEq+9wEF8EDyyjtX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", "diseno": "data:image/png;base64,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", "carrusel": "data:image/png;base64,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","historia":"data:image/png;base64,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"};
function fIcon(k){return FICON[k]?'<img class="fi" src="'+FICON[k]+'" alt="" aria-hidden="true">':''}
var FORMAT_ORDER=['reel','foto','carrusel','historia','diseno'];
var STATUS={idea:'Idea',porproducir:'Por producir',produccion:'En producción',listo:'Listo',publicado:'Publicado'};
var PLATFORMS={ig:'Instagram',tt:'TikTok'};
var PLAT_ABBR={ig:'IG',tt:'TT'};

/* ---------- Helpers ---------- */
var main=document.getElementById('main');
var now=new Date();
function $(s,r){return (r||document).querySelector(s)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return String(n).padStart(2,'0')}
function ymd(y,m,d){return y+'-'+pad(m+1)+'-'+pad(d)}
function todayStr(){var d=new Date();return ymd(d.getFullYear(),d.getMonth(),d.getDate())}
function dateObj(s){var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
function dowMon(dt){return (dt.getDay()+6)%7}
function monthKey(y,m){return y+'-'+pad(m+1)}
function fmtLong(s){var dt=dateObj(s);return DOW_LONG[dowMon(dt)]+' '+dt.getDate()+' de '+MONTHS[dt.getMonth()].toLowerCase()}
function whenTxt(p){if(!p.date)return 'sin fecha';var dt=dateObj(p.date);return DOW[dowMon(dt)].toLowerCase()+' '+dt.getDate()+' '+MON3[dt.getMonth()]+(p.time?' · '+p.time:'')}
function platTxt(p){return (p.platforms||[]).map(function(k){return PLATFORMS[k]}).filter(Boolean).join(' + ')}
function platAbbr(p){return ['ig','tt'].filter(function(k){return (p.platforms||[]).indexOf(k)>=0}).map(function(k){return PLAT_ABBR[k]}).join(', ')}
function plural(n,one,many){return n+' '+(n===1?one:many)}
function relTime(ts){
  var s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60)return 'justo ahora';
  if(s<3600)return 'hace '+Math.floor(s/60)+' min';
  if(s<86400)return 'hace '+Math.floor(s/3600)+' h';
  var d=new Date(ts);return 'el '+d.getDate()+' '+MON3[d.getMonth()];
}
function isShootDefault(f){return f==='reel'||f==='foto'}
function defaultPlats(f){return f==='reel'?['ig','tt']:['ig']}
function newId(pfx){return pfx+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
var EXT_SVG='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2.5H3a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h5.5a1 1 0 0 0 1-1V7M7 2h3v3M10 2L5.5 6.5"/></svg>';
function extractLinks(text){
  var out=[],seen={};
  (String(text||'').match(/(?:https?:\/\/|www\.)[^\s<>"]+/gi)||[]).forEach(function(raw){
    var u=raw.replace(/[.,;:!?)\]}'"]+$/,'');
    if(/^www\./i.test(u))u='https://'+u;
    try{
      var x=new URL(u);
      if(x.protocol!=='http:'&&x.protocol!=='https:')return;
      if(seen[x.href])return; seen[x.href]=1;
      out.push({href:x.href,label:x.hostname.replace(/^www\./,'')+(x.pathname.length>1?x.pathname:'')});
    }catch(e){}
  });
  return out;
}
function linksHtml(text,cls){
  var l=extractLinks(text); if(!l.length)return '';
  return '<div class="links'+(cls?' '+cls:'')+'">'+l.map(function(x){
    return '<a href="'+esc(x.href)+'" target="_blank" rel="noopener noreferrer">'+EXT_SVG+'<span>'+esc(x.label)+'</span></a>';
  }).join('')+'</div>';
}

function getShots(p){
  if(Array.isArray(p.shots)) return p.shots;
  return String(p.shotList||'').split('\n').map(function(x){return x.trim()}).filter(Boolean).map(function(t){return {t:t,d:false}});
}
function shotCount(p){var a=getShots(p);return {n:a.length,d:a.filter(function(x){return x.d}).length}}
function isTaken(p){var c=shotCount(p);return c.n?c.d===c.n:!!p.shotDone}
function voiceLines(p){return String(p.voice||'').split('\n').map(function(x){return x.trim()}).filter(Boolean)}
function copyShots(p){return getShots(p).map(function(x){return {t:x.t,d:!!x.d}})}
function setShots(p,arr,delay){p.shots=arr;queueSave('posts/'+p.id,{shots:arr},delay==null?600:delay)}
function toggleTaken(p){
  var sh=copyShots(p);
  if(sh.length){var all=sh.every(function(x){return x.d});setShots(p,sh.map(function(x){return {t:x.t,d:!all}}),0)}
  else{p.shotDone=!p.shotDone;queueSave('posts/'+p.id,{shotDone:p.shotDone},0)}
}

function refImgs(p){return Array.isArray(p.refImgs)?p.refImgs.filter(function(x){return x&&x.id}):[]}
function hasRefs(p){return refImgs(p).length>0||extractLinks(p.refs).length>0}
function lines(t){return String(t||'').split('\n').map(function(x){return x.trim()}).filter(Boolean)}
function cap(t){t=String(t||'');return t.charAt(0).toUpperCase()+t.slice(1)}
function fmtShort(ds){var d=dateObj(ds);return d.getDate()+' '+MON3[d.getMonth()]}

/* ---------- State ---------- */
var S={
  posts:new Map(), goals:new Map(), account:{},
  view:'lista', postId:null, last:'lista', detailBuilt:null,
  cy:now.getFullYear(), cm:now.getMonth(), selDay:null,
  f:{plat:'all',fmt:'all',st:'all',q:''},
  group:'tipo', showDone:true, filtersOpen:false, goalsEdit:false, pdfBusy:false, assets:null, refBusy:false, needsRender:false, lgroup:'fecha', mdel:'', mcol:(function(){try{return JSON.parse(localStorage.getItem('pc_mcol')||'{}')||{}}catch(e){return {}}})(), noClick:false,
  loaded:{posts:false,goals:false}, slow:false, booted:false,
  canWrite:true, uid:null, names:{}, focusTitle:false, roToast:false
};
var db=null, userCap=null;

function allPosts(){return Array.from(S.posts.values())}
function cmp(a,b){
  return (a.date||'9999').localeCompare(b.date||'9999')
    || (a.time||'99:99').localeCompare(b.time||'99:99')
    || (a.createdAt||0)-(b.createdAt||0);
}
function inMonth(p,y,m){return !!p.date && p.date.indexOf(monthKey(y,m)+'-')===0}
function passes(p){
  var f=S.f;
  if(f.plat!=='all' && (p.platforms||[]).indexOf(f.plat)<0) return false;
  if(f.fmt!=='all' && p.format!==f.fmt) return false;
  if(f.st!=='all' && p.status!==f.st) return false;
  if(f.q){
    var hay=((p.title||'')+' '+(p.copy||'')+' '+(p.hashtags||'')+' '+(p.direction||'')).toLowerCase();
    if(hay.indexOf(f.q.toLowerCase())<0) return false;
  }
  return true;
}
function stats(y,m){
  var o={total:0,pub:0,by:{},stories:0};
  allPosts().forEach(function(p){
    if(!inMonth(p,y,m))return;
    if(p.format==='historia'){o.stories++;return}
    o.total++; if(p.status==='publicado')o.pub++;
    o.by[p.format]=(o.by[p.format]||0)+1;
  });
  return o;
}

/* ---------- Toast ---------- */
var toastT=null;
function toast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('on');
  clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('on')},2600);
}

/* ---------- Writes ---------- */
var pending={}, chain={};
function canW(){
  if(S.canWrite) return true;
  toast('Solo lectura: pide a un administrador acceso de editor.');
  return false;
}
function queueSave(path,patch,delay){
  if(!db||!canW()) return;
  var e=pending[path]||(pending[path]={patch:{},timer:null});
  Object.assign(e.patch,patch);
  clearTimeout(e.timer);
  if(delay===0) flush(path); else e.timer=setTimeout(function(){flush(path)},delay==null?500:delay);
}
function flush(path){
  var e=pending[path]; if(!e) return;
  clearTimeout(e.timer); delete pending[path];
  var patch=Object.assign({},e.patch,{updatedAt:Date.now(),updatedBy:S.uid||null});
  chain[path]=(chain[path]||Promise.resolve()).then(function(){
    var ref=db.doc(path);
    return ref.update(patch).catch(function(err){
      if(err&&err.code==='invalid_argument'){
        if(path.indexOf('posts/')!==0){
          return ref.set(Object.assign({createdAt:Date.now(),createdBy:S.uid||null},patch)).catch(fail);
        }
        toast('No se pudo guardar. Puede que el post haya sido eliminado.');
        return;
      }
      fail(err);
    });
  });
}
function flushAll(){Object.keys(pending).forEach(flush)}
function fail(err){
  toast(err&&err.code==='quota_exceeded'?'Se alcanzó el límite de almacenamiento.':'No se pudo guardar. Revisa tu conexión.');
}
function createPost(data){
  if(!db||!canW()) return Promise.resolve(null);
  var id=newId('p'), fmt=(data&&data.format)||'reel', ts=Date.now();
  var doc=Object.assign({
    title:'',format:fmt,platforms:defaultPlats(fmt),date:'',time:'',status:'idea',
    direction:'',copy:'',hashtags:'',shoot:isShootDefault(fmt),shots:[],voice:'',location:'',props:'',refs:'',shotDone:false,
    createdAt:ts,createdBy:S.uid||null,updatedAt:ts,updatedBy:S.uid||null
  },data||{});
  S.posts.set(id,Object.assign({id:id},doc));
  return db.doc('posts/'+id).set(doc).then(function(){return id}).catch(function(e){S.posts.delete(id);fail(e);return null});
}
function deletePost(id){
  if(!db||!canW()) return;
  S.posts.delete(id);
  db.doc('posts/'+id).delete().catch(fail);
}

/* ---------- Routing ---------- */
var LISTS=['lista','calendario','objetivos','pauta'];
function route(){
  var h=location.hash.replace(/^#/,'');
  if(h.indexOf('post-')===0){S.view='detalle';S.postId=h.slice(5)}
  else if(LISTS.indexOf(h)>=0){S.view=h;S.postId=null}
  else {S.view='lista';S.postId=null}
  if(S.view==='lista'||S.view==='calendario') S.last=S.view;
  if(S.view!=='objetivos') S.goalsEdit=false;
}
function go(h){
  if(location.hash==='#'+h){route();render(true)} else location.hash=h;
}
window.addEventListener('hashchange',function(){flushAll();route();render(true)});
window.addEventListener('pagehide',flushAll);
document.addEventListener('visibilitychange',function(){if(document.hidden)flushAll()});

function setNav(){
  var cur=S.view==='detalle'?S.last:S.view;
  document.querySelectorAll('[data-nav]').forEach(function(a){
    if(a.dataset.nav===cur)a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
}

/* ---------- Shared fragments ---------- */
function shift(n){
  var m=S.cm+n,y=S.cy;
  while(m<0){m+=12;y--} while(m>11){m-=12;y++}
  S.cm=m;S.cy=y;S.selDay=null;
}
function monthBar(){
  var q=S.view==='objetivos', qn=Math.floor(S.cm/3);
  var title=q?('T'+(qn+1)+' <span>'+S.cy+'</span>'):(MONTHS[S.cm]+' <span>'+S.cy+'</span>');
  var sub=q?'<small>'+MONTHS[qn*3]+' – '+MONTHS[qn*3+2]+'</small>':'';
  return '<div class="monthbar"><div class="mb-nav">'
    +'<button class="icon-btn" type="button" data-act="prev" aria-label="'+(q?'Trimestre anterior':'Mes anterior')+'">‹</button>'
    +'<h2>'+title+'</h2>'+sub
    +'<button class="icon-btn" type="button" data-act="next" aria-label="'+(q?'Trimestre siguiente':'Mes siguiente')+'">›</button></div>'
    +'<button class="btn ghost" type="button" data-act="today">'+(q?'Este trimestre':'Hoy')+'</button></div>';
}
function stPill(s){return '<span class="st st-'+esc(s||'idea')+'"><i></i>'+esc(STATUS[s]||'Idea')+'</span>'}
function notices(){
  var h='';
  if(!S.canWrite) h+='<div class="note"><span>Solo lectura. Pide a un administrador acceso de editor para hacer cambios.</span></div>';
  var ex=allPosts().filter(function(p){return p.example});
  if(ex.length) h+='<div class="note"><span>Hay '+plural(ex.length,'post de ejemplo','posts de ejemplo')+' en el calendario.</span><button class="btn sm" type="button" data-act="rmexamples">Borrar ejemplos</button></div>';
  return h;
}
var FILTER_SVG='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5h12l-4.6 5.4v3.6L6.6 14V8.9z"/></svg>';
var EYE_SVG='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>';
var EYEOFF_SVG='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/></svg>';
function liHtml(t){return '<li>'+esc(t)+'</li>'}
function liDone(t,g){return '<li'+(((g&&g.objDone)||[]).indexOf(t)>=0?' class="od"':'')+'>'+esc(t)+'</li>'}
function brief(){
  var y=S.cy,m=S.cm, qn=Math.floor(m/3)+1;
  var g=S.goals.get('m-'+monthKey(y,m))||{}, qg=S.goals.get('q-'+y+'-'+qn)||{};
  var st=stats(y,m), objs=lines(g.objectives), tgt=Number(g.postTarget)||0;
  var def='<p class="hg-empty">Sin definir. <a class="lnk" href="#objetivos">Definir</a></p>';
  var h='<section class="hd" aria-label="Resumen de '+MONTHS[m].toLowerCase()+'">';
  h+='<div class="hg"><span class="k">Tema del mes</span>'+(g.theme?'<p class="hg-main">'+esc(g.theme)+'</p>':def)+(qg.theme?'<p class="hg-sub">T'+qn+' · '+esc(qg.theme)+'</p>':'')+'</div>';
  h+='<div class="hg"><span class="k">Objetivos</span>';
  if(objs.length){
    h+='<ul class="objl">'+objs.slice(0,3).map(function(t){return liDone(t,g)}).join('')+'</ul>';
    if(objs.length>3)h+='<details class="more"><summary>+'+(objs.length-3)+' más</summary><ul class="objl">'+objs.slice(3).map(function(t){return liDone(t,g)}).join('')+'</ul></details>';
  } else h+=def;
  h+='</div>';
  var pct=tgt?Math.min(100,Math.round(st.total/tgt*100)):(st.total?Math.round(st.pub/st.total*100):0);
  var mix=FORMAT_ORDER.filter(function(f){return st.by[f]}).map(function(f){return '<span class="tag f-'+f+'">'+fIcon(f)+st.by[f]+' '+(st.by[f]===1?FORMATS[f].label:FORMATS[f].plural).toLowerCase()+'</span>'}).join('');
  if(st.stories)mix+='<span class="tag f-historia">'+fIcon('historia')+plural(st.stories,'historia','historias')+'</span>';
  var smix='';
  h+='<div class="hg"><span class="k">Posts</span><p class="hg-main"><b class="big">'+st.total+'</b> '+(tgt?'de '+tgt+' planificados':(st.total===1?'planificado':'planificados'))+'</p>'
    +'<div class="bar" aria-hidden="true"><i style="width:'+pct+'%;background:var(--accent)"></i></div>'
    +'<p class="hg-sub">'+plural(st.pub,'publicado','publicados')+' · '+plural(st.total-st.pub,'pendiente','pendientes')+'</p>'
    +(mix?'<div class="mix">'+mix+'</div>':'')+smix+'</div></section>';
  return h;
}
function activeFilters(){var f=S.f;return (f.plat!=='all'?1:0)+(f.fmt!=='all'?1:0)+(f.st!=='all'?1:0)+(f.q?1:0)}
function filters(legend,isList){
  var f=S.f, n=activeFilters();
  var h='<div class="toolbar"><button class="btn filter-btn" type="button" data-act="togfilters" aria-expanded="'+S.filtersOpen+'" aria-controls="fpanel">'+FILTER_SVG+'<span>Filtros</span>'+(n?'<span class="badge" aria-label="'+plural(n,'filtro activo','filtros activos')+'">'+n+'</span>':'')+'</button>';
  if(n)h+='<button class="btn ghost sm" type="button" data-act="clearfilters">Limpiar</button>';
  if(isList&&S.lgroup==='estado')h+='<span class="hits">Agrupado por estado</span>';
  if(legend)h+='<div class="legend">'+FORMAT_ORDER.map(function(k){return '<span class="tag f-'+k+'">'+fIcon(k)+FORMATS[k].label+'</span>'}).join('')+'</div>';
  h+='</div>';
  if(S.filtersOpen){
    h+='<div class="fpanel" id="fpanel">'+(isList?'<div class="fld"><span class="lbl">Agrupar por</span><div class="seg" role="group" aria-label="Agrupar por">'+[['fecha','Fecha'],['estado','Estado']].map(function(x){return '<button type="button" data-act="lgroup" data-v="'+x[0]+'" aria-pressed="'+(S.lgroup===x[0])+'">'+x[1]+'</button>'}).join('')+'</div></div>':'')+'<div class="fld"><span class="lbl">Plataforma</span><div class="seg" role="group" aria-label="Plataforma">'
      +[['all','Todas'],['ig','Instagram'],['tt','TikTok']].map(function(x){return '<button type="button" data-act="fplat" data-v="'+x[0]+'" aria-pressed="'+(f.plat===x[0])+'">'+x[1]+'</button>'}).join('')+'</div></div>'
      +'<div class="fld"><label for="fq-fmt">Formato</label><select id="fq-fmt" class="in" data-fsel="fmt"><option value="all">Todos</option>'+FORMAT_ORDER.map(function(k){return '<option value="'+k+'"'+(f.fmt===k?' selected':'')+'>'+FORMATS[k].label+'</option>'}).join('')+'</select></div>'
      +'<div class="fld"><label for="fq-st">Estado</label><select id="fq-st" class="in" data-fsel="st"><option value="all">Todos</option>'+Object.keys(STATUS).map(function(k){return '<option value="'+k+'"'+(f.st===k?' selected':'')+'>'+STATUS[k]+'</option>'}).join('')+'</select></div>'
      +'<div class="fld"><label for="fq">Buscar</label><input id="fq" class="in" type="search" placeholder="Título, copy o hashtags" value="'+esc(f.q)+'" autocomplete="off"></div></div>';
  }
  return h;
}
function loadingBlock(){
  if(db===null&&S.booted) return '<div class="empty"><h3>No se pudo conectar con el servidor</h3><p>Revisa tu conexión y vuelve a cargar la página.</p></div>';
  return '<div class="empty"><p>'+(S.slow?'Conectando con los datos compartidos… está tardando más de lo normal.':'Cargando el plan…')+'</p></div>';
}
function emptyAll(){
  return '<div class="empty"><h3>Aún no hay posts planificados</h3><p>Crea el primero o carga unos ejemplos para ver cómo funciona la lista, el calendario y la pauta.</p><div class="acts"><button class="btn primary" type="button" data-act="new">+ Nuevo post</button><button class="btn" type="button" data-act="examples">Cargar ejemplos</button></div></div>';
}
function stSelect(p){
  var cur=STATUS[p.status]?p.status:'idea';
  if(!S.canWrite)return stPill(cur);
  return '<label class="st stsel st-'+cur+'" title="Cambiar estado"><i></i><span>'+esc(STATUS[cur])+'</span><svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>'
    +'<select data-stsel="'+esc(p.id)+'" aria-label="Estado de '+esc(p.title||'Sin título')+'">'+Object.keys(STATUS).map(function(k){return '<option value="'+k+'"'+(k===cur?' selected':'')+'>'+STATUS[k]+'</option>'}).join('')+'</select></label>';
}
function row(p,drag){
  var f=FORMATS[p.format]||FORMATS.reel, d=p.date?dateObj(p.date):null, pl=platAbbr(p);
  return '<div class="row f-'+esc(p.format)+'"'+(drag?' data-drag="'+esc(p.id)+'"':'')+'>'
    +'<div class="rd">'+(d?'<b>'+d.getDate()+'</b><span>'+DOW[dowMon(d)]+'</span>'+(p.time?'<span class="rt">'+esc(p.time)+'</span>':''):'<b>–</b><span>idea</span>')+'</div>'
    +'<div><div class="t"><a class="rlink" href="#post-'+esc(p.id)+'" draggable="false">'+(p.title?esc(p.title):'<em>Sin título</em>')+'</a></div>'
    +'<div class="meta"><span class="tag">'+fIcon(p.format)+f.label+'</span>'+(pl?'<span class="pl">'+pl+'</span>':'')+'</div></div>'
    +stSelect(p)+'</div>';
}

/* ---------- Views ---------- */
function viewLista(){
  var y=S.cy,m=S.cm;
  var items=allPosts().filter(function(p){return inMonth(p,y,m)&&passes(p)}).sort(cmp);
  var undated=allPosts().filter(function(p){return !p.date&&passes(p)}).sort(cmp);
  var h=notices()+monthBar()+brief()+filters(false,true);
  if(!S.loaded.posts&&!S.posts.size) h+=loadingBlock();
  else if(!S.posts.size) h+=emptyAll();
  else {
    if(!items.length) h+='<div class="empty"><h3>Nada en '+MONTHS[m].toLowerCase()+(activeFilters()?' con estos filtros':'')+'</h3><p>Crea un post o muévete a otro mes.</p><div class="acts"><button class="btn primary" type="button" data-act="new">+ Nuevo post</button></div></div>';
    var cur=null;
    if(S.lgroup==='estado'){
      var all2=items.concat(undated);
      Object.keys(STATUS).forEach(function(k){
        var g=all2.filter(function(p){return (STATUS[p.status]?p.status:'idea')===k});
        if(g.length)h+='<section class="day-group"><h3 class="day-h">'+STATUS[k]+' <span>· '+g.length+'</span></h3><div class="rows">'+g.map(function(p){return row(p)}).join('')+'</div></section>';
      });
      items=[];undated=[];
    }
    items.forEach(function(p){
      if(p.date!==cur){ if(cur!==null) h+='</div></section>'; cur=p.date;
        h+='<section class="day-group"><h3 class="day-h">'+cap(fmtLong(p.date))+(p.date===todayStr()?' <span>· hoy</span>':'')+'</h3><div class="rows">'; }
      h+=row(p);
    });
    if(cur!==null) h+='</div></section>';
    if(undated.length) h+='<section class="day-group"><h3 class="day-h">Sin fecha <span>· banco de ideas · '+undated.length+'</span></h3><div class="rows">'+undated.map(function(p){return row(p)}).join('')+'</div></section>';
  }
  main.innerHTML=h;
}
function chip(p){
  var pub=p.status==='publicado', st=STATUS[p.status]?p.status:'idea', f=FORMATS[p.format]||FORMATS.reel, pl=platAbbr(p);
  return '<a class="chip f-'+esc(p.format)+(pub?' pub':'')+'" href="#post-'+esc(p.id)+'" data-drag="'+esc(p.id)+'" draggable="false" title="'+esc(p.title||'Sin título')+'">'
    +'<span class="ct">'+(esc(p.title)||'Sin título')+'</span>'
    +'<span class="cm">'+(p.time?'<em>'+esc(p.time)+'</em>':'')+'<i>'+fIcon(p.format)+f.label+'</i>'+(pl?'<b>'+pl+'</b>':'')+'</span>'
    +'<span class="cs cs-'+st+'"><u></u>'+esc(STATUS[st])+'</span></a>';
}
function viewCal(){
  var y=S.cy,m=S.cm, first=new Date(y,m,1), lead=dowMon(first), dim=new Date(y,m+1,0).getDate();
  var total=Math.ceil((lead+dim)/7)*7, by={}, today=todayStr();
  allPosts().filter(passes).forEach(function(p){if(p.date)(by[p.date]=by[p.date]||[]).push(p)});
  Object.keys(by).forEach(function(k){by[k].sort(cmp)});
  if(!S.selDay||S.selDay.indexOf(monthKey(y,m))!==0) S.selDay=today.indexOf(monthKey(y,m))===0?today:ymd(y,m,1);
  var cells=DOW.map(function(d){return '<div class="dow">'+d+'</div>'}).join('');
  for(var i=0;i<total;i++){
    var dt=new Date(y,m,i-lead+1), ds=ymd(dt.getFullYear(),dt.getMonth(),dt.getDate()), list=by[ds]||[];
    cells+='<div class="day'+(dt.getMonth()!==m?' out':'')+(ds===today?' today':'')+(ds===S.selDay?' sel':'')+'" data-date="'+ds+'" data-act="selday">'
      +'<div class="day-top"><span class="dn">'+dt.getDate()+'</span><button class="add" type="button" data-act="add" data-date="'+ds+'" aria-label="Nuevo post el '+dt.getDate()+' de '+MONTHS[dt.getMonth()].toLowerCase()+'">+</button></div>'
      +'<div class="chips">'+list.map(chip).join('')+'</div></div>';
  }
  var sel=by[S.selDay]||[];
  var h=notices()+monthBar()+brief()+filters(true);
  if(!S.loaded.posts&&!S.posts.size) h+=loadingBlock();
  else {
    h+='<div class="cal">'+cells+'</div>';
    h+='<section class="agenda"><h3 class="day-h">'+cap(fmtLong(S.selDay))+'</h3>'
      +(S.canWrite&&sel.length?'<p class="tip">Mantén presionada una tarjeta y arrástrala a otro día para cambiar su fecha.</p>':'')
      +'<div class="rows">'+(sel.length?sel.map(function(p){return row(p,true)}).join(''):'<p class="muted">Nada planificado este día.</p>')+'</div>'
      +'<button class="btn" type="button" data-act="add" data-date="'+S.selDay+'">+ Nuevo post este día</button></section>';
    if(!S.posts.size) h+='<div style="margin-top:16px">'+emptyAll()+'</div>';
  }
  main.innerHTML=h;
}
function goalField(id,field,label,kind,ph,val){
  var fid='g-'+id+'-'+field, ctl;
  if(kind==='area') ctl='<textarea class="in" id="'+fid+'" data-g="'+id+'" data-gf="'+field+'" rows="4" placeholder="'+esc(ph)+'">'+esc(val||'')+'</textarea>';
  else ctl='<input class="in" id="'+fid+'" data-g="'+id+'" data-gf="'+field+'" type="'+(kind==='num'?'number':'text')+'"'+(kind==='num'?' min="0" inputmode="numeric"':'')+' placeholder="'+esc(ph)+'" value="'+esc(val==null?'':val)+'">';
  return '<div class="fld"><label for="'+fid+'">'+label+'</label>'+ctl+'</div>';
}
function gRead(label,html){return '<div class="fld"><span class="lbl">'+label+'</span>'+html+'</div>'}
var G_EMPTY='<p class="gv-empty">Sin definir</p>';
function gTheme(id,g,edit,label){
  return edit?goalField(id,'theme',label,'text','Ej. Mostrar el proceso detrás del producto',g.theme)
    :gRead(label,g.theme?'<p class="gv-theme">'+esc(g.theme)+'</p>':G_EMPTY);
}
function gObjs(id,g,edit){
  var ls=lines(g.objectives), done=g.objDone||[];
  if(edit)return goalField(id,'objectives','Objetivos (uno por línea)','area','Ej.\nSubir la frecuencia a 4 posts por semana\nConvertir 3 reels en recurrentes',g.objectives);
  if(!ls.length)return gRead('Objetivos',G_EMPTY);
  return gRead('Objetivos','<ul class="gv-chk">'+ls.map(function(t,i){
    var d=done.indexOf(t)>=0;
    return '<li class="'+(d?'od':'')+'"><button class="ck" type="button" role="checkbox" aria-checked="'+d+'" aria-label="Cumplido: '+esc(t)+'" data-act="objdone" data-gid="'+esc(id)+'" data-i="'+i+'"'+(S.canWrite?'':' disabled')+'>'+CHECK_SVG+'</button><span>'+esc(t)+'</span></li>';
  }).join('')+'</ul>');
}
//CALC-START
function parseNum(v){
  if(v==null)return null;
  var t=String(v).trim().replace(/\s/g,'').replace(/%$/,'');
  if(!t)return null;
  if(t.indexOf(',')>=0)t=t.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,'');
  var n=Number(t);
  return isFinite(n)?n:null;
}
function decOf(n){var s=String(n),i=s.indexOf('.');return i<0?0:Math.min(2,s.length-i-1)}
function fmtNum(n,d){
  if(n==null||!isFinite(n))return '–';
  var s=Math.abs(n).toFixed(d||0).split('.');
  s[0]=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return (n<0?'−':'')+s.join(',');
}
function sgnNum(n,d){return (n>0?'+':'')+fmtNum(n,d)}
function valStr(n){return n==null||n===''?'':String(n).replace('.',',')}
function hasNum(v){return v!=null&&v!==''&&isFinite(Number(v))}
/* Hitos: crecimiento compuesto (el primer mes es el más lento). Con un mes ajustado, los otros dos se reparten el resto. */
function calcMilestones(cur,tar,pin){
  if(!hasNum(cur)||!hasNum(tar))return null;
  cur=Number(cur);tar=Number(tar);
  var pm=-1,pd=0;
  if(pin&&pin.m>=0&&pin.m<=2&&hasNum(pin.d)){pm=Number(pin.m);pd=Number(pin.d)}
  var d=Math.max(decOf(cur),decOf(tar),pm>=0?decOf(pd):0), k=Math.pow(10,d);
  function rnd(x){return Math.round(x*k)/k}
  var total=tar-cur, w=[1,1,1];
  if(cur>0&&tar>0&&cur!==tar){var g=Math.pow(tar/cur,1/3);w=[1,g,g*g]}
  var delta=[0,0,0], warn=false;
  if(pm>=0){
    var o=[0,1,2].filter(function(i){return i!==pm}), rem=total-pd, ws=w[o[0]]+w[o[1]];
    delta[pm]=pd;
    o.forEach(function(i){delta[i]=rem*w[i]/ws});
    if(total!==0&&(rem*total<0||pd*total<0))warn=true;
  } else {
    var s3=w[0]+w[1]+w[2];
    for(var i=0;i<3;i++)delta[i]=total*w[i]/s3;
  }
  var E=[cur+delta[0],cur+delta[0]+delta[1],tar], R=[];
  for(var j=0;j<3;j++){var prev=j?R[j-1]:cur;R[j]=(j===pm&&j<2)?rnd(prev+pd):rnd(E[j])}
  R[2]=rnd(tar);
  return {end:R,inc:[rnd(R[0]-cur),rnd(R[1]-R[0]),rnd(R[2]-R[1])],d:d,warn:warn,pm:pm};
}
function monthEnded(y,mi){return todayStr()>ymd(y,mi,new Date(y,mi+1,0).getDate())}
function msStatus(m,i,ms,y,mi){
  var real=m.real&&m.real[i], has=hasNum(real), dir=Number(m.tar)>=Number(m.cur)?1:-1;
  var reached=has&&(dir>0?Number(real)>=ms.end[i]:Number(real)<=ms.end[i]);
  if(reached)return {k:'ok',t:'Cumplido'};
  if(monthEnded(y,mi))return has?{k:'bad',t:'No cumplido'}:{k:'miss',t:'Sin registrar'};
  return has?{k:'run',t:'En curso'}:{k:'pend',t:'Pendiente'};
}
function qStatus(m,y,qn){
  var last=-1;
  for(var i=0;i<3;i++)if(hasNum(m.real&&m.real[i]))last=i;
  var c=Number(m.cur),t=Number(m.tar),dir=t>=c?1:-1, real=last>=0?Number(m.real[last]):null;
  var reached=real!=null&&(dir>0?real>=t:real<=t), pct=null;
  if(real!=null&&t!==c)pct=Math.max(0,Math.min(100,Math.round((real-c)/(t-c)*100)));
  var s;
  if(reached)s={k:'ok',t:'Objetivo cumplido'};
  else if(monthEnded(y,qn*3+2))s=real!=null?{k:'bad',t:'No cumplido'}:{k:'miss',t:'Sin registrar'};
  else s=real!=null?{k:'run',t:'En curso'}:{k:'pend',t:'Pendiente'};
  s.pct=pct;return s;
}
//CALC-END
function mpill(s){var c={ok:'st-listo',bad:'st-bad',run:'st-produccion',pend:'st-idea',miss:'st-porproducir'}[s.k];return '<span class="st '+c+'"><i></i>'+esc(s.t)+'</span>'}
function metricList(g,pl){return (g&&g.metrics&&Array.isArray(g.metrics[pl]))?g.metrics[pl].filter(function(m){return m&&m.id}):[]}
function saveMetrics(gid,fn){
  if(!canW())return;
  var g=S.goals.get(gid)||{id:gid}, src=g.metrics||{};
  var nm={ig:JSON.parse(JSON.stringify(src.ig||[])),tt:JSON.parse(JSON.stringify(src.tt||[]))};
  fn(nm);
  S.goals.set(gid,Object.assign({},g,{metrics:nm}));
  queueSave('goals/'+gid,{metrics:nm},300);
}
function editMetric(gid,pl,mid,fn){
  saveMetrics(gid,function(nm){var a=nm[pl]||[];for(var i=0;i<a.length;i++)if(a[i].id===mid){fn(a[i]);return}});
}
function hitCount(g,y,qn){
  var tot=0,ok=0;
  ['ig','tt'].forEach(function(pl){metricList(g,pl).forEach(function(m){
    var ms=calcMilestones(m.cur,m.tar,m.pin); if(!ms)return;
    for(var i=0;i<3;i++){tot++;if(msStatus(m,i,ms,y,qn*3+i).k==='ok')ok++}
  })});
  return {tot:tot,ok:ok};
}
function metricCard(gid,g,pl,m,edit,y,qn){
  var ms=calcMilestones(m.cur,m.tar,m.pin), uid=m.id, key=gid+'|'+pl+'|'+uid+'|', ro=S.canWrite?'':' disabled';
  var h='<div class="mx">';
  if(edit){
    h+='<div class="mx-edit"><div class="fld"><label for="mf-'+uid+'-name">Métrica</label><input class="in" id="mf-'+uid+'-name" data-mf="'+key+'name" type="text" placeholder="Ej. Seguidores" value="'+esc(m.name||'')+'" autocomplete="off"></div>'
      +'<div class="fld"><label for="mf-'+uid+'-cur">Actual</label><input class="in" id="mf-'+uid+'-cur" data-mf="'+key+'cur" type="text" inputmode="decimal" placeholder="1.200" value="'+esc(valStr(m.cur))+'" autocomplete="off"></div>'
      +'<div class="fld"><label for="mf-'+uid+'-tar">Objetivo</label><input class="in" id="mf-'+uid+'-tar" data-mf="'+key+'tar" type="text" inputmode="decimal" placeholder="2.000" value="'+esc(valStr(m.tar))+'" autocomplete="off"></div>'
      +'<div class="del">'+(S.mdel===uid
          ?'¿Quitar? <button class="btn sm danger" type="button" data-act="mdelyes" data-gid="'+esc(gid)+'" data-plat="'+pl+'" data-mid="'+uid+'">Sí</button><button class="btn sm" type="button" data-act="mdelno">No</button>'
          :'<button class="btn sm ghost danger" type="button" data-act="mdel" data-mid="'+uid+'" aria-label="Quitar métrica">Quitar</button>')+'</div></div>';
  } else {
    var qs=ms?qStatus(m,y,qn):null, col=!!S.mcol[uid];
    h+='<button class="mx-tg" type="button" data-act="mtoggle" data-mid="'+uid+'" aria-expanded="'+(!col)+'"><svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg><b>'+esc(m.name||'Sin nombre')+'</b>'+(qs?mpill(qs):'')+'</button>'
      +'<div class="mx-sub">Actual '+fmtNum(hasNum(m.cur)?Number(m.cur):null,ms?ms.d:0)+' → objetivo '+fmtNum(hasNum(m.tar)?Number(m.tar):null,ms?ms.d:0)+(qs&&qs.pct!=null?' · '+qs.pct+'% del camino':'')+'</div>';
  }
  if(!edit&&S.mcol[uid])return h+'</div>';
  if(!ms){
    h+='<p class="gv-empty">Completa el valor actual y el objetivo para calcular los hitos.</p>';
  } else {
    if(ms.warn)h+='<p class="warn-note">Con este ajuste los otros meses tendrían que retroceder. Revisa el número.</p>';
    for(var i=0;i<3;i++){
      var mi=qn*3+i, st=msStatus(m,i,ms,y,mi), pinned=ms.pm===i, real=m.real&&m.real[i];
      h+='<div class="ms-row'+(edit?' ed':'')+'"><span class="ms-m">'+cap(MON3[mi])+'</span>'
        +'<div class="ms-meta"><b>'+fmtNum(ms.end[i],ms.d)+'</b> <span class="mut">'+sgnNum(ms.inc[i],ms.d)+'</span>'+(pinned?'<span class="adj">ajustado</span>':'')+'</div>'
        +'<div class="ms-real">'+(S.canWrite
            ?'<label class="sr" for="mr-'+uid+'-'+i+'">Valor real al cierre de '+MONTHS[mi].toLowerCase()+'</label><input class="in" id="mr-'+uid+'-'+i+'" data-mreal="'+key+i+'" type="text" inputmode="decimal" placeholder="Real" value="'+esc(valStr(real))+'" autocomplete="off">'
            :'<span class="rv">'+(hasNum(real)?fmtNum(Number(real),ms.d):'–')+'</span>')+'</div>'
        +'<div class="ms-st">'+mpill(st)+(hasNum(real)&&st.k!=='ok'?'<span class="mut">faltan '+fmtNum(Math.abs(ms.end[i]-Number(real)),ms.d)+'</span>':'')+'</div>';
      if(edit)h+='<div class="ms-adj"><label for="mp-'+uid+'-'+i+'">Ajustar crecimiento del mes</label><input class="in" id="mp-'+uid+'-'+i+'" data-mpin="'+key+i+'" type="text" inputmode="decimal" placeholder="'+esc(valStr(ms.inc[i]))+'" value="'+(pinned?esc(valStr(m.pin.d)):'')+'" autocomplete="off">'
        +(pinned?'<button class="btn sm ghost" type="button" data-act="mpinreset" data-gid="'+esc(gid)+'" data-plat="'+pl+'" data-mid="'+uid+'">Restablecer</button>':'')+'</div>';
      h+='</div>';
    }
  }
  return h+'</div>';
}
function quarterMetrics(gid,g,edit,y,qn){
  var hc=hitCount(g,y,qn);
  var h='<div class="fld"><span class="lbl">Métricas del trimestre por plataforma</span>';
  h+='<p class="hint" style="min-height:0">'+(hc.tot?'<span class="hits"><b>'+hc.ok+' de '+hc.tot+'</b> hitos cumplidos</span>':'<span>Define el valor actual y el objetivo; los hitos mensuales se calculan solos.</span>')+'</p>';
  if(edit)h+='<p class="muted" style="font-size:12.5px">Los hitos crecen de forma compuesta: el primer mes es el más lento. Si ajustas el crecimiento de un mes, los otros dos se recalculan para llegar al mismo objetivo.</p>';
  else if(hc.tot&&S.canWrite)h+='<p class="muted" style="font-size:12.5px">Escribe el valor real al cierre de cada mes para ver si se cumplió.</p>';
  h+='<div class="mtr" style="gap:16px">';
  ['ig','tt'].forEach(function(pl){
    var list=metricList(g,pl);
    h+='<div class="plat-block"><div class="plat-h"><span class="pl">'+PLAT_ABBR[pl]+'</span><span class="lbl">'+PLATFORMS[pl]+'</span></div>';
    if(!list.length)h+=G_EMPTY;
    list.forEach(function(m){h+=metricCard(gid,g,pl,m,edit,y,qn)});
    if(edit&&S.canWrite)h+='<div><button class="btn sm" type="button" data-act="madd" data-gid="'+esc(gid)+'" data-plat="'+pl+'">+ Añadir métrica</button></div>';
    h+='</div>';
  });
  return h+'</div></div>';
}
function monthMsBlock(y,mi){
  var qn=Math.floor(mi/3), qg=S.goals.get('q-'+y+'-'+(qn+1))||{}, i=mi-qn*3, rows=[];
  ['ig','tt'].forEach(function(pl){metricList(qg,pl).forEach(function(m){
    var ms=calcMilestones(m.cur,m.tar,m.pin); if(!ms)return;
    var st=msStatus(m,i,ms,y,mi), real=m.real&&m.real[i];
    rows.push('<div class="mm-row"><span class="pl">'+PLAT_ABBR[pl]+'</span><span class="nm">'+esc(m.name||'Sin nombre')+'</span><span class="mut">meta '+fmtNum(ms.end[i],ms.d)+' ('+sgnNum(ms.inc[i],ms.d)+')'+(hasNum(real)?' · real '+fmtNum(Number(real),ms.d):'')+'</span>'+mpill(st)+'</div>');
  })});
  return gRead('Hitos del mes',rows.length?'<div class="mtr">'+rows.join('')+'</div>':'<p class="gv-empty">Se calculan desde las métricas del trimestre.</p>');
}
function gNotes(id,g,edit){
  if(edit) return goalField(id,'notes','Ideas y notas de reunión con el cliente (opcional)','area','Acuerdos, ideas, pendientes…',g.notes);
  return (g.notes&&String(g.notes).trim())?gRead('Ideas y notas de reunión','<p class="notes">'+esc(g.notes)+'</p>'):'';
}
function monthGoalCard(y,mi,edit){
  var id='m-'+monthKey(y,mi), g=S.goals.get(id)||{}, st=stats(y,mi), tgt=Number(g.postTarget)||0;
  var bar=FORMAT_ORDER.filter(function(f){return st.by[f]}).map(function(f){return '<i class="f-'+f+'" style="width:'+(st.by[f]/st.total*100)+'%" title="'+FORMATS[f].plural+': '+st.by[f]+'"></i>'}).join('');
  return '<section class="card"><div class="card-h"><h3>'+MONTHS[mi]+'</h3><button class="btn sm" type="button" data-act="gocal" data-m="'+mi+'">Ver calendario</button></div>'
    +gTheme(id,g,edit,'Tema del mes')+gObjs(id,g,edit)
    +(edit?goalField(id,'postTarget','Meta de posts del mes','num','Ej. 16',g.postTarget):'')
    +'<div class="fld"><span class="lbl">Posts</span><div class="bar" aria-hidden="true">'+bar+'</div><p class="prog">'+st.total+(tgt?' de '+tgt:'')+' posts planificados · '+st.pub+' publicados'+(st.stories?' · '+plural(st.stories,'historia','historias'):'')+'</p></div>'
    +monthMsBlock(y,mi)+gNotes(id,g,edit)+'</section>';
}
function viewObj(){
  var y=S.cy, qn=Math.floor(S.cm/3), qid='q-'+y+'-'+(qn+1), qg=S.goals.get(qid)||{}, edit=S.goalsEdit&&S.canWrite;
  var h=notices()+monthBar();
  h+='<div class="gbar"><p class="muted">'+(edit?'Editando. Los cambios se guardan solos.':(S.canWrite?'Pulsa «Editar» para cambiar los objetivos.':'Solo lectura.'))+'</p>'
    +(S.canWrite?'<button class="btn'+(edit?' primary':'')+'" type="button" data-act="goalsedit">'+(edit?'Listo':'Editar')+'</button>':'')+'</div>';
  h+='<section class="card"><div class="card-h"><h3>Trimestre T'+(qn+1)+'</h3></div>'
    +gTheme(qid,qg,edit,'Tema del trimestre')+gObjs(qid,qg,edit)+quarterMetrics(qid,qg,edit,y,qn)+gNotes(qid,qg,edit)+'</section><div class="goal-grid">';
  for(var i=0;i<3;i++) h+=monthGoalCard(y,qn*3+i,edit);
  main.innerHTML=h+'</div>';
}

/* ---------- Pauta ---------- */
function weekLabel(ds){
  var a=dateObj(ds), b=new Date(a.getFullYear(),a.getMonth(),a.getDate()+6);
  if(a.getMonth()===b.getMonth()) return 'Semana del '+a.getDate()+' al '+b.getDate()+' de '+MONTHS[b.getMonth()].toLowerCase();
  return 'Semana del '+a.getDate()+' '+MON3[a.getMonth()]+' al '+b.getDate()+' '+MON3[b.getMonth()];
}
function mondayOf(ds){var d=dateObj(ds);var k=dowMon(d);return ymd(d.getFullYear(),d.getMonth(),d.getDate()-k)}
function pautaData(){
  var y=S.cy,m=S.cm;
  var all=allPosts().filter(function(p){return p.shoot&&inMonth(p,y,m)}).sort(cmp);
  var done=all.filter(isTaken).length;
  var items=S.showDone?all:all.filter(function(p){return !isTaken(p)});
  var groups=[];
  if(S.group==='locacion'){
    var map={}, order=[];
    items.forEach(function(p){
      var key=(p.location||'').trim().toLowerCase();
      if(!map[key]){map[key]={title:key?(p.location||'').trim():'Sin locación definida',items:[],key:key};order.push(key)}
      map[key].items.push(p);
    });
    order.sort(function(a,b){if(!a)return 1;if(!b)return -1;return a.localeCompare(b)});
    groups=order.map(function(k){return map[k]});
  } else if(S.group==='fecha'){
    var wm={}, wo=[];
    items.forEach(function(p){var k=mondayOf(p.date);if(!wm[k]){wm[k]={title:weekLabel(k),items:[]};wo.push(k)}wm[k].items.push(p)});
    wo.sort();
    groups=wo.map(function(k){return wm[k]});
  } else {
    FORMAT_ORDER.forEach(function(f){
      var it=items.filter(function(p){return p.format===f});
      if(it.length) groups.push({title:FORMATS[f].plural,icon:fIcon(f),items:it});
    });
  }
  return {all:all,done:done,items:items,groups:groups,
    noShoot:allPosts().filter(function(p){return !p.shoot&&inMonth(p,y,m)}).length};
}
function summaryTxt(d){
  var c={};d.all.forEach(function(p){c[p.format]=(c[p.format]||0)+1});
  var parts=FORMAT_ORDER.filter(function(f){return c[f]}).map(function(f){return c[f]+' '+(c[f]===1?FORMATS[f].label:FORMATS[f].plural).toLowerCase()});
  return plural(d.all.length,'pieza','piezas')+(parts.length?' · '+parts.join(' · '):'')+' · '+plural(d.done,'tomada','tomadas');
}
var CHECK_SVG='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-5.5"/></svg>';
function refsBlock(p){
  var imgs=refImgs(p), lk=linksHtml(p.refs,'inline');
  var h='<div class="plabel">Referencias</div>';
  if(imgs.length)h+='<div class="refimgs">'+imgs.map(function(x){return '<a href="'+window.PLANIFICA.img+esc(x.id)+'" target="_blank" rel="noopener noreferrer"><img src="'+window.PLANIFICA.img+esc(x.id)+'" alt="Imagen de referencia" loading="lazy"></a>'}).join('')+'</div>';
  return h+lk;
}
function pautaItem(p){
  var f=FORMATS[p.format]||FORMATS.reel, det=[], taken=isTaken(p), shots=getShots(p), voice=voiceLines(p);
  det.push('<b>Publica:</b> '+esc(whenTxt(p))+' · '+esc(platTxt(p)));
  if(p.location) det.push('<b>Locación:</b> '+esc(p.location));
  if(p.props) det.push('<b>Props / vestuario:</b> '+esc(p.props));
  return '<div class="item f-'+esc(p.format)+(taken?' done':'')+'">'
    +'<button class="ck" type="button" role="checkbox" aria-checked="'+taken+'" aria-label="Marcar todo como tomado: '+esc(p.title||'Sin título')+'" data-act="done" data-id="'+esc(p.id)+'">'+CHECK_SVG+'</button>'
    +'<div><div class="ih"><a class="it" href="#post-'+esc(p.id)+'">'+(esc(p.title)||'Sin título')+'</a><span class="tag">'+fIcon(p.format)+f.label+'</span></div>'
    +'<div class="det">'+det.join(' · ')+'</div>'
    +(p.direction?'<div class="det"><b>Dirección creativa:</b> '+esc(p.direction)+'</div>':'')
    +(shots.length?'<div class="plabel">'+esc(f.list)+'</div><ul class="pshots">'+shots.map(function(s,i){
        return '<li class="'+(s.d?'d':'')+'"><button class="ck" type="button" role="checkbox" aria-checked="'+(!!s.d)+'" aria-label="'+esc(s.t)+'" data-act="pshot" data-id="'+esc(p.id)+'" data-i="'+i+'">'+CHECK_SVG+'</button><span>'+esc(s.t)+'</span></li>';
      }).join('')+'</ul>':'')
    +(voice.length?'<div class="plabel">Guión de voz</div><ul class="pvoice">'+voice.map(function(l){return '<li>'+esc(l)+'</li>'}).join('')+'</ul>':'')
    +(p.refShow!==false&&hasRefs(p)?refsBlock(p):'')
    +'</div></div>';
}
function viewPauta(){
  var d=pautaData(), handle=(S.account.handle||'').trim();
  var h=notices()+monthBar();
  h+='<div class="ptools"><div class="seg" role="group" aria-label="Agrupar por">'
    +[['tipo','Tipo'],['locacion','Locación'],['fecha','Fecha']].map(function(x){return '<button type="button" data-act="group" data-v="'+x[0]+'" aria-pressed="'+(S.group===x[0])+'">'+x[1]+'</button>'}).join('')+'</div>'
    +'<button class="tog eye" type="button" data-act="toggledone" aria-pressed="'+S.showDone+'" title="Mostrar u ocultar las piezas ya tomadas">'+(S.showDone?EYE_SVG:EYEOFF_SVG)+'<span>Tomados</span></button>'
    +'<button class="btn primary pdfbtn" type="button" data-act="dlpdf">Descargar PDF</button></div>';
  h+='<article class="doc"><h2>Pauta audiovisual</h2><p class="sub">'+(handle?esc(handle)+' · ':'')+MONTHS[S.cm]+' '+S.cy+'</p>';
  if(!S.loaded.posts&&!S.posts.size){ h+='<p class="muted" style="margin-top:16px">Cargando…</p></article>'; main.innerHTML=h; return; }
  if(!d.all.length){
    h+='<div class="empty" style="margin-top:20px"><h3>No hay piezas para grabar en '+MONTHS[S.cm].toLowerCase()+'</h3><p>En cada post activa «Incluir en la pauta» y ponle fecha en este mes. Los reels y las fotos lo traen activado.'+(d.noShoot?' Hay '+plural(d.noShoot,'post','posts')+' este mes que no están en la pauta.':'')+'</p></div>';
  } else {
    h+='<p class="sum">'+esc(summaryTxt(d))+'</p>';
    if(!d.items.length) h+='<p class="muted" style="margin-top:18px">Todo está tomado. Activa «Tomados» (el ojo) para ver la lista completa.</p>';
    d.groups.forEach(function(g){h+='<h3>'+(g.icon||'')+esc(g.title)+' <span>'+g.items.length+'</span></h3>'+g.items.map(pautaItem).join('')});
  }
  main.innerHTML=h+'</article>';
}

/* ---------- PDF (Dual Studio) ---------- */
function pdfClean(t){
  return String(t==null?'':t).replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-')
    .replace(/…/g,'...').replace(/•/g,'-').replace(/ /g,' ').replace(/[^\u0000-ÿ]/g,'');
}
function loadImgData(id){
  return new Promise(function(res){
    if(typeof Image==='undefined'){res(null);return}
    var img=new Image();
    img.onload=function(){
      try{
        var s=Math.min(1,1500/Math.max(img.naturalWidth,img.naturalHeight)), cv=document.createElement('canvas');
        cv.width=Math.max(1,Math.round(img.naturalWidth*s));cv.height=Math.max(1,Math.round(img.naturalHeight*s));
        var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);
        res({d:cv.toDataURL('image/jpeg',0.8),w:cv.width,h:cv.height});
      }catch(e){res(null)}
    };
    img.onerror=function(){res(null)};
    img.src=''+window.PLANIFICA.img+id;
  });
}
function pdfImageIds(d){
  var ids=[];
  d.items.forEach(function(p){if(p.refShow!==false)refImgs(p).forEach(function(x){if(ids.indexOf(x.id)<0)ids.push(x.id)})});
  return ids;
}
function buildPdf(d,imgs){
  var J=window.jspdf&&window.jspdf.jsPDF; if(!J)return null;
  imgs=imgs||{};
  var doc=new J({unit:'pt',format:'letter'});
  var W=612,H=792,M=40,CW=W-2*M,TOP=46,BOT=H-54,y=TOP,PAD=12,CKW=26,IX=M+PAD+CKW,IW=CW-2*PAD-CKW;
  var C={ink:'#14161c',ink2:'#4b5160',ink3:'#757c8c',line:'#dfe2e9',soft:'#f3f4f7',ok:'#0f7f64',accent:'#3342e8',white:'#ffffff'};
  var FC={reel:['#cf2f6c','#fde8f0'],carrusel:['#2561d6','#e5eefc'],foto:['#0f7f64','#dff3ec'],historia:['#a86208','#fcefd9'],diseno:['#6d3fd1','#efe8fc']};
  var handle=pdfClean((S.account.handle||'').trim());
  function rgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]}
  function fill(h){var c=rgb(h);doc.setFillColor(c[0],c[1],c[2])}
  function stroke(h){var c=rgb(h);doc.setDrawColor(c[0],c[1],c[2])}
  function ink(h){var c=rgb(h);doc.setTextColor(c[0],c[1],c[2])}
  function font(style,size,color){doc.setFont('helvetica',style);doc.setFontSize(size);ink(color)}
  function newPage(){doc.addPage();y=TOP}
  function box(x,by,sz,on){
    if(on){
      fill(C.ok);stroke(C.ok);doc.setLineWidth(1);doc.roundedRect(x,by,sz,sz,2.5,2.5,'FD');
      stroke(C.white);doc.setLineWidth(sz>12?1.8:1.4);
      doc.line(x+sz*.24,by+sz*.52,x+sz*.43,by+sz*.72);doc.line(x+sz*.43,by+sz*.72,x+sz*.78,by+sz*.28);
    } else {
      fill(C.white);stroke(C.ink3);doc.setLineWidth(1.1);doc.roundedRect(x,by,sz,sz,2.5,2.5,'FD');
    }
  }
  function wrap(text,size,style,width,label){
    font(style,size,C.ink);
    var lw=0;
    if(label){doc.setFont('helvetica','bold');lw=doc.getTextWidth(label+' ');doc.setFont('helvetica',style)}
    var out=[];
    pdfClean(text).split('\n').forEach(function(par){
      var words=par.split(/\s+/).filter(Boolean), line='';
      if(!words.length){out.push('');return}
      words.forEach(function(w){
        var avail=width-(out.length===0?lw:0), test=line?line+' '+w:w;
        if(doc.getTextWidth(test)<=avail){line=test;return}
        if(line){out.push(line);line='';avail=width}
        if(doc.getTextWidth(w)>avail){var parts=doc.splitTextToSize(w,avail);for(var i=0;i<parts.length-1;i++)out.push(parts[i]);line=parts[parts.length-1]}
        else line=w;
      });
      out.push(line);
    });
    return {lines:out,lw:lw};
  }
  function strike(x,by,w,col){stroke(col);doc.setLineWidth(.8);doc.line(x,by,x+w,by)}

  function itemOps(p){
    var f=FORMATS[p.format]||FORMATS.reel, fc=FC[p.format]||FC.reel, taken=isTaken(p), ops=[];
    var tag=pdfClean(f.label), ico=FICON[p.format]; font('bold',8.5,C.ink); var tw=doc.getTextWidth(tag)+14+(ico?13:0);
    var tt=wrap(p.title||'Sin título',12.5,'bold',IW-tw-10), tlh=16;
    ops.push({h:tt.lines.length*tlh+4,keep:true,draw:function(yy){
      box(M+PAD,yy+1,14,taken);
      font('bold',12.5,taken?C.ink3:C.ink);
      tt.lines.forEach(function(l,i){
        doc.text(l,IX,yy+i*tlh+12);
        if(taken)strike(IX,yy+i*tlh+8.5,doc.getTextWidth(l),C.ink3);
      });
      fill(fc[1]);doc.roundedRect(M+CW-PAD-tw,yy,tw,15,4,4,'F');
      if(ico)doc.addImage(ico,'PNG',M+CW-PAD-tw+6,yy+2.5,10,10);
      font('bold',8.5,fc[0]);doc.text(tag,M+CW-PAD-tw+7+(ico?13:0),yy+10.5);
    }});
    function para(label,text,keep){
      var w=wrap(text,9.5,'normal',IW,label);
      ops.push({h:w.lines.length*13+3,keep:keep,draw:function(yy){
        w.lines.forEach(function(l,i){
          if(i===0&&label){font('bold',9.5,C.ink);doc.text(pdfClean(label),IX,yy+9.5);font('normal',9.5,C.ink2);doc.text(l,IX+w.lw,yy+9.5)}
          else{font('normal',9.5,C.ink2);doc.text(l,IX,yy+i*13+9.5)}
        });
      }});
    }
    function section(label){
      ops.push({h:22,keep:true,draw:function(yy){font('bold',7.5,C.ink3);doc.text(pdfClean(label).toUpperCase(),IX,yy+15)}});
    }
    para('Publica:',whenTxt(p)+' · '+platTxt(p));
    if(p.location)para('Locación:',p.location);
    if(p.props)para('Props / vestuario:',p.props);
    if(p.direction)para('Dirección creativa:',p.direction);
    var shots=getShots(p), voice=voiceLines(p);
    if(shots.length){
      section(f.list);
      shots.forEach(function(s){
        var w=wrap(s.t,9.5,'normal',IW-20);
        ops.push({h:w.lines.length*13+5,draw:function(yy){
          box(IX,yy+1,10,!!s.d);
          font('normal',9.5,s.d?C.ink3:C.ink);
          w.lines.forEach(function(l,i){doc.text(l,IX+20,yy+i*13+9.5);if(s.d)strike(IX+20,yy+i*13+6.5,doc.getTextWidth(l),C.ink3)});
        }});
      });
    }
    if(voice.length){
      section('Guión de voz');
      voice.forEach(function(l){
        var w=wrap(l,9.5,'normal',IW-14);
        ops.push({h:w.lines.length*13+3,draw:function(yy){
          fill(C.ink3);doc.circle(IX+3,yy+6,1.4,'F');
          font('normal',9.5,C.ink2);w.lines.forEach(function(t,i){doc.text(t,IX+14,yy+i*13+9.5)});
        }});
      });
    }
    if(p.refShow!==false&&hasRefs(p)){
      var pics=refImgs(p).map(function(x){return imgs[x.id]}).filter(Boolean), links=extractLinks(p.refs);
      if(pics.length||links.length){
        section('Referencias');
        var IMGH=180, rows=[], cur=[], cw=0, rh=0;
        pics.forEach(function(im){
          var h=IMGH, w=h*im.w/im.h; if(w>IW){w=IW;h=w*im.h/im.w}
          if(cur.length&&cw+8+w>IW){rows.push({items:cur,h:rh});cur=[];cw=0;rh=0}
          cur.push({im:im,w:w,h:h});cw+=(cur.length>1?8:0)+w;rh=Math.max(rh,h);
        });
        if(cur.length)rows.push({items:cur,h:rh});
        rows.forEach(function(r){
          ops.push({h:r.h+8,draw:function(yy){
            var x=IX;
            r.items.forEach(function(it){
              doc.addImage(it.im.d,'JPEG',x,yy,it.w,it.h);
              stroke(C.line);doc.setLineWidth(.6);doc.roundedRect(x,yy,it.w,it.h,4,4,'D');
              x+=it.w+8;
            });
          }});
        });
        links.forEach(function(lk){
          var lab=pdfClean(lk.label); font('normal',9.5,C.accent);
          var t=doc.splitTextToSize(lab,IW)[0];
          ops.push({h:14,draw:function(yy){
            font('normal',9.5,C.accent);
            doc.textWithLink(t,IX,yy+9.5,{url:lk.href});
            stroke(C.accent);doc.setLineWidth(.5);doc.line(IX,yy+11,IX+doc.getTextWidth(t),yy+11);
          }});
        });
      }
    }
    return ops;
  }
  function drawItem(p){
    var ops=itemOps(p), total=PAD*2+ops.reduce(function(a,o){return a+o.h},0);
    if(total<=BOT-TOP&&y+total>BOT)newPage();
    var cy0=y; y+=PAD;
    function closeCard(){stroke(C.line);doc.setLineWidth(.8);doc.roundedRect(M,cy0,CW,y+PAD-cy0,8,8,'D')}
    ops.forEach(function(op,i){
      var need=op.h+(op.keep&&ops[i+1]?ops[i+1].h:0);
      if(y>cy0+PAD&&y+need+PAD>BOT){closeCard();newPage();cy0=y;y+=PAD}
      op.draw(y);y+=op.h;
    });
    closeCard();y+=PAD+8;
  }
  function groupHead(name,count,first,fk){
    var fo=first?itemOps(first):[], ftot=PAD*2+fo.reduce(function(a,o){return a+o.h},0);
    var need=30+(ftot<=BOT-TOP?ftot:PAD+(fo[0]?fo[0].h:0)+(fo[1]?fo[1].h:0));
    if(y>TOP+4&&y+need>BOT)newPage();
    if(y>TOP+4)y+=10;
    var gi=fk&&FICON[fk]; if(gi)doc.addImage(gi,'PNG',M,y+1,15,15);
    var gx=M+(gi?20:0);
    font('bold',13,C.ink);doc.text(pdfClean(name),gx,y+13);
    var nw=doc.getTextWidth(pdfClean(name));
    font('normal',9.5,C.ink3);doc.text(String(count),gx+nw+8,y+13);
    stroke(C.line);doc.setLineWidth(.8);doc.line(M,y+21,W-M,y+21);
    y+=30;
  }

  /* Encabezado */
  font('bold',26,C.ink);doc.text('Pauta audiovisual',M,y+22);
  font('normal',11,C.ink2);doc.text(pdfClean((handle?handle+' · ':'')+MONTHS[S.cm]+' '+S.cy),M,y+40);
  y+=54;
  var sw=wrap(summaryTxt(d),9.5,'normal',CW-28), sh=sw.lines.length*13+18;
  fill(C.soft);doc.roundedRect(M,y,CW,sh,6,6,'F');
  font('normal',9.5,C.ink2);sw.lines.forEach(function(l,i){doc.text(l,M+14,y+9+i*13+9.5)});
  y+=sh+6;
  if(!d.items.length){font('normal',10,C.ink3);doc.text('Todo está tomado.',M,y+16)}
  d.groups.forEach(function(g){groupHead(g.title,g.items.length,g.items[0],S.group==='tipo'&&g.items[0]?g.items[0].format:null);g.items.forEach(drawItem)});

  var total=doc.getNumberOfPages();
  for(var i=1;i<=total;i++){
    doc.setPage(i);
    font('normal',8.5,C.ink3);
    doc.text('Dual Studio'+(handle?'  |  '+handle:''),M,H-28);
    doc.text(i+' / '+total,W-M,H-28,{align:'right'});
  }
  return doc.output('arraybuffer');
}

/* ---------- Detail ---------- */
function buildDetail(p){
  S.detailBuilt=p.id;
  var ro=S.canWrite?'':' disabled';
  var fmtBtns=FORMAT_ORDER.map(function(f){return '<button type="button" class="tog fmtbtn f-'+f+'" id="fmt-'+f+'" data-act="setfmt" data-v="'+f+'" aria-pressed="false">'+fIcon(f)+FORMATS[f].label+'</button>'}).join('');
  var platBtns=Object.keys(PLATFORMS).map(function(k){return '<button type="button" class="tog" id="pl-'+k+'" data-act="togplat" data-v="'+k+'" aria-pressed="false">'+PLATFORMS[k]+'</button>'}).join('');
  var stOpts=Object.keys(STATUS).map(function(k){return '<option value="'+k+'">'+STATUS[k]+'</option>'}).join('');
  main.innerHTML='<div id="detail">'
  +'<div class="detail-head"><button class="btn ghost" type="button" data-act="back">← '+(S.last==='calendario'?'Calendario':'Lista')+'</button>'
  +'<div class="dh-right"><label class="sr" for="f-status">Estado</label><select id="f-status" class="in sel" data-f="status"'+ro+'>'+stOpts+'</select>'
  +'<span id="delWrap"><button class="btn danger" type="button" data-act="del">Eliminar</button></span>'
  +'<span id="delConfirm" hidden>¿Eliminar este post? <button class="btn sm" type="button" data-act="delno">Cancelar</button> <button class="btn sm danger" type="button" data-act="delyes">Sí, eliminar</button></span></div></div>'
  +'<div class="grid2"><div class="col">'
  +'<section class="card"><h3>Contenido</h3>'
  +'<div class="fld"><label class="sr" for="f-title">Título</label><input id="f-title" class="in title" data-f="title" type="text" placeholder="Título o idea del post" autocomplete="off"'+ro+'></div>'
  +'<div class="fld"><span class="lbl" id="lbl-fmt">Formato</span><div class="wrapr" role="group" aria-labelledby="lbl-fmt">'+fmtBtns+'</div></div>'
  +'<div class="fld"><span class="lbl" id="lbl-plat">Plataformas</span><div class="wrapr" role="group" aria-labelledby="lbl-plat">'+platBtns+'</div></div>'
  +'<div class="r2"><div class="fld"><label for="f-date">Fecha de publicación</label><input id="f-date" class="in" data-f="date" type="date"'+ro+'></div>'
  +'<div class="fld"><label for="f-time">Hora</label><input id="f-time" class="in" data-f="time" type="time"'+ro+'></div></div>'
  +'<div class="fld refbox" id="refBox"><div class="card-h"><label class="lbl" for="f-refs">Referencias (opcional)</label>'
  +'<button class="sw" id="sw-refshow" type="button" role="switch" aria-checked="true" data-act="togrefshow"><span class="trk"></span><span>Mostrar en la pauta</span></button></div>'
  +'<textarea id="f-refs" class="in" data-f="refs" rows="3" placeholder="Pega links de referencia o escribe notas. También puedes pegar o arrastrar imágenes aquí."'+ro+'></textarea>'
  +'<div id="refLinks"></div><div class="thumbs" id="refThumbs"></div>'
  +'<div class="hint"><span id="refStatus"></span><span><input id="refFile" type="file" accept="image/*" multiple hidden><button class="btn sm" type="button" id="refAdd" data-act="refadd"'+ro+'>+ Añadir imágenes</button></span></div></div>'
  +'<div class="fld"><label for="f-direction">Dirección creativa (descripción)</label><textarea id="f-direction" class="in" data-f="direction" rows="5" placeholder="Describe el reel o la pieza: idea, tono, estilo visual, música…"'+ro+'></textarea></div>'
  +'<div class="fld"><label for="f-copy">Copy</label><textarea id="f-copy" class="in" data-f="copy" rows="7" placeholder="Texto que acompaña la publicación"'+ro+'></textarea>'
  +'<div class="hint"><span id="cnt-copy"></span><button class="btn sm" type="button" data-act="copyfield" data-target="f-copy">Copiar copy</button></div></div>'
  +'<div class="fld"><label for="f-hashtags">Hashtags</label><textarea id="f-hashtags" class="in" data-f="hashtags" rows="3" placeholder="#hashtag1 #hashtag2"'+ro+'></textarea>'
  +'<div class="hint"><span id="cnt-tags"></span><button class="btn sm" type="button" data-act="copyfield" data-target="f-hashtags">Copiar hashtags</button></div></div>'
  +'</section></div><div class="col">'
  +'<section class="card"><div class="card-h"><h3>Producción</h3><button class="sw" id="sw-shoot" type="button" role="switch" aria-checked="false" data-act="togshoot"><span class="trk"></span><span>Incluir en la pauta</span></button></div>'
  +'<p class="muted" id="shootHint"></p>'
  +'<div class="fld"><span class="lbl" id="lbl-shot">Lista de tomas</span><div class="shots" id="shotsBox" role="group" aria-labelledby="lbl-shot"></div><div class="hint"><span id="shotProg"></span><button class="btn sm" type="button" id="shotAdd" data-act="shotadd"'+ro+'>+ Añadir toma</button></div></div><div class="fld"><label for="f-voice">Guión de voz (opcional)</label><textarea id="f-voice" class="in" data-f="voice" rows="4" placeholder="Una frase por línea. Déjalo vacío si no lleva voz."'+ro+'></textarea></div>'
  +'<div class="fld"><label for="f-location">Locación</label><input id="f-location" class="in" data-f="location" type="text" placeholder="Dónde se graba o fotografía" autocomplete="off"'+ro+'></div>'
  +'<div class="fld"><label for="f-props">Props y vestuario</label><input id="f-props" class="in" data-f="props" type="text" placeholder="Qué hay que llevar" autocomplete="off"'+ro+'></div>'
  +'<div class="card-h" id="doneRow"><button class="sw" id="sw-done" type="button" role="switch" aria-checked="false" data-act="togdone"><span class="trk"></span><span>Ya se tomó</span></button></div>'
  +'</section>'
  
  +'<p class="edited" id="editedBy"></p></div></div></div>';
  if(S.focusTitle&&S.canWrite){S.focusTitle=false;var t=$('#f-title');if(t)t.focus()}
}
function paintCounters(){
  var c=$('#f-copy'), t=$('#f-hashtags'), p=S.posts.get(S.postId);
  if(c){
    var n=c.value.length, ig=p&&(p.platforms||[]).indexOf('ig')>=0&&n>2200;
    $('#cnt-copy').innerHTML=n+' caracteres'+(ig?' · <span class="over">Supera los 2.200 de Instagram</span>':'');
  }
  if(t){
    var tags=(t.value.match(/#[\p{L}\p{N}_]+/gu)||[]).length;
    $('#cnt-tags').textContent=plural(tags,'hashtag','hashtags');
  }
  var rl=$('#refLinks'), rf=$('#f-refs');
  if(rl&&rf) rl.innerHTML=linksHtml(rf.value);
}
function paintFooter(){
  var p=S.posts.get(S.postId), el=$('#editedBy'); if(!el||!p) return;
  if(!p.updatedAt){el.textContent='';return}
  var who=p.updatedBy?(p.updatedBy===S.uid?'ti':(S.names[p.updatedBy]||'otra persona')):'';
  el.textContent='Editado'+(who?' por '+who:'')+' · '+relTime(p.updatedAt);
}
function shotRowHtml(sh,i,ro){
  return '<div class="shot-row"><button class="ck" type="button" role="checkbox" aria-checked="'+(!!sh.d)+'" aria-label="Marcar toma '+(i+1)+'" data-act="shotck" data-i="'+i+'">'+CHECK_SVG+'</button>'
    +'<input class="in" id="shot-'+i+'" data-shot="'+i+'" type="text" value="'+esc(sh.t)+'" placeholder="Ej. Plano general del espacio" autocomplete="off"'+ro+'>'
    +'<button class="icon-x" type="button" data-act="shotdel" data-i="'+i+'" aria-label="Quitar toma '+(i+1)+'">×</button></div>';
}
function paintShots(p,force){
  var box=$('#shotsBox'); if(!box)return;
  var arr=getShots(p), ae=document.activeElement;
  var editing=!!(ae&&ae.tagName==='INPUT'&&box.contains(ae));
  var pend=(pending['posts/'+p.id]||{}).patch||{};
  var sig=JSON.stringify(arr);
  if(force||(!editing&&!Object.prototype.hasOwnProperty.call(pend,'shots')&&box.dataset.sig!==sig)){
    box.innerHTML=arr.length?arr.map(function(x,i){return shotRowHtml(x,i,S.canWrite?'':' disabled')}).join(''):'<p class="muted">Aún no hay tomas. Añade cada clip o foto que hay que tomar para ir tachándolos.</p>';
    box.dataset.sig=sig;
  }
  var c=shotCount(p);
  var pr=$('#shotProg'); if(pr)pr.textContent=c.n?(c.d+' de '+c.n+' listas'):'';
}
function focusShot(i){var el=document.getElementById('shot-'+i);if(el)el.focus()}
function mutShots(fn){
  var p=S.posts.get(S.postId); if(!p||!canW())return false;
  var arr=copyShots(p); fn(arr); setShots(p,arr,300);
  paintShots(p,true); $('#doneRow').hidden=arr.length>0;
  return true;
}
function paintRefs(p){
  var box=$('#refThumbs'); if(!box)return;
  var imgs=refImgs(p), sig=JSON.stringify(imgs);
  if(box.dataset.sig!==sig){
    box.innerHTML=imgs.map(function(x){
      return '<div class="thumb"><a href="'+window.PLANIFICA.img+esc(x.id)+'" target="_blank" rel="noopener noreferrer"><img src="'+window.PLANIFICA.img+esc(x.id)+'" alt="Imagen de referencia" loading="lazy"></a>'
        +(S.canWrite?'<button class="icon-x" type="button" data-act="refdel" data-id="'+esc(x.id)+'" aria-label="Quitar imagen">×</button>':'')+'</div>';
    }).join('');
    box.dataset.sig=sig;
  }
  var add=$('#refAdd'); if(add)add.hidden=!(S.assets&&S.canWrite);
  var st=$('#refStatus');
  if(st&&!S.refBusy)st.textContent=(S.booted&&S.canWrite&&!S.assets)?'Tu nivel de acceso no permite subir imágenes. Pega links.':'';
}
function setRefStatus(t){var st=$('#refStatus');if(st)st.textContent=t}
function prepImage(file){
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      try{
        var s=Math.min(1,1080/Math.max(img.naturalWidth,img.naturalHeight)), cv=document.createElement('canvas');
        cv.width=Math.max(1,Math.round(img.naturalWidth*s));cv.height=Math.max(1,Math.round(img.naturalHeight*s));
        var cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(img,0,0,cv.width,cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function(b){b?res(b):rej(new Error('blob'))},'image/webp',0.72);
      }catch(e){rej(e)}
    };
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('decode'))};
    img.src=url;
  });
}
function upErr(err){
  var c=err&&err.code;
  if((c==='quota_exceeded'||c==='permission_denied')&&err.message)return err.message;
  if(c==='too_large')return 'La imagen es demasiado grande.';
  if(c==='quota_or_state')return 'Se llenó el espacio de imágenes de la app.';
  if(c==='rate_limited')return 'Demasiadas subidas seguidas. Espera un momento.';
  return 'No se pudo subir una imagen. Prueba con JPG o PNG.';
}
function addRefFiles(files){
  var p=S.posts.get(S.postId); if(!p||!canW())return;
  if(!S.assets){toast('Tu nivel de acceso no permite subir imágenes.');return}
  var list=Array.prototype.filter.call(files||[],function(f){return /^image\//.test(f.type)});
  if(!list.length){toast('Elige archivos de imagen.');return}
  var pid=p.id, added=[], ch=Promise.resolve();
  S.refBusy=true; setRefStatus('Subiendo '+plural(list.length,'imagen','imágenes')+'…');
  list.forEach(function(f){
    ch=ch.then(function(){
      return prepImage(f).then(function(b){return S.assets.upload(b,{type:b.type||'image/webp'})}).then(function(r){added.push({id:r.id})},function(err){toast(upErr(err))});
    });
  });
  ch.then(function(){
    S.refBusy=false; setRefStatus('');
    var cur=S.posts.get(pid); if(!cur||!added.length)return;
    var arr=refImgs(cur).concat(added); cur.refImgs=arr; queueSave('posts/'+pid,{refImgs:arr},0);
    if(S.view==='detalle'&&S.postId===pid)paintRefs(cur);
  });
}
function paintDetail(){
  var p=S.posts.get(S.postId);
  if(!p){
    S.detailBuilt=null;
    if(S.loaded.posts) main.innerHTML='<div class="empty" style="margin-top:24px"><h3>Este post no existe</h3><p>Puede que se haya eliminado.</p><div class="acts"><button class="btn" type="button" data-act="back">← Volver</button></div></div>';
    else main.innerHTML='<div class="empty" style="margin-top:24px"><p>'+(db===null&&S.booted?'No se pudo conectar con el servidor.':'Cargando…')+'</p></div>';
    return;
  }
  if(S.detailBuilt!==p.id) buildDetail(p);
  var pend=(pending['posts/'+p.id]||{}).patch||{};
  document.querySelectorAll('#detail [data-f]').forEach(function(el){
    var f=el.dataset.f;
    if(el===document.activeElement||Object.prototype.hasOwnProperty.call(pend,f)) return;
    var v=p[f]==null?'':String(p[f]);
    if(el.value!==v) el.value=v;
  });
  FORMAT_ORDER.forEach(function(f){$('#fmt-'+f).setAttribute('aria-pressed',String(p.format===f))});
  Object.keys(PLATFORMS).forEach(function(k){$('#pl-'+k).setAttribute('aria-pressed',String((p.platforms||[]).indexOf(k)>=0))});
  $('#sw-shoot').setAttribute('aria-checked',String(!!p.shoot));
  $('#sw-done').setAttribute('aria-checked',String(!!p.shotDone));
  paintShots(p,false);
  $('#doneRow').hidden=shotCount(p).n>0;
  $('#sw-refshow').setAttribute('aria-checked',String(p.refShow!==false));
  paintRefs(p);
  $('#lbl-shot').textContent=(FORMATS[p.format]||FORMATS.reel).list;
  $('#shootHint').textContent=p.shoot?'Aparece en la pauta audiovisual del mes de publicación.':'No aparece en la pauta. Actívalo si hay que grabar o fotografiar algo.';
  paintCounters(); paintFooter();
}

/* ---------- Render ---------- */
function render(toTop){
  if(DR&&DR.active){S.needsRender=true;return}
  setNav();
  if(S.view==='detalle'){paintDetail(); if(toTop)window.scrollTo(0,0); return}
  S.detailBuilt=null;
  var ae=document.activeElement, keep=null;
  if(ae&&ae.id&&main.contains(ae)&&(ae.tagName==='TEXTAREA'||ae.tagName==='INPUT')){
    keep={id:ae.id,v:ae.value,s:ae.selectionStart,e:ae.selectionEnd};
  }
  var sy=window.scrollY;
  ({lista:viewLista,calendario:viewCal,objetivos:viewObj,pauta:viewPauta})[S.view]();
  if(keep){
    var el=document.getElementById(keep.id);
    if(el){el.value=keep.v;el.focus({preventScroll:true});try{el.setSelectionRange(keep.s,keep.e)}catch(e){}}
  }
  window.scrollTo(0,toTop?0:sy);
}
function onData(pendingWrites){
  if(S.view==='detalle'){paintDetail();return}
  if(pendingWrites&&S.view==='objetivos')return;
  render();
}

/* ---------- Examples ---------- */
function loadExamples(){
  if(!canW())return;
  var dim=new Date(S.cy,S.cm+1,0).getDate();
  function d(n){return ymd(S.cy,S.cm,Math.min(n,dim))}
  var ex=[
    {format:'reel',title:'Ejemplo: reel de bienvenida (quiénes somos)',date:d(4),time:'18:00',status:'porproducir',platforms:['ig','tt'],direction:'Ritmo rápido, luz natural, música instrumental. Cierra con cara a cámara.',copy:'Hola, somos [nombre]. Esto es lo que vas a ver por aquí.',hashtags:'#presentacion #detrasdecamaras',shoot:true,shotList:'1. Plano general del espacio\n2. Cara a cámara, 10 s\n3. Detalle de manos trabajando',location:'Estudio',props:'Vestuario neutro'},
    {format:'carrusel',title:'Ejemplo: 5 errores comunes (carrusel)',date:d(7),time:'12:00',status:'produccion',platforms:['ig'],direction:'Fondo liso, una idea por slide, tipografía grande.',copy:'Guarda este post para no cometerlos.',hashtags:'#tips #aprende',shoot:false,shotList:'Slide 1: gancho\nSlides 2–6: un error por slide\nSlide 7: llamado a guardar'},
    {format:'foto',title:'Ejemplo: foto de producto en luz natural',date:d(11),time:'10:00',status:'idea',platforms:['ig'],direction:'Luz lateral de ventana, superficie de madera clara.',shoot:true,shotList:'Plano cenital\nPlano 45° con detalle\nProducto en uso',location:'Ventana del estudio',props:'Mantel de lino, planta pequeña'},
    {format:'historia',title:'Ejemplo: encuesta de la semana',date:d(12),time:'09:00',status:'listo',platforms:['ig'],direction:'Fondo de color de marca con sticker de encuesta.',shoot:false,shotList:'Historia 1: pregunta\nHistoria 2: resultado'},
    {format:'reel',title:'Ejemplo: proceso paso a paso (timelapse)',date:d(18),time:'19:00',status:'idea',platforms:['ig','tt'],direction:'Timelapse con texto en pantalla por paso.',shoot:true,shotList:'Cámara fija sobre la mesa\nGrabar 20 min continuos\nPlano de resultado final',location:'Estudio',props:'Materiales del paso a paso'},
    {format:'diseno',title:'Ejemplo: frase del mes',date:d(24),time:'11:00',status:'porproducir',platforms:['ig'],direction:'Tipografía grande sobre fondo de color, un solo mensaje.',shoot:false}
  ];
  ex[0].voice='Hola, somos [nombre].\nEsto es lo que vas a ver por aquí.';
  ex.forEach(function(e){
    e.example=true;e.shotDone=false;e.refs=e.refs||'';
    e.shots=String(e.shotList||'').split('\n').map(function(x){return x.replace(/^\d+\.\s*/,'').trim()}).filter(Boolean).map(function(t){return {t:t,d:false}});
    delete e.shotList;
  });
  var chainP=Promise.resolve();
  ex.forEach(function(e){chainP=chainP.then(function(){return createPost(e)})});
  chainP.then(function(){toast('Ejemplos cargados');render()});
}

/* ---------- Clipboard and downloads ---------- */
function copyText(t,msg){
  var ok=function(){toast(msg||'Copiado')};
  var fb=function(){
    var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();var r=false;
    try{r=document.execCommand('copy')}catch(e){}
    ta.remove();
    if(r)ok(); else toast('No se pudo copiar. Selecciona el texto y cópialo a mano.');
  };
  try{ navigator.clipboard.writeText(t).then(ok,fb) }catch(e){fb()}
}
function download(name,text){
  var p=(window.claude&&window.claude.use)?window.claude.use('downloads'):Promise.resolve(null);
  Promise.resolve(p).catch(function(){return null}).then(function(d){
    if(!d){toast('La descarga no está disponible en esta vista.');return}
    return d.save({filename:name,data:text}).then(function(){toast('Archivo listo')},function(e){if(!e||e.code!=='declined')toast('No se pudo descargar el archivo.')});
  });
}

/* ---------- Events ---------- */
document.addEventListener('click',function(e){
  var a=e.target.closest('a[href]'); if(a&&!a.dataset.act) return;
  var el=e.target.closest('[data-act]'); if(!el) return;
  var act=el.dataset.act, p;
  switch(act){
    case 'new':
      createPost({}).then(function(id){if(id){S.focusTitle=true;go('post-'+id)}}); break;
    case 'add':
      e.stopPropagation();
      createPost({date:el.dataset.date}).then(function(id){if(id){S.focusTitle=true;go('post-'+id)}}); break;
    case 'selday': S.selDay=el.dataset.date; render(); break;
    case 'prev': shift(S.view==='objetivos'?-3:-1); render(); break;
    case 'next': shift(S.view==='objetivos'?3:1); render(); break;
    case 'today': S.cy=now.getFullYear();S.cm=now.getMonth();S.selDay=null;render(); break;
    case 'gocal': S.cm=Number(el.dataset.m);S.selDay=null;go('calendario'); break;
    case 'lgroup': S.lgroup=el.dataset.v; render(); break;
    case 'fplat': S.f.plat=el.dataset.v; render(); break;
    case 'togfilters': S.filtersOpen=!S.filtersOpen; render(); break;
    case 'clearfilters': S.f={plat:'all',fmt:'all',st:'all',q:''}; render(); break;
    case 'mtoggle':
      var tm=el.dataset.mid; if(S.mcol[tm])delete S.mcol[tm]; else S.mcol[tm]=1;
      try{localStorage.setItem('pc_mcol',JSON.stringify(S.mcol))}catch(e){}
      render(); break;
    case 'madd':
      var nid=newId('mt');
      saveMetrics(el.dataset.gid,function(nm){nm[el.dataset.plat].push({id:nid,name:'',cur:null,tar:null,pin:null,real:[null,null,null]})});
      render(); var ni2=document.getElementById('mf-'+nid+'-name'); if(ni2)ni2.focus(); break;
    case 'mdel': S.mdel=el.dataset.mid; render(); break;
    case 'mdelno': S.mdel=''; render(); break;
    case 'mdelyes':
      var dmid=el.dataset.mid;
      saveMetrics(el.dataset.gid,function(nm){nm[el.dataset.plat]=nm[el.dataset.plat].filter(function(m){return m.id!==dmid})});
      S.mdel=''; render(); break;
    case 'mpinreset': editMetric(el.dataset.gid,el.dataset.plat,el.dataset.mid,function(m){m.pin=null}); render(); break;
    case 'objdone':
      if(!canW())break;
      var ogid=el.dataset.gid, og=S.goals.get(ogid)||{id:ogid}, otx=lines(og.objectives)[Number(el.dataset.i)];
      if(otx==null)break;
      var odn=(og.objDone||[]).slice(), ok2=odn.indexOf(otx);
      if(ok2>=0)odn.splice(ok2,1); else odn.push(otx);
      S.goals.set(ogid,Object.assign({},og,{objDone:odn})); queueSave('goals/'+ogid,{objDone:odn},0); render(); break;
    case 'goalsedit': if(!canW())break; if(S.goalsEdit)flushAll(); S.goalsEdit=!S.goalsEdit; render(); break;
    case 'refadd': var rf=$('#refFile'); if(rf)rf.click(); break;
    case 'refdel':
      p=S.posts.get(S.postId); if(!p||!canW())break;
      var rid=el.dataset.id, rarr=refImgs(p).filter(function(x){return x.id!==rid});
      p.refImgs=rarr; queueSave('posts/'+p.id,{refImgs:rarr},0); paintRefs(p);
      if(S.assets)S.assets.delete(rid).catch(function(){});
      break;
    case 'togrefshow':
      p=S.posts.get(S.postId); if(!p||!canW())break;
      p.refShow=!(p.refShow!==false); queueSave('posts/'+p.id,{refShow:p.refShow},0); paintDetail(); break;
    case 'group': S.group=el.dataset.v; render(); break;
    case 'toggledone': S.showDone=!S.showDone; render(); break;
    case 'examples': loadExamples(); break;
    case 'rmexamples': allPosts().filter(function(x){return x.example}).forEach(function(x){deletePost(x.id)}); toast('Ejemplos borrados'); render(); break;
    case 'back': flushAll(); go(S.last||'lista'); break;
    case 'done':
      p=S.posts.get(el.dataset.id); if(!p||!canW())break;
      toggleTaken(p); render(); break;
    case 'pshot':
      p=S.posts.get(el.dataset.id); if(!p||!canW())break;
      var pa=copyShots(p), pi=Number(el.dataset.i);
      if(pa[pi]){pa[pi].d=!pa[pi].d;setShots(p,pa,0);render()}
      break;
    case 'shotadd':
      var ni=getShots(S.posts.get(S.postId)||{}).length;
      if(mutShots(function(a){a.push({t:'',d:false})}))focusShot(ni);
      break;
    case 'shotdel':
      var di=Number(el.dataset.i); mutShots(function(a){a.splice(di,1)}); break;
    case 'shotck':
      p=S.posts.get(S.postId); if(!p||!canW())break;
      var sa=copyShots(p), si=Number(el.dataset.i);
      if(sa[si]){
        sa[si].d=!sa[si].d; setShots(p,sa,0);
        el.setAttribute('aria-checked',String(sa[si].d));
        var bx=$('#shotsBox'); if(bx)bx.dataset.sig=JSON.stringify(sa);
        paintShots(p,false);
      }
      break;
    case 'dlpdf':
      if(S.pdfBusy)break;
      var pd=pautaData();
      if(!pd.all.length){toast('No hay piezas en la pauta de este mes.');break}
      S.pdfBusy=true; toast('Generando PDF…');
      var pids=pdfImageIds(pd);
      Promise.all(pids.map(loadImgData)).then(function(res){
        var map={}; pids.forEach(function(id,k){if(res[k])map[id]=res[k]});
        var buf=null; try{buf=buildPdf(pd,map)}catch(err){buf=null}
        S.pdfBusy=false;
        if(!buf){toast('No se pudo generar el PDF. Revisa tu conexión y recarga la página.');return}
        download('pauta-audiovisual-'+monthKey(S.cy,S.cm)+'.pdf',buf);
      });
      break;
    case 'copyfield': var t=document.getElementById(el.dataset.target); if(t&&t.value) copyText(t.value,'Copiado'); else toast('No hay nada que copiar todavía.'); break;
    case 'setfmt':
      p=S.posts.get(S.postId); if(!p||p.format===el.dataset.v)break;
      var patch={format:el.dataset.v}; if(isShootDefault(patch.format)&&!p.shoot)patch.shoot=true;
      Object.assign(p,patch); queueSave('posts/'+p.id,patch,0); paintDetail(); break;
    case 'togplat':
      p=S.posts.get(S.postId); if(!p)break;
      var pl=(p.platforms||[]).slice(), i=pl.indexOf(el.dataset.v);
      if(i>=0)pl.splice(i,1); else pl.push(el.dataset.v);
      p.platforms=pl; queueSave('posts/'+p.id,{platforms:pl},0); paintDetail(); break;
    case 'togshoot':
      p=S.posts.get(S.postId); if(!p)break;
      p.shoot=!p.shoot; queueSave('posts/'+p.id,{shoot:p.shoot},0); paintDetail(); break;
    case 'togdone':
      p=S.posts.get(S.postId); if(!p||!canW())break;
      toggleTaken(p); paintDetail(); break;
    case 'del': $('#delWrap').hidden=true; $('#delConfirm').hidden=false; break;
    case 'delno': $('#delWrap').hidden=false; $('#delConfirm').hidden=true; break;
    case 'delyes': var id=S.postId; flushAll(); deletePost(id); toast('Post eliminado'); go(S.last||'lista'); break;
  }
});
document.addEventListener('input',function(e){
  var el=e.target;
  if(el.id==='acct'){queueSave('settings/account',{handle:el.value},600);return}
  if(el.id==='fq'){S.f.q=el.value;render();return}
  if(el.dataset&&el.dataset.g){
    var v=el.dataset.gf==='postTarget'?(el.value===''?'':Number(el.value)):el.value;
    queueSave('goals/'+el.dataset.g,(function(){var o={};o[el.dataset.gf]=v;return o})(),600);return;
  }
  if(el.dataset&&el.dataset.shot!=null&&el.dataset.shot!==''){
    var sp=S.posts.get(S.postId), sk=Number(el.dataset.shot);
    if(sp){var sarr=copyShots(sp);if(sarr[sk]){sarr[sk].t=el.value;setShots(sp,sarr,600);var sb=$('#shotsBox');if(sb)sb.dataset.sig=JSON.stringify(sarr)}}
    return;
  }
  if(el.dataset&&el.dataset.f&&S.view==='detalle'&&S.postId){
    var o={};o[el.dataset.f]=el.value;
    var p=S.posts.get(S.postId); if(p)Object.assign(p,o);
    queueSave('posts/'+S.postId,o,el.tagName==='SELECT'||el.type==='date'||el.type==='time'?150:600);
    if(el.id==='f-copy'||el.id==='f-hashtags'||el.id==='f-refs')paintCounters();
  }
});
document.addEventListener('change',function(e){
  var el=e.target;
  if(el.id==='refFile'){addRefFiles(el.files);el.value='';return}
  if(el.dataset&&el.dataset.stsel){
    var sp=S.posts.get(el.dataset.stsel);
    if(sp&&canW()&&STATUS[el.value]){sp.status=el.value;queueSave('posts/'+sp.id,{status:sp.status},0);setTimeout(function(){render()},0)}
    return;
  }
  if(el.dataset&&el.dataset.mf){
    var mq=el.dataset.mf.split('|');
    editMetric(mq[0],mq[1],mq[2],function(m){if(mq[3]==='name')m.name=el.value.trim();else m[mq[3]]=parseNum(el.value)});
    setTimeout(function(){render()},0);return;
  }
  if(el.dataset&&el.dataset.mreal){
    var rq=el.dataset.mreal.split('|'), ri=Number(rq[3]);
    editMetric(rq[0],rq[1],rq[2],function(m){var a=(m.real||[null,null,null]).slice();while(a.length<3)a.push(null);a[ri]=parseNum(el.value);m.real=a});
    setTimeout(function(){render()},0);return;
  }
  if(el.dataset&&el.dataset.mpin){
    var pq=el.dataset.mpin.split('|'), pv=parseNum(el.value);
    editMetric(pq[0],pq[1],pq[2],function(m){m.pin=pv==null?null:{m:Number(pq[3]),d:pv}});
    setTimeout(function(){render()},0);return;
  }
  if(el.dataset&&el.dataset.fsel){S.f[el.dataset.fsel]=el.value;render()}
});
document.addEventListener('focusout',function(){flushAll()});
document.addEventListener('keydown',function(e){
  var el=e.target; if(!el||!el.dataset||el.dataset.shot==null||el.dataset.shot===''||e.isComposing)return;
  var i=Number(el.dataset.shot);
  if(e.key==='Enter'){e.preventDefault();if(mutShots(function(a){a.splice(i+1,0,{t:'',d:false})}))focusShot(i+1)}
  else if(e.key==='Backspace'&&el.value===''){e.preventDefault();if(mutShots(function(a){a.splice(i,1)}))focusShot(Math.max(0,i-1))}
});

/* Drag to reschedule (mouse and touch) */
var DR=null, scrollT=null;
function dayAt(x,y){var el=document.elementFromPoint(x,y);return el&&el.closest?el.closest('.day'):null}
function moveGhost(x,y){if(DR&&DR.ghost){DR.ghost.style.left=(x-30)+'px';DR.ghost.style.top=(y-16)+'px'}}
function markDrop(){
  var d=dayAt(DR.x,DR.y);
  if(DR.over&&DR.over!==d)DR.over.classList.remove('drop');
  if(d)d.classList.add('drop');
  DR.over=d;
}
function dragStart(){
  if(!DR||DR.active)return;
  DR.active=true; clearTimeout(DR.timer);
  var r=DR.src.getBoundingClientRect();
  var g=DR.src.cloneNode(true);
  g.removeAttribute('href'); g.removeAttribute('data-drag'); g.classList.add('drag-ghost');
  g.style.width=Math.max(150,Math.min(r.width||200,300))+'px';
  document.body.appendChild(g); DR.ghost=g; DR.src.classList.add('drag-src');
  document.body.classList.add('dragging');
  moveGhost(DR.x,DR.y);
  try{if(navigator.vibrate)navigator.vibrate(12)}catch(e){}
  scrollT=setInterval(function(){
    if(!DR||!DR.active)return;
    var h=window.innerHeight||600;
    if(DR.y<70)window.scrollBy(0,-14); else if(DR.y>h-70)window.scrollBy(0,14);
    markDrop();
  },30);
}
function dragEnd(drop){
  if(!DR)return;
  var d=DR; clearTimeout(d.timer); clearInterval(scrollT);
  var moved=false;
  if(d.active){
    S.noClick=true; setTimeout(function(){S.noClick=false},400);
    if(d.over)d.over.classList.remove('drop');
    if(d.ghost&&d.ghost.parentNode)d.ghost.parentNode.removeChild(d.ghost);
    d.src.classList.remove('drag-src');
    document.body.classList.remove('dragging');
    if(drop){
      var day=dayAt(d.x,d.y), p=S.posts.get(d.id);
      if(day&&p&&day.dataset.date&&p.date!==day.dataset.date){
        p.date=day.dataset.date; queueSave('posts/'+p.id,{date:p.date},0);
        S.selDay=p.date; moved=true; toast('Movido al '+fmtShort(p.date));
      }
    }
  }
  DR=null;
  if(moved||S.needsRender){S.needsRender=false;render()}
}
document.addEventListener('pointerdown',function(e){
  if(S.view!=='calendario'||!S.canWrite||DR)return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.target.closest&&e.target.closest('select'))return;
  var src=e.target.closest&&e.target.closest('[data-drag]'); if(!src)return;
  DR={id:src.dataset.drag,src:src,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,touch:e.pointerType!=='mouse',active:false,pid:e.pointerId,over:null,ghost:null,timer:null};
  if(DR.touch)DR.timer=setTimeout(dragStart,300);
});
document.addEventListener('pointermove',function(e){
  if(!DR||e.pointerId!==DR.pid)return;
  DR.x=e.clientX; DR.y=e.clientY;
  if(!DR.active){
    var dx=Math.abs(DR.x-DR.sx), dy=Math.abs(DR.y-DR.sy);
    if(DR.touch){if(dx>10||dy>10){clearTimeout(DR.timer);DR=null}}
    else if(dx>5||dy>5)dragStart();
    return;
  }
  moveGhost(DR.x,DR.y); markDrop();
});
document.addEventListener('pointerup',function(e){if(DR&&e.pointerId===DR.pid)dragEnd(true)});
document.addEventListener('pointercancel',function(e){if(DR&&e.pointerId===DR.pid)dragEnd(false)});
document.addEventListener('touchmove',function(e){if(DR&&DR.active&&e.cancelable)e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',function(e){if(DR&&DR.active)e.preventDefault()});
document.addEventListener('click',function(e){if(S.noClick){e.preventDefault();e.stopPropagation()}},true);

/* Image paste / drop in references */
function imageFiles(dt){
  var out=[]; if(!dt)return out;
  if(dt.files&&dt.files.length)Array.prototype.forEach.call(dt.files,function(f){if(/^image\//.test(f.type))out.push(f)});
  if(!out.length&&dt.items)Array.prototype.forEach.call(dt.items,function(it){if(it.kind==='file'&&/^image\//.test(it.type)){var f=it.getAsFile();if(f)out.push(f)}});
  return out;
}
document.addEventListener('paste',function(e){
  if(!e.target||e.target.id!=='f-refs')return;
  var fs=imageFiles(e.clipboardData); if(!fs.length)return;
  e.preventDefault(); addRefFiles(fs);
});
document.addEventListener('dragover',function(e){
  var b=e.target.closest&&e.target.closest('#refBox'); if(!b)return;
  e.preventDefault(); b.classList.add('over');
});
document.addEventListener('dragleave',function(e){
  var b=e.target.closest&&e.target.closest('#refBox'); if(b)b.classList.remove('over');
});
document.addEventListener('drop',function(e){
  var b=e.target.closest&&e.target.closest('#refBox'); if(!b)return;
  e.preventDefault(); b.classList.remove('over'); addRefFiles(imageFiles(e.dataTransfer));
});

/* ---------- Boot ---------- */
function resolveNames(){
  if(!userCap||!userCap.profiles)return;
  var ids=[];
  S.posts.forEach(function(p){if(p.updatedBy&&!(p.updatedBy in S.names)&&ids.indexOf(p.updatedBy)<0)ids.push(p.updatedBy)});
  if(!ids.length)return;
  ids.forEach(function(i){S.names[i]=''});
  userCap.profiles(ids).then(function(ps){
    ids.forEach(function(i){S.names[i]=(ps&&ps[i]&&ps[i].name)||''});
    if(S.view==='detalle')paintFooter();
  },function(){});
}
function subscribe(){
  var timer=setTimeout(function(){S.slow=true;render()},10000);
  function ready(snap){if(!snap.metadata.fromCache){clearTimeout(timer);S.slow=false}}
  function bad(){clearTimeout(timer);S.slow=false;render()}
  db.collection('posts').onSnapshot(function(snap){
    var m=new Map();
    snap.docs.forEach(function(d){m.set(d.id,Object.assign({id:d.id},d.data()))});
    S.posts=m;S.loaded.posts=true;ready(snap);resolveNames();onData(snap.metadata.hasPendingWrites);
  },bad);
  db.collection('goals').onSnapshot(function(snap){
    var m=new Map();
    snap.docs.forEach(function(d){m.set(d.id,Object.assign({id:d.id},d.data()))});
    S.goals=m;S.loaded.goals=true;ready(snap);
    if(S.view!=='detalle')onData(snap.metadata.hasPendingWrites);
  },bad);
  db.doc('settings/account').onSnapshot(function(snap){
    S.account=snap.exists?snap.data():{};
    var el=document.getElementById('acct');
    if(el&&el!==document.activeElement&&el.value!==(S.account.handle||''))el.value=S.account.handle||'';
    if(S.view==='pauta'&&!snap.metadata.hasPendingWrites)render();
  },function(){});
}
function boot(){
  route();render(true);
  var c=window.claude;
  if(!c||!c.use){S.booted=true;render();return}
  Promise.all([
    c.use('db').catch(function(){return null}),
    c.use('user').catch(function(){return null}),
    c.use('assets').catch(function(){return null})
  ]).then(function(r){
    db=r[0];userCap=r[1];S.assets=r[2]||null;S.booted=true;
    var jobs=[];
    if(userCap){
      jobs.push(Promise.resolve(userCap.id()).then(function(id){S.uid=id},function(){}));
      jobs.push(Promise.resolve(userCap.can('data.write')).then(function(v){if(v===false)S.canWrite=false},function(){}));
    }
    return Promise.all(jobs);
  }).then(function(){
    if(!db){render();return}
    subscribe();render();
  });
}
boot();
})();
