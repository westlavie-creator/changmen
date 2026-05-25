// ---- 应用启动与插件检测 / anchor 1: Yn.init / approx line 54026 ----
iew",setup(t){const e=Io(),r=Xn(),n=oe(),s=oe(),o=oe(),a=j(()=>{if(Vt.delay.value)return Vt.delay.value<100?"success":Vt.delay.value<500?"warning":"danger"}),i={duration:1e3},l=j(()=>{let w=0;return e.accounts.forEach(b=>{b.balance&&(w+=Number(b.balance??0))}),Math.floor(w*100)/100}),u=TT(l,i),c=j(()=>e.dayProfit||0),d=TT(c,i),f=j(()=>Vt.delay.value??0),p=j(()=>{let w=0;return[...e.orders.values()].forEach(b=>w+=b.length),w}),h=TT(p,i),g=oe(localStorage.getItem("hiddenUserName")==="1"),y=()=>{const w=!g.value;localStorage.setItem("hiddenUserName",(w?1:0).toString()),g.value=w},v=j(()=>g.value?r.userId:r.userName);return xo(()=>{}),(w,b)=>{const C=Ge("el-button"),E=Ge("el-button-group"),_=Ge("el-statistic"),A=Ge("el-col"),T=Ge("el-row"),S=Ge("el-dialog");return H(),pe(nt,null,[fe("div",fHe,[fe("div",pHe,[fe("div",hHe,[X(E,null,{default:ne(()=>[X(C,{type:"primary",size:"small",onClick:b[0]||(b[0]=B=>o.value=!0)},{default:ne(()=>[ft(je(v.value),1)]),_:1}),X(C,{size:"small",type:a.value,onClick:y},{default:ne(()=>[ft(je(f.value),1),b[4]||(b[4]=fe("span",{class:"ms"},"ms",-1))]),_:1},8,["type"])]),_:1})]),fe("div",gHe,[X(E,null,{default:ne(()=>[X(C,{size:"small",class:"am-icon-plus",type:"primary",onClick:b[1]||(b[1]=B=>s.value=!0)}),X(C,{size:"small",class:"am-icon-gear",type:m(r).config.betting?"primary":"danger",onClick:b[2]||(b[2]=B=>n.value=!0)},null,8,["type"]),X(C,{size:"small",class:"am-icon-power-off",type:"info",onClick:m(r).logout},null,8,["onClick"])]),_:1})])]),fe("div",mHe,[X(T,null,{default:ne(()=>[X(A,{span:8},{default:ne(()=>[X(_,{title:"总余额",value:m(u),precision:0,class:"report-number"},null,8,["value"])]),_:1}),X(A,{span:8},{default:ne(()=>[X(_,{title:"当日盈亏",value:m(d),precision:0,class:"report-number"},null,8,["value"])]),_:1}),X(A,{span:8},{default:ne(()=>[X(_,{title:"订单数量",value:m(h),precision:0,class:"report-number"},null,8,["value"])]),_:1})]),_:1})])]),X(S,{modelValue:n.value,"onUpdate:modelValue":b[3]||(b[3]=B=>n.value=B),title:"参数配置",width:"420","close-on-press-escape":!1,"close-on-click-modal":!1},{default:ne(()=>[X(EDe,{close:()=>n.value=!1},null,8,["close"])]),_:1},8,["modelValue"]),s.value?(H(),Fe(bK,{key:0,close:()=>s.value=!1,info:void 0},null,8,["close"])):Re("",!0),o.value?(H(),Fe(dHe,{key:1,close:()=>o.value=!1},null,8,["close"])):Re("",!0)],64)}}}),vHe={class:"date flex flex-center"},bHe={class:"player"},wHe=["innerHTML"],CHe={class:"bet"},EHe=["innerHTML"],xHe={class:"item",style:{float:"right"}},THe=["innerHTML"],AHe={class:"time"},SHe={class:"profit"},_He=Se({__name:"OrderView",setup(t){const e=oe(0),r=j(()=>{const c=n.accounts.map(d=>({value:d.accountId,label:`${n.getPlatform(d.platformId)}/${d.playerName}`}));return c.unshift({value:0,label:"全部"}),c}),n=Io(),s=j(()=>{if(e.value===0)return n.orders;const c=new Map;for(let[f,p]of n.orders){var d=p.filter(h=>h.PlayerID===e.value);d.length!==0&&c.set(f,d)}return c}),o=oe(),a=async(c,d)=>{e.value=0;try{o.value=!0,await n.getOrders(d)}finally{await pt.wait(1e3),o.value=!1}},i=c=>{const d=[],f=pt.sum(c.filter(p=>p.Status!==Yt.reject&&p.Status!==Yt.return),p=>p.BetMoney);return c.forEach(p=>{p.Status===Yt.none&&d.push(pt.toFixed(p.BetMoney*p.Odds-f))}),d.length===0&&d.push(pt.toFixed(pt.sum(c,p=>p.Money))),d},l=c=>{const d=pt.sum(c,f=>f.Money);return d===0?"default":d>0?"success":"fail"},u=c=>{const d=n.accounts.find(f=>f.accountId===c.PlayerID);return d?`${n.getPlatform(d.platformId)} / ${d.playerName}`:c.Player?`${c.Player.Platform} / ${c.Player.UserName}`:""};return xo(async()=>{}),(c,d)=>{const f=Ge("el-date-picker"),p=Ge("el-option"),h=Ge("el-select"),g=Ge("el-button");return H(),pe(nt,null,[fe("div",vHe,[X(f,{modelValue:m(n).orderDate,"onUpdate:modelValue":d[0]||(d[0]=y=>m(n).orderDate=y),type:"date",placeholder:"选择日期",onChange:d[1]||(d[1]=y=>a(void 0,m(n).orderDate)),disabled:o.value,size:"small"},null,8,["modelValue","disabled"]),X(h,{modelValue:e.value,"onUpdate:modelValue":d[2]||(d[2]=y=>e.value=y),placeholder:"Select",style:{width:"160px"},disabled:o.value,size:"small"},{default:ne(()=>[(H(!0),pe(nt,null,Ft(r.value,y=>(H(),Fe(p,{key:y.value,label:y.label,value:y.value},null,8,["label","value"]))),128))]),_:1},8,["modelValue","disabled"]),X(g,{onClick:d[3]||(d[3]=y=>a()),disabled:o.value,class:"am-icon-refresh",size:"small"},null,8,["disabled"])]),fe("div",{class:re(["orders",{loading:o.value}])},[(H(!0),pe(nt,null,Ft(s.value,([y,v])=>(H(),pe("fieldset",{class:"orderlink",key:y},[fe("legend",{class:re(l(v))},je(i(v).join(" - ")),3),(H(!0),pe(nt,null,Ft(v,w=>{var b;return H(),pe("div",{class:"order",key:w.OrderID},[fe("label",{class:re(["status",w.Status])},null,2),fe("div",{class:re(["platform flex",(b=w.Player)==null?void 0:b.Status])},[fe("div",{class:re(["provider-icon",w.Type])},null,2),fe("div",bHe,je(u(w)),1)],2),fe("div",{class:"match",innerHTML:w.Match},null,8,wHe),fe("div",CHe,[fe("div",{class:"betname",innerHTML:w.Bet,style:{float:"left"}},null,8,EHe),fe("div",xHe,[fe("label",{innerHTML:w.Item},null,8,THe),ft("@"+je(w.Odds),1)])]),fe("div",AHe,"投注时间："+je(m(pt).formatDate(w.CreateAt)),1),fe("div",SHe,"投注金额："+je(w.BetMoney)+" 盈亏："+je(w.Money),1)])}),128))]))),128))],2)],64)}}}),PHe={key:0,class:"loseorder-container"},kHe={class:"loseorders"},IHe=["innerHTML"],BHe={class:"bet"},OHe=["innerHTML"],DHe={class:"team"},MHe={class:"time"},NHe={class:"info"},RHe={key:0},FHe=["onClick"],WHe=Se({__name:"LoseOrderView",setup(t){const e=jb(),r=Xn(),n=s=>{Lc.confirm("确认要删除补单吗？","补单删除",{confirmButtonText:"确定",cancelButtonText:"取消",type:"warning"}).then(()=>{e.removeOrder(s,!0)}).catch(()=>{})};return(s,o)=>m(e).orders.size!==0?(H(),pe("fieldset",PHe,[fe("legend",null,"补单队列 ("+je(m(e).orders.size)+"笔)",1),fe("div",kHe,[(H(!0),pe(nt,null,Ft(m(e).orders,([a,i])=>(H(),pe("div",{class:"order",key:a},[fe("div",{class:"match",innerHTML:i.match},null,8,IHe),fe("div",BHe,[fe("label",{innerHTML:i.bet},null,8,OHe),fe("label",DHe," => "+je(i.target),1)]),fe("div",MHe," 时间: "+je(m(pt).formatDate(i.createAt)),1),fe("div",NHe,[ft(" 补单金额："+je(i.getBetMoney(i.getOdds(m(r).config.makeProfit)))+"@"+je(i.getOdds(m(r).config.makeProfit)),1),i.betCount?(H(),pe("span",RHe," x "+je(i.betCount),1)):Re("",!0)]),fe("div",{class:"close am-icon-times",onClick:l=>n(a)},null,8,FHe)]))),128))])])):Re("",!0)}}),$He=Rl(WHe,[["__scopeId","data-v-6ad7135b"]]),LHe=["innerHTML"],UHe=["innerHTML"],VHe=Se({__name:"CreateLoseView",props:{match:{},bet:{},close:{type:Function}},setup(t){const e=oe(!0),r=Xn(),n=jb(),s=t;j(()=>s.bet?Math.max(...s.bet.items.map(l=>l.getOdds(Gn.Home))):0),j(()=>s.bet?Math.max(...s.bet.items.map(l=>l.getOdds(Gn.Away))):0);const o=l=>s.bet?Math.max(...s.bet.items.map(u=>u.getOdds(l))):0,a=fr({target:Gn.Home,betMoney:r.config.betMoney,profit:r.config.profit,odds:o(Gn.Home),betCount:1}),i=()=>{if(!s.match||!s.bet)return;const l=new eb(0,s.match.id,s.bet.id,a.target,a.betMoney,a.odds,s.match.title,s.bet.getBetName(),0,void 0,!0,a.betCount);n.createOrder(l),s.close()};return zt(()=>{}),(l,u)=>{const c=Ge("el-form-item"),d=Ge("el-radio"),f=Ge("el-radio-group"),p=Ge("el-input"),h=Ge("el-col"),g=Ge("el-row"),y=Ge("el-form"),v=Ge("el-button"),w=Ge("el-dialog");return H(),Fe(w,{modelValue:e.value,"onUpdate:modelValue":u[5]||(u[5]=b=>e.value=b),width:"400",title:"创建补单队列",onClosed:s.close},{footer:ne(()=>[X(v,{type:"primary",onClick:i},{default:ne(()=>u[8]||(u[8]=[ft("确定")])),_:1})]),default:ne(()=>[X(y,{"label-width":"60"},{default:ne(()=>[X(c,{label:"比赛:"},{default:ne(()=>{var b;return[fe("div",{innerHTML:(b=s.match)==null?void 0:b.title},null,8,LHe)]}),_:1}),X(c,{label:"盘口:"},{default:ne(()=>{var b;return[fe("div",{innerHTML:(b=s.bet)==null?void 0:b.getBetName()},null,8,UHe)]}),_:1}),X(c,{label:"投注:"},{default:ne(()=>[X(f,{modelValue:a.target,"onUpdate:modelValue":u[0]||(u[0]=b=>a.target=b),onChange:u[1]||(u[1]=b=>a.odds=o(a.target)+.5)},{default:ne(()=>[(H(!0),pe(nt,null,Ft(m(Gn),b=>(H(),Fe(d,{key:b,value:b},{default:ne(()=>[ft(je(b)+"("+je(o(b))+") ",1)]),_:2},1032,["value"]))),128))]),_:1},8,["modelValue"])]),_:1}),X(c,{label:"金额:"},{default:ne(()=>[X(g,null,{default:ne(()=>[X(h,{span:4},{default:ne(()=>[X(p,{modelValue:a.betMoney,"onUpdate:modelValue":u[2]||(u[2]=b=>a.betMoney=b)},null,8,["modelValue"])]),_:1}),X(h,{span:1}),X(h,{span:4},{default:ne(()=>u[6]||(u[6]=[ft("赔率:")])),_:1}),X(h,{span:5},{default:ne(()=>[X(p,{modelValue:a.odds,"onUpdate:modelValue":u[3]||(u[3]=b=>a.odds=b)},null,8,["modelValue"])]),_:1}),X(h,{span:1}),X(h,{span:4},{default:ne(()=>u[7]||(u[7]=[ft("次数:")])),_:1}),X(h,{span:4},{default:ne(()=>[X(p,{modelValue:a.betCount,"onUpdate:modelValue":u[4]||(u[4]=b=>a.betCount=b)},null,8,["modelValue"])]),_:1})]),_:1})]),_:1})]),_:1})]),_:1},8,["modelValue","onClosed"])}}}),zHe="2.0.229",yS={version:zHe},BX=yS==null?void 0:yS.version,jHe=["title"],HHe=Se({__name:"ExtensionsView",setup(t){const e=oe(),r=oe(),n=oe(),s=oe("当前已是最新版本"),o=oe(),a=()=>{e.value!==r.value&&window.open(`./extensions/${r.value}.zip`,"_blank")};zt(async()=>{var u;e.value=(u=await Yn.init())==null?void 0:u.version,r.value=await Vt.getVersion(),e.value!==r.value&&(n.value=`最新版本：${r.value}`),o.value=await Vt.getWebVersion(),o.value&&o.value!==BX&&(s.value=`最新版本：${o.value}`)});let i;const l=window.setInterval(()=>{document.title=`${i}.${Vt.counter.value}`},1e3);return xo(()=>{i=document.title}),Nu(()=>{document.title=i,window.clearInterval(l)}),(u,c)=>(H(),pe("div",{class:re(["version",{new:e.value!==r.value}]),title:n.value,onClick:a},je(e.value),11,jHe))}}),GHe=Rl(HHe,[["__scopeId","data-v-3ef2f431"]]),KHe={class:"item"},qHe={class:"item flex-1"},YHe={class:"item flex-1"},ZHe={class:"item"},JHe=Se({__name:"LimitDiagView",props:{provider:{},items:{},onClose:{type:Function}},setup(t){const e=["主队","客队"],r=t,n=oe(),s=fo(),o=j(()=>`${r.provider} - 限红调整`),a=i=>{r.provider&&(s.deleteLimit(r.provider,i),n.value=!1)};return zt(()=>{n.value=!0}),(i,l)=>{const u=Ge("el-button"),c=Ge("el-dialog");return r.items?(H(),Fe(c,{key:0,modelValue:n.value,"onUpdate:modelValue":l[0]||(l[0]=d=>n.value=d),title:o.value,onClosed:r.onClose,style:{width:"420px"}},{default:ne(()=>[(H(!0),pe(nt,null,Ft(r.items,(d,f)=>{var p,h,g;return H(),pe("div",{class:"items flex",key:d},[fe("div",KHe,je(e[f]),1),fe("div",qHe,"限红金额: "+je((h=(p=m(s).getLimit(i.provider,d))==null?void 0:p.value)==null?void 0:h.toFixed(2)),1),fe("div",YHe,"过期时间: "+je(m(pt).formatDate(((g=m(s).getLimit(i.provider,d))==null?void 0:g.expireTime)??0)||"N/A"),1),fe("div",ZHe,[X(u,{size:"small",type:"danger",class:"am-icon-times",onClick:y=>a(d),disabled:!m(s).getLimit(i.provider,d)},null,8,["onClick","disabled"])])])}),128))]),_:1},8,["modelValue","title","onClosed"])):Re("",!0)}}}),XHe={class:"common-layout"},QHe={class:"matchs"},eGe={class:"match-title"},tGe=["innerHTML"],rGe={class:"startTime"},nGe={class:"bets flex flex-wrap"},oGe=["onDblclick"],sGe={class:"bet-items"},aGe={key:0,class:"score"},iGe={class:"home"},lGe={class:"away"},uGe={key:1,class:"item flex defaultOdds"},cGe=["onClick"],dGe=["onDblclick","onClick"],fGe=["onDblclick","onClick"],pGe=Se({__name:"HomeView",setup(t){const e=fo(),r=Vg(),n=Io(),s=Xn(),o=oe(),a=oe(),i=oe(),l=()=>{a.value=!1},u=(w,b)=>{o.value=b,i.value=w,a.value=!0},c=w=>{const b=Math.max(...w.items.map(E=>E.homeOdds)),C=Math.max(...w.items.map(E=>E.awayOdds));return!b||!C?"N/A":pt.percent(1/(1/b+1/C))},d=(w,b)=>pt.toFixed(r.defaultOdds.get(`${w}:${b}`)??0),f=(w,b)=>{const C=d(w,Gn.Home),E=d(w,Gn.Away);if(!C||!E)return;const _=1/(1/C+1/E);return pt.percent(_/d(w,b),0)},p=async(w,b,C,E)=>{const _=n.getAccount(C.type,0);if(!_){Lc.alert("没有找到对应的账号",C.type);return}const A=Number(prompt("请输入要投注的金额","10"));if(!A)return;let T=new Tp(w,b,C,E,A);if(T=await n.checkBetting(_,T),!T.data){Lc.alert(T.checkError,"前置检查失败");return}return await n.betting(_,T)},h=oe(),g=oe(),y=oe(),v=(w,b)=>{g.value=w,y.value=b,h.value=!0};return xo(async()=>{await s.getUserInfo(),n.loadAccounts(!0)}),zt(async()=>{await r.initBetTarget()}),(w,b)=>{const C=Ge("el-aside"),E=Ge("el-header"),_=Ge("el-tag"),A=Ge("el-main"),T=Ge("el-container");return H(),pe(nt,null,[fe("div",XHe,[X(T,null,{default:ne(()=>[X(C,{width:"260px"},{default:ne(()=>[X(yHe),X($He),X(_He)]),_:1}),X(T,{height:"100%"},{default:ne(()=>[X(E,null,{default:ne(()=>[X(bDe),X(GHe)]),_:1}),X(A,null,{default:ne(()=>[fe("div",QHe,[(H(!0),pe(nt,null,Ft(m(r).matchs,S=>(H(),pe("div",{class:"match",key:S.id},[fe("div",eGe,[ft(" ["+je(S.game)+"] ",1),fe("label",{innerHTML:S.title},null,8,tGe),fe("label",rGe,je(m(pt).formatDate(S.startAt)),1)]),fe("div",nGe,[(H(!0),pe(nt,null,Ft(S.bets,B=>{var $,P,O,D,x;return H(),pe("div",{class:"bet",key:B.round},[B.isLive&&B.startTime?(H(),Fe(_,{key:0,class:"live",type:"warning",size:"small",effect:"dark",round:"true","disable-transitions":"true"},{default:ne(()=>[ft(je(m(pt).formatSecond((Date.now()-B.startTime)/1e3)),1)]),_:2},1024)):Re("",!0),fe("div",{class:"bet-title",onDblclick:I=>v(S,B)},je(B.getBetName())+" - "+je(c(B)),41,oGe),fe("div",sGe,[($=m(r).score.get(S.id))!=null&&$.score.has(B.round)?(H(),pe("div",aGe,[fe("div",iGe,je((O=(P=m(r).score.get(S.id))==null?void 0:P.score.get(B.round))==null?void 0:O.Home),1),fe("div",lGe,je((x=(D=m(r).score.get(S.id))==null?void 0:D.score.get(B.round))==null?void 0:x.Away),1)])):Re("",!0),d(B.id,m(Gn).Home)||d(B.id,m(Gn).Away)?(H(),pe("div",uGe,[b[0]||(b[0]=fe("div",{class:"item-type default"},null,-1)),(H(!0),pe(nt,null,Ft(m(Gn),I=>(H(),pe("div",{class:re(["item-odds",[I.toLowerCase(),{high:d(B.id,I)>2}]])},je(d(B.id,I))+" / "+je(f(B.id,I)),3))),256))])):Re("",!0),(H(!0),pe(nt,null,Ft(B.items,I=>(H(),pe("div",{class:"item flex",key:I.type},[fe("div",{class:re(["item-type provider-icon",[I.type,{limit:m(e).hasLimit(I.type,[I.homeId,I.awayId])}]]),onClick:F=>u(I.type,[I.homeId,I.awayId])},null,10,cGe),fe("div",{class:re(["item-odds home",{lock:!I.homeOdds,target:m(r).getBetTarget(I.type,B.id)===m(Gn).Home}]),onDblclick:F=>p(S,B,I,m(Gn).Home),onClick:F=>m(r).setBetTarget(I.type,B.id,m(Gn).Home)},je(I.homeOdds),43,dGe),fe("div",{class:re(["item-odds away",{lock:!I.awayOdds,target:m(r).getBetTarget(I.type,B.id)===m(Gn).Away}]),onDblclick:F=>p(S,B,I,m(Gn).Away),onClick:F=>m(r).setBetTarget(I.type,B.id,m(Gn).Away)},je(I.awayOdds),43,fGe)]))),128))])])}),128))])]))),128))])]),_:1})]),_:1})]),_:1})]),a.value?(H(),Fe(JHe,{key:0,provider:i.value,items:o.value,onClose:l},null,8,["provider","items"])):Re("",!0),h.value?(H(),Fe(VHe,{key:1,match:g.value,bet:y.value,close:()=>h.value=!1},null,8,["match","bet","close"])):Re("",!0)],64)}}}),hGe=Rl(pGe,[["__scopeId","data-v-afe46f0f"]]),gGe={class:"container flex flex-middle flex-column"},mGe={class:"loginbox"},yGe=Se({__name:"LoginView",setup(t){const e=Xn(),r=oe({userName:localStorage.getItem(vK)||"",password:""}),n=oe(!1),s=async()=>{try{n.value=!0,await e.login(r.value.userName,r.value.password)}finally{n.value=!1}};return(o,a)=>{const i=Ge("el-input"),l=Ge("el-form-item"),u=Ge("el-button"),c=Ge("el-form");return H(),pe("div",gGe,[a[4]||(a[4]=fe("div",{class:"slogo"},null,-1)),fe("div",mGe,[X(c,{modelValue:r.value,"onUpdate:modelValue":a[2]||(a[2]=d=>r.value=d)},{default:ne(()=>[X(l,null,{default:ne(()=>[X(i,{modelValue:r.value.userName,"onUpdate:modelValue":a[0]||(a[0]=d=>r.value.userName=d),size:"large",placeholder:"用户名"},null,8,["modelValue"])]),_:1}),X(l,null,{default:ne(()=>[X(i,{type:"password","show-password":"",modelValue:r.value.password,"onUpdate:modelValue":a[1]||(a[1]=d=>r.value.password=d),size:"large",placeholder:"密码"},null,8,["modelValue"])]),_:1}),X(l,null,{default:ne(()=>[X(u,{size:"large",onClick:s,style:{width:"100%"},type:"primary",disabled:!r.value.userName||!r.value.password||n.value},{default:ne(()=>a[3]||(a[3]=[ft("登录")])),_:1},8,["disabled"])]),_:1})]),_:1},8,["modelValue"])])])}}}),JC=x4e({history:Qke("./"),routes:[{path:"/",name:"home",component:hGe},{path:"/login",name:"login",component:yGe}]}),Xn=mh("user",()=>{const t=oe(new D8),e=oe(),r=oe(),n=oe(),s=oe(),o=oe(),a=oe(),i=oe();j(()=>`USER:${r.value??0}`);const l=oe(new Map),u=Io(),c=Tf(),d=async y=>{try{const v=await Vt.getUserInfo(),w=v.data;if(!w.success)return;r.value=w.info.ID,n.value=w.info.UserName,o.value=w.info.Setting,t.value=await Vt.getUserConfig(),a.value=await Vt.getFollowConfig();const b=await Vt.getData("PROXY");l.value=new Map,b&&b.forEach(E=>{l.value.set(E.proxyId,E)});const C=await Vt.getData("Message");C&&(s.value=C.telegramId,i.value=C.pushOrderId),$8e(r.value),await c.init()}finally{}},f=async()=>{await Vt.saveData("PROXY",JSON.stringify([...l.value.values()]))};return{config:t,today:e,userId:r,userName:n,setting:o,follow:a,telegramId:s,pushOrderId:i,getUserInfo:d,login:async(y,v)=>{const w=await Vt.login(y,v);return w&&w.success===1?(localStorage.setItem(Hg,w.info.token),localStorage.setItem(vK,y),JC.replace({name:"home"}),!0):!1},logout:async()=>{try{await Vt.logout(),localStorage.removeItem(Hg)}finally{z8e(r.value),r.value=void 0,n.value=void 0,s.value=void 0,i.value=void 0}JC.replace({name:"login"})},proxylist:l,saveProxyConfig:f,deleteProxyConfig:async y=>{const v=u.accounts.find(w=>w.proxyId===y);return v?(no.error(`当前代理正在被 ${u.getPlatform(v.platformId)}/${v.playerName} 使用`),!1):(l.value.delete(y),await f(),!0)}}});var Cr=(t=>(t[t.axios=0]="axios",t[t.http=1]="http",t))(Cr||{});const vS=localStorage.getItem("PROXY")??"https://47.115.75.57",mr={get:async(t,e,r,n=0,s=!1)=>{const o=Xn();if(r||(r={}),r.headers||(r.headers={}),t.proxyId&&!s){const a=o.proxylist.get(t.proxyId);r!=null&&r.headers&&(r.headers["x-proxy"]=a==null?void 0:a.url,r.headers["x-proxy-url"]=e,t.referer&&(r.headers["x-proxy-referer"]=t.referer),t.userAgent&&(r.headers["x-proxy-useragent"]=t.userAgent)),e=vS}else s=!0;return r.validateStatus=a=>![500,504].includes(a),r.timeout=15e3,n===0||!s?await Nr.get(e,r):await Yn.get(e,r)},post:async(t,e,r,n,s=0,o=!1)=>{const a=Xn();if(n||(n={}),n.headers||(n.headers={}),t.proxyId&&!o){const i=a.proxylist.get(t.proxyId);n!=null&&n.headers&&(n.headers["x-proxy"]=i==null?void 0:i.url,n.headers["x-proxy-url"]=e,t.referer&&(n.headers["x-proxy-referer"]=t.referer),t.userAgent&&(n.headers["x-proxy-useragent"]=t.userAgent)),e=vS}else o=!0;return n.validateStatus=i=>![500,504].includes(i),n.timeout=15e3,s===0||!o?await Nr.post(e,r,n):await Yn.post(e,r,n)},test:async t=>{const e=Date.now(),r="https://api.a8.to/IP";try{const n=await Nr.get(vS,{headers:{"x-proxy":t,"x-proxy-url":r}});if(n.status===200){const s=n.data;return{delay:Date.now()-e,ip:s.info.IP,address:s.info.Address}}return}catch{return}}};var $m=TypeError;const vGe={},bGe=Object.freeze(Object.defineProperty({__proto__:null,default:vGe},Symbol.toStringTag,{value:"Module"})),KI=kV(bGe);var ZD=typeof Map=="function"&&Map.prototype,bS=Object.getOwnPropertyDescriptor&&ZD?Object.getOwnPropertyDescriptor(Map.prototype,"size"):null,XC=ZD&&bS&&typeof bS.get=="function"?bS.get:null,n7=ZD&&Map.prototype.forEach,JD=typeof Set=="function"&&Set.prototype,wS=Object.getOwnPropertyDescriptor&&JD?Object.getOwnPropertyDescriptor(Set.prototype,"size"):null,QC=JD&&wS&&typeof wS.get=="function"?wS.get:null,o7=JD&&Set.prototype.forEach,wGe=typeof WeakMap=="function"&&WeakMap.prototype,hv=wGe?WeakMap.prototype.has:null,CGe=typeof WeakSet=="function"&&WeakSet.prototype,gv=CGe?WeakSet.prototype.has:null,EGe=typeof WeakRef=="function"&&WeakRef.prototype,s7=EGe?WeakRef.prototype.deref:null,xGe=Boolean.prototype.valueOf,TGe=Object.prototype.toString,AGe=Function.prototype.toString,SGe=String.prototype.match,XD=String.prototype.slice,jd=String.prototype.replace,_Ge=String.prototype.toUpperCase,a7=String.prototype.toLowerCase,OX=RegExp.prototype.test,i7=Array.prototype.concat,uu=Array.prototype.join,PGe=Array.prototype.slice,l7=Math.floor,qI=typeof BigInt=="function"?BigInt.prototype.valueOf:null,CS=Object.getOwnPropertySymbols,YI=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?Symbol.prototype.toString:null,nm=typeof Symbol=="function"&&typeof Symbol.iterator=="object",mv=typeof Symbol=="function"&&Symbol.toStringTag&&(typeof Symbol.toStringTag===nm||!0)?Symbol.toStringTag:null,DX=Object.prototype.propertyIsEnumerable,u7=(typeof Reflect=="function"?Reflect.getPrototypeOf:Object.getPrototypeOf)||([].__proto__===Array.prototype?function(t){return t.__proto__}:null);function c7(t,e){if(t===1/0||t===-1/0||t!==t||t&&t>-1e3&&t<1e3||OX.call(/e/,e))return e;var r=/[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;if(typeof t=="number"){var n=t<0?-l7(-t):l7(t);if(n!==t){var s=String(n),o=XD.call(e,s.length+1);return jd.call(s,r,"$&_")+"."+jd.call(jd.call(o,/([0-9]{3})/g,"$&_"),/_$/,"")}}return jd.call(e,r,"$&_")}var ZI=KI,d7=ZI.custom,f7=RX(d7)?d7:null,MX={__proto__:null,double:'"',single:"'"},kGe={__proto__:null,double:/(["\\])/g,single:/(['\\])/g
    },
    jx=function t(e,
    r,
    n,
    s){
      var o=r||{
      };
      if(ic(o,
      "quoteStyle")&&!ic(MX,
      o.quoteStyle))throw new TypeError('option "quoteStyle" must be "single" or "double"');
      if(ic(o,
      "maxStringLength")&&(typeof o.maxStringLength=="number"?o.maxStringLength<0&&o.maxStringLength!==1/0:o.maxStringLength!==null))throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
      var a=ic(o,
      "customInspect")?o.customInspect:!0;
      if(typeof a!="boolean"&&a!=="symbol")throw new TypeError("option \"customInspect\", if provided, must be `true`, `false`, or `'symbol'`");
      if(ic(o,
      "indent")&&o.indent!==null&&o.indent!=="	"&&!(parseInt(o.indent,
      10)===o.indent&&o.indent>0))throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
      if(ic(o,
      "numericSeparator")&&typeof o.numericSeparator!="boolean")throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
      var i=o.numericSeparator;
      if(typeof e>"u")return"undefined";
      if(e===null)return"null";
      if(typeof e=="boolean")return e?"true":"false";
      if(typeof e=="string")return WX(e,
      o);
      if(typeof e=="number"){
        if(e===0)return 1/0/e>0?"0":"-0";
        var l=String(e);
        return i?c7(e,
        l):l
      }
      if(typeof e=="bigint"){
        var u=String(e)+"n";
        return i?c7(e,
        u):u
      }
      var c=typeof o.depth>"u"?5:o.depth;
      if(typeof n>"u"&&(n=0),
      n>=c&&c>0&&typeof e=="object")return JI(e)?"[Array]":"[Object]";
      var d=KGe(o,
      n);
      if(typeof s>"u")s=[];
      else if(FX(s,
      e)>=0)return"[Circular]";
      function f(O,
      D,
      x){
        if(D&&(s=PGe.call(s),
        s.push(D)),
        x){
          var I={
            depth:o.depth
          };
          return ic(o,
          "quoteStyle")&&(I.quoteStyle=o.quoteStyle),
          t(O,
          I,
          n+1,
          s)
        }
        return t(O,
        o,
        n+1,
        s)
      }
      if(typeof e=="function"&&!p7(e)){
        var p=WGe(e),
        h=Sw(e,
        f);
        return"[Function"+(p?": "+p:" (anonymous)")+"]"+(h.length>0?" { "+uu.call(h,
        ", ")+" }":"")
      }
      if(RX(e)){
        var g=nm?jd.call(String(e),
        /^(Symbol\(.*\))_[^)]*$/,
        "$1"):YI.call(e);
        return typeof e=="object"&&!nm?ay(g):g
      }
      if(jGe(e)){
        for(var y="<"+a7.call(String(e.nodeName)),
        v=e.attributes||[],
        w=0;
        w<v.length;
        w++)y+=" "+v[w].name+"="+NX(IGe(v[w].value),
        "double",
        o);
        return y+=">",
        e.childNodes&&e.childNodes.length&&(y+="..."),
        y+="</"+a7.call(String(e.nodeName))+">",
        y
      }
      if(JI(e)){
        if(e.length===0)return"[]";
        var b=Sw(e,
        f);
        return d&&!GGe(b)?"["+XI(b,
        d)+"]":"[ "+uu.call(b,
        ", ")+" ]"
      }
      if(OGe(e)){
        var C=Sw(e,
        f);
        return!("cause"in Error.prototype)&&"cause"in e&&!DX.call(e,
        "cause")?"{ ["+String(e)+"] "+uu.call(i7.call("[cause]: "+f(e.cause),
        C),
        ", ")+" }":C.length===0?"["+String(e)+"]":"{ ["+String(e)+"] "+uu.call(C,
        ", ")+" }"
      }
      if(typeof e=="object"&&a){
        if(f7&&typeof e[f7]=="function"&&ZI)return ZI(e,
        {
          depth:c-n
        });
        if(a!=="symbol"&&typeof e.inspect=="function")return e.inspect()
      }
      if($Ge(e)){
        var E=[];
        return n7&&n7.call(e,
        function(O,
        D){
          E.push(f(D,
          e,
          !0)+" => "+f(O,
          e))
        }),
        h7("Map",
        XC.call(e),
        E,
        d)
      }
      if(VGe(e)){
        var _=[];
        return o7&&o7.call(e,
        function(O){
          _.push(f(O,
          e))
        }),
        h7("Set",
        QC.call(e),
        _,
        d)
      }
      if(LGe(e))return ES("WeakMap");
      if(zGe(e))return ES("WeakSet");
      if(UGe(e))return ES("WeakRef");
      if(MGe(e))return ay(f(Number(e)));
      if(RGe(e))return ay(f(qI.call(e)));
      if(NGe(e))return ay(xGe.call(e));
      if(DGe(e))return ay(f(String(e)));
      if(typeof window<"u"&&e===window)return"{ [object Window] }";
      if(typeof globalThis<"u"&&e===globalThis||typeof go<"u"&&e===go)return"{ [object globalThis] }";
      if(!BGe(e)&&!p7(e)){
        var A=Sw(e,
        f),
        T=u7?u7(e)===Object.prototype:e instanceof Object||e.constructor===Object,
        S=e instanceof Object?"":"null prototype",
        B=!T&&mv&&Object(e)===e&&mv in e?XD.call(If(e),
        8,
        -1):S?"Object":"",
        $=T||typeof e.constructor!="function"?"":e.constructor.name?e.constructor.name+" ":"",
        P=$+(B||S?"["+uu.call(i7.call([],
        B||[],
        S||[]),
        ": ")+"] ":"");
        return A.length===0?P+"{}":d?P+"{"+XI(A,
        d)+"}":P+"{ "+uu.call(A,
        ", ")+" }"
      }
      return String(e)
    };
    function NX(t,
    e,
    r){
      var n=r.quoteStyle||e,
      s=MX[n];
      return s+t+s
    }
    function IGe(t){
      return jd.call(String(t),
      /"/g,"&quot;
      ")}function Ph(t){return!mv||!(typeof t=="object"&&(mv in t||typeof t[mv]<"u"))}function JI(t){return If(t)==="[object Array]"&&Ph(t)}function BGe(t){return If(t)==="[object Date]"&&Ph(t)}function p7(t){return If(t)==="[object RegExp]"&&Ph(t)}function OGe(t){return If(t)==="[object Error]"&&Ph(t)}function DGe(t){return If(t)==="[object String]"&&Ph(t)}function MGe(t){return If(t)==="[object Number]"&&Ph(t)}function NGe(t){return If(t)==="[object Boolean]"&&Ph(t)}function RX(t){if(nm)return t&&typeof t=="object"&&t instanceof Symbol;if(typeof t=="symbol")return!0;if(!t||typeof t!="object"||!YI)return!1;try{return YI.call(t),!0}catch{}return!1}function RGe(t){if(!t||typeof t!="object"||!qI)return!1;try{return qI.call(t),!0}catch{}return!1}var FGe=Object.prototype.hasOwnProperty||function(t){return t in this};function ic(t,e){return FGe.call(t,e)}function If(t){return TGe.call(t)}function WGe(t){if(t.name)return t.name;var e=SGe.call(AGe.call(t),/^function\s*([\w$]+)/);return e?e[1]:null}function FX(t,e){if(t

// ---- 应用启动与插件检测 / anchor 2: gB=kL / approx line 54535 ----
       e
        }
        = (.+);
        `);if(!r.test(t))return;const n=r.exec(t);if(n)return n[1]},ks=Xt.SABA;let wee=[];const MQe={20:"Moneyline",9001:"Map X Moneyline"},NQe=t=>{if(!t)return;const e=t.gameId;if(!e||!wee.includes(e.toString()))return;const r=Date.now();if(!(t.kickofftime>r/1e3+3600))return{SourceMatchID:t.matchid,SourceGameID:e,Type:ks,StartTime:t.kickofftime*1e3,HomeID:t.homeid,Home:t.hteamnamecn,AwayID:t.awayid,Away:t.ateamnamecn,Teams:[{TeamID:t.homeid,Type:ks,GameID:e,Name:t.hteamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.homeid}&ha=h`},{TeamID:t.awayid,Type:ks,GameID:e,Name:t.ateamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.awayid}&ha=a`}]}},RQe=(t,e)=>{if(!t)return;const r=MQe[t.bettype];if(!r)return;const n=t.resourceid&&Number(t.resourceid)||0,s=`${t.oddsid}:Home`,o=Pr.convertMyToEU(t.odds1a),a=`${t.oddsid}:Away`,i=Pr.convertMyToEU(t.odds2a),l=t.oddsstatus!=="running",u=fo();return u.save(ks,new Jn(s,o,l)),u.save(ks,new Jn(a,i,l)),{Type:ks,SourceMatchID:t.matchid,SourceBetID:t.oddsid,Map:n,BetName:r.replace("Map X",`Map ${n}`),SourceHomeID:s,HomeName:e.Home,HomeOdds:o,SourceAwayID:a,AwayName:e.Away,AwayOdds:i,Status:l?"Locked":"Normal"}},f6="SABA:CONTENT",FQe=()=>sessionStorage.getItem(f6),WQe=t=>{t&&sessionStorage.setItem(f6,t)},$Qe=()=>{sessionStorage.removeItem(f6)},LQe=async()=>{var c,d,f,p;const t=await Vt.getPlatform(Xt.SABA);if(!t)return;wee=t.games;let e=FQe();const r=`${t.gateway}/${t.token}/ESports/43/ALL?mode=m0&market=L`;if(e||(e=(await Yn.get(r)).data,WQe(e)),!e)return;const n=$w(e,"url");if(!n)return;const s=(c=DQe.parse(n))==null?void 0:c.p,o=(d=$w(e,"id"))==null?void 0:d.replace(/\"/g,"");if(!o)return;const a=(f=$w(e,"logo"))==null?void 0:f.replace(/\"/g,"");if(!a)return;const i=$w(e,"account");if(!i)return;const l=JSON.parse(i),u=(p=l==null?void 0:l.pnv)==null?void 0:p.tk;if(u)return{gateway:r,url:s,gid:pt.uuid("N").substring(0,16),token:u,id:o,rid:"1",ext:1,logo:a,config:t}},UQe=async()=>{const e=Io().accounts.find(r=>r.provider===Xt.SABA);e&&await Vt.updatePlatform({provider:Xt.SABA,token:e.token,gateway:e.gateway})},Lw=[],wy=new Map,r0=new Map,Uw=new Map,U2=async()=>{if(!Io().accounts.some(l=>l.provider===Xt.SABA)){await pt.wait(60*1e3),await U2();return}const r=await LQe();if(!r){Bc.error(`${ks}配置读取失败，等待60秒后重试`),await UQe(),await pt.wait(60*1e3),await U2();return}console.log(ks,r);const n=fo(),s=Tf(),o=new URL(r.gateway),a=G0(`wss://${r.url}`,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${o.host}`},query:{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext}});a.on("connect",()=>{a.emit("init",{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext,dr:"transport close",rc:1,v:2}),a.on("init",h=>{console.log(`SABA init 链接成功 => ${JSON.stringify(h)}`),a.emit("subscribe",u)});const u=[["odds",{spread:[{id:"c0",rev:"DM4WT",sorting:0,condition:{},r:"c1627df7-r3928",p:"d530b060d500b34b-b2074"}],odds:[{id:"c2",rev:"Gwz9v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"},{id:"c4",rev:"Gwz0v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"}]}.odds]];a.on("err",h=>{Bc.error(`${ks}连接发生错误:${h}`),$Qe(),a.disconnect()}),a.on("disconnectReason",h=>{Bc.error(`${ks}链接断开:${h}`),a.disconnect()});const c=h=>{const[g,...y]=h,v={};for(let w=0;w<y.length;w+=2){const b=y[w],C=y[w+1];v[Lw[b]??b]=C}return v},d=h=>{var C;const[g,...y]=h;if(g!=="m")return;const v={};for(let E=1;E<h.length;E+=2){const _=h[E],A=h[E+1];v[Lw[_]??_]=A}const w=v.matchid;if(w)if(!r0.has(w))r0.set(w,v);else{const E=r0.get(w);Object.keys(v).forEach(_=>{E[_]=v[_]})}if(!w)return;const b=r0.get(w);if(b!=null&&b.leagueid){const E=(C=wy.get(b.leagueid))==null?void 0:C.leaguegroupid;E&&(b.gameId=E)}return b},f=h=>{const[g,...y]=h;if(g!=="l")return;const v={};for(let b=1;b<h.length;b+=2){const C=h[b],E=h[b+1];v[Lw[C]??C]=E}const w=v.leagueid;if(w)if(!wy.has(w))wy.set(w,v);else{const b=wy.get(w);Object.keys(v).forEach(C=>{b[C]=v[C]})}return w&&wy.get(w)||void 0},p=h=>{const g=c(h),y=g.oddsid;if(y){const v=Uw.get(y);v?Object.keys(g).forEach(w=>{v[w]=g[w]}):Uw.set(y,g)}else return;return Uw.get(y)};a.on("m",async(h,g,y)=>{g.forEach(async v=>{const[w,...b]=v;switch(w){case"c":break;case"f":const[C,E]=b;E.forEach((_,A)=>{const T=C+A;Lw[T]=_});break;case 0:switch(b[0]){case"reset":r0.clear();break;case"done":const _=[];r0.forEach(A=>{const T=NQe(A);T&&_.push(T)}),await s.saveMatch(ks,_),_.forEach(A=>{const T=[];[...Uw.values()].filter(S=>S.matchid===A.SourceMatchID).forEach(S=>{const B=RQe(S,A);B&&T.push(B)}),s.saveBets(ks,A.SourceMatchID,T)});break;case"l":f(b);break;case"m":d(b);break;case"-m":{const A=d(b);A==null||A.matchid}break;case"o":{const A=p(b),T=(A==null?void 0:A.oddsstatus)!=="running";A!=null&&A.oddsid&&(A!=null&&A.odds1a)&&n.save(ks,new Jn(`${A.oddsid}:Home`,Pr.convertMyToEU(A.odds1a),T,A.oddsid)),A!=null&&A.oddsid&&(A!=null&&A.odds2a)&&n.save(ks,new Jn(`${A.oddsid}:Away`,Pr.convertMyToEU(A.odds2a),T,A.oddsid))}break;case"-o":{const A=p(b),T=A==null?void 0:A.oddsid;T&&n.updateBetLock(ks,T,!0)}break}break}})})});const i=Date.now();for(;;)if(await pt.wait(3e3),await VQe(r.config),a.connected){Date.now()-i>300*1e3&&a.disconnect();continue}else if(a.disconnected){n.clean(ks);break}await U2()},VQe=async t=>{const e=`${t.gateway}/${t.token}/LoginCheckin/Index`;await Yn.post(e,null,{headers:{username:""}})},Qa=Xt.IMT;let Ba;const zQe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},o$=t=>`https://ipis-cdn.kemehkemeh.xyz/TeamImage/${t}.png`,jQe=t=>{if(!t||t.length!==2)return 0;const e=/gamenr=(\d)/;if(!e.test(t[0].s))return 0;const r=e.exec(t[0].s);return r?Number(r[1]):0},Cee=t=>{if(!t)return;const e=zQe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}};let V2;const HQe=async()=>{if(!Ba||!fb)return;const t=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/GetAllLiveEvents`,e={AllLiveEventsRequestGroups:fb.games.map(o=>({SportId:Number(o),EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),IsCombo:!1,OddsType:3,BetTypes:[283],Periods:[1],SortingType:2,PanelType:2},r=await mr.post(Ba,t,e,{headers:Cee(Ba)},Cr.http),n=r.data;if((n==null?void 0:n.StatusCode)!==100)return;const s=[];return n.d&&(V2=n.d),n.ale.forEach(o=>{o.sels.forEach(a=>{const i=`${a.st}:${a.eid}`,l=[];a.mls.forEach(u=>{if(!u.ws||u.ws.length!==2)return;const c=u.ws.find(h=>h.si===707),d=u.ws.find(h=>h.si===708);if(!c||!d)return;const f=jQe(u.ws);if(f===0)return;const p=`${f}:${u.bti}:${u.mi}`;l.push({Type:Qa,SourceMatchID:i,SourceBetID:p,SourceHomeID:`${c.si}:${c.wsi}`,HomeName:a.htn,HomeOdds:c.o,SourceAwayID:`${d.si}:${d.wsi}`,AwayName:a.atn,AwayOdds:d.o,BetName:u.btn,Map:f,Status:u.il?"Locked":"Normal"})}),s.push({SourceMatchID:i,SourceGameID:a.st,Type:Qa,StartTime:new Date(a.edt).getTime(),HomeID:a.htid,Home:a.htn,AwayID:a.atid,Away:a.atn,Teams:[{Type:Qa,TeamID:a.htid,Name:a.htn,GameID:a.st,Logo:o$(a.htid)},{Type:Qa,TeamID:a.atid,Name:a.atn,GameID:a.st,Logo:o$(a.atid)}],Bets:l})})}),s},GQe=async()=>{const t=fo();if(!V2||!fb||!Ba||z2.length===0){t.clean(Qa);return}const e={AllLiveEventsDeltaRequestGroups:z2.map(o=>({SportId:o,EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),CompetitionIds:[],SortingType:2,Delta:V2,BetTypes:[283],Periods:[1],OddsType:3,SportIds:z2,IsCombo:!1,PanelType:2},r=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta`,n=await mr.post(Ba,r,e,{headers:Cee(Ba)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){t.clean(Qa);return}V2=s.Delta,s.dc.forEach(o=>{o.v.forEach(a=>{a.ws.forEach(i=>{const l=`${i.si}:${i.wsi}`;t.save(Qa,new Jn(l,i.o,a.il))})})})};let fb=null,s$=0,z2=[];const Eee=async()=>{try{if(fb=await Vt.getPlatform(Qa),!fb)return;Ba=Io().accounts.find(n=>n.provider===Qa&&n.balance!==void 0);const t=fo(),e=Tf();if(!Ba){console.log(Qa,"当前未检测到账号"),t.clean(Qa),await pt.wait(3*1e3);return}if(Date.now()-s$>60*1e3){const n=await HQe();if(!n)return;await e.saveMatch(Qa,n)&&n.forEach(async s=>{s.Bets&&await e.saveBets(Qa,s.SourceMatchID,s.Bets)}),z2=[...new Set(n.map(s=>s.SourceGameID))],s$=Date.now()}await GQe()}finally{await pt.wait(1e3),Eee()}},Vw=Xt.XBet,KQe=async()=>{const t=fo(),e=Vg();ph["XBet:Score"]=r=>{console.log(Vw,r),e.updateScore(Xt.XBet,r)},ph[Vw]=r=>{r.bets.forEach(s=>{const o=`${s.betId}:1`,a=`${s.betId}:3`;t.save(Vw,new Jn(o,s.home,!1)),t.save(Vw,new Jn(a,s.away,!1))})}},gB=kL(sJe).use(Yre());gB.use(JC).use(Cke);const qQe=t=>{if(!t)return;const e=document.getElementById("app");e&&(document.body.classList.add("checking"),e.innerHTML=`<h1>插件检测中...</h1> <a href="./extensions/${t}.zip" target="_blank">下载插件</a>`)},YQe=async()=>{const t=await Nr.get(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`),e=t.data.version;for(let r=0;r<10;r++){const n=await Yn.init();if(n){const s=`${n.name} ${n.version}`;document.body.classList.remove("checking"),no({message:s,type:"success",dangerouslyUseHTMLString:!0,duration:5*1e3}),document.title=s,n.error?Lc.alert(`${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>`,"插件发生错误",{type:"error",showConfirmButton:!1,dangerouslyUseHTMLString:!0,draggable:!0}):(gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),gB.mount("#app"));break}qQe(e),await pt.wait(3e3)}};YQe()});export default ZQe();
        