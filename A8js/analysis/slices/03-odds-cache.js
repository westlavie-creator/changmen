// ---- 实时赔率缓存 fo / Jn / anchor 1: updateOddsLock / approx line 8947 ----
let l=!0;this.interceptors.request.forEach(function(g){typeof g.runWhen=="function"&&g.runWhen(r)===!1||(l=l&&g.synchronous,i.unshift(g.fulfilled,g.rejected))});const u=[];this.interceptors.response.forEach(function(g){u.push(g.fulfilled,g.rejected)});let c,d=0,f;if(!l){const h=[xF.bind(this),void 0];for(h.unshift(...i),h.push(...u),f=h.length,c=Promise.resolve(r);d<f;)c=c.then(h[d++],h[d++]);return c}f=i.length;let p=r;for(;d<f;){const h=i[d++],g=i[d++];try{p=h(p)}catch(y){g.call(this,y);break}}try{c=xF.call(this,p)}catch(h){return Promise.reject(h)}for(d=0,f=u.length;d<f;)c=c.then(u[d++],u[d++]);return c}getUri(e){e=sh(this.defaults,e);const r=gG(e.baseURL,e.url,e.allowAbsoluteUrls);return cG(r,e.params,e.paramsSerializer)}}lt.forEach(["delete","get","head","options"],function(e){$p.prototype[e]=function(r,n){return this.request(sh(n||{},{method:e,url:r,data:(n||{}).data}))}});lt.forEach(["post","put","patch"],function(e){function r(n){return function(o,a,i){return this.request(sh(i||{},{method:e,headers:n?{"Content-Type":"multipart/form-data"}:{},url:o,data:a}))}}$p.prototype[e]=r(),$p.prototype[e+"Form"]=r(!0)});class O8{constructor(e){if(typeof e!="function")throw new TypeError("executor must be a function.");let r;this.promise=new Promise(function(o){r=o});const n=this;this.promise.then(s=>{if(!n._listeners)return;let o=n._listeners.length;for(;o-- >0;)n._listeners[o](s);n._listeners=null}),this.promise.then=s=>{let o;const a=new Promise(i=>{n.subscribe(i),o=i}).then(s);return a.cancel=function(){n.unsubscribe(o)},a},e(function(o,a,i){n.reason||(n.reason=new Cm(o,a,i),r(n.reason))})}throwIfRequested(){if(this.reason)throw this.reason}subscribe(e){if(this.reason){e(this.reason);return}this._listeners?this._listeners.push(e):this._listeners=[e]}unsubscribe(e){if(!this._listeners)return;const r=this._listeners.indexOf(e);r!==-1&&this._listeners.splice(r,1)}toAbortSignal(){const e=new AbortController,r=n=>{e.abort(n)};return this.subscribe(r),e.signal.unsubscribe=()=>this.unsubscribe(r),e.signal}static source(){let e;return{token:new O8(function(s){e=s}),cancel:e}}}function JIe(t){return function(r){return t.apply(null,r)}}function XIe(t){return lt.isObject(t)&&t.isAxiosError===!0}const O3={Continue:100,SwitchingProtocols:101,Processing:102,EarlyHints:103,Ok:200,Created:201,Accepted:202,NonAuthoritativeInformation:203,NoContent:204,ResetContent:205,PartialContent:206,MultiStatus:207,AlreadyReported:208,ImUsed:226,MultipleChoices:300,MovedPermanently:301,Found:302,SeeOther:303,NotModified:304,UseProxy:305,Unused:306,TemporaryRedirect:307,PermanentRedirect:308,BadRequest:400,Unauthorized:401,PaymentRequired:402,Forbidden:403,NotFound:404,MethodNotAllowed:405,NotAcceptable:406,ProxyAuthenticationRequired:407,RequestTimeout:408,Conflict:409,Gone:410,LengthRequired:411,PreconditionFailed:412,PayloadTooLarge:413,UriTooLong:414,UnsupportedMediaType:415,RangeNotSatisfiable:416,ExpectationFailed:417,ImATeapot:418,MisdirectedRequest:421,UnprocessableEntity:422,Locked:423,FailedDependency:424,TooEarly:425,UpgradeRequired:426,PreconditionRequired:428,TooManyRequests:429,RequestHeaderFieldsTooLarge:431,UnavailableForLegalReasons:451,InternalServerError:500,NotImplemented:501,BadGateway:502,ServiceUnavailable:503,GatewayTimeout:504,HttpVersionNotSupported:505,VariantAlsoNegotiates:506,InsufficientStorage:507,LoopDetected:508,NotExtended:510,NetworkAuthenticationRequired:511};Object.entries(O3).forEach(([t,e])=>{O3[e]=t});function wG(t){const e=new $p(t),r=XH($p.prototype.request,e);return lt.extend(r,$p.prototype,e,{allOwnKeys:!0}),lt.extend(r,e,null,{allOwnKeys:!0}),r.create=function(s){return wG(sh(t,s))},r}const Nr=wG(zb);Nr.Axios=$p;Nr.CanceledError=Cm;Nr.CancelToken=O8;Nr.isCancel=pG;Nr.VERSION=bG;Nr.toFormData=ex;Nr.AxiosError=Sr;Nr.Cancel=Nr.CanceledError;Nr.all=function(e){return Promise.all(e)};Nr.spread=JIe;Nr.isAxiosError=XIe;Nr.mergeConfig=sh;Nr.AxiosHeaders=Wa;Nr.formToJSON=t=>fG(lt.isHTMLForm(t)?new FormData(t):t);Nr.getAdapter=vG.getAdapter;Nr.HttpStatusCode=O3;Nr.default=Nr;const AF="phnhdoaolljdeohmagpngbijbjbiecde",SF=2;class Yn{static async sendMessage(e){return e.uuid||(e.uuid=pt.uuid()),new Promise((r,n)=>{chrome.runtime.sendMessage(AF,e,{},s=>{chrome.runtime.lastError&&n(chrome.runtime.lastError),s?r(s):(console.error(`未安装 ${AF} 插件`),n(null))})})}static async init(){try{const e=await Yn.sendMessage({type:"version"}),r=e==null?void 0:e.response;return r&&parseFloat(r.version)<SF&&(r.error=`当前版本：${r.version}低于系统要求的最低版本：${SF}`),r}catch{return}}static async get(e,r){const n=await this.sendMessage({type:"GET",url:e,options:r});return n==null?void 0:n.response}static async post(e,r,n){const s=await this.sendMessage({type:"POST",url:e,data:r,options:n});return s==null?void 0:s.response}static async getStore(e){return await this.sendMessage({type:"getStore",data:{key:e}})}}class D8{constructor(e){ke(this,"betting");ke(this,"bettingAutoOpen");ke(this,"bettingAutoOpenTime");ke(this,"betMoney");ke(this,"minMoney");ke(this,"maxMoney");ke(this,"tenNumber");ke(this,"makeUp");ke(this,"makeUp_odds");ke(this,"makeUp_defaultOdds");ke(this,"makeProfit");ke(this,"noSameProvider");ke(this,"allowSameProvider",[Xt.PB]);ke(this,"noSameBet");ke(this,"allowSameBet",[Xt.PB]);ke(this,"anyOdds");ke(this,"anyOddsProfit");ke(this,"betSorting");ke(this,"winRateValue",.15);ke(this,"providerSortValue");ke(this,"providerFixed",[Xt.IM]);ke(this,"fake");ke(this,"betCount");ke(this,"betInterval");ke(this,"profit");ke(this,"maxProfit");ke(this,"minOdds");ke(this,"maxOdds");ke(this,"waitTime");ke(this,"betChecked");ke(this,"singleBet");ke(this,"singleMinBet");ke(this,"singleMaxBet");ke(this,"checkTimeout");e??(e={}),this.betting=!!e.betting,this.bettingAutoOpen=!!e.bettingAutoOpen,this.bettingAutoOpenTime=e.bettingAutoOpenTime??0,this.betMoney=Number(e.betMoney)||100,this.minMoney=Number(e.minMoney)||0,this.maxMoney=Number(e.maxMoney)||0,this.tenNumber=!!e.tenNumber,this.makeUp=!!e.makeUp,this.makeUp_odds=Number(e.makeUp_odds||0),this.makeUp_defaultOdds=Number(e.makeUp_defaultOdds||0),this.makeProfit=e.makeProfit,this.noSameProvider=!!e.noSameProvider,this.noSameBet=!!e.noSameBet,this.anyOdds=!!e.anyOdds,this.anyOddsProfit=e.anyOddsProfit||.95,this.profit=Number(e.profit)||1.03,this.maxProfit=Number(e.maxProfit)||1.2,this.betSorting=e.betSorting||"Custom",this.winRateValue=Number(e.winRateValue)||.15,this.providerSortValue=e.providerSortValue||[...Object.values(Xt)],[...Object.values(Xt)].forEach(r=>{this.providerSortValue.includes(r)||this.providerSortValue.push(r)}),this.fake=e.fake||[],this.betCount=Number(e.betCount)??0,this.betInterval=Number(e.betInterval)||30,this.minOdds=Number(e.minOdds)||1.3,this.maxOdds=Number(e.maxOdds)||10,e.waitTime&&Object.keys(e.waitTime).forEach(r=>{const n=Number(e.waitTime[r])||0;e.waitTime[r]=n}),this.waitTime=e.waitTime||{},this.betChecked=!!e.betChecked,this.singleBet=!!e.singleBet,this.singleMinBet=e.singleMinBet,this.singleMaxBet=e.singleMaxBet,this.checkTimeout=Number(e.checkTimeout)||3e3}}class Jn{constructor(e,r,n,s,o){ke(this,"id");ke(this,"betId");ke(this,"time");ke(this,"odds");ke(this,"isLock");this.id=e,this.odds=r,this.isLock=n,this.time=o??Date.now(),this.betId=s}}class QIe{constructor(e,r,n){ke(this,"value");ke(this,"expireTime");ke(this,"payout");this.value=e,this.expireTime=n,r&&(this.payout=e*r)}getValue(e){if(!(!this.expireTime||this.expireTime<Date.now()))return!e||!this.payout?this.value:Math.floor(this.payout/e)}isLimit(e,r){return this.expireTime&&this.expireTime<Date.now()?!1:!r||!this.payout?e>this.value:Math.floor(this.payout/r)<e}}const fo=mh("counter",()=>{const t=new Map,e=new Map,r=oe(new Map),n=oe(new Map),s=(y,v)=>{if(!n.value.has(y))return!1;for(const w of v)if(n.value.get(y).has(w))return!0;return!1},o=(y,v)=>{var w,b;if(!(!y||!v))return(b=(w=n.value)==null?void 0:w.get(y))==null?void 0:b.get(v)},a=(y,v,w,b,C)=>{n.value.has(y)||n.value.set(y,new Map);const E=C&&Date.now()+C*1e3||void 0;n.value.get(y).set(v,new QIe(w,b,E))},i=(y,v)=>{var w,b;(b=(w=n.value)==null?void 0:w.get(y))==null||b.delete(v)},l=y=>{const v=Date.now();y||n.value.forEach(w=>{const b=[];w.forEach((C,E)=>{C.expireTime&&C.expireTime<v&&b.push(E)}),b.forEach(C=>{w.delete(C)})})},u=(y,v)=>{var w;return!!((w=e.get(y))!=null&&w.get(v))},c=(y,v)=>{var b,C,E,_,A,T,S;e.has(y)||e.set(y,new Map);const w=v.id;(b=e.get(y))==null||b.set(w,v),t.has(y)||t.set(y,new Map),v.betId&&((C=t.get(y))!=null&&C.has(v.betId)?((A=(_=t.get(y))==null?void 0:_.get(v.betId))==null?void 0:A.includes(v.id))===!1&&((S=(T=t.get(y))==null?void 0:T.get(v.betId))==null||S.push(v.id)):(E=t.get(y))==null||E.set(v.betId,[v.id]))},d=(y,v,w)=>{var C;const b=(C=e.get(y))==null?void 0:C.get(v);b&&(b.isLock=w)};return{save:c,clean:y=>{var v;if(y)e.set(y,new Map);else{const w=Date.now()-36e5;for(const b of Object.values(Xt)){if(!e.get(b))continue;const C=[];(v=e.get(b))==null||v.forEach((E,_)=>{E.time<w&&C.push(_)}),C.forEach(E=>{e.get(b).delete(E)})}}},bet:t,data:e,updateOddsLock:d,updateBetLock:(y,v,w)=>{var b,C;(C=(b=t.get(y))==null?void 0:b.get(v))==null||C.forEach(E=>{d(y,E,w)})},message:r,updateMessage:(y,v)=>{r.value.set(y,v)},getOdds:(y,v,w)=>{var C;const b=(C=e.get(y))==null?void 0:C.get(v);return b===void 0?w:b.isLock?0:b.odds},isOdds:u,limit:n,setLimit:a,getLimit:o,deleteLimit:i,cleanLimit:l,hasLimit:s}});class eBe{constructor(e,r){ke(this,"score");this.score=new Map;for(var[n,s]of Object.entries(e)){const o=r?{Home:s.Away,Away:s.Home}:s;this.score.set(Number(n),o)}}}class tBe{constructor(e){ke(this,"id");ke(this,"name");this.id=e.ID,this.name=e.Name}}class rBe{constructor(e,r,n,s){ke(this,"matchId");ke(this,"match");ke(this,"betId");ke(this,"bet");ke(this,"linkId");this.matchId=e,this.match=r,this.betId=n,this.bet=s,this.linkId=Date.now()}}class rA{constructor(e,r,n){ke(this,"LinkID");ke(this,"Provider");ke(this,"OrderID");this.LinkID=e,this.Provider=r,this.OrderID=n}}const _F="LOSEORDER",jb=mh("loseorder",()=>{const t=oe(new Map),e=()=>{sessionStorage.setItem(_F,JSON.stringify([...t.value.values()]))},r=i=>{const l=i.betId;t.value.set(l,i),e(),i.isCreateOrder&&Gi().send.PublishLoseOrderMessage()},n=(i,l)=>{var g;if(!(l!=null&&l.isOpen)||!l.betMoney||l.betMoney===0)return;const c=(g=Vg().matchs)==null?void 0:g.find(y=>y.id===i.matchId);if(!c)return;const d=c.bets.find(y=>y.id===i.betId);if(!d)return;const f=Number(i.odds)+Number(l.odds??0),p=Number(l.betMoney);console.log(p,f);const h=new eb(0,i.matchId,i.betId,i.target,p,f,c.title,d.name??"",0,Date.now(),!0,1);r(h)},s=(i,l)=>{if(t.value.has(i)){const u=t.value.get(i);!l&&(u!=null&&u.betCount)&&u.betCount>1?u.betCount-=1:t.value.delete(i),e()}},o=i=>{if(t.value.size===0)return;const l=[];i.forEach(u=>{u.forEach(c=>{l.push(c)})}),[...t.value.keys()].forEach(u=>{l.includes(u)||s(u)})};return(()=>{const i=sessionStorage.getItem(_F);if(!i)return;const l=JSON.parse(i);console.log(l),t.value=new Map(l.map(u=>[u.betId,new eb(u.accountId,u.matchId,u.betId,u.target,u.betMoney,u.betOdds,u.match,u.bet,u.linkId,u.createAt,u.isCreateOrder,u.betCount)]))})(),{orders:t,createOrder:r,createFollowOrder:n,removeOrder:s,removeOrders:o}}),CG="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",EG="ARRAYBUFFER not supported by this environment",xG="UINT8ARRAY not supported by this environment";function PF(t,e,r,n){let s,o,a;const i=e||[0],l=(r=r||0)>>>3,u=n===-1?3:0;for(s=0;s<t.length;s+=1)a=s+l,o=a>>>2,i.length<=o&&i.push(0),i[o]|=t[s]<<8*(u+n*(a%4));return{value:i,binLen:8*t.length+r}}function Em(t,e,r){switch(e){case"UTF8":case"UTF16BE":case"UTF16LE":break;default:throw new Error("encoding must be UTF8, UTF16BE, or UTF16LE")}switch(t){case"HEX":return function(n,s,o){return function(a,i,l,u){let c,d,f,p;if(a.length%2!=0)throw new Error("String of HEX type must be in byte increments");const h=i||[0],g=(l=l||0)>>>3,y=u===-1?3:0;for(c=0;c<a.length;c+=2){if(d=parseInt(a.substr(c,2),16),isNaN(d))throw new Error("String of HEX type contains invalid characters");for(p=(c>>>1)+g,f=p>>>2;h.length<=f;)h.push(0);h[f]|=d<<8*(y+u*(p%4))}return{value:h,binLen:4*a.length+l}}(n,s,o,r)};case"TEXT":return function(n,s,o){return function(a,i,l,u,c){let d,f,p,h,g,y,v,w,b=0;const C=l||[0],E=(u=u||0)>>>3;if(i==="UTF8")for(v=c===-1?3:0,p=0;p<a.length;p+=1)for(d=a.charCodeAt(p),f=[],128>d?f.push(d):2048>d?(f.push(192|d>>>6),f.push(128|63&d)):55296>d||57344<=d?f.push(224|d>>>12,128|d>>>6&63,128|63&d):(p+=1,d=65536+((1023&d)<<10|1023&a.charCodeAt(p)),f.push(240|d>>>18,128|d>>>12&63,128|d>>>6&63,128|63&d)),h=0;h<f.length;h+=1){for(y=b+E,g=y>>>2;C.length<=g;)C.push(0);C[g]|=f[h]<<8*(v+c*(y%4)),b+=1}else for(v=c===-1?2:0,w=i==="UTF16LE"&&c!==1||i!=="UTF16LE"&&c===1,p=0;p<a.length;p+=1){for(d=a.charCodeAt(p),w===!0&&(h=255&d,d=h<<8|d>>>8),y=b+E,g=y>>>2;C.length<=g;)C.push(0);C[g]|=d<<8*(v+c*(y%4)),b+=2}return{value:C,binLen:8*b+u}}(n,e,s,o,r)};case"B64":return function(n,s,o){return function(a,i,l,u){let c,d,f,p,h,g,y,v=0;const w=i||[0],b=(l=l||0)>>>3,C=u===-1?3:0,E=a.indexOf("=");if(a.search(/^[a-zA-Z0-9=+/]+$/)===-1)throw new Error("Invalid character in base-64 string");if(a=a.replace(/=/g,""),E!==-1&&E<a.length)throw new Error("Invalid '=' found in base-64 string");for(d=0;d<a.length;d+=4){for(h=a.substr(d,4),p=0,f=0;f<h.length;f+=1)c=CG.indexOf(h.charAt(f)),p|=c<<18-6*f;for(f=0;f<h.length-1;f+=1){for(y=v+b,g=y>>>2;w.length<=g;)w.push(0);w[g]|=(p>>>16-8*f&255)<<8*(C+u*(y%4)),v+=1}}return{value:w,binLen:8*v+l}}(n,s,o,r)};case"BYTES":return function(n,s,o){return function(a,i,l,u){let c,d,f,p;const h=i||[0],g=(l=l||0)>>>3,y=u===-1?3:0;for(d=0;d<a.length;d+=1)c=a.charCodeAt(d),p=d+g,f=p>>>2,h.length<=f&&h.push(0),h[f]|=c<<8*(y+u*(p%4));return{value:h,binLen:8*a.length+l}}(n,s,o,r)};case"ARRAYBUFFER":try{new ArrayBuffer(0)}catch{throw new Error(EG)}return function(n,s,o){return function(a,i,l,u){return PF(new Uint8Array(a),i,l,u)}(n,s,o,r)};case"UINT8ARRAY":try{new Uint8Array(0)}catch{throw new Error(xG)}return function(n,s,o){return PF(n,s,o,r)};default:throw new Error("format must be HEX, TEXT, B64, BYTES, ARRAYBUFFER, or UINT8ARRAY")}}function kF(t,e,r,n){switch(t){case"HEX":return function(s){return function(o,a,i,l){const u="0123456789abcdef";let c,d,f="";const p=a/8,h=i===-1?3:0;for(c=0;c<p;c+=1)d=o[c>>>2]>>>8*(h+i*(c%4)),f+=u.charAt(d>>>4&15)+u.charAt(15&d);return l.outputUpper?f.toUpperCase():f}(s,e,r,n)};case"B64":return function(s){return function(o,a,i,l){let u,c,d,f,p,h="";const g=a/8,y=i===-1?3:0;for(u=0;u<g;u+=3)for(f=u+1<g?o[u+1>>>2]:0,p=u+2<g?o[u+2>>>2]:0,d=(o[u>>>2]>>>8*(y+i*(u%4))&255)<<16|(f>>>8*(y+i*((u+1)%4))&255)<<8|p>>>8*(y+i*((u+2)%4))&255,c=0;c<4;c+=1)h+=8*u+6*c<=a?CG.charAt(d>>>6*(3-c)&63):l.b64Pad;return h}(s,e,r,n)};case"BYTES":return function(s){return function(o,a,i){let l,u,c="";const d=a/8,f=i===-1?3:0;for(l=0;l<d;l+=1)u=o[l>>>2]>>>8*(f+i*(l%4))&255,c+=String.fromCharCode(u);return c}(s,e,r)};case"ARRAYBUFFER":try{new ArrayBuffer(0)}catch{throw new Error(EG)}return function(s){return function(o,a,i){let l;const u=a/8,c=new ArrayBuffer(u),d=new Uint8Array(c),f=i===-1?3:0;for(l=0;l<u;l+=1)d[l]=o[l>>>2]>>>8*(f+i*(l%4))&255;return c}(s,e,r)};case"UINT8ARRAY":try{new Uint8Array(0)}catch{throw new Error(xG)}return function(s){return function(o,a,i){let l;const u=a/8,c=i===-1?3:0,d=new Uint8Array(u);for(l=0;l<u;l+=1)d[l]=o[l>>>2]>>>8*(c+i*(l%4))&255;return d}(s,e,r)};default:throw new Error("format must be HEX, B64, BYTES, ARRAYBUFFER, or UINT8ARRAY")}}const Hb=4294967296,nr=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],Zu=[3238371032,914150663,812702999,4144912697,4290775857,1750603025,1694076839,3204075428],Ju=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],Gb="Chosen SHA variant is not supported",TG="Cannot set numRounds with MAC";function AC(t,e){let r,n;const s=t.binLen>>>3,o=e.binLen>>>3,a=s<<3,i=4-s<<3;if(s%4!=0){for(r=0;r<o;r+=4)n=s+r>>>2,t.value[n]|=e.value[r>>>2]<<a,t.value.push(0),t.value[n+1]|=e.value[r>>>2]>>>i;return(t.value.length<<2)-4>=o+s&&t.value.pop(),{value:t.value,binLen:t.binLen+e.binLen}}return{value:t.value.concat(e.value),binLen:t.binLen+e.binLen}}function IF(t){const e={outputUpper:!1,b64Pad:"=",outputLen:-1},r=t||{},n="Output length must be a multiple of 8";if(e.outputUpper=r.outputUpper||!1,r.b64Pad&&(e.b64Pad=r.b64Pad),r.outputLen){if(r.outputLen%8!=0)throw new Error(n);e.outputLen=r.outputLen}else if(r.shakeLen){if(r.shakeLen%8!=0)throw new Error(n);e.outputLen=r.shakeLen}if(typeof e.outputUpper!="boolean")throw new Error("Invalid outputUpper formatting option");if(typeof e.b64Pad!="string")throw new Error("Invalid b64Pad formatting option");return e}function Od(t,e,r,n){const s=t+" must include a value and format";if(!e){if(!n)throw new Error(s);return n}if(e.value===void 0||!e.format)throw new Error(s);return Em(e.format,e.encoding||"UTF8",r)(e.value)}let rx=class{constructor(e,r,n){const s=n||{};if(this.t=r,this.i=s.encoding||"UTF8",this.numRounds=s.numRounds||1,isNaN(this.numRounds)||this.numRounds!==parseInt(this.numRounds,10)||1>this.numRounds)throw new Error("numRounds must a integer >= 1");this.o=e,this.h=[],this.u=0,this.l=!1,this.A=0,this.H=!1,this.S=[],this.p=[]}update(e){let r,n=0;const s=this.m>>>5,o=this.C(e,this.h,this.u),a=o.binLen,i=o.value,l=a>>>5;for(r=0;r<l;r+=s)n+this.m<=a&&(this.U=this.v(i.slice(r,r+s),this.U),n+=this.m);return this.A+=n,this.h=i.slice(n>>>5),this.u=a%this.m,this.l=!0,this}getHash(e,r){let n,s,o=this.R;const a=IF(r);if(this.K){if(a.outputLen===-1)throw new Error("Output length must be specified in options");o=a.outputLen}const i=kF(e,o,this.T,a);if(this.H&&this.g)return i(this.g(a));for(s=this.F(this.h.slice(),this.u,this.A,this.L(this.U),o),n=1;n<this.numRounds;n+=1)this.K&&o%32!=0&&(s[s.length-1]&=16777215>>>24-o%32),s=this.F(s,o,0,this.B(this.o),o);return i(s)}setHMACKey(e,r,n){if(!this.M)throw new Error("Variant does not support HMAC");if(this.l)throw new Error("Cannot set MAC key after calling update");const s=Em(r,(n||{}).encoding||"UTF8",this.T);this.k(s(e))}k(e){const r=this.m>>>3,n=r/4-1;let s;if(this.numRounds!==1)throw new Error(TG);if(this.H)throw new Error("MAC key already set");for(r<e.binLen/8&&(e.value=this.F(e.value,e.binLen,0,this.B(this.o),this.R));e.value.length<=n;)e.value.push(0);for(s=0;s<=n;s+=1)this.S[s]=909522486^e.value[s],this.p[s]=1549556828^e.value[s];this.U=this.v(this.S,this.U),this.A=this.m,this.H=!0}getHMAC(e,r){const n=IF(r);return kF(e,this.R,this.T,n)(this.Y())}Y(){let e;if(!this.H)throw new Error("Cannot call getHMAC without first setting MAC key");const r=this.F(this.h.slice(),this.u,this.A,this.L(this.U),this.R);return e=this.v(this.p,this.B(this.o)),e=this.F(r,this.R,this.m,e,this.R),e}};function $h(t,e){return t<<e|t>>>32-e}function wu(t,e){return t>>>e|t<<32-e}function AG(t,e){return t>>>e}function BF(t,e,r){return t^e^r}function SG(t,e,r){return t&e^~t&r}function _G(t,e,r){return t&e^t&r^e&r}function nBe(t){return wu(t,2)^wu(t,13)^wu(t,22)}function Ps(t,e){const r=(65535&t)+(65535&e);return(65535&(t>>>16)+(e>>>16)+(r>>>16))<<16|65535&r}function oBe(t,e,r,n){const s=(65535&t)+(65535&e)+(65535&r)+(65535&n);return(65535&(t>>>16)+(e>>>16)+(r>>>16)+(n>>>16)+(s>>>16))<<16|65535&s}function Sy(t,e,r,n,s){const o=(65535&t)+(65535&e)+(65535&r)+(65535&n)+(65535&s);return(65535&(t>>>16)+(e>>>16)+(r>>>16)+(n>>>16)+(s>>>16)+(o>>>16))<<16|65535&o}function sBe(t){return wu(t,7)^wu(t,18)^AG(t,3)}function aBe(t){return wu(t,6)^wu(t,11)^wu(t,25)}function iBe(t){return[1732584193,4023233417,2562383102,271733878,3285377520]}function PG(t,e){let r,n,s,o,a,i,l;const u=[];for(r=e[0],n=e[1],s=e[2],o=e[3],a=e[4],l=0;l<80;l+=1)u[l]=l<16?t[l]:$h(u[l-3]^u[l-8]^u[l-14]^u[l-16],1),i=l<20?Sy($h(r,5),SG(n,s,o),a,1518500249,u[l]):l<40?Sy($h(r,5),BF(n,s,o),a,1859775393,u[l]):l<60?Sy($h(r,5),_G(n,s,o),a,2400959708,u[l]):Sy($h(r,5),BF(n,s,o),a,3395469782,u[l]),a=o,o=s,s=$h(n,30),n=r,r=i;return e[0]=Ps(r,e[0]),e[1]=Ps(n,e[1]),e[2]=Ps(s,e[2]),e[3]=Ps(o,e[3]),e[4]=Ps(a,e[4]),e}function lBe(t,e,r,n){let s;const o=15+(e+65>>>9<<4),a=e+r;for(;t.length<=o;)t.push(0);for(t[e>>>5]|=128<<24-e%32,t[o]=4294967295&a,t[o-1]=a/Hb|0,s=0;s<t.length;s+=16)n=PG(t.slice(s,s+16),n);return n}let uBe=class extends rx{constructor(e,r,n){if(e!=="SHA-1")throw new Error(Gb);super(e,r,n);const s=n||{};this.M=!0,this.g=this.Y,this.T=-1,this.C=Em(this.t,this.i,this.T),this.v=PG,this.L=function(o){return o.slice()},this.B=iBe,this.F=lBe,this.U=[1732584193,4023233417,2562383102,271733878,3285377520],this.m=512,this.R=160,this.K=!1,s.hmacKey&&this.k(Od("hmacKey",s.hmacKey,this.T))}};function OF(t){let e;return e=t=="SHA-224"?Zu.slice():Ju.slice(),e}function DF(t,e){let r,n,s,o,a,i,l,u,c,d,f;const p=[];for(r=e[0],n=e[1],s=e[2],o=e[3],a=e[4],i=e[5],l=e[6],u=e[7],f=0;f<64;f+=1)p[f]=f<16?t[f]:oBe(wu(h=p[f-2],17)^wu(h,19)^AG(h,10),p[f-7],sBe(p[f-15]),p[f-16]),c=Sy(u,aBe(a),SG(a,i,l),nr[f],p[f]),d=Ps(nBe(r),_G(r,n,s)),u=l,l=i,i=a,a=Ps(o,c),o=s,s=n,n=r,r=Ps(c,d);var h;return e[0]=Ps(r,e[0]),e[1]=Ps(n,e[1]),e[2]=Ps(s,e[2]),e[3]=Ps(o,e[3]),e[4]=Ps(a,e[4]),e[5]=Ps(i,e[5]),e[6]=Ps(l,e[6]),e[7]=Ps(u,e[7]),e}let cBe=class extends rx{constructor(e,r,n){if(e!=="SHA-224"&&e!=="SHA-256")throw new Error(Gb);super(e,r,n);const s=n||{};this.g=this.Y,this.M=!0,this.T=-1,this.C=Em(this.t,this.i,this.T),this.v=DF,this.L=function(o){return o.slice()},this.B=OF,this.F=function(o,a,i,l){return function(u,c,d,f,p){let h,g;const y=15+(c+65>>>9<<4),v=c+d;for(;u.length<=y;)u.push(0);for(u[c>>>5]|=128<<24-c%32,u[y]=4294967295&v,u[y-1]=v/Hb|0,h=0;h<u.length;h+=16)f=DF(u.slice(h,h+16),f);return g=p==="SHA-224"?[f[0],f[1],f[2],f[3],f[4],f[5],f[6]]:f,g}(o,a,i,l,e)},this.U=OF(e),this.m=512,this.R=e==="SHA-224"?224:256,this.K=!1,s.hmacKey&&this.k(Od("hmacKey",s.hmacKey,this.T))}},it=class{constructor(e,r){this.N=e,this.I=r}};function MF(t,e){let r;return e>32?(r=64-e,new it(t.I<<e|t.N>>>r,t.N<<e|t.I>>>r)):e!==0?(r=32-e,new it(t.N<<e|t.I>>>r,t.I<<e|t.N>>>r)):t}function Cu(t,e){let r;return e<32?(r=32-e,new it(t.N>>>e|t.I<<r,t.I>>>e|t.N<<r)):(r=64-e,new it(t.I>>>e|t.N<<r,t.N>>>e|t.I<<r))}function kG(t,e){return new it(t.N>>>e,t.I>>>e|t.N<<32-e)}function dBe(t,e,r){return new it(t.N&e.N^t.N&r.N^e.N&r.N,t.I&e.I^t.I&r.I^e.I&r.I)}function fBe(t){const e=Cu(t,28),r=Cu(t,34),n=Cu(t,39);return new it(e.N^r.N^n.N,e.I^r.I^n.I)}function qi(t,e){let r,n;r=(65535&t.I)+(65535&e.I),n=(t.I>>>16)+(e.I>>>16)+(r>>>16);const s=(65535&n)<<16|65535&r;return r=(65535&t.N)+(65535&e.N)+(n>>>16),n=(t.N>>>16)+(e.N>>>16)+(r>>>16),new it((65535&n)<<16|65535&r,s)}function pBe(t,e,r,n){let s,o;s=(65535&t.I)+(65535&e.I)+(65535&r.I)+(65535&n.I),o=(t.I>>>16)+(e.I>>>16)+(r.I>>>16)+(n.I>>>16)+(s>>>16);const a=(65535&o)<<16|65535&s;return s=(65535&t.N)+(65535&e.N)+(65535&r.N)+(65535&n.N)+(o>>>16),o=(t.N>>>16)+(e.N>>>16)+(r.N>>>16)+(n.N>>>16)+(s>>>16),new it((65535&o)<<16|65535&s,a)}function hBe(t,e,r,n,s){let o,a;o=(65535&t.I)+(65535&e.I)+(65535&r.I)+(65535&n.I)+(65535&s.I),a=(t.I>>>16)+(e.I>>>16)+(r.I>>>16)+(n.I>>>16)+(s.I>>>16)+(o>>>16);const i=(65535&a)<<16|65535&o;return o=(65535&t.N)+(65535&e.N)+(65535&r.N)+(65535&n.N)+(65535&s.N)+(a>>>16),a=(t.N>>>16)+(e.N>>>16)+(r.N>>>16)+(n.N>>>16)+(s.N>>>16)+(o>>>16),new it((65535&a)<<16|65535&o,i)}function Jm(t,e){return new it(t.N^e.N,t.I^e.I)}function gBe(t){const e=Cu(t,19),r=Cu(t,61),n=kG(t,6);return new it(e.N^r.N^n.N,e.I^r.I^n.I)}function mBe(t){const e=Cu(t,1),r=Cu(t,8),n=kG(t,7);return new it(e.N^r.N^n.N,e.I^r.I^n.I)}function yBe(t){const e=Cu(t,14),r=Cu(t,18),n=Cu(t,41);return new it(e.N^r.N^n.N,e.I^r.I^n.I)}const vBe=[new it(nr[0],3609767458),new it(nr[1],602891725),new it(nr[2],3964484399),new it(nr[3],2173295548),new it(nr[4],4081628472),new it(nr[5],3053834265),new it(nr[6],2937671579),new it(nr[7],3664609560),new it(nr[8],2734883394),new it(nr[9],1164996542),new it(nr[10],1323610764),new it(nr[11],3590304994),new it(nr[12],4068182383),new it(nr[13],991336113),new it(nr[14],633803317),new it(nr[15],3479774868),new it(nr[16],2666613458),new it(nr[17],944711139),new it(nr[18],2341262773),new it(nr[19],2007800933),new it(nr[20],1495990901),new it(nr[21],1856431235),new it(nr[22],3175218132),new it(nr[23],2198950837),new it(nr[24],3999719339),new it(nr[25],766784016),new it(nr[26],2566594879),new it(nr[27],3203337956),new it(nr[28],1034457026),new it(nr[29],2466948901),new it(nr[30],3758326383),new it(nr[31],168717936),new it(nr[32],1188179964),new it(nr[33],1546045734),new it(nr[34],1522805485),new it(nr[35],2643833823),new it(nr[36],2343527390),new it(nr[37],1014477480),new it(nr[38],1206759142),new it(nr[39],344077627),new it(nr[40],1290863460),new it(nr[41],3158454273),new it(nr[42],3505952657),new it(nr[43],106217008),new it(nr[44],3606008344),new it(nr[45],1432725776),new it(nr[46],1467031594),new it(nr[47],851169720),new it(nr[48],3100823752),new it(nr[49],1363258195),new it(nr[50],3750685593),new it(nr[51],3785050280),new it(nr[52],3318307427),new it(nr[53],3812723403),new it(nr[54],2003034995),new it(nr[55],3602036899),new it(nr[56],1575990012),new it(nr[57],1125592928),new it(nr[58],2716904306),new it(nr[59],442776044),new it(nr[60],593698344),new it(nr[61],3733110249),new it(nr[62],2999351573),new it(nr[63],3815920427),new it(3391569614,3928383900),new it(3515267271,566280711),new it(3940187606,3454069534),new it(4118630271,4000239992),new it(116418474,1914138554),new it(174292421,2731055270),new it(289380356,3203993006),new it(460393269,320620315),new it(685471733,587496836),new it(852142971,1086792851),new it(1017036298,365543100),new it(1126000580,2618297676),new it(1288033470,3409855158),new it(1501505948,4234509866),new it(1607167915,987167468),new it(1816402316,1246189591)];function NF(t){return t==="SHA-384"?[new it(3418070365,Zu[0]),new it(1654270250,Zu[1]),new it(2438529370,Zu[2]),new it(355462360,Zu[3]),new it(1731405415,Zu[4]),new it(41048885895,Zu[5]),new it(3675008525,Zu[6]),new it(1203062813,Zu[7])]:[new it(Ju[0],4089235720),new it(Ju[1],2227873595),new it(Ju[2],4271175723),new it(Ju[3],1595750129),new it(Ju[4],2917565137),new it(Ju[5],725511199),new it(Ju[6],4215389547),new it(Ju[7],327033209)]}function RF(t,e){let r,n,s,o,a,i,l,u,c,d,f,p;const h=[];for(r=e[0],n=e[1],s=e[2],o=e[3],a=e[4],i=e[5],l=e[6],u=e[7],f=0;f<80;f+=1)f<16?(p=2*f,h[f]=new it(t[p],t[p+1])):h[f]=pBe(gBe(h[f-2]),h[f-7],mBe(h[f-15]),h[f-16]),c=hBe(u,yBe(a),(y=i,v=l,new it((g=a

// ---- 实时赔率缓存 fo / Jn / anchor 2: fo() / approx line 8965 ----
et<"u")return WebSocket},IBe=function(t){return typeof t<"u"&&!!t&&t.CLOSING===2},$f={maxReconnectionDelay:1e4,minReconnectionDelay:1e3+Math.random()*4e3,minUptime:5e3,reconnectionDelayGrowFactor:1.3,connectionTimeout:4e3,maxRetries:1/0,maxEnqueuedMessages:1/0,startClosed:!1,debug:!1},BBe=function(){function t(e,r,n){var s=this;n===void 0&&(n={}),this._listeners={error:[],message:[],open:[],close:[]},this._retryCount=-1,this._shouldReconnect=!0,this._connectLock=!1,this._binaryType="blob",this._closeCalled=!1,this._messageQueue=[],this.onclose=null,this.onerror=null,this.onmessage=null,this.onopen=null,this._handleOpen=function(o){s._debug("open event");var a=s._options.minUptime,i=a===void 0?$f.minUptime:a;clearTimeout(s._connectTimeout),s._uptimeTimeout=setTimeout(function(){return s._acceptOpen()},i),s._ws.binaryType=s._binaryType,s._messageQueue.forEach(function(l){return s._ws.send(l)}),s._messageQueue=[],s.onopen&&s.onopen(o),s._listeners.open.forEach(function(l){return s._callEventListener(o,l)})},this._handleMessage=function(o){s._debug("message event"),s.onmessage&&s.onmessage(o),s._listeners.message.forEach(function(a){return s._callEventListener(o,a)})},this._handleError=function(o){s._debug("error event",o.message),s._disconnect(void 0,o.message==="TIMEOUT"?"timeout":void 0),s.onerror&&s.onerror(o),s._debug("exec error listeners"),s._listeners.error.forEach(function(a){return s._callEventListener(o,a)}),s._connect()},this._handleClose=function(o){s._debug("close event"),s._clearTimeouts(),s._shouldReconnect&&s._connect(),s.onclose&&s.onclose(o),s._listeners.close.forEach(function(a){return s._callEventListener(o,a)})},this._url=e,this._protocols=r,this._options=n,this._options.startClosed&&(this._shouldReconnect=!1),this._connect()}return Object.defineProperty(t,"CONNECTING",{get:function(){return 0},enumerable:!0,configurable:!0}),Object.defineProperty(t,"OPEN",{get:function(){return 1},enumerable:!0,configurable:!0}),Object.defineProperty(t,"CLOSING",{get:function(){return 2},enumerable:!0,configurable:!0}),Object.defineProperty(t,"CLOSED",{get:function(){return 3},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CONNECTING",{get:function(){return t.CONNECTING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"OPEN",{get:function(){return t.OPEN},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CLOSING",{get:function(){return t.CLOSING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CLOSED",{get:function(){return t.CLOSED},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"binaryType",{get:function(){return this._ws?this._ws.binaryType:this._binaryType},set:function(e){this._binaryType=e,this._ws&&(this._ws.binaryType=e)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"retryCount",{get:function(){return Math.max(this._retryCount,0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"bufferedAmount",{get:function(){var e=this._messageQueue.reduce(function(r,n){return typeof n=="string"?r+=n.length:n instanceof Blob?r+=n.size:r+=n.byteLength,r},0);return e+(this._ws?this._ws.bufferedAmount:0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"extensions",{get:function(){return this._ws?this._ws.extensions:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"protocol",{get:function(){return this._ws?this._ws.protocol:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"readyState",{get:function(){return this._ws?this._ws.readyState:this._options.startClosed?t.CLOSED:t.CONNECTING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"url",{get:function(){return this._ws?this._ws.url:""},enumerable:!0,configurable:!0}),t.prototype.close=function(e,r){if(e===void 0&&(e=1e3),this._closeCalled=!0,this._shouldReconnect=!1,this._clearTimeouts(),!this._ws){this._debug("close enqueued: no ws instance");return}if(this._ws.readyState===this.CLOSED){this._debug("close: already closed");return}this._ws.close(e,r)},t.prototype.reconnect=function(e,r){this._shouldReconnect=!0,this._closeCalled=!1,this._retryCount=-1,!this._ws||this._ws.readyState===this.CLOSED?this._connect():(this._disconnect(e,r),this._connect())},t.prototype.send=function(e){if(this._ws&&this._ws.readyState===this.OPEN)this._debug("send",e),this._ws.send(e);else{var r=this._options.maxEnqueuedMessages,n=r===void 0?$f.maxEnqueuedMessages:r;this._messageQueue.length<n&&(this._debug("enqueue",e),this._messageQueue.push(e))}},t.prototype.addEventListener=function(e,r){this._listeners[e]&&this._listeners[e].push(r)},t.prototype.dispatchEvent=function(e){var r,n,s=this._listeners[e.type];if(s)try{for(var o=TBe(s),a=o.next();!a.done;a=o.next()){var i=a.value;this._callEventListener(e,i)}}catch(l){r={error:l}}finally{try{a&&!a.done&&(n=o.return)&&n.call(o)}finally{if(r)throw r.error}}return!0},t.prototype.removeEventListener=function(e,r){this._listeners[e]&&(this._listeners[e]=this._listeners[e].filter(function(n){return n!==r}))},t.prototype._debug=function(){for(var e=[],r=0;r<arguments.length;r++)e[r]=arguments[r];this._options.debug&&console.log.apply(console,SBe(["RWS>"],e))},t.prototype._getNextDelay=function(){var e=this._options,r=e.reconnectionDelayGrowFactor,n=r===void 0?$f.reconnectionDelayGrowFactor:r,s=e.minReconnectionDelay,o=s===void 0?$f.minReconnectionDelay:s,a=e.maxReconnectionDelay,i=a===void 0?$f.maxReconnectionDelay:a,l=0;return this._retryCount>0&&(l=o*Math.pow(n,this._retryCount-1),l>i&&(l=i)),this._debug("next delay",l),l},t.prototype._wait=function(){var e=this;return new Promise(function(r){setTimeout(r,e._getNextDelay())})},t.prototype._getNextUrl=function(e){if(typeof e=="string")return Promise.resolve(e);if(typeof e=="function"){var r=e();if(typeof r=="string")return Promise.resolve(r);if(r.then)return r}throw Error("Invalid URL")},t.prototype._connect=function(){var e=this;if(!(this._connectLock||!this._shouldReconnect)){this._connectLock=!0;var r=this._options,n=r.maxRetries,s=n===void 0?$f.maxRetries:n,o=r.connectionTimeout,a=o===void 0?$f.connectionTimeout:o,i=r.WebSocket,l=i===void 0?kBe():i;if(this._retryCount>=s){this._debug("max retries reached",this._retryCount,">=",s);return}if(this._retryCount++,this._debug("connect",this._retryCount),this._removeListeners(),!IBe(l))throw Error("No valid WebSocket class provided");this._wait().then(function(){return e._getNextUrl(e._url)}).then(function(u){e._closeCalled||(e._debug("connect",{url:u,protocols:e._protocols}),e._ws=e._protocols?new l(u,e._protocols):new l(u),e._ws.binaryType=e._binaryType,e._connectLock=!1,e._addListeners(),e._connectTimeout=setTimeout(function(){return e._handleTimeout()},a))})}},t.prototype._handleTimeout=function(){this._debug("timeout event"),this._handleError(new _Be(Error("TIMEOUT"),this))},t.prototype._disconnect=function(e,r){if(e===void 0&&(e=1e3),this._clearTimeouts(),!!this._ws){this._removeListeners();try{this._ws.close(e,r),this._handleClose(new PBe(e,r,this))}catch{}}},t.prototype._acceptOpen=function(){this._debug("accept open"),this._retryCount=0},t.prototype._callEventListener=function(e,r){"handleEvent"in r?r.handleEvent(e):r(e)},t.prototype._removeListeners=function(){this._ws&&(this._debug("removeListeners"),this._ws.removeEventListener("open",this._handleOpen),this._ws.removeEventListener("close",this._handleClose),this._ws.removeEventListener("message",this._handleMessage),this._ws.removeEventListener("error",this._handleError))},t.prototype._addListeners=function(){this._ws&&(this._debug("addListeners"),this._ws.addEventListener("open",this._handleOpen),this._ws.addEventListener("close",this._handleClose),this._ws.addEventListener("message",this._handleMessage),this._ws.addEventListener("error",this._handleError))},t.prototype._clearTimeouts=function(){clearTimeout(this._connectTimeout),clearTimeout(this._uptimeTimeout)},t}();const $F=["api.a8.to","47.115.75.57"];let LF=0;const OBe=(t,e)=>(t=t.replace("https://api-v4","wss://ws"),e=e.replace("Token ",""),LF++,`wss://${$F[LF%$F.length]}/esport/ws/TF?auth_token=${e}&combo=false`),N3=t=>({Authorization:t,"tf-authorization":MBe(t,Math.floor(Date.now()/1e3),Math.floor(Date.now()/1e3)),"public-token":"2633b50ad4f64cd28b3224e47c877057"}),DBe=t=>{for(var e=window.atob(t),r=new Uint8Array(e.length),n=0;n<e.length;n++)r[n]=e.charCodeAt(n);return r},MBe=(t,e,r)=>{t=t.replace("Token ","");var n=Math.floor(new Date().getTime()/1e3)-r+e,s=Math.floor(n/10),o=new Uint8Array(8);o[4]=s>>24&255,o[5]=s>>16&255,o[6]=s>>8&255,o[7]=255&s;const a=DBe(t);var i=new WF("SHA-1","ARRAYBUFFER");i.setHMACKey(a,"ARRAYBUFFER"),i.update(o.buffer);var l=i.getHMAC("ARRAYBUFFER"),u=new Uint8Array(l),c=15&u[u.length-1],d=(127&u[c])<<24|u[c+1]<<16|u[c+2]<<8|u[c+3],f=new WF("SHA-512","TEXT");return f.update("".concat((d%1e6).toString()).padStart(6,"0")),f.getHash("HEX")},Lf=Xt.TF,NBe=async()=>{const t=await Vt.getPlatform(Lf);if(!t)return;const e=fo(),r=async()=>{const i=await Vt.getPlatform(Lf);return i?OBe(i.gateway,i.token):""},n=new BBe(r,[],{connectionTimeout:4e3,maxRetries:1/0,maxReconnectionDelay:5e3,minReconnectionDelay:1e3});n.onopen=()=>{},n.onmessage=i=>{const l=JSON.parse(i.data);if(!l.data||!l.data.selection)return;const u=l.data.market_id;l.data.selection.forEach(c=>{const d=`${u}:${c.name}`;if(!e.isOdds(Lf,d))return;const f=new Jn(d,c.euro_odds,c.status!=="open",u);e.save(Lf,f)})},n.onerror=()=>{Gi().send.CollectMessage(Lf,"WebSocket链接发生错误")};const s=new RegExp(t.betName),o=async()=>{const i={time:Date.now(),match:0};try{const c=(await Nr.get(`${t.gateway}/api/v8/events/?game_id=&combo=false&outright=false&timing=today&market_option=MATCH&lang=zh&timezone=Asia/Shanghai`,{headers:N3(t.token)})).data.results.filter(d=>t.games.includes(d.game_id.toString())&&new Date(d.start_datetime).getTime()<Date.now()+3600*1e3);for(let d=0;d<c.length;d++){const f=c[d].event_id;i.match++,await a(f)}}catch(l){console.error(l)}finally{Pr.debug(`[${Lf}]比赛列表:${Date.now()-i.time}ms，读取比赛:${i.match}场`),await pt.wait(30*1e3),await o()}},a=async(i,l="MATCH")=>{await pt.wait(1e3);const u=l==="MATCH"?"MATCH":"MAP",c=l==="MATCH"?"":l,d=`${t.gateway}/api/v8/events/?event_id=${i}&combo=false&outright=false&map_option=${c}&market_option=${u}&lang=zh&timezone=Asia/Shanghai`,p=(await Nr.get(d,{headers:N3(t.token)})).data;if(p.results.forEach(h=>{h.markets.forEach(g=>{if(!s.test(g.market_name))return;const y=g.market_id;g.selection.forEach(v=>{const w=`${y}:${v.name}`,b=new Jn(w,v.euro_odds,v.status!=="open",y);e.save(Lf,b)})})}),l==="MATCH"){for(let h=0;h<p.results.length;h++)if(p.results[h].market_tabs)for(let g in p.results[h].market_tabs.map(y=>y.tab_name)){const y=p.results[h].market_tabs[g].tab_name;!y||y==="MATCH"||await a(i,y)}}};o()},Vg=mh("match",()=>{const t=oe(),e=oe(new Map),r=oe(new Map),n=new Map,s=async O=>{var D;try{const x=new Map;for(const[I,F]of Object.entries(O)){const R=I;x.has(R)||x.set(R,new Map);for(const[M,G]of Object.entries(F))(D=x.get(R))==null||D.set(Number(M),G)}r.value=x}finally{}},o=async()=>{r.value=await Vt.initBetTarget()},a=async(O,D,x)=>{var F,R,M;return(F=h.setting)!=null&&F.BetTarget?(c(O,D)===x?(R=r.value.get(O))==null||R.delete(D):(r.value.has(O)||r.value.set(O,new Map),(M=r.value.get(O))==null||M.set(D,x)),await u()):!1},i=oe(new Map),l=(O,D)=>{D.forEach(x=>{var G;const I=x.SourceID;var F=(G=t.value)==null?void 0:G.find(J=>J.providers[O]===I);if(!F)return;const R=F.id,M=new eBe(x.Score,F.reverse.includes(O));i.value.set(R,M)})},u=async()=>{var O;return d(),(O=h.setting)!=null&&O.BetTarget?await Vt.saveBetTarget(r.value):!1},c=(O,D)=>{var x,I;return(I=(x=r.value)==null?void 0:x.get(O))==null?void 0:I.get(D)},d=()=>{[].forEach(D=>{r.value.forEach((x,I)=>{x.delete(D)})})},f=fo(),p=Io(),h=Xn(),g=jb(),y=Gi();let v=0,w=0,b=0;const C="BETACCOUNT:",E="BETCOUNT:",_=(O,D,x)=>{if(!O.accountId)return;const I=`${C}${D}:${x}`,F=A(D,x);F.includes(O.accountId)||(F.push(O.accountId),sessionStorage.setItem(I,JSON.stringify(F)));const R=`${E}${O.accountId}:${D}:${x}`,M=T(O,D,x);sessionStorage.setItem(R,(M+1).toString())},A=(O,D)=>{const x=`${C}${O}:${D}`,I=sessionStorage.getItem(x);return I&&JSON.parse(I)||[]},T=(O,D,x)=>{const I=`${E}${O.accountId}:${D}:${x}`,F=sessionStorage.getItem(I);return F?Number(F)??0:0},S=async O=>{let D=!0,x;if(h.config.makeUp_defaultOdds!==0&&O.match&&O.bet){const I=await Vt.getDefaultOdds(O.match.id,O.bet.id,O.target);I!==0&&h.config.makeUp_defaultOdds<=I&&(x=`初赔赔率:${I}，大于当前设定值：${h.config.makeUp_defaultOdds}`,D=!1)}return h.config.makeUp_odds!==0&&h.config.makeUp_odds<=O.odds&&(x=`当前赔率:${O.odds}，大于当前设定值：${h.config.makeUp_odds}`,D=!1),D||Pr.tip("不予补单提醒",x??"",3e3),D},B=(O,D,x,I)=>{const F=`${O.accountId}:${D}:${x}`;n.set(F,I)},$=(O,D,x)=>{const I=`${O.accountId}:${D}:${x}`;return n.get(I)},P=async()=>{var x,I,F,R;const O=Date.now();let D=!1;try{if(!h.userId)return;if(O-v>30*1e3){const G=await Vt.GetMatchs(h.userName);if(!G)return;t.value=G.map(J=>new kQ(J)),v=Date.now(),D=!0,O-w>6e4&&(g.removeOrders(t.value.map(J=>J.bets.map(z=>z.id))),w=Date.now())}if(!t.value)return;for(const G of t.value){if(i.value.has(G.id)){const J=Math.max(...((x=i.value.get(G.id))==null?void 0:x.score.keys())||[]);if(J){const z=G.bets.find(ee=>ee.round===J);z&&(z.isLive=!0),G.bets.filter(ee=>ee.round!==J&&ee.isLive).forEach(ee=>{ee.isLive=void 0})}}for(const J of G.bets){if(J.items.forEach(q=>{q.updateOdds()}),!h.config.betting||g.orders.has(J.id))continue;h.config.minMoney!==0&&h.config.maxMoney!==0&&(h.config.betMoney=Math.floor(Math.random()*(h.config.maxMoney-h.config.minMoney+1))+h.config.minMoney);const z=J.GetOrderOptions(G,h.config,p.accounts);if(!z||z.length!==2)continue;let ee=new rBe(G.id,G.title,J.id,J.getBetName()),ce=z[0],ge=z[1];const be=p.getAccount(ce.type,ce.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ce.target))||[],q=>{var Me,V;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ce.odds,G.gameId);if(!te)return!1;const ue=`${(Me=ce.bet)==null?void 0:Me.id}:${ce.target}`,ae=((V=e.value)==null?void 0:V.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ce.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ce.target))return te=!1;if(q.lastOdds){const U=$(q,J.id,ce.target);if(U&&U>=ce.odds)return te=!1}const ye=q.game[G.game];return te},z),Z=p.getAccount(ge.type,ge.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],q=>{var ye,Me;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ge.odds,G.gameId);if(!te)return!1;const ue=`${(ye=ge.bet)==null?void 0:ye.id}:${ge.target}`,ae=((Me=e.value)==null?void 0:Me.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ge.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ge.target))return te=!1;if(q.lastOdds){const V=$(q,J.id,ge.target);if(V&&V>=ge.odds)return te=!1}return te},z);if(!be||!Z)continue;be.active=Z.active=!0;const se=Date.now(),me=await Promise.all([p.checkBetting(be,ce),p.checkBetting(Z,ge)]);if(ce=me[0],ge=me[1],!ce.data||!ge.data){await pt.wait(1e3);continue}if(ce.orderIndex=1,ge.orderIndex=2,h.config.checkTimeout&&Date.now()-se>h.config.checkTimeout){Pr.tip("前置检查超时",`超时时间：${Date.now()-se}ms，大于设定值：${h.config.checkTimeout}ms`,3e3);continue}const Oe=Math.max(h.config.waitTime[be.provider]??0,h.config.waitTime[Z.provider]??0,10);let Pe,ve;if(h.config.betSorting==="Parallel"){const q=await Promise.all([p.betting(be,ce,Oe),p.betting(Z,ge,Oe)]);if(((I=q[0])==null?void 0:I.success)===!0||!q.some(te=>te==null?void 0:te.success))Pe=q[0],ve=q[1];else if(((F=q[1])==null?void 0:F.success)===!0){Pe=q[1],ve=q[0];const te=ge;ge=ce,ce=te}if((Pe==null?void 0:Pe.success)!==!0)continue}else{if(Pe=await p.betting(be,ce,Oe)??new uo(be.provider,!1),(Pe==null?void 0:Pe.success)!==!0)continue;ve=await p.betting(Z,ge,Oe)??new uo(Z.provider,!1)}if(!ve)continue;if(Pe.success&&!ve.success){let q=1/(1/h.config.makeProfit-1/ce.odds);h.config.anyOdds&&(q=1/(1/h.config.anyOddsProfit-1/ce.odds));const te=[];for(let ue=0;ue<3;ue++){J.items.forEach(Me=>{Me.updateOdds()});const ae=J.items.filter(Me=>!te.includes(Me.type)&&Me.getOdds(ge.target)>=q).desc(Me=>Me.getOdds(ge.target));if(ae.length===0)break;let Ce;for(let Me of ae){const V=Math.floor(ce.odds*ce.betMoney/Me.getOdds(ge.target));if(Ce=p.getAccount(Me.type,V,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],U=>{if(U.isPause()||te.includes(U.provider))return!1;let K=U.getMinOdds()<=Me.getOdds(ge.target);if(!K)return K;const Ee=c(U.provider,J.id);return Ee&&Ee!==ge.target?K=!1:K}),Ce){ge.odds=Me.getOdds(ge.target),ge.betMoney=V;break}}if(!Ce)break;te.push(Ce.provider),ge.data=ge.request=ge.response=void 0,ge.type=Ce.provider;const ye=ge=await p.checkBetting(Ce,ge);if(ye.data&&(ve=await p.betting(Ce,ye,Oe)??new uo(Ce.provider,!1),ve.success))break}}const le=[];if(Pe.success===!0&&(le.push(h.config.waitTime[be.provider]??5),be.updateBalance()),ve.success===!0&&(le.push(h.config.waitTime[ve.provider]??5),Z.updateBalance()),Pe.success||ve.success){let q=Math.max(...le),te=Pr.tip("拒单检测",`等待<countdown>${Oe}</countdown>秒`,Oe*1e3);for(let ue=0;ue<q;ue++)await pt.wait(1e3)}let he=!1,de=[];Pe.success&&(de=await be.updateOrders()??[],he=de&&de.length>0&&de[0].status===Yt.reject||!1);let Q=!1,N=[];if(ve.success&&(N=await Z.updateOrders()??[],Q=N&&N.length>0&&N[0].status===Yt.reject||!1),Pe.success&&!he&&(!ve.success||Q)&&await S(ge)){let te=new eb(be.accountId??0,G.id,J.id,ge.target,ce.betMoney,ce.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ge.type}下单失败，创建补单队列`,3e3)}if(Pe.success&&!he&&(_(be,J.id,ce.target),B(be,J.id,ce.target,ce.odds)),ve.success&&!Q&&(!Pe.success||he)&&await S(ce)){let te=new eb(Z.accountId??0,G.id,J.id,ce.target,ge.betMoney,ge.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ce.type}下单失败，创建补单队列`,3e3)}ve.success&&!Q&&(_(Z,J.id,ge.target),B(Z,J.id,ge.target,ge.odds)),console.log("投注成功赔率",n);let L=[];Pe.success&&de&&de.length>0&&L.push(new rA(ee.linkId,Pe.provider,de[0].orderId)),ve.success&&N&&N.length>0&&L.push(new rA(ee.linkId,ve.provider,N[0].orderId)),await Vt.saveOrderBind(L),(Pe.success||ve.success)&&y.send.BettingMessage({account:be,result:Pe,options:ce,reject:he},{account:Z,result:ve,options:ge,reject:Q})}}if([...g.orders.keys()].length!==0&&h.config.makeUp){const G=[];for(const[J,z]of g.orders){const ee=t.value.find(Z=>Z.id===z.matchId);if(!ee){G.push(J);continue}const ce=ee.bets.find(Z=>Z.id===z.betId);if(!ce){G.push(J);continue}let ge=z.getOdds(h.config.makeProfit);const be=ce.items.filter(Z=>Z.getOdds(z.target)>=ge).sort((Z,se)=>Z.getOdds(z.target)>se.getOdds(z.target)?-1:1);if(be.length!==0)for(const Z of be){if(G.includes(z.betId))continue;const se=z.getBetMoney(Z.getOdds(z.target)),me=p.getAccount(Z.type,se,h.config.noSameProvider&&A(ce.id,Pr.getOpponent(z.target))||[],he=>{if(he.isPause()||he.noMarkup||he.minOdds!==0&&Z.getOdds(z.target)<he.minOdds||he.maxOdds!==0&&Z.getOdds(z.target)>he.maxOdds)return!1;const de=`${z.betId}:${z.target}`,Q=e.value.get(de);return!(Q&&(he.minDefault!==0&&Q<he.minDefault||he.maxDefault!==0&&Q>he.maxDefault))});if(!me)continue;const Oe=await p.checkBetting(me,new Tp(ee,ce,Z,z.target,se));if(!Oe.data)continue;const Pe=h.config.waitTime[me.provider]===-1?0:Math.max(h.config.waitTime[me.provider]??0,10),ve=await p.betting(me,Oe,Pe);let le=!1;if(ve&&ve.success){if(z.isCreateOrder||(Pe>0&&Pr.tip("拒单检测",`等待<countdown>${Pe}</countdown>秒`,Pe*1e3),await pt.wait(Pe*1e3)),!z.isCreateOrder&&Pe!==0){const he=await me.updateOrders();he&&he.length!==0?(he[0].status===Yt.reject?(le=!0,Pr.tip("拒单提醒",`${z.target}再次被拒单`,3e3)):G.push(J),await Vt.saveOrderBind([new rA(z.linkId,me.provider,he[0].orderId)])):(!he||he.length===0)&&G.push(J),y.send.LoseOrderMessage(me,z,Oe,le)}else G.push(J);_(me,ce.id,Oe.target)}else ve||G.push(J)}}G.length!==0&&G.forEach(J=>{g.removeOrder(J)})}O-b>10*60*1e3&&(Vt.getMatchDefaultOdds(((R=t.value)==null?void 0:R.map(G=>G.id))??[]).then(G=>{G&&(e.value=G)}),b=Date.now())}finally{D&&f.clean(),await pt.wait(100),p.accounts.filter(M=>M.active).forEach(M=>{M.active=!1}),await P()}};return P(),{matchs:t,score:i,defaultOdds:e,initBetTarget:o,loadBetTarget:s,getBetTarget:c,setBetTarget:a,updateScore:l}});class eb{constructor(e,r,n,s,o,a,i,l,u,c,d,f){ke(this,"accountId");ke(this,"matchId");ke(this,"betId");ke(this,"target");ke(this,"betMoney");ke(this,"betOdds");ke(this,"match");ke(this,"bet");ke(this,"linkId");ke(this,"createAt");ke(this,"isCreateOrder");ke(this,"betCount");this.accountId=e,this.matchId=r,this.betId=n,this.target=s,this.betMoney=o,this.betOdds=a,this.match=i,this.bet=l,this.linkId=u,this.createAt=c||Date.now(),this.isCreateOrder=d,this.betCount=f}getBetMoney(e){return e?Math.round(this.betMoney*this.betOdds/e):0}getOdds(e){if(this.isCreateOrder)return Number(this.betOdds);e||(e=1.01);let r=1/(1/e-1/this.betOdds);return pt.toFixed(r)}}const RBe="-1001949068832",FBe="-4855267884";var DG=(t=>(t[t.Balance=0]="Balance",t[t.Profit=1]="Profit",t[t.Limit=2]="Limit",t[t.OrderReport=3]="OrderReport",t[t.OrderPush=4]="OrderPush",t[t.OrderNotify=5]="OrderNotify",t))(DG||{});const Gi=mh("message",()=>{const t=[],e=[],r=[],n=[],s=Xn(),o=Io(),a=async()=>{try{const p=t.pop();p&&await Vt.sendMessage(s.telegramId,p);const h=e.pop();h&&await Vt.sendMessage(s.pushOrderId,h);const g=r.pop();g&&await Vt.sendMessage(RBe,g);const y=n.pop();y&&await Vt.sendMessage(FBe,y)}catch(p){console.error(p)}finally{await pt.wait(1e3),await a()}};a();const i=(p,h,g=1800)=>{if(g===0)return!0;const y=`${p}:${h}`,v=Number(sessionStorage.getItem(y)??"0"),w=Date.now();return w-v<g*1e3?!1:(sessionStorage.setItem(y,w.toString()),!0)},l=(p,h)=>`<b>📣${h??"📣📣"}${p}</b>`,u=p=>`#${s.userName} ${o.getPlatform(p.platformId)}，账号：${p.playerName}，余额：${pt.toFixed(p.balance??0).toLocaleString()}，场馆：${p.provider}`,c=p=>p?p>0?"🟢":"🔴":"",d=(p,h)=>{let g=p?"✅":"❌";return h&&(g="🔴"),g};return{send:{BalanceMessage:(p,h=1800)=>{var y,v;if(!p.maxBalance||(p.balance??0)<p.maxBalance||!i(0,`${p.accountId}`,h))return;const g=[l("余额超限提醒"),u(p),`<blockquote>当前余额：${(y=p.balance)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxBalance)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},ProfitMessage:(p,h=1800)=>{var y,v;if(!p.maxProfit||!p.totalProfit||p.totalProfit<p.maxProfit||!i(1,`${p.accountId}`,h)||p.pause)return;const g=[l("账号盈利超过预设值"),u(p),`<blockquote>当前盈利：${(y=p.totalProfit)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxProfit)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},LimitMessage:(p,h)=>{const g=[l("限红提醒"),u(p),`<blockquote>${h.match} / ${h.bet}`,`投注金额：${h.betMoney}@${h.odds}`,`限红金额：${h.limit}</blockquote>`].join(`
`);return t.push(g),g},DelayMessage:(p,h)=>{h<2e3||t.push([l("注单延迟收单提醒"),u(p),`<blockquote>投注延迟：${pt.toFixed(h/1e3)}秒</blockquote>`].join(`
`))},CollectMessage:(p,h)=>{i(0,`${p}`,600)&&t.push([l(`${p}本地采集发生错误`),`<blockquote>${h}</blockquote>`].join(`
`))},BettingMessage:(p,h)=>{var C,E,_,A,T;const g=(S,B,$,P)=>{const O=[u(S),`<blockquote>投注队伍：${$.target}`,`投注金额：${$.betMoney}@${$.odds}`,`投注结果：${B.success?"✅ 成功":"❌ 失败"}`];return B.success&&O.push(`是否拒单：${P?"🔴是":"否"}`),O.push(`备注信息：${B.message??"N/A"}</blockquote>`),O.join(`
`)};t.push([l("下单提醒",[d((C=p.result)==null?void 0:C.success,p.reject),d((E=h.result)==null?void 0:E.success,h.reject)].join("")),`${(_=p.options.match)==null?void 0:_.title} / ${(A=p.options.bet)==null?void 0:A.getBetName()}`,"",g(p.account,p.result,p.options,p.reject),g(h.account,h.result,h.options,h.reject)].join(`
`));const y=[p,h],v=y.find(S=>S.options.target===Gn.Home),w=y.find(S=>S.options.target===Gn.Away),b=Pr.getRate(v==null?void 0:v.options.odds,w==null?void 0:w.options.odds);if(v&&w){const S=["<b>📣赛事推单</b>",`<b>⚽️赛事：${(T=p.options.match)==null?void 0:T.title}</b>`,`<b>1️⃣[${vf.providerName[v.options.type]}] 主队赔率：${v==null?void 0:v.options.odds}</b>`,`<b>2️⃣[${vf.providerName[w.options.type]}] 客队赔率：${w==null?void 0:w.options.odds}</b>`,`<b>本单对冲利润：${pt.percent(b)}（投注100块可无风险获得:${pt.toFixed(b*100-100,2)}元利润）</b>`];e.push(S.join(`
`))}},LoseOrderMessage:(p,h,g,y)=>{var v,w;t.push([l("补单提醒",d(!0,y)),u(p),`${(v=g.match)==null?void 0:v.title} / ${(w=g.bet)==null?void 0:w.getBetName()} / ${g.target}`,`<blockquote>原订单时间：${pt.formatDate(h.createAt)}`,`原补单金额：${h.getBetMoney(h.betOdds)}@${h.getOdds(Xn().config.makeProfit)}`,`补单金额：${g.betMoney}@${g.newOdds??g.odds}`,`是否拒单：${y?"🔴是":"否"}</blockquote>`].join(`
`))},OrderReportMessage:(p,h)=>{if(h.length===0)return;const g=pt.formatDate(new Date,"yyyy-MM-dd");if(pt.formatDate(h[0].CreateAt,"yyyy-MM-dd")!==g||!i(3,"ORDERREPORT",3600))return;const y=[l(`${g}统计报表`)],v=pt.sum(h,b=>b.Money);y.push(`总余额：${pt.toFixed(pt.sum(p,b=>b.balance??0),0).toLocaleString()} 盈亏：${c(v)}${pt.toFixed(v,0).toLocaleString()} 总订单：${h.length} 未结订单：${pt.sum(p,b=>b.unsettle)}`,""),p.forEach(b=>{y.push(u(b),`<blockquote>盈亏:${c(b.today)}${pt.toFixed(b.today).toLocaleString()}，总盈亏：${pt.toFixed(b.totalProfit??0).toLocaleString()}，`,`订单：${b.orderCount??0}笔，未结：${b.unsettle}笔</blockquote>`)});const w=y.join(`
`);t.push(w),r.push(w)},PublishLoseOrderMessage:()=>{var y;if(!((y=s.setting)!=null&&y.Publisher))return;const p=[l(`[${s.userName}]补单队列变化`)];jb().orders.forEach((v,w)=>{p.push(`<blockquote>${v.match}
${v.bet} => ${v.target}
时间：${pt.formatDate(v.createAt)}
补单金额：${v.betMoney}@${v.betOdds} x ${v.betCount??1}</blockquote>`)});const g=p.join(`
`);n.push(g)}}}});class WBe{static async get(e){}static async save(e,r){return!1}}const $Be="ModifyHeader",UF="ACCOUNT",Io=mh("account",()=>{const t=oe([]),e=oe([]),r=oe(),n=Xn(),s=Gi(),o=oe(new Map),a=_=>{if(_)return t.value.find(A=>A.accountId===_)},i=async _=>{const A=a(_.accountId);A?A.update(_):t.value.push(_),await u();const T=a(_.accountId);await(T==null?void 0:T.updateBalance()),await(T==null?void 0:T.updateOrders())},l=async _=>{_&&await c();const A=await Vt.getData(UF);A&&(t.value=A.map(T=>new uv(T)),_&&(await f(_),await E()))},u=async()=>{await Vt.saveData(UF,JSON.stringify(t.value.filter(_=>_.accountId)))},c=async()=>{const _=await Vt.getTagPlatforms();e.value=(_==null?void 0:_.map(A=>new tBe(A)))??[]},d=(_,A="")=>{var T;return _?((T=e.value.find(S=>S.id===_))==null?void 0:T.name)??A:A},f=async _=>{const A=[],T=Date.now();try{for(let S of t.value){let B=Date.now();if(A.push(`开始加载账户：${S.platformName} / ${S.playerName} / ${S.provider}`),S.active){A.push("账号正在投注中，停止加载");continue}try{B=Date.now(),await S.updateBalance(),A.push(`读取余额：${Date.now()-B}ms`),B=Date.now(),await S.updateOrders(),A.push(`读取订单：${Date.now()-B}ms`)}catch($){A.push(`发生错误：${$.message}`)}}}finally{let S=Date.now();if(await E(),A.push(`加载本地订单：${Date.now()-S}ms`),S=Date.now(),await u(),A.push(`保存账号：${Date.now()-S}ms`)

// ---- 实时赔率缓存 fo / Jn / anchor 3: new Jn / approx line 8965 ----
dReconnect&&s._connect(),s.onclose&&s.onclose(o),s._listeners.close.forEach(function(a){return s._callEventListener(o,a)})},this._url=e,this._protocols=r,this._options=n,this._options.startClosed&&(this._shouldReconnect=!1),this._connect()}return Object.defineProperty(t,"CONNECTING",{get:function(){return 0},enumerable:!0,configurable:!0}),Object.defineProperty(t,"OPEN",{get:function(){return 1},enumerable:!0,configurable:!0}),Object.defineProperty(t,"CLOSING",{get:function(){return 2},enumerable:!0,configurable:!0}),Object.defineProperty(t,"CLOSED",{get:function(){return 3},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CONNECTING",{get:function(){return t.CONNECTING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"OPEN",{get:function(){return t.OPEN},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CLOSING",{get:function(){return t.CLOSING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"CLOSED",{get:function(){return t.CLOSED},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"binaryType",{get:function(){return this._ws?this._ws.binaryType:this._binaryType},set:function(e){this._binaryType=e,this._ws&&(this._ws.binaryType=e)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"retryCount",{get:function(){return Math.max(this._retryCount,0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"bufferedAmount",{get:function(){var e=this._messageQueue.reduce(function(r,n){return typeof n=="string"?r+=n.length:n instanceof Blob?r+=n.size:r+=n.byteLength,r},0);return e+(this._ws?this._ws.bufferedAmount:0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"extensions",{get:function(){return this._ws?this._ws.extensions:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"protocol",{get:function(){return this._ws?this._ws.protocol:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"readyState",{get:function(){return this._ws?this._ws.readyState:this._options.startClosed?t.CLOSED:t.CONNECTING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"url",{get:function(){return this._ws?this._ws.url:""},enumerable:!0,configurable:!0}),t.prototype.close=function(e,r){if(e===void 0&&(e=1e3),this._closeCalled=!0,this._shouldReconnect=!1,this._clearTimeouts(),!this._ws){this._debug("close enqueued: no ws instance");return}if(this._ws.readyState===this.CLOSED){this._debug("close: already closed");return}this._ws.close(e,r)},t.prototype.reconnect=function(e,r){this._shouldReconnect=!0,this._closeCalled=!1,this._retryCount=-1,!this._ws||this._ws.readyState===this.CLOSED?this._connect():(this._disconnect(e,r),this._connect())},t.prototype.send=function(e){if(this._ws&&this._ws.readyState===this.OPEN)this._debug("send",e),this._ws.send(e);else{var r=this._options.maxEnqueuedMessages,n=r===void 0?$f.maxEnqueuedMessages:r;this._messageQueue.length<n&&(this._debug("enqueue",e),this._messageQueue.push(e))}},t.prototype.addEventListener=function(e,r){this._listeners[e]&&this._listeners[e].push(r)},t.prototype.dispatchEvent=function(e){var r,n,s=this._listeners[e.type];if(s)try{for(var o=TBe(s),a=o.next();!a.done;a=o.next()){var i=a.value;this._callEventListener(e,i)}}catch(l){r={error:l}}finally{try{a&&!a.done&&(n=o.return)&&n.call(o)}finally{if(r)throw r.error}}return!0},t.prototype.removeEventListener=function(e,r){this._listeners[e]&&(this._listeners[e]=this._listeners[e].filter(function(n){return n!==r}))},t.prototype._debug=function(){for(var e=[],r=0;r<arguments.length;r++)e[r]=arguments[r];this._options.debug&&console.log.apply(console,SBe(["RWS>"],e))},t.prototype._getNextDelay=function(){var e=this._options,r=e.reconnectionDelayGrowFactor,n=r===void 0?$f.reconnectionDelayGrowFactor:r,s=e.minReconnectionDelay,o=s===void 0?$f.minReconnectionDelay:s,a=e.maxReconnectionDelay,i=a===void 0?$f.maxReconnectionDelay:a,l=0;return this._retryCount>0&&(l=o*Math.pow(n,this._retryCount-1),l>i&&(l=i)),this._debug("next delay",l),l},t.prototype._wait=function(){var e=this;return new Promise(function(r){setTimeout(r,e._getNextDelay())})},t.prototype._getNextUrl=function(e){if(typeof e=="string")return Promise.resolve(e);if(typeof e=="function"){var r=e();if(typeof r=="string")return Promise.resolve(r);if(r.then)return r}throw Error("Invalid URL")},t.prototype._connect=function(){var e=this;if(!(this._connectLock||!this._shouldReconnect)){this._connectLock=!0;var r=this._options,n=r.maxRetries,s=n===void 0?$f.maxRetries:n,o=r.connectionTimeout,a=o===void 0?$f.connectionTimeout:o,i=r.WebSocket,l=i===void 0?kBe():i;if(this._retryCount>=s){this._debug("max retries reached",this._retryCount,">=",s);return}if(this._retryCount++,this._debug("connect",this._retryCount),this._removeListeners(),!IBe(l))throw Error("No valid WebSocket class provided");this._wait().then(function(){return e._getNextUrl(e._url)}).then(function(u){e._closeCalled||(e._debug("connect",{url:u,protocols:e._protocols}),e._ws=e._protocols?new l(u,e._protocols):new l(u),e._ws.binaryType=e._binaryType,e._connectLock=!1,e._addListeners(),e._connectTimeout=setTimeout(function(){return e._handleTimeout()},a))})}},t.prototype._handleTimeout=function(){this._debug("timeout event"),this._handleError(new _Be(Error("TIMEOUT"),this))},t.prototype._disconnect=function(e,r){if(e===void 0&&(e=1e3),this._clearTimeouts(),!!this._ws){this._removeListeners();try{this._ws.close(e,r),this._handleClose(new PBe(e,r,this))}catch{}}},t.prototype._acceptOpen=function(){this._debug("accept open"),this._retryCount=0},t.prototype._callEventListener=function(e,r){"handleEvent"in r?r.handleEvent(e):r(e)},t.prototype._removeListeners=function(){this._ws&&(this._debug("removeListeners"),this._ws.removeEventListener("open",this._handleOpen),this._ws.removeEventListener("close",this._handleClose),this._ws.removeEventListener("message",this._handleMessage),this._ws.removeEventListener("error",this._handleError))},t.prototype._addListeners=function(){this._ws&&(this._debug("addListeners"),this._ws.addEventListener("open",this._handleOpen),this._ws.addEventListener("close",this._handleClose),this._ws.addEventListener("message",this._handleMessage),this._ws.addEventListener("error",this._handleError))},t.prototype._clearTimeouts=function(){clearTimeout(this._connectTimeout),clearTimeout(this._uptimeTimeout)},t}();const $F=["api.a8.to","47.115.75.57"];let LF=0;const OBe=(t,e)=>(t=t.replace("https://api-v4","wss://ws"),e=e.replace("Token ",""),LF++,`wss://${$F[LF%$F.length]}/esport/ws/TF?auth_token=${e}&combo=false`),N3=t=>({Authorization:t,"tf-authorization":MBe(t,Math.floor(Date.now()/1e3),Math.floor(Date.now()/1e3)),"public-token":"2633b50ad4f64cd28b3224e47c877057"}),DBe=t=>{for(var e=window.atob(t),r=new Uint8Array(e.length),n=0;n<e.length;n++)r[n]=e.charCodeAt(n);return r},MBe=(t,e,r)=>{t=t.replace("Token ","");var n=Math.floor(new Date().getTime()/1e3)-r+e,s=Math.floor(n/10),o=new Uint8Array(8);o[4]=s>>24&255,o[5]=s>>16&255,o[6]=s>>8&255,o[7]=255&s;const a=DBe(t);var i=new WF("SHA-1","ARRAYBUFFER");i.setHMACKey(a,"ARRAYBUFFER"),i.update(o.buffer);var l=i.getHMAC("ARRAYBUFFER"),u=new Uint8Array(l),c=15&u[u.length-1],d=(127&u[c])<<24|u[c+1]<<16|u[c+2]<<8|u[c+3],f=new WF("SHA-512","TEXT");return f.update("".concat((d%1e6).toString()).padStart(6,"0")),f.getHash("HEX")},Lf=Xt.TF,NBe=async()=>{const t=await Vt.getPlatform(Lf);if(!t)return;const e=fo(),r=async()=>{const i=await Vt.getPlatform(Lf);return i?OBe(i.gateway,i.token):""},n=new BBe(r,[],{connectionTimeout:4e3,maxRetries:1/0,maxReconnectionDelay:5e3,minReconnectionDelay:1e3});n.onopen=()=>{},n.onmessage=i=>{const l=JSON.parse(i.data);if(!l.data||!l.data.selection)return;const u=l.data.market_id;l.data.selection.forEach(c=>{const d=`${u}:${c.name}`;if(!e.isOdds(Lf,d))return;const f=new Jn(d,c.euro_odds,c.status!=="open",u);e.save(Lf,f)})},n.onerror=()=>{Gi().send.CollectMessage(Lf,"WebSocket链接发生错误")};const s=new RegExp(t.betName),o=async()=>{const i={time:Date.now(),match:0};try{const c=(await Nr.get(`${t.gateway}/api/v8/events/?game_id=&combo=false&outright=false&timing=today&market_option=MATCH&lang=zh&timezone=Asia/Shanghai`,{headers:N3(t.token)})).data.results.filter(d=>t.games.includes(d.game_id.toString())&&new Date(d.start_datetime).getTime()<Date.now()+3600*1e3);for(let d=0;d<c.length;d++){const f=c[d].event_id;i.match++,await a(f)}}catch(l){console.error(l)}finally{Pr.debug(`[${Lf}]比赛列表:${Date.now()-i.time}ms，读取比赛:${i.match}场`),await pt.wait(30*1e3),await o()}},a=async(i,l="MATCH")=>{await pt.wait(1e3);const u=l==="MATCH"?"MATCH":"MAP",c=l==="MATCH"?"":l,d=`${t.gateway}/api/v8/events/?event_id=${i}&combo=false&outright=false&map_option=${c}&market_option=${u}&lang=zh&timezone=Asia/Shanghai`,p=(await Nr.get(d,{headers:N3(t.token)})).data;if(p.results.forEach(h=>{h.markets.forEach(g=>{if(!s.test(g.market_name))return;const y=g.market_id;g.selection.forEach(v=>{const w=`${y}:${v.name}`,b=new Jn(w,v.euro_odds,v.status!=="open",y);e.save(Lf,b)})})}),l==="MATCH"){for(let h=0;h<p.results.length;h++)if(p.results[h].market_tabs)for(let g in p.results[h].market_tabs.map(y=>y.tab_name)){const y=p.results[h].market_tabs[g].tab_name;!y||y==="MATCH"||await a(i,y)}}};o()},Vg=mh("match",()=>{const t=oe(),e=oe(new Map),r=oe(new Map),n=new Map,s=async O=>{var D;try{const x=new Map;for(const[I,F]of Object.entries(O)){const R=I;x.has(R)||x.set(R,new Map);for(const[M,G]of Object.entries(F))(D=x.get(R))==null||D.set(Number(M),G)}r.value=x}finally{}},o=async()=>{r.value=await Vt.initBetTarget()},a=async(O,D,x)=>{var F,R,M;return(F=h.setting)!=null&&F.BetTarget?(c(O,D)===x?(R=r.value.get(O))==null||R.delete(D):(r.value.has(O)||r.value.set(O,new Map),(M=r.value.get(O))==null||M.set(D,x)),await u()):!1},i=oe(new Map),l=(O,D)=>{D.forEach(x=>{var G;const I=x.SourceID;var F=(G=t.value)==null?void 0:G.find(J=>J.providers[O]===I);if(!F)return;const R=F.id,M=new eBe(x.Score,F.reverse.includes(O));i.value.set(R,M)})},u=async()=>{var O;return d(),(O=h.setting)!=null&&O.BetTarget?await Vt.saveBetTarget(r.value):!1},c=(O,D)=>{var x,I;return(I=(x=r.value)==null?void 0:x.get(O))==null?void 0:I.get(D)},d=()=>{[].forEach(D=>{r.value.forEach((x,I)=>{x.delete(D)})})},f=fo(),p=Io(),h=Xn(),g=jb(),y=Gi();let v=0,w=0,b=0;const C="BETACCOUNT:",E="BETCOUNT:",_=(O,D,x)=>{if(!O.accountId)return;const I=`${C}${D}:${x}`,F=A(D,x);F.includes(O.accountId)||(F.push(O.accountId),sessionStorage.setItem(I,JSON.stringify(F)));const R=`${E}${O.accountId}:${D}:${x}`,M=T(O,D,x);sessionStorage.setItem(R,(M+1).toString())},A=(O,D)=>{const x=`${C}${O}:${D}`,I=sessionStorage.getItem(x);return I&&JSON.parse(I)||[]},T=(O,D,x)=>{const I=`${E}${O.accountId}:${D}:${x}`,F=sessionStorage.getItem(I);return F?Number(F)??0:0},S=async O=>{let D=!0,x;if(h.config.makeUp_defaultOdds!==0&&O.match&&O.bet){const I=await Vt.getDefaultOdds(O.match.id,O.bet.id,O.target);I!==0&&h.config.makeUp_defaultOdds<=I&&(x=`初赔赔率:${I}，大于当前设定值：${h.config.makeUp_defaultOdds}`,D=!1)}return h.config.makeUp_odds!==0&&h.config.makeUp_odds<=O.odds&&(x=`当前赔率:${O.odds}，大于当前设定值：${h.config.makeUp_odds}`,D=!1),D||Pr.tip("不予补单提醒",x??"",3e3),D},B=(O,D,x,I)=>{const F=`${O.accountId}:${D}:${x}`;n.set(F,I)},$=(O,D,x)=>{const I=`${O.accountId}:${D}:${x}`;return n.get(I)},P=async()=>{var x,I,F,R;const O=Date.now();let D=!1;try{if(!h.userId)return;if(O-v>30*1e3){const G=await Vt.GetMatchs(h.userName);if(!G)return;t.value=G.map(J=>new kQ(J)),v=Date.now(),D=!0,O-w>6e4&&(g.removeOrders(t.value.map(J=>J.bets.map(z=>z.id))),w=Date.now())}if(!t.value)return;for(const G of t.value){if(i.value.has(G.id)){const J=Math.max(...((x=i.value.get(G.id))==null?void 0:x.score.keys())||[]);if(J){const z=G.bets.find(ee=>ee.round===J);z&&(z.isLive=!0),G.bets.filter(ee=>ee.round!==J&&ee.isLive).forEach(ee=>{ee.isLive=void 0})}}for(const J of G.bets){if(J.items.forEach(q=>{q.updateOdds()}),!h.config.betting||g.orders.has(J.id))continue;h.config.minMoney!==0&&h.config.maxMoney!==0&&(h.config.betMoney=Math.floor(Math.random()*(h.config.maxMoney-h.config.minMoney+1))+h.config.minMoney);const z=J.GetOrderOptions(G,h.config,p.accounts);if(!z||z.length!==2)continue;let ee=new rBe(G.id,G.title,J.id,J.getBetName()),ce=z[0],ge=z[1];const be=p.getAccount(ce.type,ce.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ce.target))||[],q=>{var Me,V;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ce.odds,G.gameId);if(!te)return!1;const ue=`${(Me=ce.bet)==null?void 0:Me.id}:${ce.target}`,ae=((V=e.value)==null?void 0:V.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ce.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ce.target))return te=!1;if(q.lastOdds){const U=$(q,J.id,ce.target);if(U&&U>=ce.odds)return te=!1}const ye=q.game[G.game];return te},z),Z=p.getAccount(ge.type,ge.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],q=>{var ye,Me;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ge.odds,G.gameId);if(!te)return!1;const ue=`${(ye=ge.bet)==null?void 0:ye.id}:${ge.target}`,ae=((Me=e.value)==null?void 0:Me.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ge.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ge.target))return te=!1;if(q.lastOdds){const V=$(q,J.id,ge.target);if(V&&V>=ge.odds)return te=!1}return te},z);if(!be||!Z)continue;be.active=Z.active=!0;const se=Date.now(),me=await Promise.all([p.checkBetting(be,ce),p.checkBetting(Z,ge)]);if(ce=me[0],ge=me[1],!ce.data||!ge.data){await pt.wait(1e3);continue}if(ce.orderIndex=1,ge.orderIndex=2,h.config.checkTimeout&&Date.now()-se>h.config.checkTimeout){Pr.tip("前置检查超时",`超时时间：${Date.now()-se}ms，大于设定值：${h.config.checkTimeout}ms`,3e3);continue}const Oe=Math.max(h.config.waitTime[be.provider]??0,h.config.waitTime[Z.provider]??0,10);let Pe,ve;if(h.config.betSorting==="Parallel"){const q=await Promise.all([p.betting(be,ce,Oe),p.betting(Z,ge,Oe)]);if(((I=q[0])==null?void 0:I.success)===!0||!q.some(te=>te==null?void 0:te.success))Pe=q[0],ve=q[1];else if(((F=q[1])==null?void 0:F.success)===!0){Pe=q[1],ve=q[0];const te=ge;ge=ce,ce=te}if((Pe==null?void 0:Pe.success)!==!0)continue}else{if(Pe=await p.betting(be,ce,Oe)??new uo(be.provider,!1),(Pe==null?void 0:Pe.success)!==!0)continue;ve=await p.betting(Z,ge,Oe)??new uo(Z.provider,!1)}if(!ve)continue;if(Pe.success&&!ve.success){let q=1/(1/h.config.makeProfit-1/ce.odds);h.config.anyOdds&&(q=1/(1/h.config.anyOddsProfit-1/ce.odds));const te=[];for(let ue=0;ue<3;ue++){J.items.forEach(Me=>{Me.updateOdds()});const ae=J.items.filter(Me=>!te.includes(Me.type)&&Me.getOdds(ge.target)>=q).desc(Me=>Me.getOdds(ge.target));if(ae.length===0)break;let Ce;for(let Me of ae){const V=Math.floor(ce.odds*ce.betMoney/Me.getOdds(ge.target));if(Ce=p.getAccount(Me.type,V,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],U=>{if(U.isPause()||te.includes(U.provider))return!1;let K=U.getMinOdds()<=Me.getOdds(ge.target);if(!K)return K;const Ee=c(U.provider,J.id);return Ee&&Ee!==ge.target?K=!1:K}),Ce){ge.odds=Me.getOdds(ge.target),ge.betMoney=V;break}}if(!Ce)break;te.push(Ce.provider),ge.data=ge.request=ge.response=void 0,ge.type=Ce.provider;const ye=ge=await p.checkBetting(Ce,ge);if(ye.data&&(ve=await p.betting(Ce,ye,Oe)??new uo(Ce.provider,!1),ve.success))break}}const le=[];if(Pe.success===!0&&(le.push(h.config.waitTime[be.provider]??5),be.updateBalance()),ve.success===!0&&(le.push(h.config.waitTime[ve.provider]??5),Z.updateBalance()),Pe.success||ve.success){let q=Math.max(...le),te=Pr.tip("拒单检测",`等待<countdown>${Oe}</countdown>秒`,Oe*1e3);for(let ue=0;ue<q;ue++)await pt.wait(1e3)}let he=!1,de=[];Pe.success&&(de=await be.updateOrders()??[],he=de&&de.length>0&&de[0].status===Yt.reject||!1);let Q=!1,N=[];if(ve.success&&(N=await Z.updateOrders()??[],Q=N&&N.length>0&&N[0].status===Yt.reject||!1),Pe.success&&!he&&(!ve.success||Q)&&await S(ge)){let te=new eb(be.accountId??0,G.id,J.id,ge.target,ce.betMoney,ce.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ge.type}下单失败，创建补单队列`,3e3)}if(Pe.success&&!he&&(_(be,J.id,ce.target),B(be,J.id,ce.target,ce.odds)),ve.success&&!Q&&(!Pe.success||he)&&await S(ce)){let te=new eb(Z.accountId??0,G.id,J.id,ce.target,ge.betMoney,ge.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ce.type}下单失败，创建补单队列`,3e3)}ve.success&&!Q&&(_(Z,J.id,ge.target),B(Z,J.id,ge.target,ge.odds)),console.log("投注成功赔率",n);let L=[];Pe.success&&de&&de.length>0&&L.push(new rA(ee.linkId,Pe.provider,de[0].orderId)),ve.success&&N&&N.length>0&&L.push(new rA(ee.linkId,ve.provider,N[0].orderId)),await Vt.saveOrderBind(L),(Pe.success||ve.success)&&y.send.BettingMessage({account:be,result:Pe,options:ce,reject:he},{account:Z,result:ve,options:ge,reject:Q})}}if([...g.orders.keys()].length!==0&&h.config.makeUp){const G=[];for(const[J,z]of g.orders){const ee=t.value.find(Z=>Z.id===z.matchId);if(!ee){G.push(J);continue}const ce=ee.bets.find(Z=>Z.id===z.betId);if(!ce){G.push(J);continue}let ge=z.getOdds(h.config.makeProfit);const be=ce.items.filter(Z=>Z.getOdds(z.target)>=ge).sort((Z,se)=>Z.getOdds(z.target)>se.getOdds(z.target)?-1:1);if(be.length!==0)for(const Z of be){if(G.includes(z.betId))continue;const se=z.getBetMoney(Z.getOdds(z.target)),me=p.getAccount(Z.type,se,h.config.noSameProvider&&A(ce.id,Pr.getOpponent(z.target))||[],he=>{if(he.isPause()||he.noMarkup||he.minOdds!==0&&Z.getOdds(z.target)<he.minOdds||he.maxOdds!==0&&Z.getOdds(z.target)>he.maxOdds)return!1;const de=`${z.betId}:${z.target}`,Q=e.value.get(de);return!(Q&&(he.minDefault!==0&&Q<he.minDefault||he.maxDefault!==0&&Q>he.maxDefault))});if(!me)continue;const Oe=await p.checkBetting(me,new Tp(ee,ce,Z,z.target,se));if(!Oe.data)continue;const Pe=h.config.waitTime[me.provider]===-1?0:Math.max(h.config.waitTime[me.provider]??0,10),ve=await p.betting(me,Oe,Pe);let le=!1;if(ve&&ve.success){if(z.isCreateOrder||(Pe>0&&Pr.tip("拒单检测",`等待<countdown>${Pe}</countdown>秒`,Pe*1e3),await pt.wait(Pe*1e3)),!z.isCreateOrder&&Pe!==0){const he=await me.updateOrders();he&&he.length!==0?(he[0].status===Yt.reject?(le=!0,Pr.tip("拒单提醒",`${z.target}再次被拒单`,3e3)):G.push(J),await Vt.saveOrderBind([new rA(z.linkId,me.provider,he[0].orderId)])):(!he||he.length===0)&&G.push(J),y.send.LoseOrderMessage(me,z,Oe,le)}else G.push(J);_(me,ce.id,Oe.target)}else ve||G.push(J)}}G.length!==0&&G.forEach(J=>{g.removeOrder(J)})}O-b>10*60*1e3&&(Vt.getMatchDefaultOdds(((R=t.value)==null?void 0:R.map(G=>G.id))??[]).then(G=>{G&&(e.value=G)}),b=Date.now())}finally{D&&f.clean(),await pt.wait(100),p.accounts.filter(M=>M.active).forEach(M=>{M.active=!1}),await P()}};return P(),{matchs:t,score:i,defaultOdds:e,initBetTarget:o,loadBetTarget:s,getBetTarget:c,setBetTarget:a,updateScore:l}});class eb{constructor(e,r,n,s,o,a,i,l,u,c,d,f){ke(this,"accountId");ke(this,"matchId");ke(this,"betId");ke(this,"target");ke(this,"betMoney");ke(this,"betOdds");ke(this,"match");ke(this,"bet");ke(this,"linkId");ke(this,"createAt");ke(this,"isCreateOrder");ke(this,"betCount");this.accountId=e,this.matchId=r,this.betId=n,this.target=s,this.betMoney=o,this.betOdds=a,this.match=i,this.bet=l,this.linkId=u,this.createAt=c||Date.now(),this.isCreateOrder=d,this.betCount=f}getBetMoney(e){return e?Math.round(this.betMoney*this.betOdds/e):0}getOdds(e){if(this.isCreateOrder)return Number(this.betOdds);e||(e=1.01);let r=1/(1/e-1/this.betOdds);return pt.toFixed(r)}}const RBe="-1001949068832",FBe="-4855267884";var DG=(t=>(t[t.Balance=0]="Balance",t[t.Profit=1]="Profit",t[t.Limit=2]="Limit",t[t.OrderReport=3]="OrderReport",t[t.OrderPush=4]="OrderPush",t[t.OrderNotify=5]="OrderNotify",t))(DG||{});const Gi=mh("message",()=>{const t=[],e=[],r=[],n=[],s=Xn(),o=Io(),a=async()=>{try{const p=t.pop();p&&await Vt.sendMessage(s.telegramId,p);const h=e.pop();h&&await Vt.sendMessage(s.pushOrderId,h);const g=r.pop();g&&await Vt.sendMessage(RBe,g);const y=n.pop();y&&await Vt.sendMessage(FBe,y)}catch(p){console.error(p)}finally{await pt.wait(1e3),await a()}};a();const i=(p,h,g=1800)=>{if(g===0)return!0;const y=`${p}:${h}`,v=Number(sessionStorage.getItem(y)??"0"),w=Date.now();return w-v<g*1e3?!1:(sessionStorage.setItem(y,w.toString()),!0)},l=(p,h)=>`<b>📣${h??"📣📣"}${p}</b>`,u=p=>`#${s.userName} ${o.getPlatform(p.platformId)}，账号：${p.playerName}，余额：${pt.toFixed(p.balance??0).toLocaleString()}，场馆：${p.provider}`,c=p=>p?p>0?"🟢":"🔴":"",d=(p,h)=>{let g=p?"✅":"❌";return h&&(g="🔴"),g};return{send:{BalanceMessage:(p,h=1800)=>{var y,v;if(!p.maxBalance||(p.balance??0)<p.maxBalance||!i(0,`${p.accountId}`,h))return;const g=[l("余额超限提醒"),u(p),`<blockquote>当前余额：${(y=p.balance)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxBalance)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},ProfitMessage:(p,h=1800)=>{var y,v;if(!p.maxProfit||!p.totalProfit||p.totalProfit<p.maxProfit||!i(1,`${p.accountId}`,h)||p.pause)return;const g=[l("账号盈利超过预设值"),u(p),`<blockquote>当前盈利：${(y=p.totalProfit)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxProfit)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},LimitMessage:(p,h)=>{const g=[l("限红提醒"),u(p),`<blockquote>${h.match} / ${h.bet}`,`投注金额：${h.betMoney}@${h.odds}`,`限红金额：${h.limit}</blockquote>`].join(`
`);return t.push(g),g},DelayMessage:(p,h)=>{h<2e3||t.push([l("注单延迟收单提醒"),u(p),`<blockquote>投注延迟：${pt.toFixed(h/1e3)}秒</blockquote>`].join(`
`))},CollectMessage:(p,h)=>{i(0,`${p}`,600)&&t.push([l(`${p}本地采集发生错误`),`<blockquote>${h}</blockquote>`].join(`
`))},BettingMessage:(p,h)=>{var C,E,_,A,T;const g=(S,B,$,P)=>{const O=[u(S),`<blockquote>投注队伍：${$.target}`,`投注金额：${$.betMoney}@${$.odds}`,`投注结果：${B.success?"✅ 成功":"❌ 失败"}`];return B.success&&O.push(`是否拒单：${P?"🔴是":"否"}`),O.push(`备注信息：${B.message??"N/A"}</blockquote>`),O.join(`
`)};t.push([l("下单提醒",[d((C=p.result)==null?void 0:C.success,p.reject),d((E=h.result)==null?void 0:E.success,h.reject)].join("")),`${(_=p.options.match)==null?void 0:_.title} / ${(A=p.options.bet)==null?void 0:A.getBetName()}`,"",g(p.account,p.result,p.options,p.reject),g(h.account,h.result,h.options,h.reject)].join(`
`));const y=[p,h],v=y.find(S=>S.options.target===Gn.Home),w=y.find(S=>S.options.target===Gn.Away),b=Pr.getRate(v==null?void 0:v.options.odds,w==null?void 0:w.options.odds);if(v&&w){const S=["<b>📣赛事推单</b>",`<b>⚽️赛事：${(T=p.options.match)==null?void 0:T.title}</b>`,`<b>1️⃣[${vf.providerName[v.options.type]}] 主队赔率：${v==null?void 0:v.options.odds}</b>`,`<b>2️⃣[${vf.providerName[w.options.type]}] 客队赔率：${w==null?void 0:w.options.odds}</b>`,`<b>本单对冲利润：${pt.percent(b)}（投注100块可无风险获得:${pt.toFixed(b*100-100,2)}元利润）</b>`];e.push(S.join(`
`))}},LoseOrderMessage:(p,h,g,y)=>{var v,w;t.push([l("补单提醒",d(!0,y)),u(p),`${(v=g.match)==null?void 0:v.title} / ${(w=g.bet)==null?void 0:w.getBetName()} / ${g.target}`,`<blockquote>原订单时间：${pt.formatDate(h.createAt)}`,`原补单金额：${h.getBetMoney(h.betOdds)}@${h.getOdds(Xn().config.makeProfit)}`,`补单金额：${g.betMoney}@${g.newOdds??g.odds}`,`是否拒单：${y?"🔴是":"否"}</blockquote>`].join(`
`))},OrderReportMessage:(p,h)=>{if(h.length===0)return;const g=pt.formatDate(new Date,"yyyy-MM-dd");if(pt.formatDate(h[0].CreateAt,"yyyy-MM-dd")!==g||!i(3,"ORDERREPORT",3600))return;const y=[l(`${g}统计报表`)],v=pt.sum(h,b=>b.Money);y.push(`总余额：${pt.toFixed(pt.sum(p,b=>b.balance??0),0).toLocaleString()} 盈亏：${c(v)}${pt.toFixed(v,0).toLocaleString()} 总订单：${h.length} 未结订单：${pt.sum(p,b=>b.unsettle)}`,""),p.forEach(b=>{y.push(u(b),`<blockquote>盈亏:${c(b.today)}${pt.toFixed(b.today).toLocaleString()}，总盈亏：${pt.toFixed(b.totalProfit??0).toLocaleString()}，`,`订单：${b.orderCount??0}笔，未结：${b.unsettle}笔</blockquote>`)});const w=y.join(`
`);t.push(w),r.push(w)},PublishLoseOrderMessage:()=>{var y;if(!((y=s.setting)!=null&&y.Publisher))return;const p=[l(`[${s.userName}]补单队列变化`)];jb().orders.forEach((v,w)=>{p.push(`<blockquote>${v.match}
${v.bet} => ${v.target}
时间：${pt.formatDate(v.createAt)}
补单金额：${v.betMoney}@${v.betOdds} x ${v.betCount??1}</blockquote>`)});const g=p.join(`
`);n.push(g)}}}});class WBe{static async get(e){}static async save(e,r){return!1}}const $Be="ModifyHeader",UF="ACCOUNT",Io=mh("account",()=>{const t=oe([]),e=oe([]),r=oe(),n=Xn(),s=Gi(),o=oe(new Map),a=_=>{if(_)return t.value.find(A=>A.accountId===_)},i=async _=>{const A=a(_.accountId);A?A.update(_):t.value.push(_),await u();const T=a(_.accountId);await(T==null?void 0:T.updateBalance()),await(T==null?void 0:T.updateOrders())},l=async _=>{_&&await c();const A=await Vt.getData(UF);A&&(t.value=A.map(T=>new uv(T)),_&&(await f(_),await E()))},u=async()=>{await Vt.saveData(UF,JSON.stringify(t.value.filter(_=>_.accountId)))},c=async()=>{const _=await Vt.getTagPlatforms();e.value=(_==null?void 0:_.map(A=>new tBe(A)))??[]},d=(_,A="")=>{var T;return _?((T=e.value.find(S=>S.id===_))==null?void 0:T.name)??A:A},f=async _=>{const A=[],T=Date.now();try{for(let S of t.value){let B=Date.now();if(A.push(`开始加载账户：${S.platformName} / ${S.playerName} / ${S.provider}`),S.active){A.push("账号正在投注中，停止加载");continue}try{B=Date.now(),await S.updateBalance(),A.push(`读取余额：${Date.now()-B}ms`),B=Date.now(),await S.updateOrders(),A.push(`读取订单：${Date.now()-B}ms`)}catch($){A.push(`发生错误：${$.message}`)}}}finally{let S=Date.now();if(await E(),A.push(`加载本地订单：${Date.now()-S}ms`),S=Date.now(),await u(),A.push(`保存账号：${Date.now()-S}ms`),Vt.saveLog(`加载账号信息，总耗时:${Date.now()-T}ms`,A),_){const B=[];t.value.forEach($=>{$.gateway&&$.userAgent&&B.push({UrlPattern:$.gateway,UserAgent:$.userAgent})}),WBe.save($Be,B),await pt.wait(120*1e3+Math.random()*6e4),await f(_)}}},p=async _=>{_&&(t.value=t.value.filter(A=>A.accountId!==_),u())},h=new Map,g=(_,A=void 0,T=[],S,B)=>{if(!_)return;const $=n.config;A===void 0&&(A=$.betMoney),h.has(_)||h.set(_,0);const P=h.get(_)??0,O=t.value.filter(x=>x.provider===_);for(let x=0;x<O.length;x++){const I=O[x];if(I.accountId&&T.includes(I.accountId))continue;const F=I.getBalance();F!==void 0&&(S&&!S(I)||F<A)}var D=t.value.filter(x=>{if(x.accountId&&T.includes(x.accountId)||x.maxOrder&&x.todayOrder&&x.todayOrder>=x.maxOrder)return!1;const I=x.getBalance();return I===void 0||S&&!S(x)?!1:x.provider===_&&I>=A});if(D.length!==0){if(D.length===1)return D[0];if(B&&B.length===2&&D.some(x=>x.profit!==0)){const x=1/(B.map(I=>1/I.odds).sum()??1);return D.filter(I=>I.profit===0||I.profit>=x).asc(I=>I.profit===0?$.profit:I.profit).first()}return h.set(_,P+1),D[P%D.length]}},y=async(_,A)=>{if(!_)return A.checkError=`场馆${A.type}没有可用账号`,A;const T=vf.GetProvider(_);if(!T)return A.checkError=`场馆${A.type}不被支持`,A;try{return A.betMoney=_.getBetMoney(A.betMoney,A.odds),A=await T.checkBet(A)}catch(S){return A.checkError=JSON.stringify(S),A}finally{A.saveLog(_)}},v=async(_,A,T=10)=>{var D,x,I;const S=vf.GetProvider(_);if(!S)return;let B,$=[`<p>赛事：${(D=A.match)==null?void 0:D.title} / ${(x=A.bet)==null?void 0:x.getBetName()} / ${A.target}@${(I

// ---- 实时赔率缓存 fo / Jn / anchor 4: fo() / approx line 8965 ----
}),Object.defineProperty(t.prototype,"retryCount",{get:function(){return Math.max(this._retryCount,0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"bufferedAmount",{get:function(){var e=this._messageQueue.reduce(function(r,n){return typeof n=="string"?r+=n.length:n instanceof Blob?r+=n.size:r+=n.byteLength,r},0);return e+(this._ws?this._ws.bufferedAmount:0)},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"extensions",{get:function(){return this._ws?this._ws.extensions:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"protocol",{get:function(){return this._ws?this._ws.protocol:""},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"readyState",{get:function(){return this._ws?this._ws.readyState:this._options.startClosed?t.CLOSED:t.CONNECTING},enumerable:!0,configurable:!0}),Object.defineProperty(t.prototype,"url",{get:function(){return this._ws?this._ws.url:""},enumerable:!0,configurable:!0}),t.prototype.close=function(e,r){if(e===void 0&&(e=1e3),this._closeCalled=!0,this._shouldReconnect=!1,this._clearTimeouts(),!this._ws){this._debug("close enqueued: no ws instance");return}if(this._ws.readyState===this.CLOSED){this._debug("close: already closed");return}this._ws.close(e,r)},t.prototype.reconnect=function(e,r){this._shouldReconnect=!0,this._closeCalled=!1,this._retryCount=-1,!this._ws||this._ws.readyState===this.CLOSED?this._connect():(this._disconnect(e,r),this._connect())},t.prototype.send=function(e){if(this._ws&&this._ws.readyState===this.OPEN)this._debug("send",e),this._ws.send(e);else{var r=this._options.maxEnqueuedMessages,n=r===void 0?$f.maxEnqueuedMessages:r;this._messageQueue.length<n&&(this._debug("enqueue",e),this._messageQueue.push(e))}},t.prototype.addEventListener=function(e,r){this._listeners[e]&&this._listeners[e].push(r)},t.prototype.dispatchEvent=function(e){var r,n,s=this._listeners[e.type];if(s)try{for(var o=TBe(s),a=o.next();!a.done;a=o.next()){var i=a.value;this._callEventListener(e,i)}}catch(l){r={error:l}}finally{try{a&&!a.done&&(n=o.return)&&n.call(o)}finally{if(r)throw r.error}}return!0},t.prototype.removeEventListener=function(e,r){this._listeners[e]&&(this._listeners[e]=this._listeners[e].filter(function(n){return n!==r}))},t.prototype._debug=function(){for(var e=[],r=0;r<arguments.length;r++)e[r]=arguments[r];this._options.debug&&console.log.apply(console,SBe(["RWS>"],e))},t.prototype._getNextDelay=function(){var e=this._options,r=e.reconnectionDelayGrowFactor,n=r===void 0?$f.reconnectionDelayGrowFactor:r,s=e.minReconnectionDelay,o=s===void 0?$f.minReconnectionDelay:s,a=e.maxReconnectionDelay,i=a===void 0?$f.maxReconnectionDelay:a,l=0;return this._retryCount>0&&(l=o*Math.pow(n,this._retryCount-1),l>i&&(l=i)),this._debug("next delay",l),l},t.prototype._wait=function(){var e=this;return new Promise(function(r){setTimeout(r,e._getNextDelay())})},t.prototype._getNextUrl=function(e){if(typeof e=="string")return Promise.resolve(e);if(typeof e=="function"){var r=e();if(typeof r=="string")return Promise.resolve(r);if(r.then)return r}throw Error("Invalid URL")},t.prototype._connect=function(){var e=this;if(!(this._connectLock||!this._shouldReconnect)){this._connectLock=!0;var r=this._options,n=r.maxRetries,s=n===void 0?$f.maxRetries:n,o=r.connectionTimeout,a=o===void 0?$f.connectionTimeout:o,i=r.WebSocket,l=i===void 0?kBe():i;if(this._retryCount>=s){this._debug("max retries reached",this._retryCount,">=",s);return}if(this._retryCount++,this._debug("connect",this._retryCount),this._removeListeners(),!IBe(l))throw Error("No valid WebSocket class provided");this._wait().then(function(){return e._getNextUrl(e._url)}).then(function(u){e._closeCalled||(e._debug("connect",{url:u,protocols:e._protocols}),e._ws=e._protocols?new l(u,e._protocols):new l(u),e._ws.binaryType=e._binaryType,e._connectLock=!1,e._addListeners(),e._connectTimeout=setTimeout(function(){return e._handleTimeout()},a))})}},t.prototype._handleTimeout=function(){this._debug("timeout event"),this._handleError(new _Be(Error("TIMEOUT"),this))},t.prototype._disconnect=function(e,r){if(e===void 0&&(e=1e3),this._clearTimeouts(),!!this._ws){this._removeListeners();try{this._ws.close(e,r),this._handleClose(new PBe(e,r,this))}catch{}}},t.prototype._acceptOpen=function(){this._debug("accept open"),this._retryCount=0},t.prototype._callEventListener=function(e,r){"handleEvent"in r?r.handleEvent(e):r(e)},t.prototype._removeListeners=function(){this._ws&&(this._debug("removeListeners"),this._ws.removeEventListener("open",this._handleOpen),this._ws.removeEventListener("close",this._handleClose),this._ws.removeEventListener("message",this._handleMessage),this._ws.removeEventListener("error",this._handleError))},t.prototype._addListeners=function(){this._ws&&(this._debug("addListeners"),this._ws.addEventListener("open",this._handleOpen),this._ws.addEventListener("close",this._handleClose),this._ws.addEventListener("message",this._handleMessage),this._ws.addEventListener("error",this._handleError))},t.prototype._clearTimeouts=function(){clearTimeout(this._connectTimeout),clearTimeout(this._uptimeTimeout)},t}();const $F=["api.a8.to","47.115.75.57"];let LF=0;const OBe=(t,e)=>(t=t.replace("https://api-v4","wss://ws"),e=e.replace("Token ",""),LF++,`wss://${$F[LF%$F.length]}/esport/ws/TF?auth_token=${e}&combo=false`),N3=t=>({Authorization:t,"tf-authorization":MBe(t,Math.floor(Date.now()/1e3),Math.floor(Date.now()/1e3)),"public-token":"2633b50ad4f64cd28b3224e47c877057"}),DBe=t=>{for(var e=window.atob(t),r=new Uint8Array(e.length),n=0;n<e.length;n++)r[n]=e.charCodeAt(n);return r},MBe=(t,e,r)=>{t=t.replace("Token ","");var n=Math.floor(new Date().getTime()/1e3)-r+e,s=Math.floor(n/10),o=new Uint8Array(8);o[4]=s>>24&255,o[5]=s>>16&255,o[6]=s>>8&255,o[7]=255&s;const a=DBe(t);var i=new WF("SHA-1","ARRAYBUFFER");i.setHMACKey(a,"ARRAYBUFFER"),i.update(o.buffer);var l=i.getHMAC("ARRAYBUFFER"),u=new Uint8Array(l),c=15&u[u.length-1],d=(127&u[c])<<24|u[c+1]<<16|u[c+2]<<8|u[c+3],f=new WF("SHA-512","TEXT");return f.update("".concat((d%1e6).toString()).padStart(6,"0")),f.getHash("HEX")},Lf=Xt.TF,NBe=async()=>{const t=await Vt.getPlatform(Lf);if(!t)return;const e=fo(),r=async()=>{const i=await Vt.getPlatform(Lf);return i?OBe(i.gateway,i.token):""},n=new BBe(r,[],{connectionTimeout:4e3,maxRetries:1/0,maxReconnectionDelay:5e3,minReconnectionDelay:1e3});n.onopen=()=>{},n.onmessage=i=>{const l=JSON.parse(i.data);if(!l.data||!l.data.selection)return;const u=l.data.market_id;l.data.selection.forEach(c=>{const d=`${u}:${c.name}`;if(!e.isOdds(Lf,d))return;const f=new Jn(d,c.euro_odds,c.status!=="open",u);e.save(Lf,f)})},n.onerror=()=>{Gi().send.CollectMessage(Lf,"WebSocket链接发生错误")};const s=new RegExp(t.betName),o=async()=>{const i={time:Date.now(),match:0};try{const c=(await Nr.get(`${t.gateway}/api/v8/events/?game_id=&combo=false&outright=false&timing=today&market_option=MATCH&lang=zh&timezone=Asia/Shanghai`,{headers:N3(t.token)})).data.results.filter(d=>t.games.includes(d.game_id.toString())&&new Date(d.start_datetime).getTime()<Date.now()+3600*1e3);for(let d=0;d<c.length;d++){const f=c[d].event_id;i.match++,await a(f)}}catch(l){console.error(l)}finally{Pr.debug(`[${Lf}]比赛列表:${Date.now()-i.time}ms，读取比赛:${i.match}场`),await pt.wait(30*1e3),await o()}},a=async(i,l="MATCH")=>{await pt.wait(1e3);const u=l==="MATCH"?"MATCH":"MAP",c=l==="MATCH"?"":l,d=`${t.gateway}/api/v8/events/?event_id=${i}&combo=false&outright=false&map_option=${c}&market_option=${u}&lang=zh&timezone=Asia/Shanghai`,p=(await Nr.get(d,{headers:N3(t.token)})).data;if(p.results.forEach(h=>{h.markets.forEach(g=>{if(!s.test(g.market_name))return;const y=g.market_id;g.selection.forEach(v=>{const w=`${y}:${v.name}`,b=new Jn(w,v.euro_odds,v.status!=="open",y);e.save(Lf,b)})})}),l==="MATCH"){for(let h=0;h<p.results.length;h++)if(p.results[h].market_tabs)for(let g in p.results[h].market_tabs.map(y=>y.tab_name)){const y=p.results[h].market_tabs[g].tab_name;!y||y==="MATCH"||await a(i,y)}}};o()},Vg=mh("match",()=>{const t=oe(),e=oe(new Map),r=oe(new Map),n=new Map,s=async O=>{var D;try{const x=new Map;for(const[I,F]of Object.entries(O)){const R=I;x.has(R)||x.set(R,new Map);for(const[M,G]of Object.entries(F))(D=x.get(R))==null||D.set(Number(M),G)}r.value=x}finally{}},o=async()=>{r.value=await Vt.initBetTarget()},a=async(O,D,x)=>{var F,R,M;return(F=h.setting)!=null&&F.BetTarget?(c(O,D)===x?(R=r.value.get(O))==null||R.delete(D):(r.value.has(O)||r.value.set(O,new Map),(M=r.value.get(O))==null||M.set(D,x)),await u()):!1},i=oe(new Map),l=(O,D)=>{D.forEach(x=>{var G;const I=x.SourceID;var F=(G=t.value)==null?void 0:G.find(J=>J.providers[O]===I);if(!F)return;const R=F.id,M=new eBe(x.Score,F.reverse.includes(O));i.value.set(R,M)})},u=async()=>{var O;return d(),(O=h.setting)!=null&&O.BetTarget?await Vt.saveBetTarget(r.value):!1},c=(O,D)=>{var x,I;return(I=(x=r.value)==null?void 0:x.get(O))==null?void 0:I.get(D)},d=()=>{[].forEach(D=>{r.value.forEach((x,I)=>{x.delete(D)})})},f=fo(),p=Io(),h=Xn(),g=jb(),y=Gi();let v=0,w=0,b=0;const C="BETACCOUNT:",E="BETCOUNT:",_=(O,D,x)=>{if(!O.accountId)return;const I=`${C}${D}:${x}`,F=A(D,x);F.includes(O.accountId)||(F.push(O.accountId),sessionStorage.setItem(I,JSON.stringify(F)));const R=`${E}${O.accountId}:${D}:${x}`,M=T(O,D,x);sessionStorage.setItem(R,(M+1).toString())},A=(O,D)=>{const x=`${C}${O}:${D}`,I=sessionStorage.getItem(x);return I&&JSON.parse(I)||[]},T=(O,D,x)=>{const I=`${E}${O.accountId}:${D}:${x}`,F=sessionStorage.getItem(I);return F?Number(F)??0:0},S=async O=>{let D=!0,x;if(h.config.makeUp_defaultOdds!==0&&O.match&&O.bet){const I=await Vt.getDefaultOdds(O.match.id,O.bet.id,O.target);I!==0&&h.config.makeUp_defaultOdds<=I&&(x=`初赔赔率:${I}，大于当前设定值：${h.config.makeUp_defaultOdds}`,D=!1)}return h.config.makeUp_odds!==0&&h.config.makeUp_odds<=O.odds&&(x=`当前赔率:${O.odds}，大于当前设定值：${h.config.makeUp_odds}`,D=!1),D||Pr.tip("不予补单提醒",x??"",3e3),D},B=(O,D,x,I)=>{const F=`${O.accountId}:${D}:${x}`;n.set(F,I)},$=(O,D,x)=>{const I=`${O.accountId}:${D}:${x}`;return n.get(I)},P=async()=>{var x,I,F,R;const O=Date.now();let D=!1;try{if(!h.userId)return;if(O-v>30*1e3){const G=await Vt.GetMatchs(h.userName);if(!G)return;t.value=G.map(J=>new kQ(J)),v=Date.now(),D=!0,O-w>6e4&&(g.removeOrders(t.value.map(J=>J.bets.map(z=>z.id))),w=Date.now())}if(!t.value)return;for(const G of t.value){if(i.value.has(G.id)){const J=Math.max(...((x=i.value.get(G.id))==null?void 0:x.score.keys())||[]);if(J){const z=G.bets.find(ee=>ee.round===J);z&&(z.isLive=!0),G.bets.filter(ee=>ee.round!==J&&ee.isLive).forEach(ee=>{ee.isLive=void 0})}}for(const J of G.bets){if(J.items.forEach(q=>{q.updateOdds()}),!h.config.betting||g.orders.has(J.id))continue;h.config.minMoney!==0&&h.config.maxMoney!==0&&(h.config.betMoney=Math.floor(Math.random()*(h.config.maxMoney-h.config.minMoney+1))+h.config.minMoney);const z=J.GetOrderOptions(G,h.config,p.accounts);if(!z||z.length!==2)continue;let ee=new rBe(G.id,G.title,J.id,J.getBetName()),ce=z[0],ge=z[1];const be=p.getAccount(ce.type,ce.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ce.target))||[],q=>{var Me,V;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ce.odds,G.gameId);if(!te)return!1;const ue=`${(Me=ce.bet)==null?void 0:Me.id}:${ce.target}`,ae=((V=e.value)==null?void 0:V.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ce.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ce.target))return te=!1;if(q.lastOdds){const U=$(q,J.id,ce.target);if(U&&U>=ce.odds)return te=!1}const ye=q.game[G.game];return te},z),Z=p.getAccount(ge.type,ge.betMoney,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],q=>{var ye,Me;if(q.isPause()||q.markupOnly)return!1;let te=q.checkOdds(ge.odds,G.gameId);if(!te)return!1;const ue=`${(ye=ge.bet)==null?void 0:ye.id}:${ge.target}`,ae=((Me=e.value)==null?void 0:Me.get(ue))??0;if(ae&&(q.minDefault!==0&&(te=q.minDefault<ae,!te)||q.maxDefault!==0&&(te=q.maxDefault>ae,!te)))return!1;const Ce=c(q.provider,J.id);if(Ce&&Ce!==ge.target||q.maxBetCount!==0&&q.maxBetCount<=T(q,J.id,ge.target))return te=!1;if(q.lastOdds){const V=$(q,J.id,ge.target);if(V&&V>=ge.odds)return te=!1}return te},z);if(!be||!Z)continue;be.active=Z.active=!0;const se=Date.now(),me=await Promise.all([p.checkBetting(be,ce),p.checkBetting(Z,ge)]);if(ce=me[0],ge=me[1],!ce.data||!ge.data){await pt.wait(1e3);continue}if(ce.orderIndex=1,ge.orderIndex=2,h.config.checkTimeout&&Date.now()-se>h.config.checkTimeout){Pr.tip("前置检查超时",`超时时间：${Date.now()-se}ms，大于设定值：${h.config.checkTimeout}ms`,3e3);continue}const Oe=Math.max(h.config.waitTime[be.provider]??0,h.config.waitTime[Z.provider]??0,10);let Pe,ve;if(h.config.betSorting==="Parallel"){const q=await Promise.all([p.betting(be,ce,Oe),p.betting(Z,ge,Oe)]);if(((I=q[0])==null?void 0:I.success)===!0||!q.some(te=>te==null?void 0:te.success))Pe=q[0],ve=q[1];else if(((F=q[1])==null?void 0:F.success)===!0){Pe=q[1],ve=q[0];const te=ge;ge=ce,ce=te}if((Pe==null?void 0:Pe.success)!==!0)continue}else{if(Pe=await p.betting(be,ce,Oe)??new uo(be.provider,!1),(Pe==null?void 0:Pe.success)!==!0)continue;ve=await p.betting(Z,ge,Oe)??new uo(Z.provider,!1)}if(!ve)continue;if(Pe.success&&!ve.success){let q=1/(1/h.config.makeProfit-1/ce.odds);h.config.anyOdds&&(q=1/(1/h.config.anyOddsProfit-1/ce.odds));const te=[];for(let ue=0;ue<3;ue++){J.items.forEach(Me=>{Me.updateOdds()});const ae=J.items.filter(Me=>!te.includes(Me.type)&&Me.getOdds(ge.target)>=q).desc(Me=>Me.getOdds(ge.target));if(ae.length===0)break;let Ce;for(let Me of ae){const V=Math.floor(ce.odds*ce.betMoney/Me.getOdds(ge.target));if(Ce=p.getAccount(Me.type,V,h.config.noSameBet&&A(J.id,Pr.getOpponent(ge.target))||[],U=>{if(U.isPause()||te.includes(U.provider))return!1;let K=U.getMinOdds()<=Me.getOdds(ge.target);if(!K)return K;const Ee=c(U.provider,J.id);return Ee&&Ee!==ge.target?K=!1:K}),Ce){ge.odds=Me.getOdds(ge.target),ge.betMoney=V;break}}if(!Ce)break;te.push(Ce.provider),ge.data=ge.request=ge.response=void 0,ge.type=Ce.provider;const ye=ge=await p.checkBetting(Ce,ge);if(ye.data&&(ve=await p.betting(Ce,ye,Oe)??new uo(Ce.provider,!1),ve.success))break}}const le=[];if(Pe.success===!0&&(le.push(h.config.waitTime[be.provider]??5),be.updateBalance()),ve.success===!0&&(le.push(h.config.waitTime[ve.provider]??5),Z.updateBalance()),Pe.success||ve.success){let q=Math.max(...le),te=Pr.tip("拒单检测",`等待<countdown>${Oe}</countdown>秒`,Oe*1e3);for(let ue=0;ue<q;ue++)await pt.wait(1e3)}let he=!1,de=[];Pe.success&&(de=await be.updateOrders()??[],he=de&&de.length>0&&de[0].status===Yt.reject||!1);let Q=!1,N=[];if(ve.success&&(N=await Z.updateOrders()??[],Q=N&&N.length>0&&N[0].status===Yt.reject||!1),Pe.success&&!he&&(!ve.success||Q)&&await S(ge)){let te=new eb(be.accountId??0,G.id,J.id,ge.target,ce.betMoney,ce.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ge.type}下单失败，创建补单队列`,3e3)}if(Pe.success&&!he&&(_(be,J.id,ce.target),B(be,J.id,ce.target,ce.odds)),ve.success&&!Q&&(!Pe.success||he)&&await S(ce)){let te=new eb(Z.accountId??0,G.id,J.id,ce.target,ge.betMoney,ge.odds,G.title,J.getBetName(),ee.linkId,Date.now(),!1);g.createOrder(te),await pt.wait(500),Pr.tip("补单提醒",`${ce.type}下单失败，创建补单队列`,3e3)}ve.success&&!Q&&(_(Z,J.id,ge.target),B(Z,J.id,ge.target,ge.odds)),console.log("投注成功赔率",n);let L=[];Pe.success&&de&&de.length>0&&L.push(new rA(ee.linkId,Pe.provider,de[0].orderId)),ve.success&&N&&N.length>0&&L.push(new rA(ee.linkId,ve.provider,N[0].orderId)),await Vt.saveOrderBind(L),(Pe.success||ve.success)&&y.send.BettingMessage({account:be,result:Pe,options:ce,reject:he},{account:Z,result:ve,options:ge,reject:Q})}}if([...g.orders.keys()].length!==0&&h.config.makeUp){const G=[];for(const[J,z]of g.orders){const ee=t.value.find(Z=>Z.id===z.matchId);if(!ee){G.push(J);continue}const ce=ee.bets.find(Z=>Z.id===z.betId);if(!ce){G.push(J);continue}let ge=z.getOdds(h.config.makeProfit);const be=ce.items.filter(Z=>Z.getOdds(z.target)>=ge).sort((Z,se)=>Z.getOdds(z.target)>se.getOdds(z.target)?-1:1);if(be.length!==0)for(const Z of be){if(G.includes(z.betId))continue;const se=z.getBetMoney(Z.getOdds(z.target)),me=p.getAccount(Z.type,se,h.config.noSameProvider&&A(ce.id,Pr.getOpponent(z.target))||[],he=>{if(he.isPause()||he.noMarkup||he.minOdds!==0&&Z.getOdds(z.target)<he.minOdds||he.maxOdds!==0&&Z.getOdds(z.target)>he.maxOdds)return!1;const de=`${z.betId}:${z.target}`,Q=e.value.get(de);return!(Q&&(he.minDefault!==0&&Q<he.minDefault||he.maxDefault!==0&&Q>he.maxDefault))});if(!me)continue;const Oe=await p.checkBetting(me,new Tp(ee,ce,Z,z.target,se));if(!Oe.data)continue;const Pe=h.config.waitTime[me.provider]===-1?0:Math.max(h.config.waitTime[me.provider]??0,10),ve=await p.betting(me,Oe,Pe);let le=!1;if(ve&&ve.success){if(z.isCreateOrder||(Pe>0&&Pr.tip("拒单检测",`等待<countdown>${Pe}</countdown>秒`,Pe*1e3),await pt.wait(Pe*1e3)),!z.isCreateOrder&&Pe!==0){const he=await me.updateOrders();he&&he.length!==0?(he[0].status===Yt.reject?(le=!0,Pr.tip("拒单提醒",`${z.target}再次被拒单`,3e3)):G.push(J),await Vt.saveOrderBind([new rA(z.linkId,me.provider,he[0].orderId)])):(!he||he.length===0)&&G.push(J),y.send.LoseOrderMessage(me,z,Oe,le)}else G.push(J);_(me,ce.id,Oe.target)}else ve||G.push(J)}}G.length!==0&&G.forEach(J=>{g.removeOrder(J)})}O-b>10*60*1e3&&(Vt.getMatchDefaultOdds(((R=t.value)==null?void 0:R.map(G=>G.id))??[]).then(G=>{G&&(e.value=G)}),b=Date.now())}finally{D&&f.clean(),await pt.wait(100),p.accounts.filter(M=>M.active).forEach(M=>{M.active=!1}),await P()}};return P(),{matchs:t,score:i,defaultOdds:e,initBetTarget:o,loadBetTarget:s,getBetTarget:c,setBetTarget:a,updateScore:l}});class eb{constructor(e,r,n,s,o,a,i,l,u,c,d,f){ke(this,"accountId");ke(this,"matchId");ke(this,"betId");ke(this,"target");ke(this,"betMoney");ke(this,"betOdds");ke(this,"match");ke(this,"bet");ke(this,"linkId");ke(this,"createAt");ke(this,"isCreateOrder");ke(this,"betCount");this.accountId=e,this.matchId=r,this.betId=n,this.target=s,this.betMoney=o,this.betOdds=a,this.match=i,this.bet=l,this.linkId=u,this.createAt=c||Date.now(),this.isCreateOrder=d,this.betCount=f}getBetMoney(e){return e?Math.round(this.betMoney*this.betOdds/e):0}getOdds(e){if(this.isCreateOrder)return Number(this.betOdds);e||(e=1.01);let r=1/(1/e-1/this.betOdds);return pt.toFixed(r)}}const RBe="-1001949068832",FBe="-4855267884";var DG=(t=>(t[t.Balance=0]="Balance",t[t.Profit=1]="Profit",t[t.Limit=2]="Limit",t[t.OrderReport=3]="OrderReport",t[t.OrderPush=4]="OrderPush",t[t.OrderNotify=5]="OrderNotify",t))(DG||{});const Gi=mh("message",()=>{const t=[],e=[],r=[],n=[],s=Xn(),o=Io(),a=async()=>{try{const p=t.pop();p&&await Vt.sendMessage(s.telegramId,p);const h=e.pop();h&&await Vt.sendMessage(s.pushOrderId,h);const g=r.pop();g&&await Vt.sendMessage(RBe,g);const y=n.pop();y&&await Vt.sendMessage(FBe,y)}catch(p){console.error(p)}finally{await pt.wait(1e3),await a()}};a();const i=(p,h,g=1800)=>{if(g===0)return!0;const y=`${p}:${h}`,v=Number(sessionStorage.getItem(y)??"0"),w=Date.now();return w-v<g*1e3?!1:(sessionStorage.setItem(y,w.toString()),!0)},l=(p,h)=>`<b>📣${h??"📣📣"}${p}</b>`,u=p=>`#${s.userName} ${o.getPlatform(p.platformId)}，账号：${p.playerName}，余额：${pt.toFixed(p.balance??0).toLocaleString()}，场馆：${p.provider}`,c=p=>p?p>0?"🟢":"🔴":"",d=(p,h)=>{let g=p?"✅":"❌";return h&&(g="🔴"),g};return{send:{BalanceMessage:(p,h=1800)=>{var y,v;if(!p.maxBalance||(p.balance??0)<p.maxBalance||!i(0,`${p.accountId}`,h))return;const g=[l("余额超限提醒"),u(p),`<blockquote>当前余额：${(y=p.balance)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxBalance)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},ProfitMessage:(p,h=1800)=>{var y,v;if(!p.maxProfit||!p.totalProfit||p.totalProfit<p.maxProfit||!i(1,`${p.accountId}`,h)||p.pause)return;const g=[l("账号盈利超过预设值"),u(p),`<blockquote>当前盈利：${(y=p.totalProfit)==null?void 0:y.toLocaleString()}，大于设定值：${(v=p.maxProfit)==null?void 0:v.toLocaleString()}</blockquote>`].join(`
`);t.push(g)},LimitMessage:(p,h)=>{const g=[l("限红提醒"),u(p),`<blockquote>${h.match} / ${h.bet}`,`投注金额：${h.betMoney}@${h.odds}`,`限红金额：${h.limit}</blockquote>`].join(`
`);return t.push(g),g},DelayMessage:(p,h)=>{h<2e3||t.push([l("注单延迟收单提醒"),u(p),`<blockquote>投注延迟：${pt.toFixed(h/1e3)}秒</blockquote>`].join(`
`))},CollectMessage:(p,h)=>{i(0,`${p}`,600)&&t.push([l(`${p}本地采集发生错误`),`<blockquote>${h}</blockquote>`].join(`
`))},BettingMessage:(p,h)=>{var C,E,_,A,T;const g=(S,B,$,P)=>{const O=[u(S),`<blockquote>投注队伍：${$.target}`,`投注金额：${$.betMoney}@${$.odds}`,`投注结果：${B.success?"✅ 成功":"❌ 失败"}`];return B.success&&O.push(`是否拒单：${P?"🔴是":"否"}`),O.push(`备注信息：${B.message??"N/A"}</blockquote>`),O.join(`
`)};t.push([l("下单提醒",[d((C=p.result)==null?void 0:C.success,p.reject),d((E=h.result)==null?void 0:E.success,h.reject)].join("")),`${(_=p.options.match)==null?void 0:_.title} / ${(A=p.options.bet)==null?void 0:A.getBetName()}`,"",g(p.account,p.result,p.options,p.reject),g(h.account,h.result,h.options,h.reject)].join(`
`));const y=[p,h],v=y.find(S=>S.options.target===Gn.Home),w=y.find(S=>S.options.target===Gn.Away),b=Pr.getRate(v==null?void 0:v.options.odds,w==null?void 0:w.options.odds);if(v&&w){const S=["<b>📣赛事推单</b>",`<b>⚽️赛事：${(T=p.options.match)==null?void 0:T.title}</b>`,`<b>1️⃣[${vf.providerName[v.options.type]}] 主队赔率：${v==null?void 0:v.options.odds}</b>`,`<b>2️⃣[${vf.providerName[w.options.type]}] 客队赔率：${w==null?void 0:w.options.odds}</b>`,`<b>本单对冲利润：${pt.percent(b)}（投注100块可无风险获得:${pt.toFixed(b*100-100,2)}元利润）</b>`];e.push(S.join(`
`))}},LoseOrderMessage:(p,h,g,y)=>{var v,w;t.push([l("补单提醒",d(!0,y)),u(p),`${(v=g.match)==null?void 0:v.title} / ${(w=g.bet)==null?void 0:w.getBetName()} / ${g.target}`,`<blockquote>原订单时间：${pt.formatDate(h.createAt)}`,`原补单金额：${h.getBetMoney(h.betOdds)}@${h.getOdds(Xn().config.makeProfit)}`,`补单金额：${g.betMoney}@${g.newOdds??g.odds}`,`是否拒单：${y?"🔴是":"否"}</blockquote>`].join(`
`))},OrderReportMessage:(p,h)=>{if(h.length===0)return;const g=pt.formatDate(new Date,"yyyy-MM-dd");if(pt.formatDate(h[0].CreateAt,"yyyy-MM-dd")!==g||!i(3,"ORDERREPORT",3600))return;const y=[l(`${g}统计报表`)],v=pt.sum(h,b=>b.Money);y.push(`总余额：${pt.toFixed(pt.sum(p,b=>b.balance??0),0).toLocaleString()} 盈亏：${c(v)}${pt.toFixed(v,0).toLocaleString()} 总订单：${h.length} 未结订单：${pt.sum(p,b=>b.unsettle)}`,""),p.forEach(b=>{y.push(u(b),`<blockquote>盈亏:${c(b.today)}${pt.toFixed(b.today).toLocaleString()}，总盈亏：${pt.toFixed(b.totalProfit??0).toLocaleString()}，`,`订单：${b.orderCount??0}笔，未结：${b.unsettle}笔</blockquote>`)});const w=y.join(`
`);t.push(w),r.push(w)},PublishLoseOrderMessage:()=>{var y;if(!((y=s.setting)!=null&&y.Publisher))return;const p=[l(`[${s.userName}]补单队列变化`)];jb().orders.forEach((v,w)=>{p.push(`<blockquote>${v.match}
${v.bet} => ${v.target}
时间：${pt.formatDate(v.createAt)}
补单金额：${v.betMoney}@${v.betOdds} x ${v.betCount??1}</blockquote>`)});const g=p.join(`
`);n.push(g)}}}});class WBe{static async get(e){}static async save(e,r){return!1}}const $Be="ModifyHeader",UF="ACCOUNT",Io=mh("account",()=>{const t=oe([]),e=oe([]),r=oe(),n=Xn(),s=Gi(),o=oe(new Map),a=_=>{if(_)return t.value.find(A=>A.accountId===_)},i=async _=>{const A=a(_.accountId);A?A.update(_):t.value.push(_),await u();const T=a(_.accountId);await(T==null?void 0:T.updateBalance()),await(T==null?void 0:T.updateOrders())},l=async _=>{_&&await c();const A=await Vt.getData(UF);A&&(t.value=A.map(T=>new uv(T)),_&&(await f(_),await E()))},u=async()=>{await Vt.saveData(UF,JSON.stringify(t.value.filter(_=>_.accountId)))},c=async()=>{const _=await Vt.getTagPlatforms();e.value=(_==null?void 0:_.map(A=>new tBe(A)))??[]},d=(_,A="")=>{var T;return _?((T=e.value.find(S=>S.id===_))==null?void 0:T.name)??A:A},f=async _=>{const A=[],T=Date.now();try{for(let S of t.value){let B=Date.now();if(A.push(`开始加载账户：${S.platformName} / ${S.playerName} / ${S.provider}`),S.active){A.push("账号正在投注中，停止加载");continue}try{B=Date.now(),await S.updateBalance(),A.push(`读取余额：${Date.now()-B}ms`),B=Date.now(),await S.updateOrders(),A.push(`读取订单：${Date.now()-B}ms`)}catch($){A.push(`发生错误：${$.message}`)}}}finally{let S=Date.now();if(await E(),A.push(`加载本地订单：${Date.now()-S}ms`),S=Date.now(),await u(),A.push(`保存账号：${Date.now()-S}ms`),Vt.saveLog(`加载账号信息，总耗时:${Date.now()-T}ms`,A),_){const B=[];t.value.forEach($=>{$.gateway&&$.userAgent&&B.push({UrlPattern:$.gateway,UserAgent:$.userAgent})}),WBe.save($Be,B),await pt.wait(120*1e3+Math.random()*6e4),await f(_)}}},p=async _=>{_&&(t.value=t.value.filter(A=>A.accountId!==_),u())},h=new Map,g=(_,A=void 0,T=[],S,B)=>{if(!_)return;const $=n.config;A===void 0&&(A=$.betMoney),h.has(_)||h.set(_,0);const P=h.get(_)??0,O=t.value.filter(x=>x.provider===_);for(let x=0;x<O.length;x++){const I=O[x];if(I.accountId&&T.includes(I.accountId))continue;const F=I.getBalance();F!==void 0&&(S&&!S(I)||F<A)}var D=t.value.filter(x=>{if(x.accountId&&T.includes(x.accountId)||x.maxOrder&&x.todayOrder&&x.todayOrder>=x.maxOrder)return!1;const I=x.getBalance();return I===void 0||S&&!S(x)?!1:x.provider===_&&I>=A});if(D.length!==0){if(D.length===1)return D[0];if(B&&B.length===2&&D.some(x=>x.profit!==0)){const x=1/(B.map(I=>1/I.odds).sum()??1);return D.filter(I=>I.profit===0||I.profit>=x).asc(I=>I.profit===0?$.profit:I.profit).first()}return h.set(_,P+1),D[P%D.length]}},y=async(_,A)=>{if(!_)return A.checkError=`场馆${A.type}没有可用账号`,A;const T=vf.GetProvider(_);if(!T)return A.checkError=`场馆${A.type}不被支持`,A;try{return A.betMoney=_.getBetMoney(A.betMoney,A.odds),A=await T.checkBet(A)}catch(S){return A.checkError=JSON.stringify(S),A}finally{A.saveLog(_)}},v=async(_,A,T=10)=>{var D,x,I;const S=vf.GetProvider(_);if(!S)return;let B,$=[`<p>赛事：${(D=A.match)==null?void 0:D.title} / ${(x=A.bet)==null?void 0:x.getBetName()} / ${A.target}@${(I=A.item)==null?void 0:I.getOdds(A.target)}</p>`,`<p>投注：${A.target}，金额：${A.betMoney}@${A.odds} / ${A.betCount}次</p>`].join("");const P=Bc({title:`${_.provider} / ${d(_==null?void 0:_.platformId)} / ${_==null?void 0:_.playerName} 投注中...`,dangerouslyUseHTMLString:!0,duration:10*1e3,message:$,customClass:`notification loading ${_.provider}`,icon:"provider"}),O=Date.now();try{return B=await S.betting(A)}catch(F){return B=new uo(_.provider,!1,F.message)}finally{s.send.DelayMessage(_,Date.now()-O),P.close(),Bc({title:`${_.provider} / ${d(_==null?void 0:_.platformId)} / ${_==null?void 0:_.playerName}`,message:`
                ${$}
                <p>${(B==null?void 0:B.message)||""}</p>`,type:B!=null&&B.success?"success":"error",dangerouslyUseHTMLString:!0,duration:T===0?3e3:T*1e3}),B==null||B.saveLog(_,O),B!=null&&B.success&&await V8e(A)}},w=_=>{const A=pt.formatDate(new Date,"yyyy-MM-dd");var T=pt.groupBy(_,S=>S.PlayerID);t.value.forEach(S=>{S.today=0,S.orderCount=0,A===C.value&&(S.todayOrder=0)});for(let[S,B]of T){const $=pt.sum(B,O=>O.Money),P=t.value.find(O=>O.accountId===S);P&&(P.today=pt.toFixed($,0),P.orderCount=B.length,A===C.value&&(P.todayOrder=B.length,P.winBalance=(P.balance??0)+(B.filter(O=>O.Status===Yt.none).sum(O=>O.BetMoney*O.Odds)??0)))

// ---- 实时赔率缓存 fo / Jn / anchor 5: fo() / approx line 8991 ----
d[5]||(d[5]=A=>o.value=A),"inline-prompt":"","active-text":"秒出","inactive-text":"秒出",style:{"--el-switch-on-color":"#13ce66","--el-switch-off-color":"#ccc"}},null,8,["modelValue"])]),_:1})):Re("",!0)]),X(h,null,{default:ne(()=>[X(C,{class:"am-icon-save",type:"primary",style:{width:"100%"},disabled:!l.value,onClick:u},{default:ne(()=>d[7]||(d[7]=[ft(" 保存")])),_:1},8,["disabled"])]),_:1})]),_:1},8,["disabled"])]),_:1},8,["modelValue","onClosed"])}}}),uDe={class:"report"},cDe={key:0,class:"tip"},dDe={class:"pageSplit flex flex-center"},fDe=Se({__name:"MoneyView",props:{accountId:{},close:{type:Function}},setup(t){const e=t,r={Lose:"被黑",Recharge:"充值",Withdraw:"提现"},n=oe(!0),s=oe(),o=Io(),a=j(()=>{var T,S;return[o.getPlatform((T=s.value)==null?void 0:T.platformId),(S=s.value)==null?void 0:S.playerName].join(" / ")}),i=({row:T,rowIndex:S})=>`row-${T.Type}`,l=oe([]),u=oe(),c=oe(1),d=oe(10),f=oe(),p=j(()=>{var T;return pt.sum(((T=u.value)==null?void 0:T.filter(S=>S.Type==="Recharge"))??[],S=>S.Money*Pr.getExchange(S.Currency))}),h=j(()=>{var T;return pt.sum(((T=u.value)==null?void 0:T.filter(S=>S.Type==="Withdraw"))??[],S=>S.Money*Pr.getExchange(S.Currency))}),g=j(()=>{var T;return((T=s.value)==null?void 0:T.credit)??0}),y=j(()=>{var T,S,B;return h.value-p.value+(((T=s.value)==null?void 0:T.balance)??0)*Pr.getExchange(((S=s.value)==null?void 0:S.currency)??ti.CNY)-(((B=s.value)==null?void 0:B.credit)??0)}),v=()=>{const T=window.prompt("请输入当前的授信额度",g.value.toString());!T||isNaN(Number(T))||s.value&&(s.value.credit=Number(T),o.saveAccounts())},w=async T=>{T&&(c.value=T);const S=await Vt.getMoneyLogs(e.accountId,c.value,d.value);S&&(l.value=S.list,u.value=S.data,f.value=S.RecordCount)},b=async T=>{if(!confirm("确认删除吗？"))return;await Vt.deleteMoneyLog(T)&&await w()},C=oe(),E=oe(),_=T=>{C.value=T,E.value=!0},A=async()=>{E.value=!1,await w()};return xo(async()=>{s.value=o.accounts.find(T=>T.accountId===e.accountId),await w()}),(T,S)=>{const B=Ge("el-statistic"),$=Ge("el-col"),P=Ge("el-row"),O=Ge("el-alert"),D=Ge("el-button"),x=Ge("el-table-column"),I=Ge("el-table"),F=Ge("el-pagination"),R=Ge("el-dialog");return H(),pe(nt,null,[X(R,{modelValue:n.value,"onUpdate:modelValue":S[2]||(S[2]=M=>n.value=M),title:a.value,width:"800",onClosed:e.close},{default:ne(()=>{var M,G;return[fe("div",uDe,[X(P,null,{default:ne(()=>[X($,{span:4},{default:ne(()=>[X(B,{title:"充值",value:p.value,precision:0,prefix:"￥"},null,8,["value"])]),_:1}),X($,{span:5},{default:ne(()=>[X(B,{title:"提现",value:h.value,precision:0,prefix:"￥"},null,8,["value"])]),_:1}),X($,{span:5},{default:ne(()=>[X(B,{title:"授信额度",value:g.value,precision:0,prefix:"￥",onDblclick:v},null,8,["value"])]),_:1}),X($,{span:5},{default:ne(()=>{var J,z;return[X(B,{title:"当前余额",value:(J=s.value)==null?void 0:J.balance,prefix:(z=s.value)==null?void 0:z.currency,precision:0},null,8,["value","prefix"])]}),_:1}),X($,{span:5},{default:ne(()=>[X(B,{title:"账号盈亏",value:y.value,precision:0,prefix:"￥"},null,8,["value"])]),_:1})]),_:1})]),(M=s.value)!=null&&M.description?(H(),pe("div",cDe,[X(O,{title:(G=s.value)==null?void 0:G.description,type:"info","show-icon":""},null,8,["title"])])):Re("",!0),X(aDe,{playerId:e.accountId},null,8,["playerId"]),fe("fieldset",null,[fe("legend",{onClick:S[0]||(S[0]=J=>_())},[S[3]||(S[3]=ft(" 充提记录 ")),X(D,{link:"",type:"primary",class:"am-icon-plus"})]),X(I,{data:l.value,border:"",style:{width:"100%"},"row-class-name":i,size:"small",class:"table"},{default:ne(()=>[X(x,{prop:"ID",label:"ID",width:"60",align:"center"}),X(x,{prop:"Type",label:"操作类型",width:"100",align:"center"},{default:ne(J=>[fe("label",{class:re([J.row.Type,{auto:J.row.IsAuto===1}])},je(r[J.row.Type]??J.row.Type),3)]),_:1}),X(x,{prop:"Money",label:"金额",width:"100",align:"center"},{default:ne(J=>[fe("label",{class:re(["currency",J.row.Currency])},je(J.row.Money),3)]),_:1}),X(x,{prop:"CreateAt",label:"时间",width:"150",align:"center"},{default:ne(J=>[ft(je(m(pt).formatDate(J.row.CreateAt)),1)]),_:1}),X(x,{prop:"Description",label:"备注信息",align:"center"}),X(x,{fixed:"right",label:"操作",width:"80",align:"center"},{default:ne(J=>[X(D,{link:"",type:"primary",class:"am-icon-edit",onClick:z=>_(J.row.ID)},null,8,["onClick"]),X(D,{link:"",type:"danger",class:"am-icon-times",onClick:z=>b(J.row.ID)},null,8,["onClick"])]),_:1})]),_:1},8,["data"]),fe("div",dDe,[X(F,{background:"",layout:"prev, pager, next",total:f.value,"page-size":d.value,modelValue:c.value,"onUpdate:modelValue":S[1]||(S[1]=J=>c.value=J),onChange:w},null,8,["total","page-size","modelValue"])])])]}),_:1},8,["modelValue","title","onClosed"]),E.value?(H(),Fe(lDe,{key:0,"log-id":C.value,"player-id":T.accountId,onClose:A},null,8,["log-id","player-id"])):Re("",!0)],64)}}}),pDe={class:"providers flex flex-wrap"},hDe={class:"currency"},gDe={class:"toolbar flex flex-wrap flex-center flex-middle"},mDe={class:"profit flex flex-center"},yDe={key:0,class:"totalProfit"},vDe=Se({__name:"AccountView",setup(t){const e=oe(!1),r=oe(),n=oe(0),s=Io(),o=p=>{if(!p.maxProfit||!p.totalProfit)return 0;const h=p.totalProfit*100/p.maxProfit;return Math.min(100,Math.max(0,h))},a=j(()=>{const p=Object.values(Xt);return s.accounts.sort((h,g)=>p.indexOf(h.provider)<p.indexOf(g.provider)?-1:1)}),i=p=>p===0?"":p>0?"success":"danger",l=async p=>{p&&confirm("确认要删除账号吗？")&&(await Vt.deletePlayer(p),s.deleteAccount(p))},u=oe(),c=p=>{p?u.value=new uv(p):u.value=void 0,e.value=!0},d=async p=>{await p.updateBalance(),await p.updateOrders()},f=p=>{n.value=p.accountId??0,r.value=!0};return xo(async()=>{}),Nu(()=>{}),(p,h)=>{const g=Ge("el-button"),y=Ge("el-tag"),v=Ge("el-progress"),w=Ge("el-tooltip");return H(),pe(nt,null,[fe("div",pDe,[(H(!0),pe(nt,null,Ft(a.value,b=>{var C;return H(),pe("div",{class:re(["account",[b.provider,{pause:b.isPause(),loading:b.loadingBalance}]]),key:b.accountId},[fe("div",{class:re(["provider-icon",b.provider])},null,2),fe("div",{class:re(["platform",{active:b.active}])},je(b.platformName??m(s).getPlatform(b.platformId))+" / "+je(b.playerName),3),fe("div",{class:re(["balance",{danger:b.balance&&b.maxBalance!==0&&b.balance>b.maxBalance,error:b.balance===void 0}])},[fe("label",hDe,je(b.currency),1),ft(" "+je(b.balance&&m(pt).toFixed(b.balance??0,0,"floor").toLocaleString()),1)],2),fe("div",gDe,[X(g,{title:"刷新",onClick:E=>d(b),size:"small",class:"iconfont-base-refresh"},null,8,["onClick"]),X(g,{title:"充提登记",onClick:E=>f(b),size:"small",class:"iconfont-base-bank"},null,8,["onClick"]),X(g,{title:"编辑账号",onClick:E=>c(b),size:"small",class:"iconfont-base-edit"},null,8,["onClick"]),X(g,{title:"注销",onClick:E=>l(b.accountId),size:"small",class:"am-icon-power-off"},null,8,["onClick"]),b.isPause()?(H(),Fe(g,{key:0,title:"暂停原因",onClick:E=>m(Pr).alert(b.isPause()??"","暂停原因"),size:"small",class:"am-icon-pause-circle"},null,8,["onClick"])):Re("",!0)]),fe("div",mDe,[X(y,{size:"small",round:"",effect:"dark",type:i(b.today)},{default:ne(()=>[ft(je(b.today.toLocaleString()),1)]),_:2},1032,["type"]),b.orderCount?(H(),Fe(y,{key:0,size:"small",round:"",style:{marginLeft:"6px"}},{default:ne(()=>[ft(je(b.unsettle)+"/"+je(b.orderCount),1)]),_:2},1024)):Re("",!0)]),b.maxProfit?(H(),pe("div",yDe,[X(w,{class:"box-item",effect:"light",content:`当前盈利:${((C=b.totalProfit)==null?void 0:C.toFixed(0))??0}/${b.maxProfit}`,placement:"bottom"},{default:ne(()=>[X(v,{color:"#f56c6c","text-inside":!0,percentage:o(b),format:()=>"",style:{width:"100%"}},null,8,["percentage"])]),_:2},1032,["content"])])):Re("",!0)],2)}),128))]),e.value?(H(),Fe(bK,{key:0,close:()=>e.value=!1,info:u.value},null,8,["close","info"])):Re("",!0),r.value?(H(),Fe(fDe,{key:1,accountId:n.value,close:()=>r.value=!1},null,8,["accountId","close"])):Re("",!0)],64)}}}),bDe=Rl(vDe,[["__scopeId","data-v-80afd9d4"]]),wDe=["onDragenter","onDragover","onDragstart"],CDe={class:"flex flex-center submit"},zh="80px",hA="80px",EDe=Se({__name:"UserConfigView",props:{close:{type:Function}},setup(t){const e=Xn(),r=oe(new D8),n=j({get(){return r.value.bettingAutoOpenTime?new Date(r.value.bettingAutoOpenTime):null},set(l){r.value.bettingAutoOpenTime=l?l.getTime():0}}),s={Low:"低赔优先",High:"高赔优先",Parallel:"并行投注",WinRate:"胜率优先",Custom:"自定义顺序"},o=t,a={index:0,dragstart:l=>{a.index=l},dragenter:(l,u)=>{if(l.preventDefault(),a.index!==u){const c=r.value.providerSortValue[a.index];r.value.providerSortValue.splice(a.index,1),r.value.providerSortValue.splice(u,0,c),a.index=u}},dragover:(l,u)=>{l.preventDefault()}};xo(async()=>{r.value=await Vt.getUserConfig()});const i=async()=>{try{r.value.profit=Number(r.value.profit),r.value.maxProfit=Number(r.value.maxProfit)??1.1,r.value.makeProfit=Number(r.value.makeProfit)??1.01,r.value.betMoney=Number(r.value.betMoney)??100,r.value.minMoney=Number(r.value.minMoney)??0,r.value.maxMoney=Number(r.value.maxMoney)??0,r.value.anyOddsProfit=Number(r.value.anyOddsProfit)??1,r.value.anyOddsProfit=Number(r.value.minOdds)??0,r.value.anyOddsProfit=Number(r.value.maxOdds)??0,await Vt.saveUserConfig(r.value)&&no.success("保存成功")}finally{o.close(),await e.getUserInfo()}};return(l,u)=>{const c=Ge("el-input"),d=Ge("el-form-item"),f=Ge("el-col"),p=Ge("el-switch"),h=Ge("el-date-picker"),g=Ge("el-row"),y=Ge("el-tooltip"),v=Ge("el-radio"),w=Ge("el-radio-group"),b=Ge("el-button"),C=Ge("el-form");return H(),Fe(C,{model:r.value},{default:ne(()=>[X(d,null,{default:ne(()=>[X(f,{span:10},{default:ne(()=>[X(d,{label:"投注金额:","label-width":zh},{default:ne(()=>[X(c,{modelValue:r.value.betMoney,"onUpdate:modelValue":u[0]||(u[0]=E=>r.value.betMoney=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{span:1}),X(f,{span:5},{default:ne(()=>[X(p,{modelValue:r.value.tenNumber,"onUpdate:modelValue":u[1]||(u[1]=E=>r.value.tenNumber=E),"inline-prompt":"","active-text":"十位取整","inactive-text":"十位取整",size:"large"},null,8,["modelValue"])]),_:1}),X(f,{span:1}),X(f,{span:6},{default:ne(()=>[X(p,{modelValue:r.value.betting,"onUpdate:modelValue":u[2]||(u[2]=E=>r.value.betting=E),"inline-prompt":"","active-text":"开启投注","inactive-text":"开启投注",size:"large"},null,8,["modelValue"])]),_:1})]),_:1}),r.value.betting?Re("",!0):(H(),Fe(d,{key:0},{default:ne(()=>[X(f,{span:6},{default:ne(()=>[X(p,{modelValue:r.value.bettingAutoOpen,"onUpdate:modelValue":u[3]||(u[3]=E=>r.value.bettingAutoOpen=E),"inline-prompt":"","active-text":"定时打开","inactive-text":"定时打开",size:"large"},null,8,["modelValue"])]),_:1}),r.value.bettingAutoOpen?(H(),Fe(f,{key:0,span:18},{default:ne(()=>[X(d,{label:"开启时间:","label-width":zh},{default:ne(()=>[X(h,{modelValue:n.value,"onUpdate:modelValue":u[4]||(u[4]=E=>n.value=E),type:"datetime",placeholder:"Select date and time"},null,8,["modelValue"])]),_:1})]),_:1})):Re("",!0)]),_:1})),X(d,null,{default:ne(()=>[X(f,{span:10},{default:ne(()=>[X(d,{label:"最低投注:","label-width":zh},{default:ne(()=>[X(c,{modelValue:r.value.minMoney,"onUpdate:modelValue":u[5]||(u[5]=E=>r.value.minMoney=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{span:10},{default:ne(()=>[X(d,{label:"最高投注:","label-width":zh},{default:ne(()=>[X(c,{modelValue:r.value.maxMoney,"onUpdate:modelValue":u[6]||(u[6]=E=>r.value.maxMoney=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1})]),_:1}),X(d,null,{default:ne(()=>[X(g,null,{default:ne(()=>[X(f,{span:10},{default:ne(()=>[X(d,{label:"投注次数","label-width":zh},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.betCount,"onUpdate:modelValue":u[7]||(u[7]=E=>r.value.betCount=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{span:12},{default:ne(()=>[X(d,{label:"投注间隔","label-width":hA},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.betInterval,"onUpdate:modelValue":u[8]||(u[8]=E=>r.value.betInterval=E),autocomplete:"off"},{append:ne(()=>u[23]||(u[23]=[ft("秒")])),_:1},8,["modelValue"])]),_:1})]),_:1})]),_:1})]),_:1}),X(d,{label:"利润要求","label-width":zh},{default:ne(()=>[X(g,null,{default:ne(()=>[X(f,{span:6},{default:ne(()=>[X(c,{type:"number",modelValue:r.value.profit,"onUpdate:modelValue":u[9]||(u[9]=E=>r.value.profit=E),autocomplete:"off"},null,8,["modelValue"])]),_:1}),X(f,{span:2,style:{"text-align":"center"}},{default:ne(()=>u[24]||(u[24]=[fe("span",{class:"text-gray-500"},"-",-1)])),_:1}),X(f,{span:6},{default:ne(()=>[X(c,{type:"number",modelValue:r.value.maxProfit,"onUpdate:modelValue":u[10]||(u[10]=E=>r.value.maxProfit=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1})]),_:1}),X(d,null,{default:ne(()=>[X(g,null,{default:ne(()=>[X(f,{span:10},{default:ne(()=>[X(d,{label:"最低赔率","label-width":hA},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.minOdds,"onUpdate:modelValue":u[11]||(u[11]=E=>r.value.minOdds=E),autocomplete:"off"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{span:14},{default:ne(()=>[X(d,{label:"检测超时","label-width":hA},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.checkTimeout,"onUpdate:modelValue":u[12]||(u[12]=E=>r.value.checkTimeout=E),autocomplete:"off"},{append:ne(()=>u[25]||(u[25]=[ft("ms")])),_:1},8,["modelValue"])]),_:1})]),_:1})]),_:1})]),_:1}),fe("fieldset",null,[u[26]||(u[26]=fe("legend",null,"补单配置",-1)),X(d,null,{default:ne(()=>[X(g,{gutter:10},{default:ne(()=>[X(f,{span:8},{default:ne(()=>[X(d,{label:"是否补单:"},{default:ne(()=>[X(p,{modelValue:r.value.makeUp,"onUpdate:modelValue":u[13]||(u[13]=E=>r.value.makeUp=E)},null,8,["modelValue"])]),_:1})]),_:1}),r.value.makeUp?(H(),Fe(f,{key:0,span:10},{default:ne(()=>[X(d,{label:"补单利润:"},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.makeProfit,"onUpdate:modelValue":u[14]||(u[14]=E=>r.value.makeProfit=E),autocomplete:"off",disabled:!r.value.makeUp},null,8,["modelValue","disabled"])]),_:1})]),_:1})):Re("",!0)]),_:1})]),_:1}),r.value.makeUp?(H(),Fe(d,{key:0},{default:ne(()=>[X(g,{gutter:10},{default:ne(()=>[X(f,{span:10},{default:ne(()=>[X(d,{label:"初始赔率:",title:"初赔大于此设定赔率不进行补单"},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.makeUp_defaultOdds,"onUpdate:modelValue":u[15]||(u[15]=E=>r.value.makeUp_defaultOdds=E),autocomplete:"off",disabled:!r.value.makeUp},null,8,["modelValue","disabled"])]),_:1})]),_:1}),X(f,{span:10},{default:ne(()=>[X(d,{label:"当前赔率:",title:"补单的赔率大于此设定值不进行补单"},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.makeUp_odds,"onUpdate:modelValue":u[16]||(u[16]=E=>r.value.makeUp_odds=E),autocomplete:"off",disabled:!r.value.makeUp},null,8,["modelValue","disabled"])]),_:1})]),_:1})]),_:1})]),_:1})):Re("",!0),X(d,null,{default:ne(()=>[X(f,{span:1}),X(f,{span:8},{default:ne(()=>[X(p,{modelValue:r.value.noSameProvider,"onUpdate:modelValue":u[17]||(u[17]=E=>r.value.noSameProvider=E),"inline-prompt":"","active-text":"不补同场馆","inactive-text":"不补同场馆",size:"large"},null,8,["modelValue"])]),_:1}),X(f,{span:8},{default:ne(()=>[X(p,{modelValue:r.value.noSameBet,"onUpdate:modelValue":u[18]||(u[18]=E=>r.value.noSameBet=E),"inline-prompt":"","active-text":"场管不对打","inactive-text":"场管不对打",size:"large"},null,8,["modelValue"])]),_:1}),X(f,{span:7},{default:ne(()=>[X(y,{class:"box-item",effect:"dark",content:"1、下单失败用当前可投注的最高赔率继续投注。2、被拒单马上用最高赔率进行补单",placement:"bottom"},{default:ne(()=>[X(p,{modelValue:r.value.anyOdds,"onUpdate:modelValue":u[19]||(u[19]=E=>r.value.anyOdds=E),"inline-prompt":"","active-text":"任意赔率","inactive-text":"任意赔率",size:"large"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{span:1}),r.value.anyOdds?(H(),Fe(f,{key:0,span:12},{default:ne(()=>[X(d,{label:"任意赔率利润要求:"},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.anyOddsProfit,"onUpdate:modelValue":u[20]||(u[20]=E=>r.value.anyOddsProfit=E),autocomplete:"off",disabled:!r.value.anyOdds},null,8,["modelValue","disabled"])]),_:1})]),_:1})):Re("",!0)]),_:1})]),fe("fieldset",null,[u[27]||(u[27]=fe("legend",null,"投注顺序",-1)),X(d,null,{default:ne(()=>[X(w,{modelValue:r.value.betSorting,"onUpdate:modelValue":u[21]||(u[21]=E=>r.value.betSorting=E),size:"large"},{default:ne(()=>[(H(!0),pe(nt,null,Ft(Object.keys(s),E=>(H(),Fe(v,{value:E},{default:ne(()=>[ft(je(s[E]),1)]),_:2},1032,["value"]))),256))]),_:1},8,["modelValue"])]),_:1}),X(g,null,{default:ne(()=>[r.value.betSorting==="WinRate"?(H(),Fe(f,{key:0,span:8},{default:ne(()=>[X(d,{label:"胜率差额:"},{default:ne(()=>[X(c,{type:"text",modelValue:r.value.winRateValue,"onUpdate:modelValue":u[22]||(u[22]=E=>r.value.winRateValue=E),autocomplete:"off",disabled:r.value.betSorting!=="WinRate"},null,8,["modelValue","disabled"])]),_:1})]),_:1})):Re("",!0)]),_:1}),X(d,null,{default:ne(()=>[X(LB,{name:"drag",class:"provider-sort",tag:"div"},{default:ne(()=>[(H(!0),pe(nt,null,Ft(r.value.providerSortValue,(E,_)=>(H(),pe("div",{draggable:"true",class:"drag-item",onDragenter:A=>a.dragenter(A,_),onDragover:A=>a.dragover(A,_),onDragstart:A=>a.dragstart(_)},je(E),41,wDe))),256))]),_:1})]),_:1})]),fe("fieldset",null,[u[28]||(u[28]=fe("legend",null,"拒单检测",-1)),X(g,{gutter:10},{default:ne(()=>[(H(!0),pe(nt,null,Ft(m(Xt),E=>(H(),Fe(f,{span:8},{default:ne(()=>[X(c,{modelValue:r.value.waitTime[E],"onUpdate:modelValue":_=>r.value.waitTime[E]=_},{prepend:ne(()=>[ft(je(E),1)]),_:2},1032,["modelValue","onUpdate:modelValue"])]),_:2},1024))),256))]),_:1})]),fe("div",CDe,[X(b,{size:"large",type:"primary",class:"am-icon-save",block:"",round:"",onClick:i},{default:ne(()=>u[29]||(u[29]=[ft(" 保存配置")])),_:1})])]),_:1},8,["model"])}}}),xDe={class:"flex googlecode"},TDe={class:"item"},ADe={class:"name"},SDe={class:"code"},_De=Se({__name:"UserPasswordView",setup(t){const e=oe([{name:"EB06",key:"msjsslro5dxxvb75o3rve5cgfe5d57u2"}]);return xo(async()=>{}),(r,n)=>{const s=Ge("el-button"),o=Ge("el-dialog");return H(),pe(nt,null,[n[1]||(n[1]=fe("fieldset",null,[fe("legend",null,"修改密码")],-1)),fe("fieldset",null,[fe("legend",null,[n[0]||(n[0]=ft("谷歌验证码 ")),X(s,{link:"",type:"primary",class:"am-icon-plus"})]),fe("div",xDe,[(H(!0),pe(nt,null,Ft(e.value,a=>(H(),pe("div",TDe,[fe("div",ADe,je(a.name),1),fe("div",SDe,je(),1)]))),256))])]),X(o)],64)}}}),PDe=["onDblclick"],kDe={class:"flex flex-center"},IDe=Se({__name:"UserMessageView",setup(t){const e=Xn(),r=oe(!0),n=o=>{o==="OrderPush"&&(r.value=!1)},s=async()=>{await Vt.saveData("Message",JSON.stringify({telegramId:e.telegramId,pushOrderId:e.pushOrderId}),!0)};return(o,a)=>{const i=Ge("el-input"),l=Ge("el-form-item"),u=Ge("el-link"),c=Ge("el-button"),d=Ge("el-form");return H(),Fe(d,{"label-width":"120px"},{default:ne(()=>[X(l,{label:"TelegramID:"},{default:ne(()=>[X(i,{modelValue:m(e).telegramId,"onUpdate:modelValue":a[0]||(a[0]=f=>m(e).telegramId=f)},null,8,["modelValue"])]),_:1}),X(l,{label:"机器人推单:"},{default:ne(()=>[X(i,{modelValue:m(e).pushOrderId,"onUpdate:modelValue":a[1]||(a[1]=f=>m(e).pushOrderId=f),disabled:r.value},null,8,["modelValue","disabled"])]),_:1}),X(l,{label:"消息通知类型:"},{default:ne(()=>[(H(!0),pe(nt,null,Ft([...Object.keys(m(DG))].filter(f=>isNaN(Number(f))),f=>(H(),pe("label",{onDblclick:p=>n(f)},je(f)+"   ",41,PDe))),256))]),_:1}),X(l,{label:"机器人:"},{default:ne(()=>[X(u,{href:"https://t.me/esportfight_bot",target:"_blank"},{default:ne(()=>a[2]||(a[2]=[ft("@esportfight_bot")])),_:1})]),_:1}),fe("div",kDe,[X(c,{type:"primary",class:"am-icon-save",size:"large",onClick:s},{default:ne(()=>a[3]||(a[3]=[ft(" 保存")])),_:1})])]),_:1})}}}),BDe={class:"test-result"},ODe=Se({__name:"UserProxyView",setup(t){const e=Xn();let r=fr({proxyId:0,label:"",url:""}),n=()=>!s.value&&r.label&&r.url,s=oe();const o=async()=>{try{new URL(r.url)}catch{no.error("代理地址格式错误");return}s.value=!0;try{if(!await mr.test(r.url)){no.error("代理连接测试失败");return}const f=Date.now();e.proxylist.set(f,{proxyId:f,label:r.label,url:r.url}),await e.saveProxyConfig(),no.success("保存成功"),r.proxyId=0,r.label=r.url=""}finally{s.value=!1}},a=oe(new Map),i=async d=>{var p,h,g;(p=a.value)==null||p.set(d.proxyId,"测试中...");const f=await mr.test(d.url);if(!f){(h=a.value)==null||h.set(d.proxyId,"代理连接失败");return}(g=a.value)==null||g.set(d.proxyId,`延迟:${f.delay}ms, IP:${f.ip}, 地址:${f.address}`)},l=oe(),u=d=>{const f=/^socks5:\/\/([\d\.]+):(\d+):(\w+):(\w+)$/;if(f.test(d)){const h=d.match(f);if(h){const[g,y,v,w,b]=h;return`socks5://${w}:${b}@${y}:${v}`}}const p=/^([\d\.]+)\|(\d+)\|(\w+)\|(\w+)\|/;if(p.test(d)){const h=d.match(p);if(h){const[g,y,v,w,b]=h;return`socks5://${w}:${b}@${y}:${v}`}}return d},c=async d=>{d.url=u(d.url);try{l.value=!0,await e.saveProxyConfig()}finally{l.value=!1}};return(d,f)=>{const p=Ge("el-input"),h=Ge("el-col"),g=Ge("el-button"),y=Ge("el-form-item"),v=Ge("el-row"),w=Ge("el-form");return H(),pe(nt,null,[X(w,null,{default:ne(()=>[(H(!0),pe(nt,null,Ft(m(e).proxylist,([b,C])=>(H(),pe("div",{class:"proxy-item",key:b},[X(v,{gutter:10},{default:ne(()=>[X(h,{span:6},{default:ne(()=>[X(p,{modelValue:C.label,"onUpdate:modelValue":E=>C.label=E,disabled:l.value,onChange:E=>c(C)},{prepend:ne(()=>f[4]||(f[4]=[ft("标签")])),_:2},1032,["modelValue","onUpdate:modelValue","disabled","onChange"])]),_:2},1024),X(h,{span:14},{default:ne(()=>[X(p,{modelValue:C.url,"onUpdate:modelValue":E=>C.url=E,disabled:l.value,onChange:E=>c(C)},{prepend:ne(()=>f[5]||(f[5]=[ft("地址")])),_:2},1032,["modelValue","onUpdate:modelValue","disabled","onChange"])]),_:2},1024),X(h,{span:4},{default:ne(()=>[X(g,{class:"am-icon-flash",onClick:E=>i(C)},null,8,["onClick"]),X(g,{type:"danger",class:"am-icon-times",disabled:l.value},null,8,["disabled"])]),_:2},1024),X(h,{span:24},{default:ne(()=>{var E;return[(E=a.value)!=null&&E.get(C.proxyId)?(H(),Fe(y,{key:0,label:"测试结果:"},{default:ne(()=>{var _;return[fe("div",BDe,je((_=a.value)==null?void 0:_.get(C.proxyId)),1)]}),_:2},1024)):Re("",!0)]}),_:2},1024)]),_:2},1024)]))),128))]),_:1}),fe("fieldset",null,[f[7]||(f[7]=fe("legend",null,"添加代理配置",-1)),X(w,{"label-width":"100",modelValue:m(r),"onUpdate:modelValue":f[3]||(f[3]=b=>Mr(r)?r.value=b:r=b)},{default:ne(()=>[X(y,{label:"标签名:"},{default:ne(()=>[X(p,{placeholder:"标签名称",modelValue:m(r).label,"onUpdate:modelValue":f[0]||(f[0]=b=>m(r).label=b)},null,8,["modelValue"])]),_:1}),X(y,{label:"代理地址:"},{default:ne(()=>[X(p,{placeholder:"http://username:password@host:port",modelValue:m(r).url,"onUpdate:modelValue":f[1]||(f[1]=b=>m(r).url=b),onChange:f[2]||(f[2]=b=>m(r).url=u(m(r).url))},null,8,["modelValue"])]),_:1}),X(y,null,{default:ne(()=>[X(g,{type:"primary",class:"am-icon-save",disabled:!m(n)(),onClick:o},{default:ne(()=>f[6]||(f[6]=[ft(" 保存")])),_:1},8,["disabled"])]),_:1})]),_:1},8,["modelValue"])])],64)}}}),DDe=Se({__name:"UserReportView",setup(t){const e=oe(),r=oe(pt.formatDate(new Date,"yyyy-MM")),n=async()=>{e.value=await Vt.getMonthReport(r.value)},s=(a,i,l)=>pt.toFixed(l,0).toLocaleString(),o=a=>{console.log(a);const i=[],{columns:l,data:u}=a;return l.forEach((c,d)=>{var f,p,h,g;if(d===0){i[d]="统计";return}if((f=e.value)!=null&&f.total[c.property])switch(c.property){case"Rate":i[d]=pt.percent((p=e.value)==null?void 0:p.total[c.property]);break;case"OrderCount":case"Deposit":case"Withdraw":case"Hacked":i[d]=pt.toFixed(((h=e.value)==null?void 0:h.total[c.property])??0,0).toLocaleString();break;default:const y=((g=e.value)==null?void 0:g.total[c.property])??0;i[d]=It("div",{class:{moneyValue:!0,win:y>0,lose:y<0}},[pt.toFixed(y,0).toLocaleString()]);break}}),i};return xo(async()=>{await n()}),(a,i)=>{var p;const l=Ge("el-date-picker"),u=Ge("el-form-item"),c=Ge("el-form"),d=Ge("el-table-column"),f=Ge("el-table");return H(),pe(nt,null,[X(c,null,{default:ne(()=>[X(u,null,{default:ne(()=>[X(l,{modelValue:r.value,"onUpdate:modelValue":i[0]||(i[0]=h=>r.value=h),type:"month",placeholder:"Pick a month",onChange:n,"value-format":"YYYY-MM"},null,8,["modelValue"])]),_:1})]),_:1}),X(f,{data:(p=e.value)==null?void 0:p.list,border:"",style:{width:"100%"},size:"small",class:"table","show-summary":"","summary-method":o},{default:ne(()=>[X(d,{prop:"Date",label:"日期",align:"center",width:"60"},{default:ne(h=>[ft(je(m(pt).formatDate(new Date(h.row.Date),"dd")),1)]),_:1}),X(d,{prop:"Profit",label:"盈利"},{default:ne(h=>[fe("div",{class:re(["moneyValue",{win:h.row.Profit>0,lose:h.row.Profit<0}])},je(m(pt).toFixed(h.row.Profit,0).toLocaleString()),3)]),_:1}),X(d,{prop:"OrderCount",label:"订单量"}),X(d,{prop:"BetMoney",label:"流水",formatter:s}),X(d,{prop:"Rate",label:"利润率"},{default:ne(h=>[fe("div",{class:re(["moneyValue",{win:h.row.Rate>0,lose:h.row.Rate<0}])},je(m(pt).percent(h.row.Rate)),3)]),_:1}),X(d,{prop:"Hacked",label:"被黑"},{default:ne(h=>[fe("div",{class:re({hacked:h.row.Hacked>0})},je(h.row.Hacked.toLocaleString()),3)]),_:1}),X(d,{prop:"RealProfit",label:"实际利润"},{default:ne(h=>[fe("div",{class:re(["moneyValue",{win:h.row.RealProfit>0,lose:h.row.RealProfit<0}])},je(m(pt).toFixed(h.row.RealProfit,0).toLocaleString()),3)]),_:1}),X(d,{prop:"Deposit",label:"充值",formatter:s}),X(d,{prop:"Withdraw",label:"提现",formatter:s}),X(d,{prop:"Wallet",label:"充提差"},{default:ne(h=>[fe("div",{class:re(["moneyValue",{win:h.row.Wallet>0,lose:h.row.Wallet<0}])},je(m(pt).toFixed(h.row.Wallet,0).toLocaleString()),3)]),_:1})]),_:1},8,["data"])],64)}}}),MDe={class:"rank flex flex-wrap"},NDe={class:"face"},RDe={class:"name"},FDe={class:"profit"},WDe={class:"flex flex-center"},$De=Se({__name:"UserRankView",setup(t){const e=[{label:"盈利",type:"Money"},{label:"订单量",type:"Count"},{label:"流水",type:"BetMoney"}],r=oe(),n=j(()=>{var c;const u=(c=r.value)==null?void 0:c.desc(d=>d.Money).first();if(!(!u||u.Money<0))return u.UserID}),s=oe("Money"),o=j(()=>{var u,c,d;return s.value==="Money"?((u=r.value)==null?void 0:u.desc(f=>f.Money))??[]:s.value==="Count"?((c=r.value)==null?void 0:c.filter(f=>f.Count).desc(f=>f.Count??0))??[]:s.value==="BetMoney"?((d=r.value)==null?void 0:d.filter(f=>f.BetMoney).desc(f=>f.BetMoney??0))??[]:r.value}),a=u=>{if(s.value==="Money")return Math.floor(u.Money).toLocaleString();if(s.value==="Count")return u.Count;if(s.value==="BetMoney")return Math.floor(u.BetMoney??0).toLocaleString()},i=u=>u.UserID===n.value,l=u=>!(u.Money>=0);return xo(async()=>{r.value=await Vt.getRankList()}),(u,c)=>{const d=Ge("el-tag"),f=Ge("el-button"),p=Ge("el-button-group");return H(),pe(nt,null,[fe("div",MDe,[(H(!0),pe(nt,null,Ft(o.value,(h,g)=>(H(),pe("div",{class:re(["item",{lose:h.Money<0,boss:i(h),loser:l(h)}]),key:h.UserID},[fe("div",NDe,[fe("div",RDe,je(h.UserName),1)]),fe("div",FDe,[X(d,{round:"",type:h.Money>0?"success":"danger"},{default:ne(()=>[ft(je(a(h)),1)]),_:2},1032,["type"])])],2))),128))]),fe("div",WDe,[X(p,{size:"small"},{default:ne(()=>[(H(),pe(nt,null,Ft(e,h=>X(f,{key:h.type,type:s.value===h.type?"primary":"default",onClick:g=>s.value=h.type},{default:ne(()=>[ft(je(h.label),1)]),_:2},1032,["type","onClick"])),64))]),_:1})])],64)}}}),LDe=Rl($De,[["__scopeId","data-v-ffd98bc6"]]),Tf=mh("collect",()=>{const t="CollectConfig",e=fr({log:!1,collect:new Map}),r=async(i,l)=>{if(!e.collect.get(i))return!1;const u=await Vt.saveMatchSource(i,l.map(c=>({SourceMatchID:c.SourceMatchID,SourceGameID:c.SourceGameID,Type:c.Type,StartTime:c.StartTime,HomeID:c.HomeID,Home:c.Home,AwayID:c.AwayID,Away:c.Away,Teams:c.Teams,BO:c.BO})));return await a(`${i}赛事采集${l.length}场 => ${u}`,l.map(c=>({game:c.SourceGameID,matchId:c.SourceMatchID,startTime:pt.formatDate(c.StartTime),title:c.Teams.map(d=>d.Name).join(" VS ")}))),u},n=async(i,l,u)=>{if(!e.collect.get(i))return!1;const c=await Vt.saveBetSource(i,l,u);ret

// ---- 实时赔率缓存 fo / Jn / anchor 6: fo() / approx line 27861 ----
p.hostname||(p.hostname="localhost"),p.path||(p.path="/"),p.wsOptions||(p.wsOptions={})}function c(p,h){let g=p.protocol==="alis"?"wss":"ws",y=`${g}://${p.hostname}${p.path}`;return p.port&&p.port!==80&&p.port!==443&&(y=`${g}://${p.hostname}:${p.port}${p.path}`),typeof p.transformWsUrl=="function"&&(y=p.transformWsUrl(y,p,h)),y}function d(){i||(i=!0,s.onSocketOpen(()=>{a.socketReady()}),s.onSocketMessage(p=>{if(typeof p.data=="string"){let h=e.Buffer.from(p.data,"base64");o.push(h)}else{let h=new FileReader;h.addEventListener("load",()=>{let g=h.result;g instanceof ArrayBuffer?g=e.Buffer.from(g):g=e.Buffer.from(g,"utf8"),o.push(g)}),h.readAsArrayBuffer(p.data)}}),s.onSocketClose(()=>{a.end(),a.destroy()}),s.onSocketError(p=>{a.destroy(p)}))}var f=(p,h)=>{if(h.hostname=h.hostname||h.host,!h.hostname)throw new Error("Could not determine host. Specify host manually.");let g=h.protocolId==="MQIsdp"&&h.protocolVersion===3?"mqttv3.1":"mqtt";u(h);let y=c(h,p);return s=h.my,s.connectSocket({url:y,protocols:g}),o=l(),a=new n.BufferedDuplex(h,o,s),d(),a};t.default=f}),_Me=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__importDefault||function(d){return d&&d.__esModule?d:{default:d}};Object.defineProperty(t,"__esModule",{value:!0}),t.connectAsync=void 0;var r=e(zc()),n=e((TMe(),In(Iq))),s=e(fk()),o=e(fx());typeof(vn==null?void 0:vn.nextTick)!="function"&&(vn.nextTick=setImmediate);var a=(0,r.default)("mqttjs"),i=null;function l(d){let f;d.auth&&(f=d.auth.match(/^(.+):(.+)$/),f?(d.username=f[1],d.password=f[2]):d.username=d.auth)}function u(d,f){var p,h,g,y;if(a("connecting to an MQTT broker..."),typeof d=="object"&&!f&&(f=d,d=""),f=f||{},d&&typeof d=="string"){let b=n.default.parse(d,!0),C={};if(b.port!=null&&(C.port=Number(b.port)),C.host=b.hostname,C.query=b.query,C.auth=b.auth,C.protocol=b.protocol,C.path=b.path,C.protocol=(p=C.protocol)===null||p===void 0?void 0:p.replace(/:$/,""),f=Object.assign(Object.assign({},C),f),!f.protocol)throw new Error("Missing protocol")}if(f.unixSocket=f.unixSocket||((h=f.protocol)===null||h===void 0?void 0:h.includes("+unix")),f.unixSocket?f.protocol=f.protocol.replace("+unix",""):!(!((g=f.protocol)===null||g===void 0)&&g.startsWith("ws"))&&!(!((y=f.protocol)===null||y===void 0)&&y.startsWith("wx"))&&delete f.path,l(f),f.query&&typeof f.query.clientId=="string"&&(f.clientId=f.query.clientId),f.cert&&f.key)if(f.protocol){if(["mqtts","wss","wxs","alis"].indexOf(f.protocol)===-1)switch(f.protocol){case"mqtt":f.protocol="mqtts";break;case"ws":f.protocol="wss";break;case"wx":f.protocol="wxs";break;case"ali":f.protocol="alis";break;default:throw new Error(`Unknown protocol for secure connection: "${f.protocol}"!`)}}else throw new Error("Missing secure protocol key");if(i||(i={},!o.default&&!f.forceNativeWebSocket?(i.ws=sw().streamBuilder,i.wss=sw().streamBuilder,i.mqtt=q5().default,i.tcp=q5().default,i.ssl=Y5().default,i.tls=i.ssl,i.mqtts=Y5().default):(i.ws=sw().browserStreamBuilder,i.wss=sw().browserStreamBuilder,i.wx=Z5().default,i.wxs=Z5().default,i.ali=J5().default,i.alis=J5().default)),!i[f.protocol]){let b=["mqtts","wss"].indexOf(f.protocol)!==-1;f.protocol=["mqtt","mqtts","ws","wss","wx","wxs","ali","alis"].filter((C,E)=>b&&E%2===0?!1:typeof i[C]=="function")[0]}if(f.clean===!1&&!f.clientId)throw new Error("Missing clientId for unclean clients");f.protocol&&(f.defaultProtocol=f.protocol);function v(b){return f.servers&&((!b._reconnectCount||b._reconnectCount===f.servers.length)&&(b._reconnectCount=0),f.host=f.servers[b._reconnectCount].host,f.port=f.servers[b._reconnectCount].port,f.protocol=f.servers[b._reconnectCount].protocol?f.servers[b._reconnectCount].protocol:f.defaultProtocol,f.hostname=f.host,b._reconnectCount++),a("calling streambuilder for",f.protocol),i[f.protocol](b,f)}let w=new s.default(v,f);return w.on("error",()=>{}),w}function c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
    @jspm/core/nodelibs/browser/buffer.js: (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
    */const IMe=Xt.OB,
    uY="https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1",
    BMe="https://uphw-cdn3.jomscxu.com/upload/json/pc.json",
    OMe=t=>{
      const e=/(.+?)(\d+)/;
      if(!e.test(t))return null;
      const r=e.exec(t);
      return r?{
        topic:r[1],
        matchId:r[2]
      }
      :null
    },
    Q5=t=>["/odd/insert/".concat(t),
    "/odd/statusUpdate/".concat(t),
    "/odd/visible/".concat(t),
    "/odd/suspended/".concat(t),
    "/market/sortCodeUpdate/".concat(t),
    "/market/suspended/".concat(t),
    "/market/visible/".concat(t),
    "/market/statusUpdate/".concat(t),
    "/market/oddsUpdate/".concat(t)],
    DMe=async()=>{
      var r;
      const t=await Nr.get(uY),
      e=t.data;
      if((r=e==null?void 0:e.data)!=null&&r.pc){
        const s=new URL(e.data.pc).searchParams.get("token");
        await Vt.updatePlatform({
          provider:Xt.OB,
          token:s??void 0
        })
      }
    },
    Ck=t=>({
      device:"1",
      lang:"cn",
      token:t.token
    });
    let ud;
    const e9=async t=>{
      if(!ud){
        const e="OBService:TeamLogo";
        if(ud=(await Nr.get(BMe)).data.team_imag,
        ud)localStorage.setItem(e,
        JSON.stringify(ud));
        else{
          const s=localStorage.getItem(e);
          s&&(ud=JSON.parse(s))
        }
      }
      return!ud||!ud[t]?"":`https://uphw-cdn6.peyesight.com/${ud[t]}`
    },
    MMe=async t=>{
      const e=`${t.gateway}/game/getTimer`,
      r=await Nr.get(e,
      {
        headers:Ck(t)
      }),
      n=r.data;
      if(n.status!=="true")return;
      const s=[];
      Object.values(n.data).forEach(o=>{
        s.push({
          MatchID:o.match_id,
          Round:o.round.toNumber(),
          StartTime:o.start_time*1e3
        })
      }),
      await Vt.saveLiveTimer(IMe,
      s)
    },
    NMe=async()=>{
      await pt.wait(3e3);
      const t="admin",
      e="Qazqaz123...",
      r="mqttjs_dj1250901313125773543",
      n=kMe.connect("wss://47.115.75.57/esport/ws/OB",
      {
        username:t,
        password:e,
        clientId:r,
        clean:!0,
        keepalive:60,
        reconnectPeriod:5e3,
        protocolId:"MQTT"
      }),
      s=Xt.OB,
      o=fo(),
      a=Tf();
      n.on("connect",
      ()=>{
      }),
      n.on("message",
      (c,
      d)=>{
        const f=JSON.parse(d.toString());
        o.updateMessage(s,
        d.toString());
        const p=OMe(c);
        if(p)switch(p.topic){
          case"/market/oddsUpdate/":f.forEach(h=>{
            o.isOdds(s,
            h.id)&&o.save(s,
            new Jn(h.id,
            h.odd,
            !1,
            h.market_id))
          });
          break;
          case"/market/statusUpdate/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            !0)
          });
          break;
          case"/market/suspended/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            h.suspended===1)
          });
          break
        }
      });
      const i=[],
      l=async()=>{
        const c={
          time:Date.now(),
          match:0
        };
        try{
          const d=await Vt.getPlatform(s);
          if(!d)return;
          const p=(await Nr.get(`${d.gateway}/game/index?game_id=0&flag=1&day=1`,
          {
            headers:Ck(d)
          })).data;
          if(p.status==="false"){
            Pr.error(s,
            `本地赔率采集失败 => ${p.data}`),
            p.data==="token"&&await DMe();
            return
          }
          const h=p.data.filter(y=>d.games.includes(y.game_id)&&y.start_time<Date.now()/1e3+3600),
          g=[];
          for(let y of h){
            const v=y.match_team.replace(/&nbsp;
            /g,
            " ").split(","),
            w=y.team_id.split(",");
            if(v.length!==2||w.length!==2)return;
            const b=await e9(w[0]),
            C=await e9(w[1]);
            g.push({
              Type:s,
              SourceGameID:y.game_id,
              SourceMatchID:y.id,
              BO:y.bo,
              StartTime:y.start_time*1e3,
              Home:v[0],
              HomeID:w[0],
              Away:v[1],
              AwayID:w[1],
              Teams:[{
                Type:s,
                GameID:y.game_id,
                Name:v[0],
                TeamID:w[0],
                Logo:b
              },
              {
                Type:s,
                GameID:y.game_id,
                Name:v[1],
                TeamID:w[1],
                Logo:C
              }]
            })
          }
          await a.saveMatch(s,
          g);
          for(let y=0;
          y<h.length;
          y++){
            const v=h[y];
            n.unsubscribe(Q5(v.id)),
            await u(v,
            d),
            c.match++,
            n.subscribe(Q5(v.id),
            w=>{
              w||i.push(v.id)
            })
          }
          await MMe(d)
        }
        finally{
          Pr.debug(`[${s}]比赛列表:${Date.now()-c.time}ms，读取比赛:${c.match}场`),
          await pt.wait(30*1e3),
          await l()
        }
      },
      u=async(c,
      d)=>{
        const f=[],
        p=c.match_team.replace(/&nbsp;
        /g,
        " ").split(",");
        c.team_id.split(",");
        let h=!1;
        const g=c.bo===1?0:c.bo;
        for(let y=0;
        y<=g;
        y++)try{
          const w=(await Nr.get(`${d.gateway}/game/view?match_id=${c.id}&stage_id=${y}`,
          {
            headers:Ck(d)
          })).data;
          if(w.status!=="true")continue;
          w.data.forEach(b=>{
            const E=`[${b.round===0?"全场":`地图${
              b.round
            }
            `}]-${b.cn_name.replace(/\&nbsp;/g,"")}`,
            _=new RegExp(d.betName);
            if(b.status===12||b.visible===0||!_.test(E))return;
            const A=b.status!==6||b.visible!==1||b.suspended!==0,
            T=[];
            for(let $ in b.odds){
              const P=b.odds[$];
              T.push(P),
              o.save(s,
              new Jn(P.id,
              P.odd.toNumber(),
              A,
              b.id))
            }
            const S=T.find($=>$.name==="@T1"),
            B=T.find($=>$.name==="@T2");
            !S||!B||f.push({
              Type:s,
              SourceMatchID:c.id,
              Map:b.round,
              SourceBetID:b.id,
              BetName:E,
              SourceHomeID:S.id,
              HomeName:p[0],
              HomeOdds:S.odd.toNumber(),
              SourceAwayID:B.id,
              AwayName:p[1],
              AwayOdds:B.odd.toNumber(),
              Status:A?"Locked":"Normal"
            })
          })
        }
        catch(v){
          h=!0,
          console.error(v)
        }
        finally{
          await pt.wait(1500)
        }
        h||await a.saveBets(s,
        c.id,
        f)
      };
      await l()
    },
    RMe="a123456",
    FMe="game.haijings.vip",
    WMe=3,
    $Me=Se({
      __name:"UserCollectView",
      setup(t){
        const e=Tf(),
        r=oe({
        }),
        n=oe(!0),
        s=async()=>{
          await e.saveConfig(r.value)
        },
        o=Xn(),
        a=oe(),
        i=async(d,
        f)=>{
          let p="/v4.0/";
          location.hostname==="localhost"&&(p="https://api.a8.to/v4.0/");
          const h=`${p}${d}`;
          return(await Nr.post(h,
          f,
          {
            headers:{
              "Content-Type":"application/x-www-form-urlencoded;",
              token:a.value,
              "x-forwarded-site":FMe
            }
          })).data
        },
        l=async d=>{
          if(d===Xt.OB)return await u(d);
          if(d===Xt.SABA)return c(d);
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await i("user/account/login",
            {
              userName:o.userName,
              password:RMe
            });
            if(p.success!==1){
              no.error(p.msg);
              return
            }
            a.value=p.info.token;
            const h=await i("game/play/Login",
            {
              gameId:WMe
            });
            if(h.success!==1){
              no.error(h.msg);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.info.Url,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        u=async d=>{
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await Nr.get(uY),
            h=p.data;
            if(!h.status){
              no.error(h.message);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.data.pc,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        c=d=>{
          window.open("https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7",
          d.toString())
        };
        return zt(()=>{
          e.config.collect.forEach((d,
          f)=>{
            r.value[f]=d
          })
        }),
        (d,
        f)=>{
          const p=Ge("el-switch"),
          h=Ge("el-col"),
          g=Ge("el-row"),
          y=Ge("el-divider"),
          v=Ge("el-button");
          return H(),
          pe(nt,
          null,
          [X(g,
          {
            class:"providers"
          },
          {
            default:ne(()=>[X(h,
            {
              span:4
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":"采集日志",
                "inactive-text":"采集日志",
                modelValue:m(e).config.log,
                "onUpdate:modelValue":f[0]||(f[0]=w=>m(e).config.log=w),
                onChange:s
              },
              null,
              8,
              ["disabled",
              "modelValue"])]),
              _:1
            }),
            (H(!0),
            pe(nt,
            null,
            Ft(m(Xt),
            w=>(H(),
            Fe(h,
            {
              span:4,
              class:"provider"
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":w,
                "inactive-text":w,
                modelValue:r.value[w],
                "onUpdate:modelValue":b=>r.value[w]=b,
                onChange:s
              },
              null,
              8,
              ["disabled",
              "active-text",
              "inactive-text",
              "modelValue",
              "onUpdate:modelValue"])]),
              _:2
            },
            1024))),
            256))]),
            _:1
          }),
          X(y,
          null,
          {
            default:ne(()=>[f[5]||(f[5]=ft("信用")),
            fe("span",
            {
              onDblclick:f[1]||(f[1]=w=>n.value=!n.value)
            },
            "盘",
            32),
            f[6]||(f[6]=ft("入口"))]),
            _:1
          }),
          X(g,
          {
            class:"credit"
          },
          {
            default:ne(()=>[X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[2]||(f[2]=w=>l(m(Xt).PB))
              },
              {
                default:ne(()=>f[7]||(f[7]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon PB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "平博体育")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[3]||(f[3]=w=>l(m(Xt).OB))
              },
              {
                default:ne(()=>f[8]||(f[8]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon OB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "OB试玩")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[4]||(f[4]=w=>l(m(Xt).SABA))
              },
              {
                default:ne(()=>f[9]||(f[9]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon SABA"
                }),
                fe("div",
                {
                  class:"name"
                },
                "SABA试玩")],
                -1)])),
                _:1
              })]),
              _:1
            })]),
            _:1
          })],
          64)
        }
      }
    }),
    LMe=Rl($Me,
    [["__scopeId",
    "data-v-88e483b8"]]),
    UMe=["title"],
    VMe=Se({
      __name:"TradeView",
      setup(t){
        const e=Xn(),
        r=oe(),
        n=j(()=>{
          var h;
          return(h=r.value)==null?void 0:h.filter(g=>g.isOnline===1)
        }),
        s=oe(JSON.parse(sessionStorage.getItem("TRADE:USERS")??"[]")),
        o=new Map,
        a=h=>{
          var y,
          v;
          if(!h)return;
          const g=o.get(h);
          if(g)return(v=(y=r.value)==null?void 0:y.find(w=>w.userId===g))==null?void 0:v.userName
        },
        i=oe(new Map),
        l=j(()=>{
          const h=[];
          return s.value.forEach(g=>{
            var y;
            h.push(...((y=i.value.get(g))==null?void 0:y.filter(v=>v.provider===u.value))??[])
          }),
          h
        }),
        u=oe(Xt.PB),
        c=async h=>{
          if(!h)return;
          const g=`USER:${h}`,
          y=pt.uuid(),
          v={
            action:"query",
            info:{
              type:"accounts",
              reply:f,
              msgId:y,
              data:{
                provider:u.value
              }
            }
          },
          w=Date.now(),
          b=await U8e(g,
          y,
          JSON.stringify(v));
          if(!b)return;
          console.log(b,
          `耗时：${Date.now()-w}ms`),
          i.value.has(h)||i.value.set(h,
          []);
          const C=i.value.get(h)??[];
          b.forEach(E=>{
            if(!E.accountId)return;
            o.set(E.accountId,
            h);
            const _=C.map(A=>A.accountId).indexOf(E.accountId);
            _===-1?C.push(E):C[_]=E
          })
        },
        d=async()=>{
          if(s.value){
            sessionStorage.setItem("TRADE:USERS",
            JSON.stringify(s.value));
            for(const h of s.value)await c(h)
          }
        },
        f=`TRADE:${e.userId}`,
        p=async(h,
        g)=>{
          var b;
          if(!h)return;
          const y=o.get(h);
          if(!y)return;
          const v=(b=i.value.get(y))==null?void 0:b.find(C=>C.accountId===h);
          if(!v)return;
          const w={
            action:"account",
            info:{
              accountId:h
            }
          };
          switch(g){
            case"pause":w.info.pause=v.pause;
            break;
            case"lastOdds":w.info.lastOdds=v.lastOdds;
            break;
            default:w.info[g]=v[g];
            break
          }
          await ax(`USER:${y}`,
          JSON.stringify(w))
        };
        return xo(async()=>{
          await lv(f,
          h=>{
            const g=JSON.parse(h.content),
            y=g.msgId;
            L8e(y,
            g.content)
          }),
          r.value=await Vt.getUsers(),
          await d()
        }),
        (h,
        g)=>{
          const y=Ge("el-radio"),
          v=Ge("el-radio-group"),
          w=Ge("el-form-item"),
          b=Ge("el-checkbox"),
          C=Ge("el-checkbox-group"),
          E=Ge("el-button"),
          _=Ge("el-switch"),
          A=Ge("el-col"),
          T=Ge("el-input"),
          S=Ge("el-row"),
          B=Ge("el-form");
          return H(),
          Fe(B,
          null,
          {
            default:ne(()=>[X(w,
            {
              label:"平台："
            },
            {
              default:ne(()=>[X(v,
              {
                modelValue:u.value,
                "onUpdate:modelValue":g[0]||(g[0]=$=>u.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(m(Xt),
                $=>(H(),
                Fe(y,
                {
                  value:$
                },
                {
                  default:ne(()=>[ft(je($),
                  1)]),
                  _:2
                },
                1032,
                ["value"]))),
                256))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(w,
            null,
            {
              label:ne(()=>g[2]||(g[2]=[ft(" 用户列表： ")])),
              default:ne(()=>[X(C,
              {
                modelValue:s.value,
                "onUpdate:modelValue":g[1]||(g[1]=$=>s.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(n.value,
                $=>(H(),
                Fe(b,
                {
                  key:$.userId,
                  label:$.userName,
                  value:$.userId
                },
                {
                  default:ne(()=>[ft(je($.userName),
                  1)]),
                  _:2
                },
                1032,
                ["label",
                "value"]))),
                128))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(S,
            null,
            {
              default:ne(()=>[(H(!0),
              pe(nt,
              null,
              Ft(l.value,
              $=>(H(),
              Fe(A,
              {
                span:12,
                key:$.accountId
              },
              {
                default:ne(()=>{
                  var P;
                  return[fe("fieldset",
                  null,
                  [fe("legend",
                  null,
                  [ft(" ["+je(a($.accountId))+"] "+je($.platformName)+"/"+je($.playerName)+" / "+je((P=$.balance)==null?void 0:P.toFixed(0)),
                  1),
                  X(E,
                  {
                    link:""
                  },
                  {
                    defa

// ---- 实时赔率缓存 fo / Jn / anchor 7: updateBetLock / approx line 27890 ----
end(),a.destroy()}),s.onSocketError(p=>{a.destroy(p)}))}var f=(p,h)=>{if(h.hostname=h.hostname||h.host,!h.hostname)throw new Error("Could not determine host. Specify host manually.");let g=h.protocolId==="MQIsdp"&&h.protocolVersion===3?"mqttv3.1":"mqtt";u(h);let y=c(h,p);return s=h.my,s.connectSocket({url:y,protocols:g}),o=l(),a=new n.BufferedDuplex(h,o,s),d(),a};t.default=f}),_Me=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__importDefault||function(d){return d&&d.__esModule?d:{default:d}};Object.defineProperty(t,"__esModule",{value:!0}),t.connectAsync=void 0;var r=e(zc()),n=e((TMe(),In(Iq))),s=e(fk()),o=e(fx());typeof(vn==null?void 0:vn.nextTick)!="function"&&(vn.nextTick=setImmediate);var a=(0,r.default)("mqttjs"),i=null;function l(d){let f;d.auth&&(f=d.auth.match(/^(.+):(.+)$/),f?(d.username=f[1],d.password=f[2]):d.username=d.auth)}function u(d,f){var p,h,g,y;if(a("connecting to an MQTT broker..."),typeof d=="object"&&!f&&(f=d,d=""),f=f||{},d&&typeof d=="string"){let b=n.default.parse(d,!0),C={};if(b.port!=null&&(C.port=Number(b.port)),C.host=b.hostname,C.query=b.query,C.auth=b.auth,C.protocol=b.protocol,C.path=b.path,C.protocol=(p=C.protocol)===null||p===void 0?void 0:p.replace(/:$/,""),f=Object.assign(Object.assign({},C),f),!f.protocol)throw new Error("Missing protocol")}if(f.unixSocket=f.unixSocket||((h=f.protocol)===null||h===void 0?void 0:h.includes("+unix")),f.unixSocket?f.protocol=f.protocol.replace("+unix",""):!(!((g=f.protocol)===null||g===void 0)&&g.startsWith("ws"))&&!(!((y=f.protocol)===null||y===void 0)&&y.startsWith("wx"))&&delete f.path,l(f),f.query&&typeof f.query.clientId=="string"&&(f.clientId=f.query.clientId),f.cert&&f.key)if(f.protocol){if(["mqtts","wss","wxs","alis"].indexOf(f.protocol)===-1)switch(f.protocol){case"mqtt":f.protocol="mqtts";break;case"ws":f.protocol="wss";break;case"wx":f.protocol="wxs";break;case"ali":f.protocol="alis";break;default:throw new Error(`Unknown protocol for secure connection: "${f.protocol}"!`)}}else throw new Error("Missing secure protocol key");if(i||(i={},!o.default&&!f.forceNativeWebSocket?(i.ws=sw().streamBuilder,i.wss=sw().streamBuilder,i.mqtt=q5().default,i.tcp=q5().default,i.ssl=Y5().default,i.tls=i.ssl,i.mqtts=Y5().default):(i.ws=sw().browserStreamBuilder,i.wss=sw().browserStreamBuilder,i.wx=Z5().default,i.wxs=Z5().default,i.ali=J5().default,i.alis=J5().default)),!i[f.protocol]){let b=["mqtts","wss"].indexOf(f.protocol)!==-1;f.protocol=["mqtt","mqtts","ws","wss","wx","wxs","ali","alis"].filter((C,E)=>b&&E%2===0?!1:typeof i[C]=="function")[0]}if(f.clean===!1&&!f.clientId)throw new Error("Missing clientId for unclean clients");f.protocol&&(f.defaultProtocol=f.protocol);function v(b){return f.servers&&((!b._reconnectCount||b._reconnectCount===f.servers.length)&&(b._reconnectCount=0),f.host=f.servers[b._reconnectCount].host,f.port=f.servers[b._reconnectCount].port,f.protocol=f.servers[b._reconnectCount].protocol?f.servers[b._reconnectCount].protocol:f.defaultProtocol,f.hostname=f.host,b._reconnectCount++),a("calling streambuilder for",f.protocol),i[f.protocol](b,f)}let w=new s.default(v,f);return w.on("error",()=>{}),w}function c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
    @jspm/core/nodelibs/browser/buffer.js: (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
    */const IMe=Xt.OB,
    uY="https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1",
    BMe="https://uphw-cdn3.jomscxu.com/upload/json/pc.json",
    OMe=t=>{
      const e=/(.+?)(\d+)/;
      if(!e.test(t))return null;
      const r=e.exec(t);
      return r?{
        topic:r[1],
        matchId:r[2]
      }
      :null
    },
    Q5=t=>["/odd/insert/".concat(t),
    "/odd/statusUpdate/".concat(t),
    "/odd/visible/".concat(t),
    "/odd/suspended/".concat(t),
    "/market/sortCodeUpdate/".concat(t),
    "/market/suspended/".concat(t),
    "/market/visible/".concat(t),
    "/market/statusUpdate/".concat(t),
    "/market/oddsUpdate/".concat(t)],
    DMe=async()=>{
      var r;
      const t=await Nr.get(uY),
      e=t.data;
      if((r=e==null?void 0:e.data)!=null&&r.pc){
        const s=new URL(e.data.pc).searchParams.get("token");
        await Vt.updatePlatform({
          provider:Xt.OB,
          token:s??void 0
        })
      }
    },
    Ck=t=>({
      device:"1",
      lang:"cn",
      token:t.token
    });
    let ud;
    const e9=async t=>{
      if(!ud){
        const e="OBService:TeamLogo";
        if(ud=(await Nr.get(BMe)).data.team_imag,
        ud)localStorage.setItem(e,
        JSON.stringify(ud));
        else{
          const s=localStorage.getItem(e);
          s&&(ud=JSON.parse(s))
        }
      }
      return!ud||!ud[t]?"":`https://uphw-cdn6.peyesight.com/${ud[t]}`
    },
    MMe=async t=>{
      const e=`${t.gateway}/game/getTimer`,
      r=await Nr.get(e,
      {
        headers:Ck(t)
      }),
      n=r.data;
      if(n.status!=="true")return;
      const s=[];
      Object.values(n.data).forEach(o=>{
        s.push({
          MatchID:o.match_id,
          Round:o.round.toNumber(),
          StartTime:o.start_time*1e3
        })
      }),
      await Vt.saveLiveTimer(IMe,
      s)
    },
    NMe=async()=>{
      await pt.wait(3e3);
      const t="admin",
      e="Qazqaz123...",
      r="mqttjs_dj1250901313125773543",
      n=kMe.connect("wss://47.115.75.57/esport/ws/OB",
      {
        username:t,
        password:e,
        clientId:r,
        clean:!0,
        keepalive:60,
        reconnectPeriod:5e3,
        protocolId:"MQTT"
      }),
      s=Xt.OB,
      o=fo(),
      a=Tf();
      n.on("connect",
      ()=>{
      }),
      n.on("message",
      (c,
      d)=>{
        const f=JSON.parse(d.toString());
        o.updateMessage(s,
        d.toString());
        const p=OMe(c);
        if(p)switch(p.topic){
          case"/market/oddsUpdate/":f.forEach(h=>{
            o.isOdds(s,
            h.id)&&o.save(s,
            new Jn(h.id,
            h.odd,
            !1,
            h.market_id))
          });
          break;
          case"/market/statusUpdate/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            !0)
          });
          break;
          case"/market/suspended/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            h.suspended===1)
          });
          break
        }
      });
      const i=[],
      l=async()=>{
        const c={
          time:Date.now(),
          match:0
        };
        try{
          const d=await Vt.getPlatform(s);
          if(!d)return;
          const p=(await Nr.get(`${d.gateway}/game/index?game_id=0&flag=1&day=1`,
          {
            headers:Ck(d)
          })).data;
          if(p.status==="false"){
            Pr.error(s,
            `本地赔率采集失败 => ${p.data}`),
            p.data==="token"&&await DMe();
            return
          }
          const h=p.data.filter(y=>d.games.includes(y.game_id)&&y.start_time<Date.now()/1e3+3600),
          g=[];
          for(let y of h){
            const v=y.match_team.replace(/&nbsp;
            /g,
            " ").split(","),
            w=y.team_id.split(",");
            if(v.length!==2||w.length!==2)return;
            const b=await e9(w[0]),
            C=await e9(w[1]);
            g.push({
              Type:s,
              SourceGameID:y.game_id,
              SourceMatchID:y.id,
              BO:y.bo,
              StartTime:y.start_time*1e3,
              Home:v[0],
              HomeID:w[0],
              Away:v[1],
              AwayID:w[1],
              Teams:[{
                Type:s,
                GameID:y.game_id,
                Name:v[0],
                TeamID:w[0],
                Logo:b
              },
              {
                Type:s,
                GameID:y.game_id,
                Name:v[1],
                TeamID:w[1],
                Logo:C
              }]
            })
          }
          await a.saveMatch(s,
          g);
          for(let y=0;
          y<h.length;
          y++){
            const v=h[y];
            n.unsubscribe(Q5(v.id)),
            await u(v,
            d),
            c.match++,
            n.subscribe(Q5(v.id),
            w=>{
              w||i.push(v.id)
            })
          }
          await MMe(d)
        }
        finally{
          Pr.debug(`[${s}]比赛列表:${Date.now()-c.time}ms，读取比赛:${c.match}场`),
          await pt.wait(30*1e3),
          await l()
        }
      },
      u=async(c,
      d)=>{
        const f=[],
        p=c.match_team.replace(/&nbsp;
        /g,
        " ").split(",");
        c.team_id.split(",");
        let h=!1;
        const g=c.bo===1?0:c.bo;
        for(let y=0;
        y<=g;
        y++)try{
          const w=(await Nr.get(`${d.gateway}/game/view?match_id=${c.id}&stage_id=${y}`,
          {
            headers:Ck(d)
          })).data;
          if(w.status!=="true")continue;
          w.data.forEach(b=>{
            const E=`[${b.round===0?"全场":`地图${
              b.round
            }
            `}]-${b.cn_name.replace(/\&nbsp;/g,"")}`,
            _=new RegExp(d.betName);
            if(b.status===12||b.visible===0||!_.test(E))return;
            const A=b.status!==6||b.visible!==1||b.suspended!==0,
            T=[];
            for(let $ in b.odds){
              const P=b.odds[$];
              T.push(P),
              o.save(s,
              new Jn(P.id,
              P.odd.toNumber(),
              A,
              b.id))
            }
            const S=T.find($=>$.name==="@T1"),
            B=T.find($=>$.name==="@T2");
            !S||!B||f.push({
              Type:s,
              SourceMatchID:c.id,
              Map:b.round,
              SourceBetID:b.id,
              BetName:E,
              SourceHomeID:S.id,
              HomeName:p[0],
              HomeOdds:S.odd.toNumber(),
              SourceAwayID:B.id,
              AwayName:p[1],
              AwayOdds:B.odd.toNumber(),
              Status:A?"Locked":"Normal"
            })
          })
        }
        catch(v){
          h=!0,
          console.error(v)
        }
        finally{
          await pt.wait(1500)
        }
        h||await a.saveBets(s,
        c.id,
        f)
      };
      await l()
    },
    RMe="a123456",
    FMe="game.haijings.vip",
    WMe=3,
    $Me=Se({
      __name:"UserCollectView",
      setup(t){
        const e=Tf(),
        r=oe({
        }),
        n=oe(!0),
        s=async()=>{
          await e.saveConfig(r.value)
        },
        o=Xn(),
        a=oe(),
        i=async(d,
        f)=>{
          let p="/v4.0/";
          location.hostname==="localhost"&&(p="https://api.a8.to/v4.0/");
          const h=`${p}${d}`;
          return(await Nr.post(h,
          f,
          {
            headers:{
              "Content-Type":"application/x-www-form-urlencoded;",
              token:a.value,
              "x-forwarded-site":FMe
            }
          })).data
        },
        l=async d=>{
          if(d===Xt.OB)return await u(d);
          if(d===Xt.SABA)return c(d);
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await i("user/account/login",
            {
              userName:o.userName,
              password:RMe
            });
            if(p.success!==1){
              no.error(p.msg);
              return
            }
            a.value=p.info.token;
            const h=await i("game/play/Login",
            {
              gameId:WMe
            });
            if(h.success!==1){
              no.error(h.msg);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.info.Url,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        u=async d=>{
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await Nr.get(uY),
            h=p.data;
            if(!h.status){
              no.error(h.message);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.data.pc,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        c=d=>{
          window.open("https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7",
          d.toString())
        };
        return zt(()=>{
          e.config.collect.forEach((d,
          f)=>{
            r.value[f]=d
          })
        }),
        (d,
        f)=>{
          const p=Ge("el-switch"),
          h=Ge("el-col"),
          g=Ge("el-row"),
          y=Ge("el-divider"),
          v=Ge("el-button");
          return H(),
          pe(nt,
          null,
          [X(g,
          {
            class:"providers"
          },
          {
            default:ne(()=>[X(h,
            {
              span:4
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":"采集日志",
                "inactive-text":"采集日志",
                modelValue:m(e).config.log,
                "onUpdate:modelValue":f[0]||(f[0]=w=>m(e).config.log=w),
                onChange:s
              },
              null,
              8,
              ["disabled",
              "modelValue"])]),
              _:1
            }),
            (H(!0),
            pe(nt,
            null,
            Ft(m(Xt),
            w=>(H(),
            Fe(h,
            {
              span:4,
              class:"provider"
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":w,
                "inactive-text":w,
                modelValue:r.value[w],
                "onUpdate:modelValue":b=>r.value[w]=b,
                onChange:s
              },
              null,
              8,
              ["disabled",
              "active-text",
              "inactive-text",
              "modelValue",
              "onUpdate:modelValue"])]),
              _:2
            },
            1024))),
            256))]),
            _:1
          }),
          X(y,
          null,
          {
            default:ne(()=>[f[5]||(f[5]=ft("信用")),
            fe("span",
            {
              onDblclick:f[1]||(f[1]=w=>n.value=!n.value)
            },
            "盘",
            32),
            f[6]||(f[6]=ft("入口"))]),
            _:1
          }),
          X(g,
          {
            class:"credit"
          },
          {
            default:ne(()=>[X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[2]||(f[2]=w=>l(m(Xt).PB))
              },
              {
                default:ne(()=>f[7]||(f[7]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon PB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "平博体育")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[3]||(f[3]=w=>l(m(Xt).OB))
              },
              {
                default:ne(()=>f[8]||(f[8]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon OB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "OB试玩")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[4]||(f[4]=w=>l(m(Xt).SABA))
              },
              {
                default:ne(()=>f[9]||(f[9]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon SABA"
                }),
                fe("div",
                {
                  class:"name"
                },
                "SABA试玩")],
                -1)])),
                _:1
              })]),
              _:1
            })]),
            _:1
          })],
          64)
        }
      }
    }),
    LMe=Rl($Me,
    [["__scopeId",
    "data-v-88e483b8"]]),
    UMe=["title"],
    VMe=Se({
      __name:"TradeView",
      setup(t){
        const e=Xn(),
        r=oe(),
        n=j(()=>{
          var h;
          return(h=r.value)==null?void 0:h.filter(g=>g.isOnline===1)
        }),
        s=oe(JSON.parse(sessionStorage.getItem("TRADE:USERS")??"[]")),
        o=new Map,
        a=h=>{
          var y,
          v;
          if(!h)return;
          const g=o.get(h);
          if(g)return(v=(y=r.value)==null?void 0:y.find(w=>w.userId===g))==null?void 0:v.userName
        },
        i=oe(new Map),
        l=j(()=>{
          const h=[];
          return s.value.forEach(g=>{
            var y;
            h.push(...((y=i.value.get(g))==null?void 0:y.filter(v=>v.provider===u.value))??[])
          }),
          h
        }),
        u=oe(Xt.PB),
        c=async h=>{
          if(!h)return;
          const g=`USER:${h}`,
          y=pt.uuid(),
          v={
            action:"query",
            info:{
              type:"accounts",
              reply:f,
              msgId:y,
              data:{
                provider:u.value
              }
            }
          },
          w=Date.now(),
          b=await U8e(g,
          y,
          JSON.stringify(v));
          if(!b)return;
          console.log(b,
          `耗时：${Date.now()-w}ms`),
          i.value.has(h)||i.value.set(h,
          []);
          const C=i.value.get(h)??[];
          b.forEach(E=>{
            if(!E.accountId)return;
            o.set(E.accountId,
            h);
            const _=C.map(A=>A.accountId).indexOf(E.accountId);
            _===-1?C.push(E):C[_]=E
          })
        },
        d=async()=>{
          if(s.value){
            sessionStorage.setItem("TRADE:USERS",
            JSON.stringify(s.value));
            for(const h of s.value)await c(h)
          }
        },
        f=`TRADE:${e.userId}`,
        p=async(h,
        g)=>{
          var b;
          if(!h)return;
          const y=o.get(h);
          if(!y)return;
          const v=(b=i.value.get(y))==null?void 0:b.find(C=>C.accountId===h);
          if(!v)return;
          const w={
            action:"account",
            info:{
              accountId:h
            }
          };
          switch(g){
            case"pause":w.info.pause=v.pause;
            break;
            case"lastOdds":w.info.lastOdds=v.lastOdds;
            break;
            default:w.info[g]=v[g];
            break
          }
          await ax(`USER:${y}`,
          JSON.stringify(w))
        };
        return xo(async()=>{
          await lv(f,
          h=>{
            const g=JSON.parse(h.content),
            y=g.msgId;
            L8e(y,
            g.content)
          }),
          r.value=await Vt.getUsers(),
          await d()
        }),
        (h,
        g)=>{
          const y=Ge("el-radio"),
          v=Ge("el-radio-group"),
          w=Ge("el-form-item"),
          b=Ge("el-checkbox"),
          C=Ge("el-checkbox-group"),
          E=Ge("el-button"),
          _=Ge("el-switch"),
          A=Ge("el-col"),
          T=Ge("el-input"),
          S=Ge("el-row"),
          B=Ge("el-form");
          return H(),
          Fe(B,
          null,
          {
            default:ne(()=>[X(w,
            {
              label:"平台："
            },
            {
              default:ne(()=>[X(v,
              {
                modelValue:u.value,
                "onUpdate:modelValue":g[0]||(g[0]=$=>u.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(m(Xt),
                $=>(H(),
                Fe(y,
                {
                  value:$
                },
                {
                  default:ne(()=>[ft(je($),
                  1)]),
                  _:2
                },
                1032,
                ["value"]))),
                256))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(w,
            null,
            {
              label:ne(()=>g[2]||(g[2]=[ft(" 用户列表： ")])),
              default:ne(()=>[X(C,
              {
                modelValue:s.value,
                "onUpdate:modelValue":g[1]||(g[1]=$=>s.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(n.value,
                $=>(H(),
                Fe(b,
                {
                  key:$.userId,
                  label:$.userName,
                  value:$.userId
                },
                {
                  default:ne(()=>[ft(je($.userName),
                  1)]),
                  _:2
                },
                1032,
                ["label",
                "value"]))),
                128))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(S,
            null,
            {
              default:ne(()=>[(H(!0),
              pe(nt,
              null,
              Ft(l.value,
              $=>(H(),
              Fe(A,
              {
                span:12,
                key:$.accountId
              },
              {
                default:ne(()=>{
                  var P;
                  return[fe("fieldset",
                  null,
                  [fe("legend",
                  null,
                  [ft(" ["+je(a($.accountId))+"] "+je($.platformName)+"/"+je($.playerName)+" / "+je((P=$.balance)==null?void 0:P.toFixed(0)),
                  1),
                  X(E,
                  {
                    link:""
                  },
                  {
                    default:ne(()=>g[3]||(g[3]=[fe("i",
                    {
                      class:"am-icon-refresh"
                    },
                    null,
                    -1)])),
                    _:1
                  })]),
                  X(S,
                  {
                    gutter:10
                  },
                  {
                    default:ne(()=>[X(A,
                    {
                      span:8
                    },
                    {
                      default:ne(()=>[X(_,
                      {
                        "active-text":"暂停",
                        "inactive-text":"开启",
                        "inline-prompt":"",
                  

// ---- 实时赔率缓存 fo / Jn / anchor 8: new Jn / approx line 28005 ----
n c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
    @jspm/core/nodelibs/browser/buffer.js: (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
    */const IMe=Xt.OB,
    uY="https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1",
    BMe="https://uphw-cdn3.jomscxu.com/upload/json/pc.json",
    OMe=t=>{
      const e=/(.+?)(\d+)/;
      if(!e.test(t))return null;
      const r=e.exec(t);
      return r?{
        topic:r[1],
        matchId:r[2]
      }
      :null
    },
    Q5=t=>["/odd/insert/".concat(t),
    "/odd/statusUpdate/".concat(t),
    "/odd/visible/".concat(t),
    "/odd/suspended/".concat(t),
    "/market/sortCodeUpdate/".concat(t),
    "/market/suspended/".concat(t),
    "/market/visible/".concat(t),
    "/market/statusUpdate/".concat(t),
    "/market/oddsUpdate/".concat(t)],
    DMe=async()=>{
      var r;
      const t=await Nr.get(uY),
      e=t.data;
      if((r=e==null?void 0:e.data)!=null&&r.pc){
        const s=new URL(e.data.pc).searchParams.get("token");
        await Vt.updatePlatform({
          provider:Xt.OB,
          token:s??void 0
        })
      }
    },
    Ck=t=>({
      device:"1",
      lang:"cn",
      token:t.token
    });
    let ud;
    const e9=async t=>{
      if(!ud){
        const e="OBService:TeamLogo";
        if(ud=(await Nr.get(BMe)).data.team_imag,
        ud)localStorage.setItem(e,
        JSON.stringify(ud));
        else{
          const s=localStorage.getItem(e);
          s&&(ud=JSON.parse(s))
        }
      }
      return!ud||!ud[t]?"":`https://uphw-cdn6.peyesight.com/${ud[t]}`
    },
    MMe=async t=>{
      const e=`${t.gateway}/game/getTimer`,
      r=await Nr.get(e,
      {
        headers:Ck(t)
      }),
      n=r.data;
      if(n.status!=="true")return;
      const s=[];
      Object.values(n.data).forEach(o=>{
        s.push({
          MatchID:o.match_id,
          Round:o.round.toNumber(),
          StartTime:o.start_time*1e3
        })
      }),
      await Vt.saveLiveTimer(IMe,
      s)
    },
    NMe=async()=>{
      await pt.wait(3e3);
      const t="admin",
      e="Qazqaz123...",
      r="mqttjs_dj1250901313125773543",
      n=kMe.connect("wss://47.115.75.57/esport/ws/OB",
      {
        username:t,
        password:e,
        clientId:r,
        clean:!0,
        keepalive:60,
        reconnectPeriod:5e3,
        protocolId:"MQTT"
      }),
      s=Xt.OB,
      o=fo(),
      a=Tf();
      n.on("connect",
      ()=>{
      }),
      n.on("message",
      (c,
      d)=>{
        const f=JSON.parse(d.toString());
        o.updateMessage(s,
        d.toString());
        const p=OMe(c);
        if(p)switch(p.topic){
          case"/market/oddsUpdate/":f.forEach(h=>{
            o.isOdds(s,
            h.id)&&o.save(s,
            new Jn(h.id,
            h.odd,
            !1,
            h.market_id))
          });
          break;
          case"/market/statusUpdate/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            !0)
          });
          break;
          case"/market/suspended/":f.forEach(h=>{
            o.updateBetLock(s,
            h.market_id,
            h.suspended===1)
          });
          break
        }
      });
      const i=[],
      l=async()=>{
        const c={
          time:Date.now(),
          match:0
        };
        try{
          const d=await Vt.getPlatform(s);
          if(!d)return;
          const p=(await Nr.get(`${d.gateway}/game/index?game_id=0&flag=1&day=1`,
          {
            headers:Ck(d)
          })).data;
          if(p.status==="false"){
            Pr.error(s,
            `本地赔率采集失败 => ${p.data}`),
            p.data==="token"&&await DMe();
            return
          }
          const h=p.data.filter(y=>d.games.includes(y.game_id)&&y.start_time<Date.now()/1e3+3600),
          g=[];
          for(let y of h){
            const v=y.match_team.replace(/&nbsp;
            /g,
            " ").split(","),
            w=y.team_id.split(",");
            if(v.length!==2||w.length!==2)return;
            const b=await e9(w[0]),
            C=await e9(w[1]);
            g.push({
              Type:s,
              SourceGameID:y.game_id,
              SourceMatchID:y.id,
              BO:y.bo,
              StartTime:y.start_time*1e3,
              Home:v[0],
              HomeID:w[0],
              Away:v[1],
              AwayID:w[1],
              Teams:[{
                Type:s,
                GameID:y.game_id,
                Name:v[0],
                TeamID:w[0],
                Logo:b
              },
              {
                Type:s,
                GameID:y.game_id,
                Name:v[1],
                TeamID:w[1],
                Logo:C
              }]
            })
          }
          await a.saveMatch(s,
          g);
          for(let y=0;
          y<h.length;
          y++){
            const v=h[y];
            n.unsubscribe(Q5(v.id)),
            await u(v,
            d),
            c.match++,
            n.subscribe(Q5(v.id),
            w=>{
              w||i.push(v.id)
            })
          }
          await MMe(d)
        }
        finally{
          Pr.debug(`[${s}]比赛列表:${Date.now()-c.time}ms，读取比赛:${c.match}场`),
          await pt.wait(30*1e3),
          await l()
        }
      },
      u=async(c,
      d)=>{
        const f=[],
        p=c.match_team.replace(/&nbsp;
        /g,
        " ").split(",");
        c.team_id.split(",");
        let h=!1;
        const g=c.bo===1?0:c.bo;
        for(let y=0;
        y<=g;
        y++)try{
          const w=(await Nr.get(`${d.gateway}/game/view?match_id=${c.id}&stage_id=${y}`,
          {
            headers:Ck(d)
          })).data;
          if(w.status!=="true")continue;
          w.data.forEach(b=>{
            const E=`[${b.round===0?"全场":`地图${
              b.round
            }
            `}]-${b.cn_name.replace(/\&nbsp;/g,"")}`,
            _=new RegExp(d.betName);
            if(b.status===12||b.visible===0||!_.test(E))return;
            const A=b.status!==6||b.visible!==1||b.suspended!==0,
            T=[];
            for(let $ in b.odds){
              const P=b.odds[$];
              T.push(P),
              o.save(s,
              new Jn(P.id,
              P.odd.toNumber(),
              A,
              b.id))
            }
            const S=T.find($=>$.name==="@T1"),
            B=T.find($=>$.name==="@T2");
            !S||!B||f.push({
              Type:s,
              SourceMatchID:c.id,
              Map:b.round,
              SourceBetID:b.id,
              BetName:E,
              SourceHomeID:S.id,
              HomeName:p[0],
              HomeOdds:S.odd.toNumber(),
              SourceAwayID:B.id,
              AwayName:p[1],
              AwayOdds:B.odd.toNumber(),
              Status:A?"Locked":"Normal"
            })
          })
        }
        catch(v){
          h=!0,
          console.error(v)
        }
        finally{
          await pt.wait(1500)
        }
        h||await a.saveBets(s,
        c.id,
        f)
      };
      await l()
    },
    RMe="a123456",
    FMe="game.haijings.vip",
    WMe=3,
    $Me=Se({
      __name:"UserCollectView",
      setup(t){
        const e=Tf(),
        r=oe({
        }),
        n=oe(!0),
        s=async()=>{
          await e.saveConfig(r.value)
        },
        o=Xn(),
        a=oe(),
        i=async(d,
        f)=>{
          let p="/v4.0/";
          location.hostname==="localhost"&&(p="https://api.a8.to/v4.0/");
          const h=`${p}${d}`;
          return(await Nr.post(h,
          f,
          {
            headers:{
              "Content-Type":"application/x-www-form-urlencoded;",
              token:a.value,
              "x-forwarded-site":FMe
            }
          })).data
        },
        l=async d=>{
          if(d===Xt.OB)return await u(d);
          if(d===Xt.SABA)return c(d);
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await i("user/account/login",
            {
              userName:o.userName,
              password:RMe
            });
            if(p.success!==1){
              no.error(p.msg);
              return
            }
            a.value=p.info.token;
            const h=await i("game/play/Login",
            {
              gameId:WMe
            });
            if(h.success!==1){
              no.error(h.msg);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.info.Url,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        u=async d=>{
          let f;
          try{
            f=Zv.service({
              lock:!0,
              text:"正在进入游戏",
              background:"rgba(0, 0, 0, 0.7)"
            });
            const p=await Nr.get(uY),
            h=p.data;
            if(!h.status){
              no.error(h.message);
              return
            }
            Lc.confirm(`确认要进入${d}吗？`,
            d,
            {
              confirmButtonText:"进入游戏",
              cancelButtonText:"取消",
              type:"warning",
              center:!0
            }).then(()=>{
              window.open(h.data.pc,
              d.toString())
            })
          }
          finally{
            await pt.wait(1e3),
            f==null||f.close()
          }
        },
        c=d=>{
          window.open("https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7",
          d.toString())
        };
        return zt(()=>{
          e.config.collect.forEach((d,
          f)=>{
            r.value[f]=d
          })
        }),
        (d,
        f)=>{
          const p=Ge("el-switch"),
          h=Ge("el-col"),
          g=Ge("el-row"),
          y=Ge("el-divider"),
          v=Ge("el-button");
          return H(),
          pe(nt,
          null,
          [X(g,
          {
            class:"providers"
          },
          {
            default:ne(()=>[X(h,
            {
              span:4
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":"采集日志",
                "inactive-text":"采集日志",
                modelValue:m(e).config.log,
                "onUpdate:modelValue":f[0]||(f[0]=w=>m(e).config.log=w),
                onChange:s
              },
              null,
              8,
              ["disabled",
              "modelValue"])]),
              _:1
            }),
            (H(!0),
            pe(nt,
            null,
            Ft(m(Xt),
            w=>(H(),
            Fe(h,
            {
              span:4,
              class:"provider"
            },
            {
              default:ne(()=>[X(p,
              {
                disabled:n.value,
                size:"large",
                "inline-prompt":"",
                "active-text":w,
                "inactive-text":w,
                modelValue:r.value[w],
                "onUpdate:modelValue":b=>r.value[w]=b,
                onChange:s
              },
              null,
              8,
              ["disabled",
              "active-text",
              "inactive-text",
              "modelValue",
              "onUpdate:modelValue"])]),
              _:2
            },
            1024))),
            256))]),
            _:1
          }),
          X(y,
          null,
          {
            default:ne(()=>[f[5]||(f[5]=ft("信用")),
            fe("span",
            {
              onDblclick:f[1]||(f[1]=w=>n.value=!n.value)
            },
            "盘",
            32),
            f[6]||(f[6]=ft("入口"))]),
            _:1
          }),
          X(g,
          {
            class:"credit"
          },
          {
            default:ne(()=>[X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[2]||(f[2]=w=>l(m(Xt).PB))
              },
              {
                default:ne(()=>f[7]||(f[7]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon PB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "平博体育")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[3]||(f[3]=w=>l(m(Xt).OB))
              },
              {
                default:ne(()=>f[8]||(f[8]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon OB"
                }),
                fe("div",
                {
                  class:"name"
                },
                "OB试玩")],
                -1)])),
                _:1
              })]),
              _:1
            }),
            X(h,
            {
              span:6,
              class:"flex-center"
            },
            {
              default:ne(()=>[X(v,
              {
                type:"primary",
                onClick:f[4]||(f[4]=w=>l(m(Xt).SABA))
              },
              {
                default:ne(()=>f[9]||(f[9]=[fe("div",
                {
                  class:"flex flex-middle"
                },
                [fe("div",
                {
                  class:"provider-icon SABA"
                }),
                fe("div",
                {
                  class:"name"
                },
                "SABA试玩")],
                -1)])),
                _:1
              })]),
              _:1
            })]),
            _:1
          })],
          64)
        }
      }
    }),
    LMe=Rl($Me,
    [["__scopeId",
    "data-v-88e483b8"]]),
    UMe=["title"],
    VMe=Se({
      __name:"TradeView",
      setup(t){
        const e=Xn(),
        r=oe(),
        n=j(()=>{
          var h;
          return(h=r.value)==null?void 0:h.filter(g=>g.isOnline===1)
        }),
        s=oe(JSON.parse(sessionStorage.getItem("TRADE:USERS")??"[]")),
        o=new Map,
        a=h=>{
          var y,
          v;
          if(!h)return;
          const g=o.get(h);
          if(g)return(v=(y=r.value)==null?void 0:y.find(w=>w.userId===g))==null?void 0:v.userName
        },
        i=oe(new Map),
        l=j(()=>{
          const h=[];
          return s.value.forEach(g=>{
            var y;
            h.push(...((y=i.value.get(g))==null?void 0:y.filter(v=>v.provider===u.value))??[])
          }),
          h
        }),
        u=oe(Xt.PB),
        c=async h=>{
          if(!h)return;
          const g=`USER:${h}`,
          y=pt.uuid(),
          v={
            action:"query",
            info:{
              type:"accounts",
              reply:f,
              msgId:y,
              data:{
                provider:u.value
              }
            }
          },
          w=Date.now(),
          b=await U8e(g,
          y,
          JSON.stringify(v));
          if(!b)return;
          console.log(b,
          `耗时：${Date.now()-w}ms`),
          i.value.has(h)||i.value.set(h,
          []);
          const C=i.value.get(h)??[];
          b.forEach(E=>{
            if(!E.accountId)return;
            o.set(E.accountId,
            h);
            const _=C.map(A=>A.accountId).indexOf(E.accountId);
            _===-1?C.push(E):C[_]=E
          })
        },
        d=async()=>{
          if(s.value){
            sessionStorage.setItem("TRADE:USERS",
            JSON.stringify(s.value));
            for(const h of s.value)await c(h)
          }
        },
        f=`TRADE:${e.userId}`,
        p=async(h,
        g)=>{
          var b;
          if(!h)return;
          const y=o.get(h);
          if(!y)return;
          const v=(b=i.value.get(y))==null?void 0:b.find(C=>C.accountId===h);
          if(!v)return;
          const w={
            action:"account",
            info:{
              accountId:h
            }
          };
          switch(g){
            case"pause":w.info.pause=v.pause;
            break;
            case"lastOdds":w.info.lastOdds=v.lastOdds;
            break;
            default:w.info[g]=v[g];
            break
          }
          await ax(`USER:${y}`,
          JSON.stringify(w))
        };
        return xo(async()=>{
          await lv(f,
          h=>{
            const g=JSON.parse(h.content),
            y=g.msgId;
            L8e(y,
            g.content)
          }),
          r.value=await Vt.getUsers(),
          await d()
        }),
        (h,
        g)=>{
          const y=Ge("el-radio"),
          v=Ge("el-radio-group"),
          w=Ge("el-form-item"),
          b=Ge("el-checkbox"),
          C=Ge("el-checkbox-group"),
          E=Ge("el-button"),
          _=Ge("el-switch"),
          A=Ge("el-col"),
          T=Ge("el-input"),
          S=Ge("el-row"),
          B=Ge("el-form");
          return H(),
          Fe(B,
          null,
          {
            default:ne(()=>[X(w,
            {
              label:"平台："
            },
            {
              default:ne(()=>[X(v,
              {
                modelValue:u.value,
                "onUpdate:modelValue":g[0]||(g[0]=$=>u.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(m(Xt),
                $=>(H(),
                Fe(y,
                {
                  value:$
                },
                {
                  default:ne(()=>[ft(je($),
                  1)]),
                  _:2
                },
                1032,
                ["value"]))),
                256))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(w,
            null,
            {
              label:ne(()=>g[2]||(g[2]=[ft(" 用户列表： ")])),
              default:ne(()=>[X(C,
              {
                modelValue:s.value,
                "onUpdate:modelValue":g[1]||(g[1]=$=>s.value=$),
                onChange:d
              },
              {
                default:ne(()=>[(H(!0),
                pe(nt,
                null,
                Ft(n.value,
                $=>(H(),
                Fe(b,
                {
                  key:$.userId,
                  label:$.userName,
                  value:$.userId
                },
                {
                  default:ne(()=>[ft(je($.userName),
                  1)]),
                  _:2
                },
                1032,
                ["label",
                "value"]))),
                128))]),
                _:1
              },
              8,
              ["modelValue"])]),
              _:1
            }),
            X(S,
            null,
            {
              default:ne(()=>[(H(!0),
              pe(nt,
              null,
              Ft(l.value,
              $=>(H(),
              Fe(A,
              {
                span:12,
                key:$.accountId
              },
              {
                default:ne(()=>{
                  var P;
                  return[fe("fieldset",
                  null,
                  [fe("legend",
                  null,
                  [ft(" ["+je(a($.accountId))+"] "+je($.platformName)+"/"+je($.playerName)+" / "+je((P=$.balance)==null?void 0:P.toFixed(0)),
                  1),
                  X(E,
                  {
                    link:""
                  },
                  {
                    default:ne(()=>g[3]||(g[3]=[fe("i",
                    {
                      class:"am-icon-refresh"
                    },
                    null,
                    -1)])),
                    _:1
                  })]),
                  X(S,
                  {
                    gutter:10
                  },
                  {
                    default:ne(()=>[X(A,
                    {
                      span:8
                    },
                    {
                      default:ne(()=>[X(_,
                      {
                        "active-text":"暂停",
                        "inactive-text":"开启",
                        "inline-prompt":"",
                        modelValue:$.pause,
                        "onUpdate:modelValue":O=>$.pause=O,
                        onChange:O=>p($.accountId,
                        "pause")
                      },
                      null,
                      8,
                      ["modelValue",
                      "onUpdate:modelValue",
                      "onChange"])]),
                      _:2
                    },
                    1024),
                    X(A,
                    {
                      span:8
                    },
                    {
                      default:ne(()=>[X(_,
                      {
                        "active-text":"上次投注",
                        "inactive-text":"上次投注",
                        "inline-prompt":"",
                        modelValue:$.lastOdds,
                        "onUpdate:modelValue":O=>$.lastOdds=O,
                        onChange:O=>p($.accountId,
                        "lastOdds")
                      },
                      null,
                      8,
                      ["modelValue",
                      "onUpdate:modelValue",
                      "onChange"])]),
                      _:2
                    },
                    1024),
                    (H(),
                    pe(nt,
                    null,
                    Ft(["profit",
                    "maxBetCount",
                    "minOdds",
                    "maxOdds",
                    "multiply"],
                    O=>X(A,
                    {
                      span:8
                    },
                    {
                      default:ne(()=>[X(T,
                      {
                        modelValue:$[O],
                        "onUpdate:modelValue":D=>$[O]=D,
                        onChange:D=>p($.accountId,
                        O)
                      },
                      {
                        prepend:ne(()=>[fe("div",
                        {
                          class:"account-field",
                          title:O
                        },
                        je(O),
                        9,
                        UMe)]),
                        _:2
                      },
                      1032,
                      ["modelValue",
                      "onUpdate:modelValue",
                      "onChange"])]),
                      _:2
                    },
                    1024)),
                    64))]),
                    _:2
                  },
                  1024)])]
                }),
                _:2
              },
              1024))),
              128))]),
              _:1
            })]),
            _:1
          })
        }
      }
    }),
    zMe=Rl(VMe,
    [["__scopeId",
    "data-v-46986c43"]]),
    jMe=Se({
      __name:"FollowView",
      setup(t){
        const e=Xn(),
        r=oe(e.follow??{
          isOpen:!1,
          betMoney:e.config.betMoney,
          odds:0
        }),
        n=oe(),
        s=async()=>{
          await Vt.saveFollowConfig(r.value)&&(e.follow=r.value)
        };
        return xo(