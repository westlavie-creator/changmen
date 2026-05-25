// ---- OB 平台逻辑 / anchor 1: const IMe=Xt.OB / approx line 27773 ----
n(rD))),s=e(zc()),o=(0,s.default)("mqttjs:tls"),a=(i,l)=>{l.port=l.port||8883,l.host=l.hostname||l.host||"localhost",n.default.isIP(l.host)===0&&(l.servername=l.host),l.rejectUnauthorized=l.rejectUnauthorized!==!1,delete l.path,o("port %d host %s rejectUnauthorized %b",l.port,l.host,l.rejectUnauthorized);let u=r.default.connect(l);u.on("secureConnect",()=>{l.rejectUnauthorized&&!u.authorized?u.emit("error",new Error("TLS not authorized")):u.removeListener("error",c)});function c(d){l.rejectUnauthorized&&i.emit("error",d),u.end()}return u.on("error",c),u};t.default=a}),Z5=Dt(t=>{wt(),Et(),Ct(),Object.defineProperty(t,"__esModule",{value:!0});var e=(ms(),In(gs)),r=Ah(),n=tD(),s,o,a;function i(){let f=new r.Transform;return f._write=(p,h,g)=>{s.send({data:p.buffer,success(){g()},fail(y){g(new Error(y))}})},f._flush=p=>{s.close({success(){p()}})},f}function l(f){f.hostname||(f.hostname="localhost"),f.path||(f.path="/"),f.wsOptions||(f.wsOptions={})}function u(f,p){let h=f.protocol==="wxs"?"wss":"ws",g=`${h}://${f.hostname}${f.path}`;return f.port&&f.port!==80&&f.port!==443&&(g=`${h}://${f.hostname}:${f.port}${f.path}`),typeof f.transformWsUrl=="function"&&(g=f.transformWsUrl(g,f,p)),g}function c(){s.onOpen(()=>{a.socketReady()}),s.onMessage(f=>{let{data:p}=f;p instanceof ArrayBuffer?p=e.Buffer.from(p):p=e.Buffer.from(p,"utf8"),o.push(p)}),s.onClose(()=>{a.emit("close"),a.end(),a.destroy()}),s.onError(f=>{let p=new Error(f.errMsg);a.destroy(p)})}var d=(f,p)=>{if(p.hostname=p.hostname||p.host,!p.hostname)throw new Error("Could not determine host. Specify host manually.");let h=p.protocolId==="MQIsdp"&&p.protocolVersion===3?"mqttv3.1":"mqtt";l(p);let g=u(p,f);s=wx.connectSocket({url:g,protocols:[h]}),o=i(),a=new n.BufferedDuplex(p,o,s),a._destroy=(v,w)=>{s.close({success(){w&&w(v)}})};let y=a.destroy;return a.destroy=(v,w)=>(a.destroy=y,setTimeout(()=>{s.close({fail(){a._destroy(v,w)}})},0),a),c(),a};t.default=d}),J5=Dt(t=>{wt(),Et(),Ct(),Object.defineProperty(t,"__esModule",{value:!0});var e=(ms(),In(gs)),r=Ah(),n=tD(),s,o,a,i=!1;function l(){let p=new r.Transform;return p._write=(h,g,y)=>{s.sendSocketMessage({data:h.buffer,success(){y()},fail(){y(new Error)}})},p._flush=h=>{s.closeSocket({success(){h()}})},p}function u(p){p.hostname||(p.hostname="localhost"),p.path||(p.path="/"),p.wsOptions||(p.wsOptions={})}function c(p,h){let g=p.protocol==="alis"?"wss":"ws",y=`${g}://${p.hostname}${p.path}`;return p.port&&p.port!==80&&p.port!==443&&(y=`${g}://${p.hostname}:${p.port}${p.path}`),typeof p.transformWsUrl=="function"&&(y=p.transformWsUrl(y,p,h)),y}function d(){i||(i=!0,s.onSocketOpen(()=>{a.socketReady()}),s.onSocketMessage(p=>{if(typeof p.data=="string"){let h=e.Buffer.from(p.data,"base64");o.push(h)}else{let h=new FileReader;h.addEventListener("load",()=>{let g=h.result;g instanceof ArrayBuffer?g=e.Buffer.from(g):g=e.Buffer.from(g,"utf8"),o.push(g)}),h.readAsArrayBuffer(p.data)}}),s.onSocketClose(()=>{a.end(),a.destroy()}),s.onSocketError(p=>{a.destroy(p)}))}var f=(p,h)=>{if(h.hostname=h.hostname||h.host,!h.hostname)throw new Error("Could not determine host. Specify host manually.");let g=h.protocolId==="MQIsdp"&&h.protocolVersion===3?"mqttv3.1":"mqtt";u(h);let y=c(h,p);return s=h.my,s.connectSocket({url:y,protocols:g}),o=l(),a=new n.BufferedDuplex(h,o,s),d(),a};t.default=f}),_Me=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__importDefault||function(d){return d&&d.__esModule?d:{default:d}};Object.defineProperty(t,"__esModule",{value:!0}),t.connectAsync=void 0;var r=e(zc()),n=e((TMe(),In(Iq))),s=e(fk()),o=e(fx());typeof(vn==null?void 0:vn.nextTick)!="function"&&(vn.nextTick=setImmediate);var a=(0,r.default)("mqttjs"),i=null;function l(d){let f;d.auth&&(f=d.auth.match(/^(.+):(.+)$/),f?(d.username=f[1],d.password=f[2]):d.username=d.auth)}function u(d,f){var p,h,g,y;if(a("connecting to an MQTT broker..."),typeof d=="object"&&!f&&(f=d,d=""),f=f||{},d&&typeof d=="string"){let b=n.default.parse(d,!0),C={};if(b.port!=null&&(C.port=Number(b.port)),C.host=b.hostname,C.query=b.query,C.auth=b.auth,C.protocol=b.protocol,C.path=b.path,C.protocol=(p=C.protocol)===null||p===void 0?void 0:p.replace(/:$/,""),f=Object.assign(Object.assign({},C),f),!f.protocol)throw new Error("Missing protocol")}if(f.unixSocket=f.unixSocket||((h=f.protocol)===null||h===void 0?void 0:h.includes("+unix")),f.unixSocket?f.protocol=f.protocol.replace("+unix",""):!(!((g=f.protocol)===null||g===void 0)&&g.startsWith("ws"))&&!(!((y=f.protocol)===null||y===void 0)&&y.startsWith("wx"))&&delete f.path,l(f),f.query&&typeof f.query.clientId=="string"&&(f.clientId=f.query.clientId),f.cert&&f.key)if(f.protocol){if(["mqtts","wss","wxs","alis"].indexOf(f.protocol)===-1)switch(f.protocol){case"mqtt":f.protocol="mqtts";break;case"ws":f.protocol="wss";break;case"wx":f.protocol="wxs";break;case"ali":f.protocol="alis";break;default:throw new Error(`Unknown protocol for secure connection: "${f.protocol}"!`)}}else throw new Error("Missing secure protocol key");if(i||(i={},!o.default&&!f.forceNativeWebSocket?(i.ws=sw().streamBuilder,i.wss=sw().streamBuilder,i.mqtt=q5().default,i.tcp=q5().default,i.ssl=Y5().default,i.tls=i.ssl,i.mqtts=Y5().default):(i.ws=sw().browserStreamBuilder,i.wss=sw().browserStreamBuilder,i.wx=Z5().default,i.wxs=Z5().default,i.ali=J5().default,i.alis=J5().default)),!i[f.protocol]){let b=["mqtts","wss"].indexOf(f.protocol)!==-1;f.protocol=["mqtt","mqtts","ws","wss","wx","wxs","ali","alis"].filter((C,E)=>b&&E%2===0?!1:typeof i[C]=="function")[0]}if(f.clean===!1&&!f.clientId)throw new Error("Missing clientId for unclean clients");f.protocol&&(f.defaultProtocol=f.protocol);function v(b){return f.servers&&((!b._reconnectCount||b._reconnectCount===f.servers.length)&&(b._reconnectCount=0),f.host=f.servers[b._reconnectCount].host,f.port=f.servers[b._reconnectCount].port,f.protocol=f.servers[b._reconnectCount].protocol?f.servers[b._reconnectCount].protocol:f.defaultProtocol,f.hostname=f.host,b._reconnectCount++),a("calling streambuilder for",f.protocol),i[f.protocol](b,f)}let w=new s.default(v,f);return w.on("error",()=>{}),w}function c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
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
      

// ---- OB 平台逻辑 / anchor 2: game/index / approx line 27906 ----
,d(),a};t.default=f}),_Me=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__importDefault||function(d){return d&&d.__esModule?d:{default:d}};Object.defineProperty(t,"__esModule",{value:!0}),t.connectAsync=void 0;var r=e(zc()),n=e((TMe(),In(Iq))),s=e(fk()),o=e(fx());typeof(vn==null?void 0:vn.nextTick)!="function"&&(vn.nextTick=setImmediate);var a=(0,r.default)("mqttjs"),i=null;function l(d){let f;d.auth&&(f=d.auth.match(/^(.+):(.+)$/),f?(d.username=f[1],d.password=f[2]):d.username=d.auth)}function u(d,f){var p,h,g,y;if(a("connecting to an MQTT broker..."),typeof d=="object"&&!f&&(f=d,d=""),f=f||{},d&&typeof d=="string"){let b=n.default.parse(d,!0),C={};if(b.port!=null&&(C.port=Number(b.port)),C.host=b.hostname,C.query=b.query,C.auth=b.auth,C.protocol=b.protocol,C.path=b.path,C.protocol=(p=C.protocol)===null||p===void 0?void 0:p.replace(/:$/,""),f=Object.assign(Object.assign({},C),f),!f.protocol)throw new Error("Missing protocol")}if(f.unixSocket=f.unixSocket||((h=f.protocol)===null||h===void 0?void 0:h.includes("+unix")),f.unixSocket?f.protocol=f.protocol.replace("+unix",""):!(!((g=f.protocol)===null||g===void 0)&&g.startsWith("ws"))&&!(!((y=f.protocol)===null||y===void 0)&&y.startsWith("wx"))&&delete f.path,l(f),f.query&&typeof f.query.clientId=="string"&&(f.clientId=f.query.clientId),f.cert&&f.key)if(f.protocol){if(["mqtts","wss","wxs","alis"].indexOf(f.protocol)===-1)switch(f.protocol){case"mqtt":f.protocol="mqtts";break;case"ws":f.protocol="wss";break;case"wx":f.protocol="wxs";break;case"ali":f.protocol="alis";break;default:throw new Error(`Unknown protocol for secure connection: "${f.protocol}"!`)}}else throw new Error("Missing secure protocol key");if(i||(i={},!o.default&&!f.forceNativeWebSocket?(i.ws=sw().streamBuilder,i.wss=sw().streamBuilder,i.mqtt=q5().default,i.tcp=q5().default,i.ssl=Y5().default,i.tls=i.ssl,i.mqtts=Y5().default):(i.ws=sw().browserStreamBuilder,i.wss=sw().browserStreamBuilder,i.wx=Z5().default,i.wxs=Z5().default,i.ali=J5().default,i.alis=J5().default)),!i[f.protocol]){let b=["mqtts","wss"].indexOf(f.protocol)!==-1;f.protocol=["mqtt","mqtts","ws","wss","wx","wxs","ali","alis"].filter((C,E)=>b&&E%2===0?!1:typeof i[C]=="function")[0]}if(f.clean===!1&&!f.clientId)throw new Error("Missing clientId for unclean clients");f.protocol&&(f.defaultProtocol=f.protocol);function v(b){return f.servers&&((!b._reconnectCount||b._reconnectCount===f.servers.length)&&(b._reconnectCount=0),f.host=f.servers[b._reconnectCount].host,f.port=f.servers[b._reconnectCount].port,f.protocol=f.servers[b._reconnectCount].protocol?f.servers[b._reconnectCount].protocol:f.defaultProtocol,f.hostname=f.host,b._reconnectCount++),a("calling streambuilder for",f.protocol),i[f.protocol](b,f)}let w=new s.default(v,f);return w.on("error",()=>{}),w}function c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
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
                      "onCha

// ---- OB 平台逻辑 / anchor 3: game/view / approx line 27987 ----
?!1:typeof i[C]=="function")[0]}if(f.clean===!1&&!f.clientId)throw new Error("Missing clientId for unclean clients");f.protocol&&(f.defaultProtocol=f.protocol);function v(b){return f.servers&&((!b._reconnectCount||b._reconnectCount===f.servers.length)&&(b._reconnectCount=0),f.host=f.servers[b._reconnectCount].host,f.port=f.servers[b._reconnectCount].port,f.protocol=f.servers[b._reconnectCount].protocol?f.servers[b._reconnectCount].protocol:f.defaultProtocol,f.hostname=f.host,b._reconnectCount++),a("calling streambuilder for",f.protocol),i[f.protocol](b,f)}let w=new s.default(v,f);return w.on("error",()=>{}),w}function c(d,f,p=!0){return new Promise((h,g)=>{let y=u(d,f),v={connect:b=>{w(),h(y)},end:()=>{w(),h(y)},error:b=>{w(),y.end(),g(b)}};p===!1&&(v.close=()=>{v.error(new Error("Couldn't connect to server"))});function w(){Object.keys(v).forEach(b=>{y.off(b,v[b])})}Object.keys(v).forEach(b=>{y.on(b,v[b])})})}t.connectAsync=c,t.default=u}),X5=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(p,h,g,y){y===void 0&&(y=g);var v=Object.getOwnPropertyDescriptor(h,g);(!v||("get"in v?!h.__esModule:v.writable||v.configurable))&&(v={enumerable:!0,get:function(){return h[g]}}),Object.defineProperty(p,y,v)}:function(p,h,g,y){y===void 0&&(y=g),p[y]=h[g]}),r=t&&t.__setModuleDefault||(Object.create?function(p,h){Object.defineProperty(p,"default",{enumerable:!0,value:h})}:function(p,h){p.default=h}),n=t&&t.__importStar||function(p){if(p&&p.__esModule)return p;var h={};if(p!=null)for(var g in p)g!=="default"&&Object.prototype.hasOwnProperty.call(p,g)&&e(h,p,g);return r(h,p),h},s=t&&t.__exportStar||function(p,h){for(var g in p)g!=="default"&&!Object.prototype.hasOwnProperty.call(h,g)&&e(h,p,g)},o=t&&t.__importDefault||function(p){return p&&p.__esModule?p:{default:p}};Object.defineProperty(t,"__esModule",{value:!0}),t.ReasonCodes=t.KeepaliveManager=t.UniqueMessageIdProvider=t.DefaultMessageIdProvider=t.Store=t.MqttClient=t.connectAsync=t.connect=t.Client=void 0;var a=o(fk());t.MqttClient=a.default;var i=o(iq());t.DefaultMessageIdProvider=i.default;var l=o(lMe());t.UniqueMessageIdProvider=l.default;var u=o(lq());t.Store=u.default;var c=n(_Me());t.connect=c.default,Object.defineProperty(t,"connectAsync",{enumerable:!0,get:function(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
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
 