// ---- SABA 平台逻辑 / anchor 1: Xt.SABA / approx line 28073 ----
ction(){return c.connectAsync}});var d=o(Tq());t.KeepaliveManager=d.default,t.Client=a.default,s(fk(),t),s(_m(),t);var f=dx();Object.defineProperty(t,"ReasonCodes",{enumerable:!0,get:function(){return f.ReasonCodes}})}),PMe=Dt(t=>{wt(),Et(),Ct();var e=t&&t.__createBinding||(Object.create?function(a,i,l,u){u===void 0&&(u=l);var c=Object.getOwnPropertyDescriptor(i,l);(!c||("get"in c?!i.__esModule:c.writable||c.configurable))&&(c={enumerable:!0,get:function(){return i[l]}}),Object.defineProperty(a,u,c)}:function(a,i,l,u){u===void 0&&(u=l),a[u]=i[l]}),r=t&&t.__setModuleDefault||(Object.create?function(a,i){Object.defineProperty(a,"default",{enumerable:!0,value:i})}:function(a,i){a.default=i}),n=t&&t.__importStar||function(a){if(a&&a.__esModule)return a;var i={};if(a!=null)for(var l in a)l!=="default"&&Object.prototype.hasOwnProperty.call(a,l)&&e(i,a,l);return r(i,a),i},s=t&&t.__exportStar||function(a,i){for(var l in a)l!=="default"&&!Object.prototype.hasOwnProperty.call(i,l)&&e(i,a,l)};Object.defineProperty(t,"__esModule",{value:!0});var o=n(X5());t.default=o,s(X5(),t)});const kMe=PMe();/*! Bundled license information:
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
        return xo(async()=>{
          const o=await Vt.getFollowConfig();
          o&&(r.value=e.follow=o);
          const a=await Vt.getUsers();
          n.value=a==null?void 0:a.filter(i=>i.setting.Publisher)
        }),
        (o,
        a)=>{
          const i=Ge("el-switch"),
          l=Ge("el-form-item"),
          u=Ge("el-col"),
          c=Ge("el-input"),
          d=Ge("el-row"),
          f=Ge("el-checkbox"),
          p=Ge("el-checkbox-group"),
          h=Ge("el-button"),
          g=Ge("el-form");
          return H(),
          Fe(g,
          null,
          {
            default:ne(()=>[X(d,
            {
              gutter:20
            },
            {
              default:ne(()=>[X(u,
              {
                span:24
              },
              {
                default:ne(()=>[X(l,
                null,
                {
                  default:ne(()=>[X(i,
                  {
                    size:"large",
                    modelValue:r.value.isOpen,
                    "onUpdate:modelValue":a[0]||(a[0]=y=>r.value.isOpen=y),
                    "inline-prompt":"",
                    "active-text":"跟单开关",
                    "inactive-text":"跟单开关"
                  },
                  null,
                  8,
                  ["modelValue"])]),
                  _:1
                })]),
                _:1
              }),
              X(u,
              {
                span:6
              },
              {
                default:ne(()=>[X(l,
                {
                  label:"跟单金额："
                },
                {
                  default:ne(()=>[X(c,
        

// ---- SABA 平台逻辑 / anchor 2: Xt.SABA / approx line 54241 ----
;const s=cl(r,"open",function(){n.onopen(),e&&e()}),o=i=>{this.cleanup(),this._readyState="closed",this.emitReserved("error",i),e?e(i):this.maybeReconnectOnOpen()},a=cl(r,"error",o);if(this._timeout!==!1){const i=this._timeout,l=this.setTimeoutFn(()=>{s(),o(new Error("timeout")),r.close()},i);this.opts.autoUnref&&l.unref(),this.subs.push(()=>{this.clearTimeoutFn(l)})}return this.subs.push(s),this.subs.push(a),this}connect(e){return this.open(e)}onopen(){this.cleanup(),this._readyState="open",this.emitReserved("open");const e=this.engine;this.subs.push(cl(e,"ping",this.onping.bind(this)),cl(e,"data",this.ondata.bind(this)),cl(e,"error",this.onerror.bind(this)),cl(e,"close",this.onclose.bind(this)),cl(this.decoder,"decoded",this.ondecoded.bind(this)))}onping(){this.emitReserved("ping")}ondata(e){try{this.decoder.add(e)}catch(r){this.onclose("parse error",r)}}ondecoded(e){qx(()=>{this.emitReserved("packet",e)},this.setTimeoutFn)}onerror(e){this.emitReserved("error",e)}socket(e,r){let n=this.nsps[e];return n?this._autoConnect&&!n.active&&n.connect():(n=new yQ(this,e,r),this.nsps[e]=n),n}_destroy(e){const r=Object.keys(this.nsps);for(const n of r)if(this.nsps[n].active)return;this._close()}_packet(e){const r=this.encoder.encode(e);for(let n=0;n<r.length;n++)this.engine.write(r[n],e.options)}cleanup(){this.subs.forEach(e=>e()),this.subs.length=0,this.decoder.destroy()}_close(){this.skipReconnect=!0,this._reconnecting=!1,this.onclose("forced close")}disconnect(){return this._close()}onclose(e,r){var n;this.cleanup(),(n=this.engine)===null||n===void 0||n.close(),this.backoff.reset(),this._readyState="closed",this.emitReserved("close",e,r),this._reconnection&&!this.skipReconnect&&this.reconnect()}reconnect(){if(this._reconnecting||this.skipReconnect)return this;const e=this;if(this.backoff.attempts>=this._reconnectionAttempts)this.backoff.reset(),this.emitReserved("reconnect_failed"),this._reconnecting=!1;else{const r=this.backoff.duration();this._reconnecting=!0;const n=this.setTimeoutFn(()=>{e.skipReconnect||(this.emitReserved("reconnect_attempt",e.backoff.attempts),!e.skipReconnect&&e.open(s=>{s?(e._reconnecting=!1,e.reconnect(),this.emitReserved("reconnect_error",s)):e.onreconnect()}))},r);this.opts.autoUnref&&n.unref(),this.subs.push(()=>{this.clearTimeoutFn(n)})}}onreconnect(){const e=this.backoff.attempts;this._reconnecting=!1,this.backoff.reset(),this.emitReserved("reconnect",e)}}const cy={};function G0(t,e){typeof t=="object"&&(e=t,t=void 0),e=e||{};const r=nZe(t,e.path||"/socket.io"),n=r.source,s=r.id,o=r.path,a=cy[s]&&o in cy[s].nsps,i=e.forceNew||e["force new connection"]||e.multiplex===!1||a;let l;return i?l=new sB(n,e):(cy[s]||(cy[s]=new sB(n,e)),l=cy[s]),r.query&&!e.query&&(e.query=r.queryKey),l.socket(r.path,e)}Object.assign(G0,{Manager:sB,Socket:yQ,io:G0,connect:G0});const mZe="https://47.115.75.57",ph={},F7=new Map,nu={send:(t,e)=>{var r;(r=nu.io)==null||r.emit("chat message",JSON.stringify({channel:t,message:e}))},request:async t=>{var r;const e=pt.uuid();return F7.set(e,void 0),(r=nu.io)==null||r.emit("request",JSON.stringify({requestId:e,config:t})),F7.get(e)}},yZe=async()=>{await pt.wait(3e3),nu.io=G0(mZe,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${location.hostname}`,token:localStorage.getItem(Hg)??""}}),nu.io.on("connect",()=>{var t,e,r,n,s;(t=nu.io)==null||t.emit("join room",Xt.IM),(e=nu.io)==null||e.emit("join room",Xt.Stake),(r=nu.io)==null||r.emit("join room",Xt.XBet),(n=nu.io)==null||n.emit("join room","XBet:Score"),(s=nu.io)==null||s.on("chat message",o=>{const a=JSON.parse(o),i=a.channel;ph[i]&&ph[i](a.message)})})},vZe=Xt.IM,bZe=t=>{const e=Uint8Array.from(atob(t),a=>a.charCodeAt(0)),r=new DataView(e.buffer).getBigInt64(0,!0).toString().substring(0,3),n=70+Math.floor(Math.random()*10),s=new DataView(e.buffer).getBigInt64(0,!0).toString().substring(8,12),o=`${r}07${n}000000100${s}003000000510000041000000`;return btoa(o)},wZe=()=>{const t=Date.now(),e=new Uint8Array(8);return new DataView(e.buffer).setBigUint64(0,BigInt(t),!0),btoa(String.fromCharCode(...e))},CZe=async t=>{const r=new TextEncoder().encode(t),n=await crypto.subtle.digest("SHA-256",r),s=Array.from(new Uint8Array(n));return btoa(String.fromCharCode(...s))},b0=async(t,e,r=1)=>{const n=wZe(),s=bZe(n);t.Timestamp=n,t.Stats=s;const o=[JSON.stringify(t),n,s,r,e].join(""),a=await CZe(o);return t.PHash=a,t},EZe=async()=>{await pt.wait(3e3);const t=fo();ph[vZe]=e=>{e.bets.forEach(n=>{t.save(Xt.IM,new Jn(`${n.betId}:1`,n.home,!1,n.betId)),t.save(Xt.IM,new Jn(`${n.betId}:2`,n.away,!1,n.betId))})}},Wy=t=>({"Content-Type":"application/json; charset=UTF-8",Referer:Nd(t,"/"),Origin:Nd(t,""),"x-requested-with":"XMLHttpRequest",msuv:"2.0",cbv:`203_50_bmv2_${pt.formatDate(new Date,"yyyyMMddHHmmss")}`}),Nd=(t,e)=>`${t.gateway}${e}`,xZe=async t=>{const e="/api/ExtendSession",r=await b0({BettingChannel:1,Token:t.token,TriggeredBy:2},e);return(await mr.post(t,Nd(t,e),JSON.stringify(r),{headers:Wy(t)},Cr.http)).data.StatusCode===0},TZe=new Map([[1,"45"],[2,"46"],[3,"47"],[4,"48"],[8,"65"]]),dy=Xt.IM;class AZe extends $u{async getBalance(){const e="/api/GetMemberBalance",r=await b0({BettingChannel:1,Token:this.account.token,TriggeredBy:1,Type:1},e),n=await mr.post(this.account,Nd(this.account,e),JSON.stringify(r),{headers:Wy(this.account)},Cr.http);if(!n)return;const s=n.data;return s.StatusCode!==0?void 0:(await xZe(this.account),{currency:Pr.getCurrency(s.MemberBalances[0].Currency),balance:Number(s.MemberBalances[0].AvailableBalance)})}async checkBet(e){var a,i,l,u;const r=TZe.get(((a=e.match)==null?void 0:a.gameId)??0);if(!r)return e.checkError=`未找到游戏ID:${(i=e.match)==null?void 0:i.gameId}对应的参数`,e;const n="/api/GetBetInfoSingleV2",s=Number(e.itemId.split(":")[1]),o=e.request=await b0({GameCat:1,OddsType:3,Currency:"RMB",Token:this.account.token,BettingChannel:2,BetInfos:[{SportId:r,MatchNo:e.betId,HDP:0,SCode:s,STId:1,ComboId:0,ComboSelection:null}],Language:"chs",TriggeredBy:1},n);try{const c=fo(),d=c.getLimit(dy,e.itemId);if(d!=null&&d.isLimit(e.betMoney,e.odds))return e.checkError=`本地限红金额：${d.getValue(e.odds)}`,e;const f=await mr.post(this.account,Nd(this.account,n),JSON.stringify(o),{headers:Wy(this.account)},Cr.http),p=f.data;if(e.response=p,p.StatusCode!==0)return e.checkError=p.StatusDesc,e;const h=p.BetInfos&&p.BetInfos[0];if(!h)return e.checkError="数据结构错误",e;if(h.StatusCode!==0)return e.checkError=h.StatusDesc,e;if(e.betMoney<h.MinStake||e.betMoney>h.MaxStake)return e.checkError=Gi().send.LimitMessage(this.account,{match:(l=e.match)==null?void 0:l.title,bet:(u=e.bet)==null?void 0:u.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:h.MaxStake}),c.setLimit(dy,e.itemId,h.MaxStake,h.Odds),e;if(e.odds<h.Odds||Math.abs(e.odds-h.Odds)<=.01)e.newOdds=Math.min(e.odds,h.Odds);else return e.newOdds=h.Odds,e.checkError=`赔率下降至${e.newOdds}`,e.newOdds&&e.updateOdds(e.newOdds),e;const g=await b0({GameCat:1,CustomerIP:"",BettingChannel:2,OddsType:3,Stake:e.betMoney.toString(),IsParlay:!1,Hash:p.Hash,ServerTicks:p.ServerTicks,BetLists:[{MatchNo:e.betId,SCode:s,Odds:e.newOdds,HDP:0,STId:2,ComboId:0,ComboSelection:null}],Token:this.account.token,Currency:"RMB",IsLiveStreamOn:!1,TriggeredBy:1},"/api/PlaceBetV2");return e.data=g,e}finally{e.data||e.updateOdds(e.newOdds??0)}}async getOrders(){const e=new Date,r=pt.formatDate(e,"yyyy-MM-dd"),n=pt.formatDate(e.setDate(e.getDate()-1),"yyyy-MM-dd"),s=[],o="/api/GetBetStatement",a=Nd(this.account,o),i={headers:Wy(this.account)},l=await b0({Token:this.account.token,BetDateFrom:`${n}T00:00:00+08:00`,BetDateTo:`${r}T23:59:59+08:00`,SportId:-99,SettleStatus:0,Language:"chs",GameCat:1},o),u=await b0({Token:this.account.token,BetDateFrom:`${n}T00:00:00+08:00`,BetDateTo:`${r}T23:59:59+08:00`,SportId:-99,SettleStatus:1,Language:"chs",GameCat:1},o);let c=await mr.post(this.account,a,JSON.stringify(l),i,Cr.http),d=await mr.post(this.account,a,JSON.stringify(u),i,Cr.http);return[c,d].forEach(f=>{f.data.BetStatements.forEach(p=>{let h=0,g=0,y=Yt.none,v=p.BetDetails[0],w=v.SName;if(p.IsCancelled)y=Yt.reject;else if(p.IsSettled)switch(p.WinLose){case 1:y=Yt.win,h=p.Stake+p.Return,g=p.Return;break;case 2:y=Yt.lose,g=-p.Stake;break}switch(w){case"{TeamA}":w=v.HTName;break;case"{TeamB}":w=v.ATName;break}s.push({provider:dy,orderId:p.BetId,odds:p.Odds,createAt:new Date(p.BetDate).getTime(),betMoney:p.Stake,reward:h,money:g,status:y,game:v.SportName,match:[v.HTName,v.ATName].join(" VS "),bet:v.GTName,item:w})})}),s}async betting(e){const r="/api/PlaceBetV2";let n;try{n=await mr.post(this.account,Nd(this.account,r),JSON.stringify(e.data),{headers:Wy(this.account)},Cr.http)}catch(a){return n=a,new uo(dy,!1,"发生异常")}finally{}const s=n.data,o=s&&s.StatusCode===0;return o||e.updateOdds(0),new uo(dy,o,(s&&s.StatusDesc||"")+(o?`,实际赔率:${s.Odds}`:""),{url:Nd(this.account,r),data:e.data},s)}}function qf(t,e){return`${t.gateway}/${t.token}${e}`}const e0=t=>({"content-type":"application/x-www-form-urlencoded; charset=UTF-8"}),US=Xt.SABA,W7={};class SZe extends $u{async getBalance(){let e=this.account.token;try{const n=(await mr.post(this.account,qf(this.account,"/Customer/Balance"),Ma.stringify({TimeZone:8}),{headers:e0(this.account)},Cr.http)).data;return n.Data?{currency:Pr.getCurrency(n.Data.Curr),balance:n.Data.BCredit.toNumber()}:void 0}catch(r){console.error(US,r);return}finally{if(e&&!W7[e]){const r=await mr.post(this.account,qf(this.account,"/Customer/OddsType?set=1"),{},{headers:e0(this.account)},Cr.http);W7[e]=r.data}try{await mr.post(this.account,qf(this.account,"/LoginCheckin/Index"),null,{headers:{username:""}},Cr.http)}catch(r){console.error(`${US}LoginCheckIn`,r)}}}async checkBet(e){var c,d;let r=new RegExp("es_([0-9]+):(Home|Away)$"),n=r.exec(e.itemId);if(!n)return e;let s=Number(n[1]),o=n[2]==="Home"?"h":"a",a;e.odds;let i;const l=qf(this.account,"/Betting/GetTickets"),u={ItemList:[{Type:"OU",Bettype:9001,Oddsid:s,Odds:e.odds,Line:0,Hdp1:0,Hdp2:0,Hscore:0,Ascore:0,Betteam:o,Stake:"",Matchid:e.matchId,ChoiceValue:"",SrcOddsInfo:"",Home:"",Away:"",Gameid:43,ProgramID:"",RaceNum:0,Runner:0,AcceptBetterOdds:!0,isQuickBet:!1,isTablet:!1,PhoneBettingSetting:{IsGraphButton:!1,GraphRemark:"",AdminID:0,HideTicket:!1,Using1X2AsiaHdp:!1,Using1X2Hdp:!1,IsKeyInDeadBallLiveScore:!0},IsInPlay:!1,BonusID:0,BonusType:0,MMR:"",parentMatchId:0}]};try{if(a=await mr.post(this.account,l,Ma.stringify(u),{headers:e0(this.account)},Cr.http),a.data)this.account.errorCount=0;else return this.account.errorCount++,this.account.errorCount>=3&&this.account.logout(),e;if(a.data.ErrorCode!==0||a.data.Data.length!==1)return e.response=a.data,e;let f=a.data&&a.data.Data.length===1&&a.data.Data[0];if(!f)return e.response=a.data,e;if(f.Common&&[46,47].includes(f.Common.ErrorCode)&&["ClosePrice","MarketClosed"].includes(f.Common.ErrorMsg)||f.OddsStatus!=="running")return e.checkError=f.Message,e.updateOdds(0),e;if(e.betMoney<f.Minbet.toNumber()||e.betMoney>f.Maxbet.toNumber())return e.checkError=Gi().send.LimitMessage(this.account,{match:((c=e.match)==null?void 0:c.title)??"",bet:((d=e.bet)==null?void 0:d.getBetName())??"",odds:e.odds,betMoney:e.betMoney,limit:f.Maxbet}),e;if(i=Number(f.DisplayOdds),e.odds<i||Math.abs(e.odds-i)<=.01)e.odds=i;else return e.checkError=f.Message,e.updateOdds(i),e;e.data={ItemList:[{Type:"OU",Bettype:9001,Oddsid:s,Odds:e.odds,Line:0,Hdp1:0,Hdp2:0,Hscore:0,Ascore:0,Betteam:o,Stake:Math.round(e.betMoney),Matchid:e.matchId,ChoiceValue:f.ChoiceValue,ErrorCode:0,Home:f.HomeName,Away:f.AwayName,Gameid:43,ProgramID:0,RaceNum:0,Runner:0,MRPercentage:"",AcceptBetterOdds:!0,isQuickBet:!1,isTablet:!1,PhoneBettingSetting:{IsGraphButton:!1,GraphRemark:"",AdminID:0,HideTicket:!1,Using1X2AsiaHdp:!1,Using1X2Hdp:!1,IsKeyInDeadBallLiveScore:!0},IsInPlay:f.IsInPlay,BonusID:0,BonusType:0,sinfo:f.sinfo,MMR:"",parentMatchId:0,RecommendType:0,Guid:f.Guid,TicketTime:f.TicketTime}]}}catch(f){e.response=f}finally{}return e}async getOrders(){const e=new Date().addSeconds(-28800),r=pt.formatDate(e,"dd-MM-yyyy"),n=r.replace(/\-/g,"/");pt.formatDate(e.setDate(e.getDate()-1),"dd-MM-yyyy").replace(/\-/g,"/");const o=await mr.post(this.account,qf(this.account,"/Statement/GetBetListApi?GMT=8"),"GMT=8",{headers:e0(this.account)},Cr.http),a=await mr.post(this.account,qf(this.account,`/NonSportsStatementApi/GetSettledBetsLv2?date=${r}&dataType=1&sportType=SB&GMT=8`),Ma.stringify({dt:n,GMT:8}),{headers:e0(this.account)},Cr.http);if(o.status!==200||a.status!==200)return;const i=[];return[o.data.Data,a.data.Data.BetListCollection,a.data.OtherData&&a.data.OtherData.BetListCollection||null].forEach((l,u)=>{l&&l.forEach(c=>{let d=new Date(c.TransDateFromDb).getTime()+432e5,f=0,p=Yt.none,h=c.choiceDetails[0].SportName.split("/")[1],g=`${c.choiceDetails[0].HomeName} vs ${c.choiceDetails[0].AwayName}`,y=c.choiceDetails[0].BetTypeName,v=c.choiceDetails[0].Choice,w=0;switch(c.TicketStatus){case"running":p=Yt.none;break;case"reject":p=Yt.reject;break;case"won":p=Yt.win,f=Number(c.Stake)+Number(c.WinLost),w=Number(c.WinLost);break;case"lose":p=Yt.lose,w=Number(c.WinLost);break;case"refund":case"非正规注单":p=Yt.return;break;default:p=Yt.none;break}const b={provider:Xt.SABA,orderId:c.TransId,game:h,match:g,bet:y,item:v,createAt:d,status:p,money:w,betMoney:c.Stake,reward:f,odds:c.Odds};i.push(b)})}),i.desc(l=>l.createAt)}async betting(e){if(!e.data)return new uo(this.account.provider,!1);const r=qf(this.account,"/Betting/ProcessBet");let n=await mr.post(this.account,r,Ma.stringify(e.data),{headers:e0(this.account)},Cr.http),s=n.data;const o=s&&s.ErrorCode===0&&s.Data&&s.Data.ItemList&&s.Data.ItemList.length===1&&s.Data.ItemList[0].ErrorCode===0;return o||fo().updateOddsLock(US,e.itemId,!0),new uo(this.account.provider,o,s.Data&&s.Data.ItemList&&s.Data.ItemList[0]&&s.Data.ItemList[0].Message||"")}}const Bi=Xt.PB,vQ=new Map,P0=(t,e)=>{if(t!=null&&t.token)try{const r=JSON.parse(t.token),n=JSON.parse(r["x-app-data"]),s={"x-app-data":Object.keys(n).map(o=>`${o}=${n[o]}`).join(";")+";","x-browser-session-id-515":n.BrowserSessionId_515||"","x-custid-515":decodeURIComponent(r.custid_515)||"","v-hucode":r["v-hucode"]||"","x-requested-with":"XMLHttpRequest"};return e&&Object.keys(e).forEach(o=>{const a=e[o];s[o]=a}),s}catch{return}},_Ze=t=>t.toLowerCase().replace(/\s/g,"-"),$7=(t,e)=>(e=e.toLowerCase().replace(/\s/g,"-"),t==="cs2"&&(t="cs"),`https://static.storeclutter.com/cdn-cgi/image/width=80,quality=75/images/esports/${t}/${e}/${e}-logo.png`),Bw=t=>t.toLowerCase().replace(/\s/g,"-"),L7=(t,e,r)=>[t,e,1,r==="HOME"?0:1,0,0,r==="HOME"?0:1].join("|"),PZe=async()=>{if(!vv)return;const t=P0(vv),e=`${vv.gateway}/sports-service/sv/euro/odds?sportId=12&isLive=true&isHlE=false&oddsType=1&version=0&timeStamp=${Date.now()}&language=zh-cn&isHomePage=&leagueCode=&eventType=0&eSportCode=&periodNum=0%2C1%2C2%2C3%2C4%2C5%2C6%2C7&participant=&locale=zh_CN&_=${Date.now()}&withCredentials=true`,r=await Yn.get(e,{headers:t}),n=r.data,s=[];return n.leagues.forEach(o=>{const a=_Ze(o.gameCode);o.events.forEach(i=>{const l=i.participants.find(f=>f.type==="HOME"),u=i.participants.find(f=>f.type==="AWAY");if(!l||!u)return;const c=/\(Kills\)/;if(c.test(l.englishName)||c.test(u.englishName))return;const d=[];Object.keys(i.periods).forEach(f=>{const p=f.toNumber(),h=i.periods[p],g=h.moneyLine;!g||g.unavailable||(vQ.set(`${i.id}:${p}`,g.lineId),d.push({Type:Bi,SourceMatchID:i.id,SourceBetID:`${i.id}:${p}`,Map:p,BetName:`[${p===0?"全场":`地图${p}`}]-比赛胜负`,SourceHomeID:L7(i.id,p,"HOME"),HomeName:l.name,HomeOdds:g.homePrice.toNumber(),SourceAwayID:L7(i.id,p,"AWAY"),AwayName:u.name,AwayOdds:g.awayPrice.toNumber(),Status:!g.offline&&!g.unavailable?"Normal":"Locked"}))}),s.push({Type:Bi,SourceGameID:a,SourceMatchID:i.id,StartTime:i.time,HomeID:Bw(l.englishName),Home:l.name,AwayID:Bw(u.englishName),Away:u.name,Teams:[{Type:Bi,TeamID:Bw(l.englishName),Name:l.name,GameID:a,Logo:$7(a,l.englishName)},{Type:Bi,TeamID:Bw(u.englishName),Name:u.name,GameID:a,Logo:$7(a,u.englishName)}],Bets:d})})}),s};let VS=0,vv;const bQ=async()=>{let t=!1;try{const e=await Vt.getPlatform(Bi);if(!e)return;vv=Io().accounts.find(a=>a.provider===Bi&&a.balance!==void 0);const r=fo(),n=Tf();if(!vv){console.log(Bi,"当前未检测到账号"),r.clean(Bi),await pt.wait(3*1e3);return}const s=await PZe();if(!s)return;const o=s.filter(a=>e.games.includes(a.SourceGameID));Date.now()-VS>60*1e3&&(t=await n.saveMatch(Bi,o)),o.filter(a=>e.games.includes(a.SourceGameID)).forEach(async a=>{a.Bets&&(a.Bets.forEach(i=>{r.save(Bi,new Jn(i.SourceHomeID,i.HomeOdds,i.Status!=="Normal",i.SourceBetID)),r.save(Bi,new Jn(i.SourceAwayID,i.AwayOdds,i.Status!=="Normal",i.SourceBetID))}),Date.now()-VS>60*1e3&&await n.saveBets(Bi,a.SourceMatchID,a.Bets))})}catch(e){console.error("PBService",e)}finally{t&&(VS=Date.now()),await pt.wait(5e3),await bQ()}},$y=(t,e)=>`${t.gateway}${e}`,wQ=t=>`${K0}:${t.accountId}:Order`,K0=Xt.PB;class kZe extends $u{async getBalance(){const e=$y(this.account,`/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`),r=await Yn.post(e,"",{headers:P0(this.account)}),n=r.data;return n.success?{balance:n.betCredit*Math.max(1,this.account.multiply??1),currency:Pr.getCurrency(n.currency)}:void 0}async checkBet(e){var f,p;const r=$y(this.account,`/member-betslip/v2/all-odds-selections?locale=zh_CN&_=${Date.now()}&withCredentials=true`),n=e.itemId,s=vQ.get(`${e.betId}`)??0;if(s===0)return e.checkError=`查找line值失败,${e.betId}`,e;const o=await Yn.post(r,{oddsSelections:[{oddsFormat:1,oddsId:n,oddsSelectionsType:"NORMAL",selectionId:`${s}|${n}`}]},{headers:P0(this.account,{"content-type":"application/json; charset=UTF-8"})}),a=e.response=o.data;if(!a||a.length!==1)return e.checkError=JSON.stringify(a),e;const i=a[0];if(i.status==="UNAVAILABLE")return e.checkError=i.status,e;const l=Math.max(7,Math.floor(e.betMoney/Math.max(1,this.account.multiply??1)));if(l<i.minStake||l>i.maxStake)return e.checkError=Gi().send.LimitMessage(this.account,{match:(f=e.match)==null?void 0:f.title,bet:(p=e.bet)==null?void 0:p.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:i.maxStake}),e;if(e.newOdds=i.odds.toNumber(),e.newOdds<e.odds-.01)return e;const u=pt.uuid(),c=i.lineId,d=n.split("|");return d[5]="0.00",d[6]=(e.target===Gn.Home?0:1).toString(),e.data={acceptBetterOdds:!1,oddsFormat:1,selections:[{odds:i.odds,oddsId:n,selectionId:`${c}|0|${d.join("|")}`,stake:l,winRiskStake:"RISK",wagerType:"NORMAL",uniqueRequestId:u,betLocationTracking:{mainPages:"ESPORT",marketTab:"UNKNOWN",market:"UNKNOWN",view:"NEW_EUROPE_VIEW",navigation:"SPORTS",oddsContainerCategory:"MAIN",oddsContainerTitle:"UNKNOWN",marketType:"UNKNOWN",eventSorting:"UNKNOWN",pageType:"UNKNOWN",defaultPage:"UNKNOWN",reuseSelection:!1,isLiveStreamPlaying:null,device:"DESKTOP",displayMode:"LIGHT",language:"zh_CN",timeZone:null}}],clientVersion:"master_9036928d"},e}async getOrders(){const e=$y(this.account,"/member-service/v2/wager-filter?locale=zh_CN"),r=[],n=Math.max(1,this.account.multiply??1);for(let a of[{f:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),t:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),d:-1,s:"OPEN",sd:!1,type:"EVENT",product:"SB",timezone:"GMT-4",sportId:"",leagueId:""},{f:pt.formatDate(new Date().addDays(-1),"yyyy-MM-dd HH:mm:ss"),t:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),d:-1,s:"SETTLED",sd:!1,type:"WAGER",product:"SB",timezone:"GMT-4",sportId:"",leagueId:""}]){const i=await Yn.post(e,a,{headers:P0(this.account,{"content-type":"application/x-www-form-urlencoded; charset=UTF-8"})}),l=i.data;l.error||l.forEach(u=>{let c=u[28],d=c.split(" - ")[0],f=u[9],p=u[42]===0?"全场":`地图${u[42]}`,h=u[22],g=u[7],y=u[16],v=u[29]+u[0],w=u[29],b=u[19],C=0,E=Yt.none;u[18]==="SETTLED"?(E=v>0?Yt.win:Yt.lose,C=v-w):u[18]==="CANCELLED"&&(E=Yt.return,v=C=0),r.push({provider:K0,orderId:g,odds:y,createAt:b,betMoney:w*n,reward:v*n,money:C*n,status:E,game:d,match:f,bet:p,item:h})})}const s=wQ(this.account),o=sessionStorage.getItem(s);if(o){const a=JSON.parse(o);r.some(i=>i.orderId===a.orderId)||r.push(a),a.status!==Yt.pending&&sessionStorage.removeItem(s)}return r.desc(a=>a.createAt)}async betting(e){var s,o,a,i,l;if(!((o=(s=e.data)==null?void 0:s.selections[0])==null?void 0:o.uniqueRequestId))return new uo(K0,!1,"requestId error");let n;try{const u=$y(this.account,`/bet-placement/buyV4?uniqueRequestId=${pt.uuid()}&locale=zh_CN&_=${Date.now()}&withCredentials=true`),c=await Yn.post(u,e.data,{headers:P0(this.account,{"content-type":"application/json; charset=UTF-8"})}),d=c.data;n=(a=d==null?void 0:d.response[0])==null?void 0:a.status;const f=(i=d==null?void 0:d.response[0])==null?void 0:i.uniqueRequestId,p=(l=d==null?void 0:d.response[0])==null?void 0:l.errorCode,h=n==="ACCEPTED"||n==="PENDING_ACCEPTANCE";return new uo(K0,h,p??n??d.errorMessage,void 0,d)}finally{n==="PENDING_ACCEPTANCE"&&CQ(this.account,Date.now())}}}const CQ=async(t,e)=>{if(Date.now()-e>30*1e3)return;let r;const n=wQ(t);let s,o="";const a=Math.max(1,t.multiply??1);try{const i=$y(t,`/member-service/v2/my-bets?locale=zh_CN&_=${Date.now()}&withCredentials=true`),l=await Yn.get(i,{headers:P0(t,{"content-type":"application/json; charset=utf-8"})}),u=l.data;if(!u||u.length===0)return;s=u[0],r=s[11],o=s[0];let c=Yt.none;switch(r){case"PENDING":c=Yt.pending;break;case"OPEN":c=Yt.none;break;case"CANCELLED":case"REJECTED":c=Yt.reject;break}const d=s[35],f=s[12],p=s[42],h=s[18],g=s[15],y=s[2],v=s[21],w={provider:K0,orderId:o,createAt:f,odds:h,betMoney:p*a,reward:0,money:0,status:c,game:v.split(" - ")[0],match:y,bet:d===0?"全场":`地图${d}`,item:g};sessionStorage.setItem(n,JSON.stringify(w))}finally{s&&Vt.saveLog(`[${K0}] - ${o} 拒单检测 => ${r}`,s),r==="PENDING"&&(await pt.wait(1e3),await CQ(t,e))}},IZe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},U7={100:"兑现成功",1e3:"您的投注发生错误。请重新尝试",1001:"赔率更新中",101:"我们暂时无法处理您的请求。请联系客服寻求协助。",102:"操作已超时。请重新登录。",1102:"账户未激活。请联系客服寻求协助。",1103:"账户余额不足",1105:"投注金额超过最高限额。请输入金额低于或等于最高投注额。",1106:"投注金额少于最低限额。请输入最低投注金额。",1107:"赔率已更改.",1108:"请降低您的投注额",1126:"所选赛事不提供混合过关.请选择其他赛事。",1132:"投注金额必须是数字值.",1200:"此注单已被取消。",1554:"已投相同的投注选项。请稍后重试。",1556:"虚拟体育当前不可用",202:"操作已超时。请重新登录。",208:"投注无效。请重试。",2102:"单项投注的快速投注最底限额为{0}",2103:"串关投注的快速投注最低限额为{0}",313:"我们暂时无法处理您的请求。请联系客服寻求协助。",333:"出于安全理由, 系统将登出您的账号。请重新登入。",346:"所选赛事不提供混合过关.请选择其他赛事。",350:"赔率正在更新。请稍后再试。",355:"总投注额已超过此赛事投注限额。",364:"请稍后再试。",365:"无效投注单号。",366:"请稍后再试。",367:"价格已更新。请重新尝试。",369:"此注单先前已成功兑现。",370:`我们暂时无法处理您的请求。
 请稍候再试。`,380:"赔率正在更新。",381:"赔率已更改。",395:"您的所在地不在我们的服务允许范围内， 我们无法为您服务。如果您有任何问题， 请联系我们的客户服务部。",400:"我们暂时无法处理您的请求，请稍候再试。",429:"您的请求过于频繁, 请稍后再试。",431:"此投注类型目前不支持免费投注",500:"我们暂时无法处理您的请求。您必须登录以访问此页。若您已登录，请联系客服寻求协助。",501:"此页面暂时无法访问，请稍后再试。",503:"系统正在做维护",700:"我们暂时无法处理您的请求。请联系客服寻求协助。",710:"您的所在地不在我们的服务允许范围内， 我们无法为您服务。如果您有任何问题， 请联系我们的客户服务部。",7e3:"请登录以添加到我的最爱。",9999:"我们暂时无法处理您的请求。",99404:"网络异常, 请重试！",99997:"当前无法检索信息，请稍后重试",99998:"请重新登录尝试",99999:`我们暂时无法处理您的请求。
 请稍候再试。`},fy=Xt.IMT,Ow=t=>{const e=IZe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}},py=(t,e)=>`${t.gateway}${e}`;class BZe extends $u{async getBalance(){const e=py(this.account,"/mobilesitev2/api/Member/GetMemberBalance"),n=(await mr.post(this.account,e,null,{headers:Ow(this.account)},Cr.http)).data;if((n==null?void 0:n.StatusCode)===100)return{balance:n.ab,currency:ti.CNY}}async checkBet(e){var g,y;const r=py(this.account,"/mobilesitev2/api/PlaceBet/GetBetInfo"),[n,s]=e.matchId.split(":").map(v=>Number(v)),[o,a,i]=e.betId.split(":").map(v=>Number(v)),[l,u]=e.itemId.split(":").map(v=>Number(v)),c={wss:[{spid:n,eid:s,btid:a,pid:1,otid:3,mlid:i,wsid:u,btsid:l,o:e.odds,spf:`gamenr=${o}`,md:0,sid:1,refid:i,wt:1}],wt:1},d=await mr.post(this.account,r,c,{headers:Ow(this.account)},Cr.http),f=d.data,p=fo();if(e.response=f,(f==null?void 0:f.StatusCode)!==100){const v=(f==null?void 0:f.StatusCode)??0;return e.checkError=U7[v]||`StatusCode:${v}`,p.save(fy,new Jn(e.itemId,0,!0)),e}if(e.newOdds=f.wss[0].o,p.save(fy,new Jn(e.itemId,e.newOdds,!1)),e.newOdds-e.odds<-.01)return e.checkError=`赔率变更为：${e.newOdds}`,e;if(e.newOdds-e.odds>.01&&(e.betMoney=Math.floor(e.betMoney*e.odds/e.newOdds)),e.betMoney>f.bset[0].mab||e.betMoney<f.bset[0].mib)return e.checkError=Gi().send.LimitMessage(this.account,{match:(g=e.match)==null?void 0:g.title,bet:(y=e.bet)==null?void 0:y.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:f.bset[0].mab}),e;const h={s:e.betMoney,ws:{spid:n,eid:f.wss[0].eid,m:f.wss[0].m,otid:f.wss[0].otid,btid:f.wss[0].btid,mlid:f.wss[0].mlid,wsid:f.wss[0].wsid,btsid:f.wss[0].btsid,h:f.wss[0].h,o:f.wss[0].o,ortid:f.wss[0].ortid,spf:f.wss[0].spf,pid:1},sw:1,fpf:"iPhone",vt:"v4"};return console.log(h),e.data=h,e}async getOrders(){const e=[],r=pt.formatDate(new Date,"yyyy-MM-dd 11:59:59"),n=pt.formatDate(new Date().addSeconds(-3600*36),"yyyy-MM-dd 12:00:00");for(const s of[{url:py(this.account,"/mobilesitev2/api/MyBet/GetBetList"),data:{BetConfirmationStatusList:[1,2,3],dateTo:null,dateFrom:null}},{url:py(this.account,"/mobilesitev2/api/MyBet/GetBetStatement"),data:{DateFrom:n,DateTo:r}}]){const o=await mr.post(this.account,s.url,s.data,{headers:Ow(this.account)},Cr.http),a=o.data;if((a==null?void 0:a.StatusCode)!==100)return;a.wl.forEach(i=>{const l=i.wil[0];if(e.some(f=>f.orderId===l.s.toString()))return;let u=l.bts.toString();switch(l.bts){case 707:u=l.htn;break;case 708:u=l.atn;break}let c=Yt.none,d=0;l.wict===2?c=Yt.reject:l.wict===3?c=Yt.return:l.wics===1?c=Yt.pending:i.wla>0?(c=Yt.win,d=i.sa+i.wla):i.wla<0&&(c=Yt.lose,d=i.sa+i.wla),e.push({provider:fy,game:l.s.toString(),orderId:i.wid,createAt:new Date(i.wcdt).getTime(),match:`${l.htn} VS ${l.atn}`,bet:l.btn,item:u,odds:l.o,betMoney:i.sa,reward:d,money:i.wla,status:c})})}return e.desc(s=>s.createAt)}async betting(e){const r=py(this.account,"/mobilesitev2/api/PlaceBet/SinglePlaceBet"),n=await mr.post(this.account,r,e.data,{headers:Ow(this.account)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){const o=(s==null?void 0:s.StatusCode)??0;return new uo(fy,!1,U7[o]||`StatusCode:${o}`,e.data,s)}return new uo(fy,!0,`实际赔率:${s.ao},余额:${s.ab}`,e.data,s)}}var EQ={exports:{}},hy={},Yu={},Yf={},V7;function Zx(){if(V7)return Yf;V7=1;function t(o,a,i){if(i===void 0&&(i=Array.prototype),o&&typeof i.find=="function")return i.find.call(o,a);for(var l=0;l<o.length;l++)if(Object.prototype.hasOwnProperty.call(o,l)){var u=o[l];if(a.call(void 0,u,l,o))return u}}function e(o,a){return a===void 0&&(a=Object),a&&typeof a.freeze=="function"?a.freeze(o):o}function r(o,a){if(o===null||typeof o!="object")throw new TypeError("target is not an object");for(var i in a)Object.prototype.hasOwnProperty.call(a,i)&&(o[i]=a[i]);return o}var n=e({HTML:"text/html",isHTML:function(o){return o===n.HTML},XML_APPLICATION:"application/xml",XML_TEXT:"text/xml",XML_XHTML_APPLICATION:"applica

// ---- SABA 平台逻辑 / anchor 3: Xt.SABA / approx line 54241 ----
56",r),s=Array.from(new Uint8Array(n));return btoa(String.fromCharCode(...s))},b0=async(t,e,r=1)=>{const n=wZe(),s=bZe(n);t.Timestamp=n,t.Stats=s;const o=[JSON.stringify(t),n,s,r,e].join(""),a=await CZe(o);return t.PHash=a,t},EZe=async()=>{await pt.wait(3e3);const t=fo();ph[vZe]=e=>{e.bets.forEach(n=>{t.save(Xt.IM,new Jn(`${n.betId}:1`,n.home,!1,n.betId)),t.save(Xt.IM,new Jn(`${n.betId}:2`,n.away,!1,n.betId))})}},Wy=t=>({"Content-Type":"application/json; charset=UTF-8",Referer:Nd(t,"/"),Origin:Nd(t,""),"x-requested-with":"XMLHttpRequest",msuv:"2.0",cbv:`203_50_bmv2_${pt.formatDate(new Date,"yyyyMMddHHmmss")}`}),Nd=(t,e)=>`${t.gateway}${e}`,xZe=async t=>{const e="/api/ExtendSession",r=await b0({BettingChannel:1,Token:t.token,TriggeredBy:2},e);return(await mr.post(t,Nd(t,e),JSON.stringify(r),{headers:Wy(t)},Cr.http)).data.StatusCode===0},TZe=new Map([[1,"45"],[2,"46"],[3,"47"],[4,"48"],[8,"65"]]),dy=Xt.IM;class AZe extends $u{async getBalance(){const e="/api/GetMemberBalance",r=await b0({BettingChannel:1,Token:this.account.token,TriggeredBy:1,Type:1},e),n=await mr.post(this.account,Nd(this.account,e),JSON.stringify(r),{headers:Wy(this.account)},Cr.http);if(!n)return;const s=n.data;return s.StatusCode!==0?void 0:(await xZe(this.account),{currency:Pr.getCurrency(s.MemberBalances[0].Currency),balance:Number(s.MemberBalances[0].AvailableBalance)})}async checkBet(e){var a,i,l,u;const r=TZe.get(((a=e.match)==null?void 0:a.gameId)??0);if(!r)return e.checkError=`未找到游戏ID:${(i=e.match)==null?void 0:i.gameId}对应的参数`,e;const n="/api/GetBetInfoSingleV2",s=Number(e.itemId.split(":")[1]),o=e.request=await b0({GameCat:1,OddsType:3,Currency:"RMB",Token:this.account.token,BettingChannel:2,BetInfos:[{SportId:r,MatchNo:e.betId,HDP:0,SCode:s,STId:1,ComboId:0,ComboSelection:null}],Language:"chs",TriggeredBy:1},n);try{const c=fo(),d=c.getLimit(dy,e.itemId);if(d!=null&&d.isLimit(e.betMoney,e.odds))return e.checkError=`本地限红金额：${d.getValue(e.odds)}`,e;const f=await mr.post(this.account,Nd(this.account,n),JSON.stringify(o),{headers:Wy(this.account)},Cr.http),p=f.data;if(e.response=p,p.StatusCode!==0)return e.checkError=p.StatusDesc,e;const h=p.BetInfos&&p.BetInfos[0];if(!h)return e.checkError="数据结构错误",e;if(h.StatusCode!==0)return e.checkError=h.StatusDesc,e;if(e.betMoney<h.MinStake||e.betMoney>h.MaxStake)return e.checkError=Gi().send.LimitMessage(this.account,{match:(l=e.match)==null?void 0:l.title,bet:(u=e.bet)==null?void 0:u.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:h.MaxStake}),c.setLimit(dy,e.itemId,h.MaxStake,h.Odds),e;if(e.odds<h.Odds||Math.abs(e.odds-h.Odds)<=.01)e.newOdds=Math.min(e.odds,h.Odds);else return e.newOdds=h.Odds,e.checkError=`赔率下降至${e.newOdds}`,e.newOdds&&e.updateOdds(e.newOdds),e;const g=await b0({GameCat:1,CustomerIP:"",BettingChannel:2,OddsType:3,Stake:e.betMoney.toString(),IsParlay:!1,Hash:p.Hash,ServerTicks:p.ServerTicks,BetLists:[{MatchNo:e.betId,SCode:s,Odds:e.newOdds,HDP:0,STId:2,ComboId:0,ComboSelection:null}],Token:this.account.token,Currency:"RMB",IsLiveStreamOn:!1,TriggeredBy:1},"/api/PlaceBetV2");return e.data=g,e}finally{e.data||e.updateOdds(e.newOdds??0)}}async getOrders(){const e=new Date,r=pt.formatDate(e,"yyyy-MM-dd"),n=pt.formatDate(e.setDate(e.getDate()-1),"yyyy-MM-dd"),s=[],o="/api/GetBetStatement",a=Nd(this.account,o),i={headers:Wy(this.account)},l=await b0({Token:this.account.token,BetDateFrom:`${n}T00:00:00+08:00`,BetDateTo:`${r}T23:59:59+08:00`,SportId:-99,SettleStatus:0,Language:"chs",GameCat:1},o),u=await b0({Token:this.account.token,BetDateFrom:`${n}T00:00:00+08:00`,BetDateTo:`${r}T23:59:59+08:00`,SportId:-99,SettleStatus:1,Language:"chs",GameCat:1},o);let c=await mr.post(this.account,a,JSON.stringify(l),i,Cr.http),d=await mr.post(this.account,a,JSON.stringify(u),i,Cr.http);return[c,d].forEach(f=>{f.data.BetStatements.forEach(p=>{let h=0,g=0,y=Yt.none,v=p.BetDetails[0],w=v.SName;if(p.IsCancelled)y=Yt.reject;else if(p.IsSettled)switch(p.WinLose){case 1:y=Yt.win,h=p.Stake+p.Return,g=p.Return;break;case 2:y=Yt.lose,g=-p.Stake;break}switch(w){case"{TeamA}":w=v.HTName;break;case"{TeamB}":w=v.ATName;break}s.push({provider:dy,orderId:p.BetId,odds:p.Odds,createAt:new Date(p.BetDate).getTime(),betMoney:p.Stake,reward:h,money:g,status:y,game:v.SportName,match:[v.HTName,v.ATName].join(" VS "),bet:v.GTName,item:w})})}),s}async betting(e){const r="/api/PlaceBetV2";let n;try{n=await mr.post(this.account,Nd(this.account,r),JSON.stringify(e.data),{headers:Wy(this.account)},Cr.http)}catch(a){return n=a,new uo(dy,!1,"发生异常")}finally{}const s=n.data,o=s&&s.StatusCode===0;return o||e.updateOdds(0),new uo(dy,o,(s&&s.StatusDesc||"")+(o?`,实际赔率:${s.Odds}`:""),{url:Nd(this.account,r),data:e.data},s)}}function qf(t,e){return`${t.gateway}/${t.token}${e}`}const e0=t=>({"content-type":"application/x-www-form-urlencoded; charset=UTF-8"}),US=Xt.SABA,W7={};class SZe extends $u{async getBalance(){let e=this.account.token;try{const n=(await mr.post(this.account,qf(this.account,"/Customer/Balance"),Ma.stringify({TimeZone:8}),{headers:e0(this.account)},Cr.http)).data;return n.Data?{currency:Pr.getCurrency(n.Data.Curr),balance:n.Data.BCredit.toNumber()}:void 0}catch(r){console.error(US,r);return}finally{if(e&&!W7[e]){const r=await mr.post(this.account,qf(this.account,"/Customer/OddsType?set=1"),{},{headers:e0(this.account)},Cr.http);W7[e]=r.data}try{await mr.post(this.account,qf(this.account,"/LoginCheckin/Index"),null,{headers:{username:""}},Cr.http)}catch(r){console.error(`${US}LoginCheckIn`,r)}}}async checkBet(e){var c,d;let r=new RegExp("es_([0-9]+):(Home|Away)$"),n=r.exec(e.itemId);if(!n)return e;let s=Number(n[1]),o=n[2]==="Home"?"h":"a",a;e.odds;let i;const l=qf(this.account,"/Betting/GetTickets"),u={ItemList:[{Type:"OU",Bettype:9001,Oddsid:s,Odds:e.odds,Line:0,Hdp1:0,Hdp2:0,Hscore:0,Ascore:0,Betteam:o,Stake:"",Matchid:e.matchId,ChoiceValue:"",SrcOddsInfo:"",Home:"",Away:"",Gameid:43,ProgramID:"",RaceNum:0,Runner:0,AcceptBetterOdds:!0,isQuickBet:!1,isTablet:!1,PhoneBettingSetting:{IsGraphButton:!1,GraphRemark:"",AdminID:0,HideTicket:!1,Using1X2AsiaHdp:!1,Using1X2Hdp:!1,IsKeyInDeadBallLiveScore:!0},IsInPlay:!1,BonusID:0,BonusType:0,MMR:"",parentMatchId:0}]};try{if(a=await mr.post(this.account,l,Ma.stringify(u),{headers:e0(this.account)},Cr.http),a.data)this.account.errorCount=0;else return this.account.errorCount++,this.account.errorCount>=3&&this.account.logout(),e;if(a.data.ErrorCode!==0||a.data.Data.length!==1)return e.response=a.data,e;let f=a.data&&a.data.Data.length===1&&a.data.Data[0];if(!f)return e.response=a.data,e;if(f.Common&&[46,47].includes(f.Common.ErrorCode)&&["ClosePrice","MarketClosed"].includes(f.Common.ErrorMsg)||f.OddsStatus!=="running")return e.checkError=f.Message,e.updateOdds(0),e;if(e.betMoney<f.Minbet.toNumber()||e.betMoney>f.Maxbet.toNumber())return e.checkError=Gi().send.LimitMessage(this.account,{match:((c=e.match)==null?void 0:c.title)??"",bet:((d=e.bet)==null?void 0:d.getBetName())??"",odds:e.odds,betMoney:e.betMoney,limit:f.Maxbet}),e;if(i=Number(f.DisplayOdds),e.odds<i||Math.abs(e.odds-i)<=.01)e.odds=i;else return e.checkError=f.Message,e.updateOdds(i),e;e.data={ItemList:[{Type:"OU",Bettype:9001,Oddsid:s,Odds:e.odds,Line:0,Hdp1:0,Hdp2:0,Hscore:0,Ascore:0,Betteam:o,Stake:Math.round(e.betMoney),Matchid:e.matchId,ChoiceValue:f.ChoiceValue,ErrorCode:0,Home:f.HomeName,Away:f.AwayName,Gameid:43,ProgramID:0,RaceNum:0,Runner:0,MRPercentage:"",AcceptBetterOdds:!0,isQuickBet:!1,isTablet:!1,PhoneBettingSetting:{IsGraphButton:!1,GraphRemark:"",AdminID:0,HideTicket:!1,Using1X2AsiaHdp:!1,Using1X2Hdp:!1,IsKeyInDeadBallLiveScore:!0},IsInPlay:f.IsInPlay,BonusID:0,BonusType:0,sinfo:f.sinfo,MMR:"",parentMatchId:0,RecommendType:0,Guid:f.Guid,TicketTime:f.TicketTime}]}}catch(f){e.response=f}finally{}return e}async getOrders(){const e=new Date().addSeconds(-28800),r=pt.formatDate(e,"dd-MM-yyyy"),n=r.replace(/\-/g,"/");pt.formatDate(e.setDate(e.getDate()-1),"dd-MM-yyyy").replace(/\-/g,"/");const o=await mr.post(this.account,qf(this.account,"/Statement/GetBetListApi?GMT=8"),"GMT=8",{headers:e0(this.account)},Cr.http),a=await mr.post(this.account,qf(this.account,`/NonSportsStatementApi/GetSettledBetsLv2?date=${r}&dataType=1&sportType=SB&GMT=8`),Ma.stringify({dt:n,GMT:8}),{headers:e0(this.account)},Cr.http);if(o.status!==200||a.status!==200)return;const i=[];return[o.data.Data,a.data.Data.BetListCollection,a.data.OtherData&&a.data.OtherData.BetListCollection||null].forEach((l,u)=>{l&&l.forEach(c=>{let d=new Date(c.TransDateFromDb).getTime()+432e5,f=0,p=Yt.none,h=c.choiceDetails[0].SportName.split("/")[1],g=`${c.choiceDetails[0].HomeName} vs ${c.choiceDetails[0].AwayName}`,y=c.choiceDetails[0].BetTypeName,v=c.choiceDetails[0].Choice,w=0;switch(c.TicketStatus){case"running":p=Yt.none;break;case"reject":p=Yt.reject;break;case"won":p=Yt.win,f=Number(c.Stake)+Number(c.WinLost),w=Number(c.WinLost);break;case"lose":p=Yt.lose,w=Number(c.WinLost);break;case"refund":case"非正规注单":p=Yt.return;break;default:p=Yt.none;break}const b={provider:Xt.SABA,orderId:c.TransId,game:h,match:g,bet:y,item:v,createAt:d,status:p,money:w,betMoney:c.Stake,reward:f,odds:c.Odds};i.push(b)})}),i.desc(l=>l.createAt)}async betting(e){if(!e.data)return new uo(this.account.provider,!1);const r=qf(this.account,"/Betting/ProcessBet");let n=await mr.post(this.account,r,Ma.stringify(e.data),{headers:e0(this.account)},Cr.http),s=n.data;const o=s&&s.ErrorCode===0&&s.Data&&s.Data.ItemList&&s.Data.ItemList.length===1&&s.Data.ItemList[0].ErrorCode===0;return o||fo().updateOddsLock(US,e.itemId,!0),new uo(this.account.provider,o,s.Data&&s.Data.ItemList&&s.Data.ItemList[0]&&s.Data.ItemList[0].Message||"")}}const Bi=Xt.PB,vQ=new Map,P0=(t,e)=>{if(t!=null&&t.token)try{const r=JSON.parse(t.token),n=JSON.parse(r["x-app-data"]),s={"x-app-data":Object.keys(n).map(o=>`${o}=${n[o]}`).join(";")+";","x-browser-session-id-515":n.BrowserSessionId_515||"","x-custid-515":decodeURIComponent(r.custid_515)||"","v-hucode":r["v-hucode"]||"","x-requested-with":"XMLHttpRequest"};return e&&Object.keys(e).forEach(o=>{const a=e[o];s[o]=a}),s}catch{return}},_Ze=t=>t.toLowerCase().replace(/\s/g,"-"),$7=(t,e)=>(e=e.toLowerCase().replace(/\s/g,"-"),t==="cs2"&&(t="cs"),`https://static.storeclutter.com/cdn-cgi/image/width=80,quality=75/images/esports/${t}/${e}/${e}-logo.png`),Bw=t=>t.toLowerCase().replace(/\s/g,"-"),L7=(t,e,r)=>[t,e,1,r==="HOME"?0:1,0,0,r==="HOME"?0:1].join("|"),PZe=async()=>{if(!vv)return;const t=P0(vv),e=`${vv.gateway}/sports-service/sv/euro/odds?sportId=12&isLive=true&isHlE=false&oddsType=1&version=0&timeStamp=${Date.now()}&language=zh-cn&isHomePage=&leagueCode=&eventType=0&eSportCode=&periodNum=0%2C1%2C2%2C3%2C4%2C5%2C6%2C7&participant=&locale=zh_CN&_=${Date.now()}&withCredentials=true`,r=await Yn.get(e,{headers:t}),n=r.data,s=[];return n.leagues.forEach(o=>{const a=_Ze(o.gameCode);o.events.forEach(i=>{const l=i.participants.find(f=>f.type==="HOME"),u=i.participants.find(f=>f.type==="AWAY");if(!l||!u)return;const c=/\(Kills\)/;if(c.test(l.englishName)||c.test(u.englishName))return;const d=[];Object.keys(i.periods).forEach(f=>{const p=f.toNumber(),h=i.periods[p],g=h.moneyLine;!g||g.unavailable||(vQ.set(`${i.id}:${p}`,g.lineId),d.push({Type:Bi,SourceMatchID:i.id,SourceBetID:`${i.id}:${p}`,Map:p,BetName:`[${p===0?"全场":`地图${p}`}]-比赛胜负`,SourceHomeID:L7(i.id,p,"HOME"),HomeName:l.name,HomeOdds:g.homePrice.toNumber(),SourceAwayID:L7(i.id,p,"AWAY"),AwayName:u.name,AwayOdds:g.awayPrice.toNumber(),Status:!g.offline&&!g.unavailable?"Normal":"Locked"}))}),s.push({Type:Bi,SourceGameID:a,SourceMatchID:i.id,StartTime:i.time,HomeID:Bw(l.englishName),Home:l.name,AwayID:Bw(u.englishName),Away:u.name,Teams:[{Type:Bi,TeamID:Bw(l.englishName),Name:l.name,GameID:a,Logo:$7(a,l.englishName)},{Type:Bi,TeamID:Bw(u.englishName),Name:u.name,GameID:a,Logo:$7(a,u.englishName)}],Bets:d})})}),s};let VS=0,vv;const bQ=async()=>{let t=!1;try{const e=await Vt.getPlatform(Bi);if(!e)return;vv=Io().accounts.find(a=>a.provider===Bi&&a.balance!==void 0);const r=fo(),n=Tf();if(!vv){console.log(Bi,"当前未检测到账号"),r.clean(Bi),await pt.wait(3*1e3);return}const s=await PZe();if(!s)return;const o=s.filter(a=>e.games.includes(a.SourceGameID));Date.now()-VS>60*1e3&&(t=await n.saveMatch(Bi,o)),o.filter(a=>e.games.includes(a.SourceGameID)).forEach(async a=>{a.Bets&&(a.Bets.forEach(i=>{r.save(Bi,new Jn(i.SourceHomeID,i.HomeOdds,i.Status!=="Normal",i.SourceBetID)),r.save(Bi,new Jn(i.SourceAwayID,i.AwayOdds,i.Status!=="Normal",i.SourceBetID))}),Date.now()-VS>60*1e3&&await n.saveBets(Bi,a.SourceMatchID,a.Bets))})}catch(e){console.error("PBService",e)}finally{t&&(VS=Date.now()),await pt.wait(5e3),await bQ()}},$y=(t,e)=>`${t.gateway}${e}`,wQ=t=>`${K0}:${t.accountId}:Order`,K0=Xt.PB;class kZe extends $u{async getBalance(){const e=$y(this.account,`/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`),r=await Yn.post(e,"",{headers:P0(this.account)}),n=r.data;return n.success?{balance:n.betCredit*Math.max(1,this.account.multiply??1),currency:Pr.getCurrency(n.currency)}:void 0}async checkBet(e){var f,p;const r=$y(this.account,`/member-betslip/v2/all-odds-selections?locale=zh_CN&_=${Date.now()}&withCredentials=true`),n=e.itemId,s=vQ.get(`${e.betId}`)??0;if(s===0)return e.checkError=`查找line值失败,${e.betId}`,e;const o=await Yn.post(r,{oddsSelections:[{oddsFormat:1,oddsId:n,oddsSelectionsType:"NORMAL",selectionId:`${s}|${n}`}]},{headers:P0(this.account,{"content-type":"application/json; charset=UTF-8"})}),a=e.response=o.data;if(!a||a.length!==1)return e.checkError=JSON.stringify(a),e;const i=a[0];if(i.status==="UNAVAILABLE")return e.checkError=i.status,e;const l=Math.max(7,Math.floor(e.betMoney/Math.max(1,this.account.multiply??1)));if(l<i.minStake||l>i.maxStake)return e.checkError=Gi().send.LimitMessage(this.account,{match:(f=e.match)==null?void 0:f.title,bet:(p=e.bet)==null?void 0:p.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:i.maxStake}),e;if(e.newOdds=i.odds.toNumber(),e.newOdds<e.odds-.01)return e;const u=pt.uuid(),c=i.lineId,d=n.split("|");return d[5]="0.00",d[6]=(e.target===Gn.Home?0:1).toString(),e.data={acceptBetterOdds:!1,oddsFormat:1,selections:[{odds:i.odds,oddsId:n,selectionId:`${c}|0|${d.join("|")}`,stake:l,winRiskStake:"RISK",wagerType:"NORMAL",uniqueRequestId:u,betLocationTracking:{mainPages:"ESPORT",marketTab:"UNKNOWN",market:"UNKNOWN",view:"NEW_EUROPE_VIEW",navigation:"SPORTS",oddsContainerCategory:"MAIN",oddsContainerTitle:"UNKNOWN",marketType:"UNKNOWN",eventSorting:"UNKNOWN",pageType:"UNKNOWN",defaultPage:"UNKNOWN",reuseSelection:!1,isLiveStreamPlaying:null,device:"DESKTOP",displayMode:"LIGHT",language:"zh_CN",timeZone:null}}],clientVersion:"master_9036928d"},e}async getOrders(){const e=$y(this.account,"/member-service/v2/wager-filter?locale=zh_CN"),r=[],n=Math.max(1,this.account.multiply??1);for(let a of[{f:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),t:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),d:-1,s:"OPEN",sd:!1,type:"EVENT",product:"SB",timezone:"GMT-4",sportId:"",leagueId:""},{f:pt.formatDate(new Date().addDays(-1),"yyyy-MM-dd HH:mm:ss"),t:pt.formatDate(new Date,"yyyy-MM-dd HH:mm:ss"),d:-1,s:"SETTLED",sd:!1,type:"WAGER",product:"SB",timezone:"GMT-4",sportId:"",leagueId:""}]){const i=await Yn.post(e,a,{headers:P0(this.account,{"content-type":"application/x-www-form-urlencoded; charset=UTF-8"})}),l=i.data;l.error||l.forEach(u=>{let c=u[28],d=c.split(" - ")[0],f=u[9],p=u[42]===0?"全场":`地图${u[42]}`,h=u[22],g=u[7],y=u[16],v=u[29]+u[0],w=u[29],b=u[19],C=0,E=Yt.none;u[18]==="SETTLED"?(E=v>0?Yt.win:Yt.lose,C=v-w):u[18]==="CANCELLED"&&(E=Yt.return,v=C=0),r.push({provider:K0,orderId:g,odds:y,createAt:b,betMoney:w*n,reward:v*n,money:C*n,status:E,game:d,match:f,bet:p,item:h})})}const s=wQ(this.account),o=sessionStorage.getItem(s);if(o){const a=JSON.parse(o);r.some(i=>i.orderId===a.orderId)||r.push(a),a.status!==Yt.pending&&sessionStorage.removeItem(s)}return r.desc(a=>a.createAt)}async betting(e){var s,o,a,i,l;if(!((o=(s=e.data)==null?void 0:s.selections[0])==null?void 0:o.uniqueRequestId))return new uo(K0,!1,"requestId error");let n;try{const u=$y(this.account,`/bet-placement/buyV4?uniqueRequestId=${pt.uuid()}&locale=zh_CN&_=${Date.now()}&withCredentials=true`),c=await Yn.post(u,e.data,{headers:P0(this.account,{"content-type":"application/json; charset=UTF-8"})}),d=c.data;n=(a=d==null?void 0:d.response[0])==null?void 0:a.status;const f=(i=d==null?void 0:d.response[0])==null?void 0:i.uniqueRequestId,p=(l=d==null?void 0:d.response[0])==null?void 0:l.errorCode,h=n==="ACCEPTED"||n==="PENDING_ACCEPTANCE";return new uo(K0,h,p??n??d.errorMessage,void 0,d)}finally{n==="PENDING_ACCEPTANCE"&&CQ(this.account,Date.now())}}}const CQ=async(t,e)=>{if(Date.now()-e>30*1e3)return;let r;const n=wQ(t);let s,o="";const a=Math.max(1,t.multiply??1);try{const i=$y(t,`/member-service/v2/my-bets?locale=zh_CN&_=${Date.now()}&withCredentials=true`),l=await Yn.get(i,{headers:P0(t,{"content-type":"application/json; charset=utf-8"})}),u=l.data;if(!u||u.length===0)return;s=u[0],r=s[11],o=s[0];let c=Yt.none;switch(r){case"PENDING":c=Yt.pending;break;case"OPEN":c=Yt.none;break;case"CANCELLED":case"REJECTED":c=Yt.reject;break}const d=s[35],f=s[12],p=s[42],h=s[18],g=s[15],y=s[2],v=s[21],w={provider:K0,orderId:o,createAt:f,odds:h,betMoney:p*a,reward:0,money:0,status:c,game:v.split(" - ")[0],match:y,bet:d===0?"全场":`地图${d}`,item:g};sessionStorage.setItem(n,JSON.stringify(w))}finally{s&&Vt.saveLog(`[${K0}] - ${o} 拒单检测 => ${r}`,s),r==="PENDING"&&(await pt.wait(1e3),await CQ(t,e))}},IZe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},U7={100:"兑现成功",1e3:"您的投注发生错误。请重新尝试",1001:"赔率更新中",101:"我们暂时无法处理您的请求。请联系客服寻求协助。",102:"操作已超时。请重新登录。",1102:"账户未激活。请联系客服寻求协助。",1103:"账户余额不足",1105:"投注金额超过最高限额。请输入金额低于或等于最高投注额。",1106:"投注金额少于最低限额。请输入最低投注金额。",1107:"赔率已更改.",1108:"请降低您的投注额",1126:"所选赛事不提供混合过关.请选择其他赛事。",1132:"投注金额必须是数字值.",1200:"此注单已被取消。",1554:"已投相同的投注选项。请稍后重试。",1556:"虚拟体育当前不可用",202:"操作已超时。请重新登录。",208:"投注无效。请重试。",2102:"单项投注的快速投注最底限额为{0}",2103:"串关投注的快速投注最低限额为{0}",313:"我们暂时无法处理您的请求。请联系客服寻求协助。",333:"出于安全理由, 系统将登出您的账号。请重新登入。",346:"所选赛事不提供混合过关.请选择其他赛事。",350:"赔率正在更新。请稍后再试。",355:"总投注额已超过此赛事投注限额。",364:"请稍后再试。",365:"无效投注单号。",366:"请稍后再试。",367:"价格已更新。请重新尝试。",369:"此注单先前已成功兑现。",370:`我们暂时无法处理您的请求。
 请稍候再试。`,380:"赔率正在更新。",381:"赔率已更改。",395:"您的所在地不在我们的服务允许范围内， 我们无法为您服务。如果您有任何问题， 请联系我们的客户服务部。",400:"我们暂时无法处理您的请求，请稍候再试。",429:"您的请求过于频繁, 请稍后再试。",431:"此投注类型目前不支持免费投注",500:"我们暂时无法处理您的请求。您必须登录以访问此页。若您已登录，请联系客服寻求协助。",501:"此页面暂时无法访问，请稍后再试。",503:"系统正在做维护",700:"我们暂时无法处理您的请求。请联系客服寻求协助。",710:"您的所在地不在我们的服务允许范围内， 我们无法为您服务。如果您有任何问题， 请联系我们的客户服务部。",7e3:"请登录以添加到我的最爱。",9999:"我们暂时无法处理您的请求。",99404:"网络异常, 请重试！",99997:"当前无法检索信息，请稍后重试",99998:"请重新登录尝试",99999:`我们暂时无法处理您的请求。
 请稍候再试。`},fy=Xt.IMT,Ow=t=>{const e=IZe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}},py=(t,e)=>`${t.gateway}${e}`;class BZe extends $u{async getBalance(){const e=py(this.account,"/mobilesitev2/api/Member/GetMemberBalance"),n=(await mr.post(this.account,e,null,{headers:Ow(this.account)},Cr.http)).data;if((n==null?void 0:n.StatusCode)===100)return{balance:n.ab,currency:ti.CNY}}async checkBet(e){var g,y;const r=py(this.account,"/mobilesitev2/api/PlaceBet/GetBetInfo"),[n,s]=e.matchId.split(":").map(v=>Number(v)),[o,a,i]=e.betId.split(":").map(v=>Number(v)),[l,u]=e.itemId.split(":").map(v=>Number(v)),c={wss:[{spid:n,eid:s,btid:a,pid:1,otid:3,mlid:i,wsid:u,btsid:l,o:e.odds,spf:`gamenr=${o}`,md:0,sid:1,refid:i,wt:1}],wt:1},d=await mr.post(this.account,r,c,{headers:Ow(this.account)},Cr.http),f=d.data,p=fo();if(e.response=f,(f==null?void 0:f.StatusCode)!==100){const v=(f==null?void 0:f.StatusCode)??0;return e.checkError=U7[v]||`StatusCode:${v}`,p.save(fy,new Jn(e.itemId,0,!0)),e}if(e.newOdds=f.wss[0].o,p.save(fy,new Jn(e.itemId,e.newOdds,!1)),e.newOdds-e.odds<-.01)return e.checkError=`赔率变更为：${e.newOdds}`,e;if(e.newOdds-e.odds>.01&&(e.betMoney=Math.floor(e.betMoney*e.odds/e.newOdds)),e.betMoney>f.bset[0].mab||e.betMoney<f.bset[0].mib)return e.checkError=Gi().send.LimitMessage(this.account,{match:(g=e.match)==null?void 0:g.title,bet:(y=e.bet)==null?void 0:y.getBetName(),odds:e.odds,betMoney:e.betMoney,limit:f.bset[0].mab}),e;const h={s:e.betMoney,ws:{spid:n,eid:f.wss[0].eid,m:f.wss[0].m,otid:f.wss[0].otid,btid:f.wss[0].btid,mlid:f.wss[0].mlid,wsid:f.wss[0].wsid,btsid:f.wss[0].btsid,h:f.wss[0].h,o:f.wss[0].o,ortid:f.wss[0].ortid,spf:f.wss[0].spf,pid:1},sw:1,fpf:"iPhone",vt:"v4"};return console.log(h),e.data=h,e}async getOrders(){const e=[],r=pt.formatDate(new Date,"yyyy-MM-dd 11:59:59"),n=pt.formatDate(new Date().addSeconds(-3600*36),"yyyy-MM-dd 12:00:00");for(const s of[{url:py(this.account,"/mobilesitev2/api/MyBet/GetBetList"),data:{BetConfirmationStatusList:[1,2,3],dateTo:null,dateFrom:null}},{url:py(this.account,"/mobilesitev2/api/MyBet/GetBetStatement"),data:{DateFrom:n,DateTo:r}}]){const o=await mr.post(this.account,s.url,s.data,{headers:Ow(this.account)},Cr.http),a=o.data;if((a==null?void 0:a.StatusCode)!==100)return;a.wl.forEach(i=>{const l=i.wil[0];if(e.some(f=>f.orderId===l.s.toString()))return;let u=l.bts.toString();switch(l.bts){case 707:u=l.htn;break;case 708:u=l.atn;break}let c=Yt.none,d=0;l.wict===2?c=Yt.reject:l.wict===3?c=Yt.return:l.wics===1?c=Yt.pending:i.wla>0?(c=Yt.win,d=i.sa+i.wla):i.wla<0&&(c=Yt.lose,d=i.sa+i.wla),e.push({provider:fy,game:l.s.toString(),orderId:i.wid,createAt:new Date(i.wcdt).getTime(),match:`${l.htn} VS ${l.atn}`,bet:l.btn,item:u,odds:l.o,betMoney:i.sa,reward:d,money:i.wla,status:c})})}return e.desc(s=>s.createAt)}async betting(e){const r=py(this.account,"/mobilesitev2/api/PlaceBet/SinglePlaceBet"),n=await mr.post(this.account,r,e.data,{headers:Ow(this.account)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){const o=(s==null?void 0:s.StatusCode)??0;return new uo(fy,!1,U7[o]||`StatusCode:${o}`,e.data,s)}return new uo(fy,!0,`实际赔率:${s.ao},余额:${s.ab}`,e.data,s)}}var EQ={exports:{}},hy={},Yu={},Yf={},V7;function Zx(){if(V7)return Yf;V7=1;function t(o,a,i){if(i===void 0&&(i=Array.prototype),o&&typeof i.find=="function")return i.find.call(o,a);for(var l=0;l<o.length;l++)if(Object.prototype.hasOwnProperty.call(o,l)){var u=o[l];if(a.call(void 0,u,l,o))return u}}function e(o,a){return a===void 0&&(a=Object),a&&typeof a.freeze=="function"?a.freeze(o):o}function r(o,a){if(o===null||typeof o!="object")throw new TypeError("target is not an object");for(var i in a)Object.prototype.hasOwnProperty.call(a,i)&&(o[i]=a[i]);return o}var n=e({HTML:"text/html",isHTML:function(o){return o===n.HTML},XML_APPLICATION:"application/xml",XML_TEXT:"text/xml",XML_XHTML_APPLICATION:"application/xhtml+xml",XML_SVG_IMAGE:"image/svg+xml"}),s=e({HTML:"http://www.w3.org/1999/xhtml",isHTML:function(o){return o===s.HTML},SVG:"http://www.w3.org/2000/svg",XML:"http://www.w3.org/XML/1998/namespace",XMLNS:"http://www.w3.org/2000/xmlns/"});return Yf.assign=r,Yf.find=t,Yf.freeze=e,Yf.MIME_TYPE=n,Yf.NAMESPACE=s,Yf}var z7;function xQ(){if(z7)return Yu;z7=1;var t=Zx(),e=t.find,r=t.NAMESPACE;function n(we){return we!==""}function s(we){return we?we.split(/[\t\n\f\r ]+/).filter(n):[]}function o(we,Ie){return we.hasOwnProperty(Ie)||(we[Ie]=!0),we}function a(we){if(!we)return[];var Ie=s(we);return Object.keys(Ie.reduce(o,{}))}function i(we){return function(Ie){return we&&we.indexOf(Ie)!==-1}}function l(we,Ie){for(var $e in we)Object.prototype.hasOwnProperty.call(we,$e)&&(Ie[$e]=we[$e])}function u(we,Ie){var $e=we.prototype;if(!($e instanceof Ie)){let Bt=function(){};var et=Bt;Bt.prototype=Ie.prototype,Bt=new Bt,l($e,Bt),we.prototype=$e=Bt}$e.constructor!=we&&(typeof we!="function"&&console.error("unknown Class:"+we),$e.constructor=we)}var c={},d=c.ELEMENT_NODE=1,f=c.ATTRIBUTE_NODE=2,p=c.TEXT_NODE=3,h=c.CDATA_SECTION_NODE=4,g=c.ENTITY_REFERENCE_NODE=5,y=c.ENTITY_NODE=6,v=c.PROCESSING_INSTRUCTION_NODE=7,w=c.COMMENT_NODE=8,b=c.DOCUMENT_NODE=9,C=c.DOCUMENT_TYPE_NODE=10,E=c.DOCUMENT_FRAGMENT_NODE=11,_=c.NOTATION_NODE=12,A={},T={};A.INDEX_SIZE_ERR=(T[1]="Index size error",1),A.DOMSTRING_SIZE_ERR=(T[2]="DOMString size error",2);var S=A.HIERARCHY_REQUEST_ERR=(T[3]="Hierarchy request error",3);A.WRONG_DOCUMENT_ERR=(T[4]="Wrong document",4),A.INVALID_CHARACTER_ERR=(T[5]="Invalid character",5),A.NO_DATA_ALLOWED_ERR=(T[6]="No data allowed",6),A.NO_MODIFICATION_ALLOWED_ERR=(T[7]="No modification allowed",7);var B=A.NOT_FOUND_ERR=(T[8]="Not found",8);A.NOT_SUPPORTED_ERR=(T[9]="Not supported",9);var $=A.INUSE_ATTRIBUTE_ERR=(T[10]="Attribute in use",10);A.INVALID_STATE_ERR=(T[11]="Invalid state",11),A.SYNTAX_ERR=(T[12]="Syntax error",12),A.INVALID_MODIFICATION_ERR=(T[13]="Invalid modification",13),A.NAMESPACE_ERR=(T[14]="Invalid namespace",14),A.INVALID_ACCESS_ERR=(T[15]="Invalid access",15);function P(we,Ie){if(Ie instanceof Error)var $e=Ie;else $e=this,Error.call(this,T[we]),this.message=T[we],Error.captureStackTrace&&Error.captureStackTrace(this,P);return $e.code=we,Ie&&(this.message=this.message+": "+Ie),$e}P.prototype=Error.prototype,l(A,P);function O(){}O.prototype={length:0,item:function(we){return we>=0&&we<this.length?this[we]:null},toString:function(we,Ie){for(var $e=[],et=0;et<this.length;et++)ut(this[et],$e,we,Ie);return $e.join("")},filter:function(we){return Array.prototype.filter.call(this,we)},indexOf:function(we){return Array.prototype.indexOf.call(this,we)}};function D(we,Ie){this._node=we,this._refresh=Ie,x(this)}function x(we){var Ie=we._node._inc||we._node.ownerDocument._inc;if(we._inc!==Ie){var $e=we._refresh(we._node);if(pr(we,"length",$e.length),!we.$$length||$e.length<we.$$length)for(var et=$e.length;et in we;et++)Object.prototype.hasOwnProperty.call(we,et)&&delete we[et];l($e,we),we._inc=Ie}}D.prototype.item=function(we){return x(this),this[we]||null},u(D,O);function I(){}function F(we,Ie){for(var $e=we.length;$e--;)if(we[$e]===Ie)return $e}function R(we,Ie,$e,et){if(et?Ie[F(Ie,et)]=$e:Ie[Ie.length++]=$e,we){$e.ownerElement=we;var Bt=we.ownerDocument;Bt&&(et&&be(Bt,we,et),ge(Bt,we,$e))}}function M(we,Ie,$e){var et=F(Ie,$e);if(et>=0){for(var Bt=Ie.length-1;et<Bt;)Ie[et]=Ie[++et];if(Ie.length=Bt,we){var ur=we.ownerDocument;ur&&(be(ur,we,$e),$e.ownerElement=null)}}else throw new P(B,new Error(we.tagName+"@"+$e))}I.prototype={length:0,item:O.prototype.item,getNamedItem:function(we){for(var Ie=this.length;Ie--;){var $e=this[Ie];if($e.nodeName==we)return $e}},setNamedItem:function(we){var Ie=we.ownerElement;if(Ie&&Ie!=this._ownerElement)throw new P($);var $e=this.getNamedItem(we.nodeName);return R(this._ownerElement,this,we,$e),$e},setNamedItemNS:function(we){var Ie=we.ownerElement,$e;if(Ie&&Ie!=this._ownerElement)throw new P($);return $e=this.getNamedItemNS(we.namespaceURI,we.localName),R(this._ownerElement,this,we,$e),$e},removeNamedItem:function(we){var Ie=this.getNamedItem(we);return M(this._o

// ---- SABA 平台逻辑 / anchor 4: Xt.SABA / approx line 54474 ----
maps"]}},{tabId:t,headers:ZZe()}),o=s.data;return o?(console.log(ra,e,JSON.stringify(o)),QZe(r,o)):{matchs:[],subscribe:[]}},yy="/_api/graphql",Ql=Xt.Stake,q0=6.977023058793687,vy=t=>({"content-type":"application/json","x-language":"zh","x-operation-name":"CurrencyConfiguration","x-operation-type":"query","x-access-token":t.token}),rJe=(t,e,r)=>{let n=Yt.none;switch(t){case"confirmed":case"settledpending":case"cashoutpending":n=Yt.none;break;case"pending":n=Yt.pending;break;case"cancelpending":n=Yt.reject;break;case"settled":case"cashout":r>e?n=Yt.win:r<e?n=Yt.lose:n=Yt.return;break;case"cancelled":n=Yt.return;break}return n},Y7=t=>{var s,o,a,i,l;const e=rJe(t.status,t.amount,t.payout);let r=0;[Yt.win,Yt.lose].includes(e)&&(r=(t.payout-t.amount)*q0);const n=((s=t.outcomes.first())==null?void 0:s.fixture.tournament.category.sport.slug)??"";return{provider:Ql,orderId:t.id,odds:((o=t.outcomes.first())==null?void 0:o.odds)??0,createAt:new Date(t.createdAt).getTime(),betMoney:t.amount*q0,reward:t.payout*q0,money:r,status:e,game:n,match:((a=t.outcomes.first())==null?void 0:a.fixture.name)??"",bet:((i=t.outcomes.first())==null?void 0:i.market.name)??"",item:((l=t.outcomes.first())==null?void 0:l.outcome.name)??""}},Z7=new Map;class nJe extends $u{async getBalance(){var i,l;if(console.log(Ql,"tabId",qs.tabId),!qs.tabId)return;const e={query:`query UserBalances {
  user {
    id
    balances {
      available {
        amount
        currency
        __typename
      }
      vault {
        amount
        currency
        __typename
      }
      __typename
    }
    __typename
  }
}`,operationName:"UserBalances"},r=await Yn.post(`${yy}?${this.getBalance.name}`,e,{headers:vy(this.account),tabId:qs.tabId}),n=r.data;console.log(Ql,"getBalance",n);const s=(l=(i=n.data.user)==null?void 0:i.balances.find(u=>u.available.currency==="usdt"))==null?void 0:l.available.amount;let o;s!==void 0&&(o=s*q0);const a={query:`mutation UpdateUserBettingPreference($preference: UpdateUserPreferencePreferenceInput!) {
  updateUserPreference(preference: $preference) {
    id
    preference {
      noBetConfirmation
      oddsChangeCondition
      singleBetSlipDisplayFirst
    }
    __typename
  }
}`,variables:{preference:{noBetConfirmation:!1,singleBetSlipDisplayFirst:!0,oddsChangeCondition:"higher"}}};return await Yn.post(`${yy}?UpdateUserBettingPreference`,a,{headers:vy(this.account),tabId:qs.tabId}),{currency:ti.CNY,balance:o}}async checkBet(e){var c,d,f,p,h,g,y;if(!qs.tabId)return e.checkError="未找到Stake标签页",e;const r=Z7.get(e.betId);if(r&&r>Date.now()-30*1e3)return e.checkError=`请稍等 30 秒后再重下同样的赌注，当前时间：${Math.floor((Date.now()-r)/1e3)}秒`,e;const s=fo().getLimit(Ql,e.itemId);if(s!=null&&s.isLimit(e.betMoney))return e.checkError=`本地限红：${(c=s.getValue())==null?void 0:c.toFixed(2)}`,e.updateOdds(0),e;const o={query:`query SportBet_SportMarketOutcome($outcomeId: String!, $provider: SportsbookOddsProviderEnum!) {
  sportMarketOutcome(outcomeId: $outcomeId, provider: $provider) {
    id
    name
    odds
    market {
      id
      name
      status
      provider
      fixture {
        id
        slug
        status
        tournament {
          slug
          category {
            slug
            sport {
              slug
            }
          }
        }
        data {
          __typename
          ... on SportFixtureDataMatch {
            startTime
            competitors {
              name
            }
          }
          ... on SportFixtureDataOutright {
            startTime
            name
          }
        }
      }
    }
  }
}`,variables:{outcomeId:e.itemId,provider:"oddin"}},a=await Yn.post(`${yy}?${this.checkBet.name}`,o,{headers:vy(this.account),tabId:qs.tabId}),i=a.data;e.response=i;const l=((f=(d=i.data.sportMarketOutcome)==null?void 0:d.market)==null?void 0:f.status)!=="active";if(e.newOdds=l?0:(p=i.data.sportMarketOutcome)==null?void 0:p.odds,e.updateOdds(e.newOdds??0),!e.newOdds)return e.checkError=`${(g=(h=i.data.sportMarketOutcome)==null?void 0:h.market)==null?void 0:g.status} @ ${((y=i.data.sportMarketOutcome)==null?void 0:y.odds)??0}`,e;if(e.odds>e.newOdds+.01)return e.checkError=`新赔率：${e.newOdds}`,e;const u=pt.toFixed(e.betMoney/q0,8);return e.data={query:`mutation BetSlipFooter_SportBet($amount: Float!, $currency: CurrencyEnum!, $outcomeIds: [String!]!, $oddsChange: SportOddsChangeEnum!, $identifier: String, $betType: SportBetTypeEnum!, $stakeShieldEnabled: Boolean, $stakeShieldProtectionLevel: Int, $stakeShieldOfferOdds: Float) {
  sportBet(
    amount: $amount
    currency: $currency
    outcomeIds: $outcomeIds
    oddsChange: $oddsChange
    identifier: $identifier
    betType: $betType
    stakeShieldEnabled: $stakeShieldEnabled
    stakeShieldProtectionLevel: $stakeShieldProtectionLevel
    stakeShieldOfferOdds: $stakeShieldOfferOdds
  ) {
    id
    amount
    currency
    payoutMultiplier
    potentialMultiplier
    outcomes {
      id
      odds
    }
  }
}`,variables:{amount:u,currency:"usdt",outcomeIds:[e.itemId],betType:"esports",oddsChange:"higher",stakeShieldOfferOdds:e.newOdds}},e}async getOrders(){var s,o,a,i;if(!qs.tabId)return;const e={query:`query ActiveBets_User(
    $limit: Int!
    $sort: UserBetsSortEnum
    $name: String
    $offset: Int!
) {
    user(name: $name) {
        id
        activeSportBets(limit: $limit, sort: $sort, offset: $offset) {
            id
            status
            amount
            currency
            payout
            potentialMultiplier
            payoutMultiplier
            createdAt
            outcomes {
                odds
                outcome {
                    name
                }
                market {
                    name
                }
                fixture {
                    id
                    name
                    tournament {
                        category {
                            sport {
                                slug
                            }
                        }
                    }
                }
            }
        }
    }
}`,variables:{limit:50,offset:0,sort:"placedTime"}},r={query:`query SportSportList(
    $limit: Int!
    $offset: Int!
    $name: String
    $status: [SportBetStatusEnum!]
) {
    user(name: $name) {
        id
        name
        sportBetList(limit: $limit, offset: $offset, status: $status) {
            id
            iid
            bet {
                ... on SportBet {
                    id
                    status
                    amount
                    currency
                    payout
                    potentialMultiplier
                    payoutMultiplier
                    createdAt
                    outcomes {
                        odds
                        outcome {
                            name
                        }
                        market {
                            name
                        }
                        fixture {
                            id
                            name
                            tournament {
                                category {
                                    sport {
                                        slug
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}`,variables:{limit:15,offset:0,status:["settled","settledManual","settledPending","cancelPending","cancelled","cashout","cashoutPending"]}},n=[];for(const l of[e,r]){const u=await Yn.post(`${yy}?${this.getOrders.name}`,l,{headers:vy(this.account),tabId:qs.tabId}),c=u.data;console.log(Ql,"getOrders",c),(o=(s=c.data.user)==null?void 0:s.activeSportBets)==null||o.forEach(d=>{n.push(Y7(d))}),(i=(a=c.data.user)==null?void 0:a.sportBetList)==null||i.forEach(d=>{n.push(Y7(d.bet))})}return console.log(n),n}async betting(e){var s,o,a;if(!qs.tabId)return new uo(Ql,!1,"未找到Stake标签页");const r=await Yn.post(`${yy}?${this.betting.name}`,e.data,{headers:vy(this.account),tabId:qs.tabId}),n=r.data;if(n.errors){const i=n.errors.first();if(i!=null&&i.message&&(i==null?void 0:i.errorType)==="rejectedBetLimitExceededForBetReoffer"){const l=fo(),u=/[\d\.]+$/,c=i.message.match(u);if(c){const d=Number(c[0]);l.setLimit(Ql,e.itemId,Math.floor(d*q0),e.newOdds,60)}}else(i==null?void 0:i.errorType)==="insufficientBalance"&&await this.account.updateBalance();return new uo(Ql,!1,i==null?void 0:i.message,e.data,n)}else if(!n.data)return new uo(Ql,!1,"未知错误",e.data,n);return Z7.set(e.betId,Date.now()),new uo(Ql,!0,`投注成功，${n.data.sportBet.currency.toUpperCase()}${(s=n.data)==null?void 0:s.sportBet.amount}@${(a=(o=n.data)==null?void 0:o.sportBet.outcomes.first())==null?void 0:a.odds}`,e.data,n)}}class vf{static GetProvider(e){let r;switch(e.provider){case Xt.OB:r=new vYe(e);break;case Xt.RAY:r=new bYe(e);break;case Xt.TF:r=new wYe(e);break;case Xt.IA:r=new EYe(e);break;case Xt.IM:r=new AZe(e);break;case Xt.SABA:r=new SZe(e);break;case Xt.PB:r=new kZe(e);break;case Xt.IMT:r=new BZe(e);break;case Xt.HG:r=new qZe(e);break;case Xt.Stake:r=new nJe(e);break}return r}}ke(vf,"providerName",{OB:"DB电竞",RAY:"雷竞技",TF:"雷火电竞",IA:"小艾电竞",IM:"电竞牛",SABA:"沙巴电竞",PB:"平博",IMT:"IM体育",XBet:"1XBet",HG:"皇冠体育",Stake:"Stake"});var Yt=(t=>(t.pending="Pending",t.none="None",t.win="Win",t.lose="Lose",t.return="Return",t.reject="Reject",t))(Yt||{});class uo{constructor(e,r,n,s,o){ke(this,"provider");ke(this,"success");ke(this,"message");ke(this,"tip",null);ke(this,"reject",null);ke(this,"orderId",null);ke(this,"link",0);ke(this,"beginTime");ke(this,"request");ke(this,"response");this.provider=e,this.success=r,this.message=n,this.beginTime=Date.now(),this.request=s,this.response=o}Show(e,r){var s,o;r==null||r.close();let n=[`<p>比赛：${(s=e.match)==null?void 0:s.title}</p>`,`<p>盘口：${(o=e.bet)==null?void 0:o.getBetName()}</p>`,`<p>投注：${e.target}，金额：${e.betMoney}@${e.odds} / ${e.betCount}次</p>`];return this.message&&n.push(`提示：${this.message}`),Bc({title:`${e.type}投注${this.success?"成功":"失败"}`,dangerouslyUseHTMLString:!0,duration:8e3,message:n.join(""),customClass:`notification ${e.type}`,type:this.success?"success":"error"})}saveLog(e,r){const n=Io();this.beginTime=r,Vt.saveLog(`[${this.provider}](${n.getPlatform(e.platformId)},${e.playerName}) 下注 => ${this.success} / 耗时:${Date.now()-r}ms`,{result:this})}}class Tp{constructor(e,r,n,s,o,a,i){ke(this,"type");ke(this,"match");ke(this,"bet");ke(this,"item");ke(this,"target");ke(this,"matchId");ke(this,"betId");ke(this,"itemId");ke(this,"odds");ke(this,"newOdds");ke(this,"betMoney");ke(this,"betCount",0);ke(this,"config");ke(this,"loseOrder",!1);ke(this,"data",null);ke(this,"checkError");ke(this,"orderIndex",0);ke(this,"request");ke(this,"response");ke(this,"startTime");this.startTime=Date.now(),typeof e=="string"?(this.matchId=e,this.betId=r,this.itemId=n,this.betMoney=Math.round(o),this.type=s,this.target=a,this.odds=i):(this.type=n.type,this.match=e,this.bet=r,this.item=n,this.target=s,this.matchId=n.matchId,this.betId=n.betId,this.itemId=n.getItemId(s),this.odds=n.getOdds(s),this.betMoney=Math.round(o))}saveLog(e){var o,a;const r=Io(),n=`[${this.type}](${r.getPlatform(e.platformId)},${e.playerName}) 请求盘口数据 => ${!!this.data} / 耗时${Date.now()-this.startTime}ms / ${this.odds}:${this.newOdds||"N/A"}`,s={options:{type:this.type,match:(o=this.match)==null?void 0:o.title,matchId:this.matchId,bet:(a=this.bet)==null?void 0:a.getBetName(),betId:this.betId,target:this.target,itemId:this.itemId,odds:this.odds,newOdds:this.newOdds,betMoney:this.betMoney,betCount:this.betCount,config:this.config,loseOrder:this.loseOrder},checkError:this.checkError,response:this.response,request:this.request,data:this.data};Vt.saveLog(n,s)}updateOdds(e){fo().save(this.type,new Jn(this.itemId,e,!1,this.betId))}}var Gn=(t=>(t.Home="Home",t.Away="Away",t))(Gn||{});class kQ{constructor(e){ke(this,"id");ke(this,"title");ke(this,"game");ke(this,"gameId");ke(this,"startAt");ke(this,"map");ke(this,"bets");ke(this,"reverse");ke(this,"providers");this.id=e.ID,this.title=e.Title,this.game=e.Game,this.gameId=e.GameID,this.startAt=e.StartTime,this.map=e.Map,this.reverse=e.Reverse,this.providers=e.Matchs,this.bets=e.Bets.map(r=>new IQ(r,e.Matchs,e.Round,e.RoundStart))}}class IQ{constructor(e,r,n,s){ke(this,"id");ke(this,"homeName");ke(this,"awayName");ke(this,"round");ke(this,"items");ke(this,"isLive");ke(this,"startTime");ke(this,"name");this.id=e.ID,this.homeName=e.HomeName,this.awayName=e.AwayName,this.name=e.Name,this.round=e.Map,n!==0&&n===this.round&&(this.isLive=!0,this.startTime=s),this.items=Object.values(e.Sources).map(o=>new BQ(o,r[o.Type]??""))}getBetName(){return this.round===-1?this.name??"":this.round===0?"全场胜负":`[地图${this.round}] 获胜`}getProviders(e,r){const n=this.items.filter(l=>e.includes(l.type)),s=pt.max(n,l=>l.homeOdds),o=pt.max(n,l=>l.awayOdds);if(!s||!o||s.homeOdds===0||o.awayOdds===0||1/(1/s.homeOdds+1/o.awayOdds)<r.profit)return;const i=new Map;return i.set("Home",s),i.set("Away",o),i}GetOrderOptions(e,r,n){if(!r)return;const o=Io().getProviders(),a=[...o.keys()],i=pt.max(this.items.filter(v=>r.noSameBet&&!r.allowSameBet.includes(v.type)&&this.isBet(v.type,o.get(v.type),"Away")?!1:v.homeOdds&&v.homeOdds>=r.minOdds&&a.includes(v.type)),v=>v.homeOdds),l=pt.max(this.items.filter(v=>i&&i.type===v.type||r.noSameBet&&!r.allowSameBet.includes(v.type)&&this.isBet(v.type,o.get(v.type),"Away")?!1:v.awayOdds&&v.awayOdds>=r.minOdds&&a.includes(v.type)),v=>v.awayOdds);if(!i||!l)return;let u=1/(1/i.homeOdds+1/l.awayOdds),c=r.profit;const d=n==null?void 0:n.filter(v=>v.profit!==0&&(v.provider===i.type||v.provider===l.type));if(d&&d.length!==0&&(c=Number(d.map(v=>v.profit).max()??r.profit)),u<c||u>r.maxProfit)return;let f=[],p=Math.min(i.homeOdds,l.awayOdds),h=Math.max(i.homeOdds,l.awayOdds),g=r.betMoney,y=p*g/h;switch(r.tenNumber&&(y=Math.round(y/10)*10),i.homeOdds<l.awayOdds?f.push(new Tp(e,this,i,"Home",g),new Tp(e,this,l,"Away",y)):f.push(new Tp(e,this,l,"Away",g),new Tp(e,this,i,"Home",y)),r.betSorting){case"Low":f.sort((w,b)=>w.odds<b.odds?-1:1);break;case"High":f.sort((w,b)=>w.odds>b.odds?-1:1);break;case"Parallel":break;case"WinRate":const v=oJe(f,r);v?f=v:f.sort((w,b)=>r.providerSortValue.indexOf(w.type)>r.providerSortValue.indexOf(b.type)?1:-1);break;case"Custom":f.sort((w,b)=>r.providerSortValue.indexOf(w.type)>r.providerSortValue.indexOf(b.type)?1:-1);break}return f.some(v=>r.providerFixed.includes(v.type))&&f.sort((v,w)=>r.providerFixed.indexOf(v.type)>r.providerFixed.indexOf(w.type)?-1:1),f}isBet(e,r,n){}}class BQ{constructor(e,r){ke(this,"type");ke(this,"matchId");ke(this,"betId");ke(this,"homeId");ke(this,"awayId");ke(this,"homeOdds");ke(this,"awayOdds");this.type=e.Type,this.matchId=r,this.betId=e.BetID,this.homeId=e.HomeID,this.awayId=e.AwayID,[Xt.HG].includes(e.Type)?(this.homeOdds=e.HomeOdds,this.awayOdds=e.AwayOdds):(this.homeOdds=0,this.awayOdds=0)}getItemId(e){let r="";switch(e){case"Home":r=this.homeId;break;case"Away":r=this.awayId;break}return r}getOdds(e){let r=0;switch(e){case"Home":r=this.homeOdds;break;case"Away":r=this.awayOdds;break}return Number(r)}updateOdds(){const e=fo();this.homeOdds=e.getOdds(this.type,this.homeId,this.homeOdds)||0,this.awayOdds=e.getOdds(this.type,this.awayId,this.awayOdds)||0}showTarget(e){return this.homeId===this.awayId?e:e.toString()}}const oJe=(t,e)=>{var a,i;if(t.length!==2)return;const r=Vg();let n=!1;const s=t.map(l=>{var d;const u=`${(d=l.bet)==null?void 0:d.id}:${l.target}`,c=r.defaultOdds.get(u)??0;return c===0&&(n=!0),{provider:l.type,odds:c}});if(console.log(s),n||s.some(l=>l.odds===0))return;const o=1/pt.sum(s,l=>1/l.odds);if(s.forEach(l=>{l.winRate=o/l.odds}),!(Math.abs((((a=s[0])==null?void 0:a.winRate)??0)-(((i=s[1])==null?void 0:i.winRate)??0))<e.winRateValue))return t.desc(l=>{var u;return((u=s.find(c=>c.provider===l.type))==null?void 0:u.winRate)??0})},Pr={tip:(t,e,r)=>{const n=Date.now()+r;let s;/\<countdown\>/.test(e)&&(s=`countdown-${n}`,e=e.replace("<countdown>",`<countdown id="${s}">`)),r===0&&(r=3e3);const o=Bc({title:t,message:e,type:"info",duration:r,dangerouslyUseHTMLString:!0});if(s){const a=window.setInterval(()=>{const i=Math.round((n-Date.now())/1e3),l=document.getElementById(s);i<0||!l?window.clearInterval(a):l.innerText=i.toString()},1e3)}return o},alert:(t,e)=>{Lc.alert(t,e??"信息提示",{type:"info",confirmButtonText:"确定"})},error:(t,e)=>{Bc({title:`${t} / 采集发生错误`,message:e,type:"error",duration:10*1e3}),Gi().send.CollectMessage(t,e)},debug:(t,e)=>{e??(e=""),console.log(t,e)},getCurrency:t=>{let e=ti.CNY;if(!t)return e;switch(t){case"CNY":case"RMB":e=ti.CNY;break;case"USD":case"USDT":e=ti.USDT;break}return e},exchange:new Map([[ti.CNY,1],[ti.USDT,7]]),getExchange:t=>Pr.exchange.get(t)??1,getOpponent:t=>t===Gn.Home?Gn.Away:Gn.Home,convertMyToEU:(t,e)=>(e??(e=2),t>0?pt.toFixed(t+1,e):pt.toFixed(1+1/Math.abs(t),e)),getRate:(t,e)=>!t||!e?0:1/(1/t+1/e)},sJe=Se({__name:"App",setup(t){let e=!1;const r=Xn(),n=async()=>{const o=await Vt.getWebVersion();o!==BX&&(e||(e=!0,Lc.confirm(`检测到新版本：${o}`,"更新通知",{buttonSize:"large",confirmButtonText:"立即更新",cancelButtonText:"取消",type:"warning",beforeClose:(a,i,l)=>{l(),e=!1}}).then(()=>{location.reload()})))},s=async()=>{const o=r.config;if(o.bettingAutoOpen&&!o.betting){const a=Date.now();if(o.bettingAutoOpenTime&&a>=o.bettingAutoOpenTime){o.betting=!0,o.bettingAutoOpen=!1,o.bettingAutoOpenTime=0;const i=await Vt.saveUserConfig(o);console.log(i)}}};return zt(()=>{let o=0;setInterval(async()=>{o%600===0&&await n(),await s(),o++},1e3)}),(o,a)=>(H(),Fe(m(JH)))}});var b1={};let aJe=class{async next(e){let r=this.createConsumer(e),n=await r.next();return r.return(),n}async once(e){let r=await this.next(e);if(r.done)if(e==null)await new Promise(()=>{});else{let n=new Error("Stream consumer operation timed out early because stream ended");throw n.name="TimeoutError",n}return r.value}createConsumer(){throw new TypeError("Method must be overriden by subclass")}[Symbol.asyncIterator](){return this.createConsumer()}};var iJe=aJe;let lJe=class{constructor(e,r,n,s){this.id=r,this._backpressure=0,this.currentNode=n,this.timeout=s,this.isAlive=!0,this.stream=e,this.stream.setConsumer(this.id,this)}getStats(){let e={id:this.id,backpressure:this._backpressure};return this.timeout!=null&&(e.timeout=this.timeout),e}_resetBackpressure(){this._backpressure=0}applyBackpressure(e){this._backpressure++}releaseBackpressure(e){this._backpressure--}getBackpressure(){return this._backpressure}clearActiveTimeout(){clearTimeout(this._timeoutId),delete this._timeoutId}write(e){this._timeoutId!==void 0&&this.clearActiveTimeout(e),this.applyBackpressure(e),this._resolve&&(this._resolve(),delete this._resolve)}kill(e){this._killPacket={value:e,done:!0},this._timeoutId!==void 0&&this.clearActiveTimeout(this._killPacket),this._destroy(),this._resolve&&(this._resolve(),delete this._resolve)}_destroy(){this.isAlive=!1,this._resetBackpressure(),this.stream.removeConsumer(this.id)}async _waitForNextItem(e){return new Promise((r,n)=>{this._resolve=r;let s;if(e!==void 0){let o=new Error("Stream consumer iteration timed out");(async()=>{let a=uJe(e);s=a.timeoutId,await a.promise,o.name="TimeoutError",delete this._resolve,n(o)})()}this._timeoutId=s})}async next(){for(this.stream.setConsumer(this.id,this);;){if(!this.currentNode.next)try{await this._waitForNextItem(this.timeout)}catch(e){throw this._destroy(),e}if(this._killPacket){this._destroy();let e=this._killPacket;return delete this._killPacket,e}if(this.currentNode=this.currentNode.next,this.releaseBackpressure(this.currentNode.data),!(this.currentNode.consumerId&&this.currentNode.consumerId!==this.id))return this.currentNode.data.done&&this._destroy(),this.currentNode.data}}return(){return delete this.currentNode,this._destroy(),{}}[Symbol.asyncIterator](){return this}};function uJe(t){let e,r=new Promise(n=>{e=setTimeout(n,t)});return{timeoutId:e,promise:r}}var cJe=lJe;const dJe=iJe,fJe=cJe;let pJe=class extends dJe{constructor(e){super(),e=e||{},this._nextConsumerId=1,this.generateConsumerId=e.generateConsumerId,this.generateConsumerId||(this.generateConsumerId=()=>this._nextConsumerId++),this.removeConsumerCallback=e.removeConsumerCallback,this._consumers=new Map,this.tailNode={next:null,data:{value:void 0,done:!1}}}_write(e,r,n){let s={data:{value:e,done:r},next:null};n&&(s.consumerId=n),this.tailNode.next=s,this.tailNode=s;for(let o of this._consumers.values())o.write(s.data)}write(e){this._write(e,!1)}close(e){this._write(e,!0)}writeToConsumer(e,r){this._write(r,!1,e)}closeConsumer(e,r){this._write(r,!0,e)}kill(e){for(let r of this._consumers.keys())this.killConsumer(r,e)}killConsumer(e,r){let n=this._consumers.get(e);n&&n.kill(r)}getBackpressure(){let e=0;for(let r of this._consumers.values()){let n=r.getBackpressure();n>e&&(e=n)}return e}getConsumerBackpressure(e){let r=this._consumers.get(e);return r?r.getBackpressure():0}hasConsumer(e){return this._consumers.has(e)}setConsumer(e,r){this._consumers.set(e,r),r.currentNode||(r.currentNode=this.tailNode)}removeConsumer(e){let r=this._consumers.delete(e);return this.removeConsumerCallback&&this.removeConsumerCallback(e),r}getConsumerStats(e){let r=this._consumers.get(e);if(r)return r.getStats()}getConsumerStatsList(){let e=[];for(let r of this._consumers.values())e.push(r.getStats());return e}createConsumer(e){return new fJe(this,this.generateConsumerId(),this.tailNode,e)}getConsumerList(){return[...this._consumers.values()]}getConsumerCount(){return this._consumers.size}};var hJe=pJe;let gJe=class{async next(e){let r=this.createConsumer(e),n=await r.next();return r.return(),n}async once(e){let r=await this.next(e);if(r.done)if(e==null)await new Promise(()=>{});else{let n=new Error("Stream consumer operation timed out early because stream ended");throw n.name="TimeoutError",n}return r.value}createConsumer(){throw new TypeError("Method must be overriden by subclass")}[Symbol.asyncIterator](){return this.createConsumer()}};var mJe=gJe;const yJe=mJe;let vJe=class extends yJe{constructor(e,r){super(),this._streamDemux=e,this.name=r}createConsumer(e){return this._streamDemux.createConsumer(this.name,e)}};var bJe=vJe;const wJe=hJe,CJe=bJe;let EJe=class{constructor(){this.streams={},this._nextConsumerId=1,this.generateConsumerId=()=>this._nextConsumerId++}write(e,r){this.streams[e]&&this.streams[e].write(r)}close(e,r){this.streams[e]&&this.streams[e].close(r)}closeAll(e){for(let r of Object.values(this.streams))r.close(e)}writeToConsumer(e,r){for(let n of Object.values(this.streams))if(n.hasConsumer(e))return n.writeToConsumer(e,r)}closeConsumer(e,r){for(let n of Object.values(this.streams))if(n.hasConsumer(e))return n.closeConsumer(e,r)}getConsumerStats(e){for(let[r,n]of Object.entries(this.streams))if(n.hasConsumer(e))return{...n.getConsumerStats(e),stream:r}}getConsumerStatsList(e){return this.streams[e]?this.streams[e].getConsumerStatsList().map(r=>({...r,stream:e})):[]}getConsumerStatsListAll(){let e=[];for(let r of Object.keys(this.streams)){let n=this.getConsumerStatsList(r);for(let s of n)e.push(s)}return e}kill(e,r){this.streams[e]&&this.streams[e].kill(r)}killAll(e){for(let r of Object.values(this.streams))r.kill(e)}killConsumer(e,r){for(let n of Object.values(this.streams))if(n.hasConsumer(e))return n.killConsumer(e,r)}getBackpressure(e){return this.streams[e]?this.streams[e].getBackpressure():0}getBackpressureAll(){return Object.values(this.streams).reduce((e,r)=>Math.max(e,r.getBackpressure()),0)}getConsumerBackpressure(e){for(let r of Object.values(this.streams))if(r.hasConsumer(e))return r.getConsumerBackpressure(e);return 0}hasConsumer(e,r){return this.streams[e]?this.streams[e].hasConsumer(r):!1}hasConsumerAll(e){return Object.values(this.streams).some(r=>r.hasConsumer(e))}getConsumerCount(e){return this.streams[e]?this.streams[e].getConsumerCount():0}getConsumerCountAll(){return Object.values(this.streams).reduce((e,r)=>e+r.getConsumerCount(),0)}createConsumer(e,r){return this.streams[e]||(this.streams[e]=new wJe({generateConsumerId:this.generateConsumerId,removeConsumerCallback:()=>{this.getConsumerCount(e)||delete this.streams[e]}})),this.streams[e].createConsumer(r)}stream(e){return new CJe(this,e)}unstream(e){delete this.streams[e]}};var OQ=EJe;const xJe=OQ;function Uo(t){this._listenerDemux=new xJe}Uo.prototype.emit=function(t,e){this._listenerDemux.write(t,e)};Uo.prototype.listener=function(t){return this._listenerDemux.stream(t)};Uo.prototype.closeListener=function(t){this._listenerDemux.close(t)};Uo.prototype.closeAllListeners=function(){this._listenerDemux.closeAll()};Uo.prototype.removeListener=function(t){this._listenerDemux.unstream(t)};Uo.prototype.getListenerConsumerStats=function(t){return this._listenerDemux.getConsumerStats(t)};Uo.prototype.getListenerConsumerStatsList=function(t){return this._listenerDemux.getConsumerStatsList(t)};Uo.prototype.getAllListenersConsumerStatsList=function(){return this._listenerDemux.getConsumerStatsListAll()};Uo.prototype.getListenerConsumerCount=function(t){return this._listenerDemux.getConsumerCount(t)};Uo.prototype.getAllListenersConsumerCount=function(){return this._listenerDemux.getConsumerCountAll()};Uo.prototype.killListener=function(t){this._listenerDemux.kill(t)};Uo.prototype.killAllListeners=function(){this._listenerDemux.killAll()};Uo.prototype.killListenerConsumer=function(t){this._listenerDemux.killConsumer(t)};Uo.prototype.getListenerBackpressure=function(t){return this._listenerDemux.getBackpressure(t)};Uo.prototype.getAllListenersBackpressure=function(){return this._listenerDemux.getBackpressureAll()};Uo.prototype.getListenerConsumerBackpressure=function(t){return this._listenerDemux.getConsumerBackpressure(t)};Uo.prototype.hasListenerConsumer=function(t,e){return this._listenerDemux.hasConsumer(t,e)};Uo.prototype.hasAnyListenerConsumer=function(t){return this._listenerDemux.hasConsumerAll(t)};var TJe=Uo;let AJe=class{async next(e){let r=this.createConsumer(e),n=await r.next();return r.return(),n}async once(e){let r=await this.next(e);return r.done&&await new Promise(()=>{}),r.value}createConsumer(){throw new TypeError("Method must be overriden by subclass")}[Symbol.asyncIterator](){return this.createConsumer()}};var SJe=AJe;const _Je=SJe;let Jx=class L2 extends _Je{constructor(e,r,n,s){super(),this.PENDING=L2.PENDING,this.SUBSCRIBED=L2.SUBSCRIBED,this.UNSUBSCRIBED=L2.UNSUBSCRIBED,this.name=e,this.client=r,this._eventDemux=n,this._dataStream=s.stream(this.name)}createConsumer(e){return this._dataStream.createConsumer(e)}listener(e){return this._eventDemux.stream(`${this.name}/${e}`)}close(){this.client.closeChannel(this.name)}kill(){this.client.killChannel(this.name)}killOutputConsumer(e){this.hasOutputConsumer(e)&&this.client.killChannelOutputConsumer(e)}killListenerConsumer(e){this.hasAnyListenerConsumer(e)&&this.client.killChannelListenerConsumer(e)}getOutputConsumerStats(e){if(this.hasOutputConsumer(e))return thi

// ---- SABA 平台逻辑 / anchor 5: Xt.SABA / approx line 54535 ----
Fn("identifier",xr)},identifierNameEscape(){if(qr!=="u")throw Wn(bt());bt();const t=hB();switch(t){case"$":case"_":case"‌":case"‍":break;default:if(!ho.isIdContinueChar(t))throw n$();break}xr+=t,Br="identifierName"},sign(){switch(qr){case".":xr=bt(),Br="decimalPointLeading";return;case"0":xr=bt(),Br="zero";return;case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":xr=bt(),Br="decimalInteger";return;case"I":return bt(),Zf("nfinity"),Fn("numeric",ec*(1/0));case"N":return bt(),Zf("aN"),Fn("numeric",NaN)}throw Wn(bt())},zero(){switch(qr){case".":xr+=bt(),Br="decimalPoint";return;case"e":case"E":xr+=bt(),Br="decimalExponent";return;case"x":case"X":xr+=bt(),Br="hexadecimal";return}return Fn("numeric",ec*0)},decimalInteger(){switch(qr){case".":xr+=bt(),Br="decimalPoint";return;case"e":case"E":xr+=bt(),Br="decimalExponent";return}if(ho.isDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},decimalPointLeading(){if(ho.isDigit(qr)){xr+=bt(),Br="decimalFraction";return}throw Wn(bt())},decimalPoint(){switch(qr){case"e":case"E":xr+=bt(),Br="decimalExponent";return}if(ho.isDigit(qr)){xr+=bt(),Br="decimalFraction";return}return Fn("numeric",ec*Number(xr))},decimalFraction(){switch(qr){case"e":case"E":xr+=bt(),Br="decimalExponent";return}if(ho.isDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},decimalExponent(){switch(qr){case"+":case"-":xr+=bt(),Br="decimalExponentSign";return}if(ho.isDigit(qr)){xr+=bt(),Br="decimalExponentInteger";return}throw Wn(bt())},decimalExponentSign(){if(ho.isDigit(qr)){xr+=bt(),Br="decimalExponentInteger";return}throw Wn(bt())},decimalExponentInteger(){if(ho.isDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},hexadecimal(){if(ho.isHexDigit(qr)){xr+=bt(),Br="hexadecimalInteger";return}throw Wn(bt())},hexadecimalInteger(){if(ho.isHexDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},string(){switch(qr){case"\\":bt(),xr+=_Qe();return;case'"':if(Uy)return bt(),Fn("string",xr);xr+=bt();return;case"'":if(!Uy)return bt(),Fn("string",xr);xr+=bt();return;case``:case"\r":throw Wn(bt());case"\u2028":case"\u2029":IQe(qr);break;case void 0:throw Wn(bt())}xr+=bt()},start(){switch(qr){case"{":case"[":return Fn("punctuator",bt())}Br="value"},beforePropertyName(){switch(qr){case"$":case"_":xr=bt(),Br="identifierName";return;case"\\":bt(),Br="identifierNameStartEscape";return;case"}":return Fn("punctuator",bt());case'"':case"'":Uy=bt()==='"',Br="string";return}if(ho.isIdStartChar(qr)){xr+=bt(),Br="identifierName";return}throw Wn(bt())},afterPropertyName(){if(qr===":")return Fn("punctuator",bt());throw Wn(bt())},beforePropertyValue(){Br="value"},afterPropertyValue(){switch(qr){case",":case"}":return Fn("punctuator",bt())}throw Wn(bt())},beforeArrayValue(){if(qr==="]")return Fn("punctuator",bt());Br="value"},afterArrayValue(){switch(qr){case",":case"]":return Fn("punctuator",bt())}throw Wn(bt())},end(){throw Wn(bt())}};function Fn(t,e){return{type:t,value:e,line:bf,column:bl}}function Zf(t){for(const e of t){if(Nc()!==e)throw Wn(bt());bt()}}function _Qe(){switch(Nc()){case"b":return bt(),"\b";case"f":return bt(),"\f";case"n":return bt(),``;case"r":return bt(),"\r";case"t":return bt(),"	";case"v":return bt(),"\v";case"0":if(bt(),ho.isDigit(Nc()))throw Wn(bt());return"\0";case"x":return bt(),PQe();case"u":return bt(),hB();case``:case"\u2028":case"\u2029":return bt(),"";case"\r":return bt(),Nc()===``&&bt(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":throw Wn(bt());case void 0:throw Wn(bt())}return bt()}function PQe(){let t="",e=Nc();if(!ho.isHexDigit(e)||(t+=bt(),e=Nc(),!ho.isHexDigit(e)))throw Wn(bt());return t+=bt(),String.fromCodePoint(parseInt(t,16))}function hB(){let t="",e=4;for(;e-- >0;){const r=Nc();if(!ho.isHexDigit(r))throw Wn(bt());t+=bt()}return String.fromCodePoint(parseInt(t,16))}const kQe={start(){if(Go.type==="eof")throw Jf();QS()},beforePropertyName(){switch(Go.type){case"identifier":case"string":d6=Go.value,na="afterPropertyName";return;case"punctuator":Ww();return;case"eof":throw Jf()}},afterPropertyName(){if(Go.type==="eof")throw Jf();na="beforePropertyValue"},beforePropertyValue(){if(Go.type==="eof")throw Jf();QS()},beforeArrayValue(){if(Go.type==="eof")throw Jf();if(Go.type==="punctuator"&&Go.value==="]"){Ww();return}QS()},afterPropertyValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforePropertyName";return;case"}":Ww()}},afterArrayValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforeArrayValue";return;case"]":Ww()}},end(){}};function QS(){let t;switch(Go.type){case"punctuator":switch(Go.value){case"{":t={};break;case"[":t=[];break}break;case"null":case"boolean":case"numeric":case"string":t=Go.value;break}if(wv===void 0)wv=t;else{const e=Ac[Ac.length-1];Array.isArray(e)?e.push(t):Object.defineProperty(e,d6,{value:t,writable:!0,enumerable:!0,configurable:!0})}if(t!==null&&typeof t=="object")Ac.push(t),Array.isArray(t)?na="beforeArrayValue":na="beforePropertyName";else{const e=Ac[Ac.length-1];e==null?na="end":Array.isArray(e)?na="afterArrayValue":na="afterPropertyValue"}}function Ww(){Ac.pop();const t=Ac[Ac.length-1];t==null?na="end":Array.isArray(t)?na="afterArrayValue":na="afterPropertyValue"}function Wn(t){return nE(t===void 0?`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `:`JSON5: invalid character '${bee(t)}' at ${
        bf
      }
      :${
        bl
      }
      `)}function Jf(){return nE(`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `)}function n$(){return bl-=5,nE(`JSON5: invalid identifier character at ${
        bf
      }
      :${
        bl
      }
      `)}function IQe(t){console.warn(`JSON5: '${bee(t)}' in strings is not valid ECMAScript;
      consider escaping`)}function bee(t){const e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[t])return e[t];if(t<" "){const r=t.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return t}function nE(t){const e=new SyntaxError(t);return e.lineNumber=bf,e.columnNumber=bl,e}var BQe=function(e,r,n){const s=[];let o="",a,i,l="",u;if(r!=null&&typeof r=="object"&&!Array.isArray(r)&&(n=r.space,u=r.quote,r=r.replacer),typeof r=="function")i=r;else if(Array.isArray(r)){a=[];for(const g of r){let y;typeof g=="string"?y=g:(typeof g=="number"||g instanceof String||g instanceof Number)&&(y=String(g)),y!==void 0&&a.indexOf(y)<0&&a.push(y)}}return n instanceof Number?n=Number(n):n instanceof String&&(n=String(n)),typeof n=="number"?n>0&&(n=Math.min(10,Math.floor(n)),l="          ".substr(0,n)):typeof n=="string"&&(l=n.substr(0,10)),c("",{"":e});function c(g,y){let v=y[g];switch(v!=null&&(typeof v.toJSON5=="function"?v=v.toJSON5(g):typeof v.toJSON=="function"&&(v=v.toJSON(g))),i&&(v=i.call(y,g,v)),v instanceof Number?v=Number(v):v instanceof String?v=String(v):v instanceof Boolean&&(v=v.valueOf()),v){case null:return"null";case!0:return"true";case!1:return"false"}if(typeof v=="string")return d(v);if(typeof v=="number")return String(v);if(typeof v=="object")return Array.isArray(v)?h(v):f(v)}function d(g){const y={"'":.1,'"':.2},v={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};let w="";for(let C=0;C<g.length;C++){const E=g[C];switch(E){case"'":case'"':y[E]++,w+=E;continue;case"\0":if(ho.isDigit(g[C+1])){w+="\\x00";continue}}if(v[E]){w+=v[E];continue}if(E<" "){let _=E.charCodeAt(0).toString(16);w+="\\x"+("00"+_).substring(_.length);continue}w+=E}const b=u||Object.keys(y).reduce((C,E)=>y[C]<y[E]?C:E);return w=w.replace(new RegExp(b,"g"),v[b]),b+w+b}function f(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=a||Object.keys(g),w=[];for(const C of v){const E=c(C,g);if(E!==void 0){let _=p(C)+":";l!==""&&(_+=" "),_+=E,w.push(_)}}let b;if(w.length===0)b="{}";else{let C;if(l==="")C=w.join(","),b="{"+C+"}";else{let E=`,
      `+o;C=w.join(E),b=`{
        `+o+C+`,
        `+y+"}"}}return s.pop(),o=y,b}function p(g){if(g.length===0)return d(g);const y=String.fromCodePoint(g.codePointAt(0));if(!ho.isIdStartChar(y))return d(g);for(let v=y.length;v<g.length;v++)if(!ho.isIdContinueChar(String.fromCodePoint(g.codePointAt(v))))return d(g);return g}function h(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=[];for(let b=0;b<g.length;b++){const C=c(String(b),g);v.push(C!==void 0?C:"null")}let w;if(v.length===0)w="[]";else if(l==="")w="["+v.join(",")+"]";else{let b=`,
        `+o,C=v.join(b);w=`[`+o+C+`,
        `+y+"]"}return s.pop(),o=y,w}};const OQe={parse:AQe,stringify:BQe};var DQe=OQe;const $w=(t,e)=>{const r=new RegExp(`ES.${
          e
        }
        = (.+);
        `);if(!r.test(t))return;const n=r.exec(t);if(n)return n[1]},ks=Xt.SABA;let wee=[];const MQe={20:"Moneyline",9001:"Map X Moneyline"},NQe=t=>{if(!t)return;const e=t.gameId;if(!e||!wee.includes(e.toString()))return;const r=Date.now();if(!(t.kickofftime>r/1e3+3600))return{SourceMatchID:t.matchid,SourceGameID:e,Type:ks,StartTime:t.kickofftime*1e3,HomeID:t.homeid,Home:t.hteamnamecn,AwayID:t.awayid,Away:t.ateamnamecn,Teams:[{TeamID:t.homeid,Type:ks,GameID:e,Name:t.hteamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.homeid}&ha=h`},{TeamID:t.awayid,Type:ks,GameID:e,Name:t.ateamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.awayid}&ha=a`}]}},RQe=(t,e)=>{if(!t)return;const r=MQe[t.bettype];if(!r)return;const n=t.resourceid&&Number(t.resourceid)||0,s=`${t.oddsid}:Home`,o=Pr.convertMyToEU(t.odds1a),a=`${t.oddsid}:Away`,i=Pr.convertMyToEU(t.odds2a),l=t.oddsstatus!=="running",u=fo();return u.save(ks,new Jn(s,o,l)),u.save(ks,new Jn(a,i,l)),{Type:ks,SourceMatchID:t.matchid,SourceBetID:t.oddsid,Map:n,BetName:r.replace("Map X",`Map ${n}`),SourceHomeID:s,HomeName:e.Home,HomeOdds:o,SourceAwayID:a,AwayName:e.Away,AwayOdds:i,Status:l?"Locked":"Normal"}},f6="SABA:CONTENT",FQe=()=>sessionStorage.getItem(f6),WQe=t=>{t&&sessionStorage.setItem(f6,t)},$Qe=()=>{sessionStorage.removeItem(f6)},LQe=async()=>{var c,d,f,p;const t=await Vt.getPlatform(Xt.SABA);if(!t)return;wee=t.games;let e=FQe();const r=`${t.gateway}/${t.token}/ESports/43/ALL?mode=m0&market=L`;if(e||(e=(await Yn.get(r)).data,WQe(e)),!e)return;const n=$w(e,"url");if(!n)return;const s=(c=DQe.parse(n))==null?void 0:c.p,o=(d=$w(e,"id"))==null?void 0:d.replace(/\"/g,"");if(!o)return;const a=(f=$w(e,"logo"))==null?void 0:f.replace(/\"/g,"");if(!a)return;const i=$w(e,"account");if(!i)return;const l=JSON.parse(i),u=(p=l==null?void 0:l.pnv)==null?void 0:p.tk;if(u)return{gateway:r,url:s,gid:pt.uuid("N").substring(0,16),token:u,id:o,rid:"1",ext:1,logo:a,config:t}},UQe=async()=>{const e=Io().accounts.find(r=>r.provider===Xt.SABA);e&&await Vt.updatePlatform({provider:Xt.SABA,token:e.token,gateway:e.gateway})},Lw=[],wy=new Map,r0=new Map,Uw=new Map,U2=async()=>{if(!Io().accounts.some(l=>l.provider===Xt.SABA)){await pt.wait(60*1e3),await U2();return}const r=await LQe();if(!r){Bc.error(`${ks}配置读取失败，等待60秒后重试`),await UQe(),await pt.wait(60*1e3),await U2();return}console.log(ks,r);const n=fo(),s=Tf(),o=new URL(r.gateway),a=G0(`wss://${r.url}`,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${o.host}`},query:{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext}});a.on("connect",()=>{a.emit("init",{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext,dr:"transport close",rc:1,v:2}),a.on("init",h=>{console.log(`SABA init 链接成功 => ${JSON.stringify(h)}`),a.emit("subscribe",u)});const u=[["odds",{spread:[{id:"c0",rev:"DM4WT",sorting:0,condition:{},r:"c1627df7-r3928",p:"d530b060d500b34b-b2074"}],odds:[{id:"c2",rev:"Gwz9v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"},{id:"c4",rev:"Gwz0v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"}]}.odds]];a.on("err",h=>{Bc.error(`${ks}连接发生错误:${h}`),$Qe(),a.disconnect()}),a.on("disconnectReason",h=>{Bc.error(`${ks}链接断开:${h}`),a.disconnect()});const c=h=>{const[g,...y]=h,v={};for(let w=0;w<y.length;w+=2){const b=y[w],C=y[w+1];v[Lw[b]??b]=C}return v},d=h=>{var C;const[g,...y]=h;if(g!=="m")return;const v={};for(let E=1;E<h.length;E+=2){const _=h[E],A=h[E+1];v[Lw[_]??_]=A}const w=v.matchid;if(w)if(!r0.has(w))r0.set(w,v);else{const E=r0.get(w);Object.keys(v).forEach(_=>{E[_]=v[_]})}if(!w)return;const b=r0.get(w);if(b!=null&&b.leagueid){const E=(C=wy.get(b.leagueid))==null?void 0:C.leaguegroupid;E&&(b.gameId=E)}return b},f=h=>{const[g,...y]=h;if(g!=="l")return;const v={};for(let b=1;b<h.length;b+=2){const C=h[b],E=h[b+1];v[Lw[C]??C]=E}const w=v.leagueid;if(w)if(!wy.has(w))wy.set(w,v);else{const b=wy.get(w);Object.keys(v).forEach(C=>{b[C]=v[C]})}return w&&wy.get(w)||void 0},p=h=>{const g=c(h),y=g.oddsid;if(y){const v=Uw.get(y);v?Object.keys(g).forEach(w=>{v[w]=g[w]}):Uw.set(y,g)}else return;return Uw.get(y)};a.on("m",async(h,g,y)=>{g.forEach(async v=>{const[w,...b]=v;switch(w){case"c":break;case"f":const[C,E]=b;E.forEach((_,A)=>{const T=C+A;Lw[T]=_});break;case 0:switch(b[0]){case"reset":r0.clear();break;case"done":const _=[];r0.forEach(A=>{const T=NQe(A);T&&_.push(T)}),await s.saveMatch(ks,_),_.forEach(A=>{const T=[];[...Uw.values()].filter(S=>S.matchid===A.SourceMatchID).forEach(S=>{const B=RQe(S,A);B&&T.push(B)}),s.saveBets(ks,A.SourceMatchID,T)});break;case"l":f(b);break;case"m":d(b);break;case"-m":{const A=d(b);A==null||A.matchid}break;case"o":{const A=p(b),T=(A==null?void 0:A.oddsstatus)!=="running";A!=null&&A.oddsid&&(A!=null&&A.odds1a)&&n.save(ks,new Jn(`${A.oddsid}:Home`,Pr.convertMyToEU(A.odds1a),T,A.oddsid)),A!=null&&A.oddsid&&(A!=null&&A.odds2a)&&n.save(ks,new Jn(`${A.oddsid}:Away`,Pr.convertMyToEU(A.odds2a),T,A.oddsid))}break;case"-o":{const A=p(b),T=A==null?void 0:A.oddsid;T&&n.updateBetLock(ks,T,!0)}break}break}})})});const i=Date.now();for(;;)if(await pt.wait(3e3),await VQe(r.config),a.connected){Date.now()-i>300*1e3&&a.disconnect();continue}else if(a.disconnected){n.clean(ks);break}await U2()},VQe=async t=>{const e=`${t.gateway}/${t.token}/LoginCheckin/Index`;await Yn.post(e,null,{headers:{username:""}})},Qa=Xt.IMT;let Ba;const zQe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},o$=t=>`https://ipis-cdn.kemehkemeh.xyz/TeamImage/${t}.png`,jQe=t=>{if(!t||t.length!==2)return 0;const e=/gamenr=(\d)/;if(!e.test(t[0].s))return 0;const r=e.exec(t[0].s);return r?Number(r[1]):0},Cee=t=>{if(!t)return;const e=zQe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}};let V2;const HQe=async()=>{if(!Ba||!fb)return;const t=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/GetAllLiveEvents`,e={AllLiveEventsRequestGroups:fb.games.map(o=>({SportId:Number(o),EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),IsCombo:!1,OddsType:3,BetTypes:[283],Periods:[1],SortingType:2,PanelType:2},r=await mr.post(Ba,t,e,{headers:Cee(Ba)},Cr.http),n=r.data;if((n==null?void 0:n.StatusCode)!==100)return;const s=[];return n.d&&(V2=n.d),n.ale.forEach(o=>{o.sels.forEach(a=>{const i=`${a.st}:${a.eid}`,l=[];a.mls.forEach(u=>{if(!u.ws||u.ws.length!==2)return;const c=u.ws.find(h=>h.si===707),d=u.ws.find(h=>h.si===708);if(!c||!d)return;const f=jQe(u.ws);if(f===0)return;const p=`${f}:${u.bti}:${u.mi}`;l.push({Type:Qa,SourceMatchID:i,SourceBetID:p,SourceHomeID:`${c.si}:${c.wsi}`,HomeName:a.htn,HomeOdds:c.o,SourceAwayID:`${d.si}:${d.wsi}`,AwayName:a.atn,AwayOdds:d.o,BetName:u.btn,Map:f,Status:u.il?"Locked":"Normal"})}),s.push({SourceMatchID:i,SourceGameID:a.st,Type:Qa,StartTime:new Date(a.edt).getTime(),HomeID:a.htid,Home:a.htn,AwayID:a.atid,Away:a.atn,Teams:[{Type:Qa,TeamID:a.htid,Name:a.htn,GameID:a.st,Logo:o$(a.htid)},{Type:Qa,TeamID:a.atid,Name:a.atn,GameID:a.st,Logo:o$(a.atid)}],Bets:l})})}),s},GQe=async()=>{const t=fo();if(!V2||!fb||!Ba||z2.length===0){t.clean(Qa);return}const e={AllLiveEventsDeltaRequestGroups:z2.map(o=>({SportId:o,EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),CompetitionIds:[],SortingType:2,Delta:V2,BetTypes:[283],Periods:[1],OddsType:3,SportIds:z2,IsCombo:!1,PanelType:2},r=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta`,n=await mr.post(Ba,r,e,{headers:Cee(Ba)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){t.clean(Qa);return}V2=s.Delta,s.dc.forEach(o=>{o.v.forEach(a=>{a.ws.forEach(i=>{const l=`${i.si}:${i.wsi}`;t.save(Qa,new Jn(l,i.o,a.il))})})})};let fb=null,s$=0,z2=[];const Eee=async()=>{try{if(fb=await Vt.getPlatform(Qa),!fb)return;Ba=Io().accounts.find(n=>n.provider===Qa&&n.balance!==void 0);const t=fo(),e=Tf();if(!Ba){console.log(Qa,"当前未检测到账号"),t.clean(Qa),await pt.wait(3*1e3);return}if(Date.now()-s$>60*1e3){const n=await HQe();if(!n)return;await e.saveMatch(Qa,n)&&n.forEach(async s=>{s.Bets&&await e.saveBets(Qa,s.SourceMatchID,s.Bets)}),z2=[...new Set(n.map(s=>s.SourceGameID))],s$=Date.now()}await GQe()}finally{await pt.wait(1e3),Eee()}},Vw=Xt.XBet,KQe=async()=>{const t=fo(),e=Vg();ph["XBet:Score"]=r=>{console.log(Vw,r),e.updateScore(Xt.XBet,r)},ph[Vw]=r=>{r.bets.forEach(s=>{const o=`${s.betId}:1`,a=`${s.betId}:3`;t.save(Vw,new Jn(o,s.home,!1)),t.save(Vw,new Jn(a,s.away,!1))})}},gB=kL(sJe).use(Yre());gB.use(JC).use(Cke);const qQe=t=>{if(!t)return;const e=document.getElementById("app");e&&(document.body.classList.add("checking"),e.innerHTML=`<h1>插件检测中...</h1> <a href="./extensions/${t}.zip" target="_blank">下载插件</a>`)},YQe=async()=>{const t=await Nr.get(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`),e=t.data.version;for(let r=0;r<10;r++){const n=await Yn.init();if(n){const s=`${n.name} ${n.version}`;document.body.classList.remove("checking"),no({message:s,type:"success",dangerouslyUseHTMLString:!0,duration:5*1e3}),document.title=s,n.error?Lc.alert(`${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>`,"插件发生错误",{type:"error",showConfirmButton:!1,dangerouslyUseHTMLString:!0,draggable:!0}):(gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),gB.mount("#app"));break}qQe(e),await pt.wait(3e3)}};YQe()});export default ZQe();
        

// ---- SABA 平台逻辑 / anchor 6: Xt.SABA / approx line 54535 ----
,decimalExponentSign(){if(ho.isDigit(qr)){xr+=bt(),Br="decimalExponentInteger";return}throw Wn(bt())},decimalExponentInteger(){if(ho.isDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},hexadecimal(){if(ho.isHexDigit(qr)){xr+=bt(),Br="hexadecimalInteger";return}throw Wn(bt())},hexadecimalInteger(){if(ho.isHexDigit(qr)){xr+=bt();return}return Fn("numeric",ec*Number(xr))},string(){switch(qr){case"\\":bt(),xr+=_Qe();return;case'"':if(Uy)return bt(),Fn("string",xr);xr+=bt();return;case"'":if(!Uy)return bt(),Fn("string",xr);xr+=bt();return;case``:case"\r":throw Wn(bt());case"\u2028":case"\u2029":IQe(qr);break;case void 0:throw Wn(bt())}xr+=bt()},start(){switch(qr){case"{":case"[":return Fn("punctuator",bt())}Br="value"},beforePropertyName(){switch(qr){case"$":case"_":xr=bt(),Br="identifierName";return;case"\\":bt(),Br="identifierNameStartEscape";return;case"}":return Fn("punctuator",bt());case'"':case"'":Uy=bt()==='"',Br="string";return}if(ho.isIdStartChar(qr)){xr+=bt(),Br="identifierName";return}throw Wn(bt())},afterPropertyName(){if(qr===":")return Fn("punctuator",bt());throw Wn(bt())},beforePropertyValue(){Br="value"},afterPropertyValue(){switch(qr){case",":case"}":return Fn("punctuator",bt())}throw Wn(bt())},beforeArrayValue(){if(qr==="]")return Fn("punctuator",bt());Br="value"},afterArrayValue(){switch(qr){case",":case"]":return Fn("punctuator",bt())}throw Wn(bt())},end(){throw Wn(bt())}};function Fn(t,e){return{type:t,value:e,line:bf,column:bl}}function Zf(t){for(const e of t){if(Nc()!==e)throw Wn(bt());bt()}}function _Qe(){switch(Nc()){case"b":return bt(),"\b";case"f":return bt(),"\f";case"n":return bt(),``;case"r":return bt(),"\r";case"t":return bt(),"	";case"v":return bt(),"\v";case"0":if(bt(),ho.isDigit(Nc()))throw Wn(bt());return"\0";case"x":return bt(),PQe();case"u":return bt(),hB();case``:case"\u2028":case"\u2029":return bt(),"";case"\r":return bt(),Nc()===``&&bt(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":throw Wn(bt());case void 0:throw Wn(bt())}return bt()}function PQe(){let t="",e=Nc();if(!ho.isHexDigit(e)||(t+=bt(),e=Nc(),!ho.isHexDigit(e)))throw Wn(bt());return t+=bt(),String.fromCodePoint(parseInt(t,16))}function hB(){let t="",e=4;for(;e-- >0;){const r=Nc();if(!ho.isHexDigit(r))throw Wn(bt());t+=bt()}return String.fromCodePoint(parseInt(t,16))}const kQe={start(){if(Go.type==="eof")throw Jf();QS()},beforePropertyName(){switch(Go.type){case"identifier":case"string":d6=Go.value,na="afterPropertyName";return;case"punctuator":Ww();return;case"eof":throw Jf()}},afterPropertyName(){if(Go.type==="eof")throw Jf();na="beforePropertyValue"},beforePropertyValue(){if(Go.type==="eof")throw Jf();QS()},beforeArrayValue(){if(Go.type==="eof")throw Jf();if(Go.type==="punctuator"&&Go.value==="]"){Ww();return}QS()},afterPropertyValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforePropertyName";return;case"}":Ww()}},afterArrayValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforeArrayValue";return;case"]":Ww()}},end(){}};function QS(){let t;switch(Go.type){case"punctuator":switch(Go.value){case"{":t={};break;case"[":t=[];break}break;case"null":case"boolean":case"numeric":case"string":t=Go.value;break}if(wv===void 0)wv=t;else{const e=Ac[Ac.length-1];Array.isArray(e)?e.push(t):Object.defineProperty(e,d6,{value:t,writable:!0,enumerable:!0,configurable:!0})}if(t!==null&&typeof t=="object")Ac.push(t),Array.isArray(t)?na="beforeArrayValue":na="beforePropertyName";else{const e=Ac[Ac.length-1];e==null?na="end":Array.isArray(e)?na="afterArrayValue":na="afterPropertyValue"}}function Ww(){Ac.pop();const t=Ac[Ac.length-1];t==null?na="end":Array.isArray(t)?na="afterArrayValue":na="afterPropertyValue"}function Wn(t){return nE(t===void 0?`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `:`JSON5: invalid character '${bee(t)}' at ${
        bf
      }
      :${
        bl
      }
      `)}function Jf(){return nE(`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `)}function n$(){return bl-=5,nE(`JSON5: invalid identifier character at ${
        bf
      }
      :${
        bl
      }
      `)}function IQe(t){console.warn(`JSON5: '${bee(t)}' in strings is not valid ECMAScript;
      consider escaping`)}function bee(t){const e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[t])return e[t];if(t<" "){const r=t.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return t}function nE(t){const e=new SyntaxError(t);return e.lineNumber=bf,e.columnNumber=bl,e}var BQe=function(e,r,n){const s=[];let o="",a,i,l="",u;if(r!=null&&typeof r=="object"&&!Array.isArray(r)&&(n=r.space,u=r.quote,r=r.replacer),typeof r=="function")i=r;else if(Array.isArray(r)){a=[];for(const g of r){let y;typeof g=="string"?y=g:(typeof g=="number"||g instanceof String||g instanceof Number)&&(y=String(g)),y!==void 0&&a.indexOf(y)<0&&a.push(y)}}return n instanceof Number?n=Number(n):n instanceof String&&(n=String(n)),typeof n=="number"?n>0&&(n=Math.min(10,Math.floor(n)),l="          ".substr(0,n)):typeof n=="string"&&(l=n.substr(0,10)),c("",{"":e});function c(g,y){let v=y[g];switch(v!=null&&(typeof v.toJSON5=="function"?v=v.toJSON5(g):typeof v.toJSON=="function"&&(v=v.toJSON(g))),i&&(v=i.call(y,g,v)),v instanceof Number?v=Number(v):v instanceof String?v=String(v):v instanceof Boolean&&(v=v.valueOf()),v){case null:return"null";case!0:return"true";case!1:return"false"}if(typeof v=="string")return d(v);if(typeof v=="number")return String(v);if(typeof v=="object")return Array.isArray(v)?h(v):f(v)}function d(g){const y={"'":.1,'"':.2},v={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};let w="";for(let C=0;C<g.length;C++){const E=g[C];switch(E){case"'":case'"':y[E]++,w+=E;continue;case"\0":if(ho.isDigit(g[C+1])){w+="\\x00";continue}}if(v[E]){w+=v[E];continue}if(E<" "){let _=E.charCodeAt(0).toString(16);w+="\\x"+("00"+_).substring(_.length);continue}w+=E}const b=u||Object.keys(y).reduce((C,E)=>y[C]<y[E]?C:E);return w=w.replace(new RegExp(b,"g"),v[b]),b+w+b}function f(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=a||Object.keys(g),w=[];for(const C of v){const E=c(C,g);if(E!==void 0){let _=p(C)+":";l!==""&&(_+=" "),_+=E,w.push(_)}}let b;if(w.length===0)b="{}";else{let C;if(l==="")C=w.join(","),b="{"+C+"}";else{let E=`,
      `+o;C=w.join(E),b=`{
        `+o+C+`,
        `+y+"}"}}return s.pop(),o=y,b}function p(g){if(g.length===0)return d(g);const y=String.fromCodePoint(g.codePointAt(0));if(!ho.isIdStartChar(y))return d(g);for(let v=y.length;v<g.length;v++)if(!ho.isIdContinueChar(String.fromCodePoint(g.codePointAt(v))))return d(g);return g}function h(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=[];for(let b=0;b<g.length;b++){const C=c(String(b),g);v.push(C!==void 0?C:"null")}let w;if(v.length===0)w="[]";else if(l==="")w="["+v.join(",")+"]";else{let b=`,
        `+o,C=v.join(b);w=`[`+o+C+`,
        `+y+"]"}return s.pop(),o=y,w}};const OQe={parse:AQe,stringify:BQe};var DQe=OQe;const $w=(t,e)=>{const r=new RegExp(`ES.${
          e
        }
        = (.+);
        `);if(!r.test(t))return;const n=r.exec(t);if(n)return n[1]},ks=Xt.SABA;let wee=[];const MQe={20:"Moneyline",9001:"Map X Moneyline"},NQe=t=>{if(!t)return;const e=t.gameId;if(!e||!wee.includes(e.toString()))return;const r=Date.now();if(!(t.kickofftime>r/1e3+3600))return{SourceMatchID:t.matchid,SourceGameID:e,Type:ks,StartTime:t.kickofftime*1e3,HomeID:t.homeid,Home:t.hteamnamecn,AwayID:t.awayid,Away:t.ateamnamecn,Teams:[{TeamID:t.homeid,Type:ks,GameID:e,Name:t.hteamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.homeid}&ha=h`},{TeamID:t.awayid,Type:ks,GameID:e,Name:t.ateamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.awayid}&ha=a`}]}},RQe=(t,e)=>{if(!t)return;const r=MQe[t.bettype];if(!r)return;const n=t.resourceid&&Number(t.resourceid)||0,s=`${t.oddsid}:Home`,o=Pr.convertMyToEU(t.odds1a),a=`${t.oddsid}:Away`,i=Pr.convertMyToEU(t.odds2a),l=t.oddsstatus!=="running",u=fo();return u.save(ks,new Jn(s,o,l)),u.save(ks,new Jn(a,i,l)),{Type:ks,SourceMatchID:t.matchid,SourceBetID:t.oddsid,Map:n,BetName:r.replace("Map X",`Map ${n}`),SourceHomeID:s,HomeName:e.Home,HomeOdds:o,SourceAwayID:a,AwayName:e.Away,AwayOdds:i,Status:l?"Locked":"Normal"}},f6="SABA:CONTENT",FQe=()=>sessionStorage.getItem(f6),WQe=t=>{t&&sessionStorage.setItem(f6,t)},$Qe=()=>{sessionStorage.removeItem(f6)},LQe=async()=>{var c,d,f,p;const t=await Vt.getPlatform(Xt.SABA);if(!t)return;wee=t.games;let e=FQe();const r=`${t.gateway}/${t.token}/ESports/43/ALL?mode=m0&market=L`;if(e||(e=(await Yn.get(r)).data,WQe(e)),!e)return;const n=$w(e,"url");if(!n)return;const s=(c=DQe.parse(n))==null?void 0:c.p,o=(d=$w(e,"id"))==null?void 0:d.replace(/\"/g,"");if(!o)return;const a=(f=$w(e,"logo"))==null?void 0:f.replace(/\"/g,"");if(!a)return;const i=$w(e,"account");if(!i)return;const l=JSON.parse(i),u=(p=l==null?void 0:l.pnv)==null?void 0:p.tk;if(u)return{gateway:r,url:s,gid:pt.uuid("N").substring(0,16),token:u,id:o,rid:"1",ext:1,logo:a,config:t}},UQe=async()=>{const e=Io().accounts.find(r=>r.provider===Xt.SABA);e&&await Vt.updatePlatform({provider:Xt.SABA,token:e.token,gateway:e.gateway})},Lw=[],wy=new Map,r0=new Map,Uw=new Map,U2=async()=>{if(!Io().accounts.some(l=>l.provider===Xt.SABA)){await pt.wait(60*1e3),await U2();return}const r=await LQe();if(!r){Bc.error(`${ks}配置读取失败，等待60秒后重试`),await UQe(),await pt.wait(60*1e3),await U2();return}console.log(ks,r);const n=fo(),s=Tf(),o=new URL(r.gateway),a=G0(`wss://${r.url}`,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${o.host}`},query:{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext}});a.on("connect",()=>{a.emit("init",{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext,dr:"transport close",rc:1,v:2}),a.on("init",h=>{console.log(`SABA init 链接成功 => ${JSON.stringify(h)}`),a.emit("subscribe",u)});const u=[["odds",{spread:[{id:"c0",rev:"DM4WT",sorting:0,condition:{},r:"c1627df7-r3928",p:"d530b060d500b34b-b2074"}],odds:[{id:"c2",rev:"Gwz9v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"},{id:"c4",rev:"Gwz0v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"}]}.odds]];a.on("err",h=>{Bc.error(`${ks}连接发生错误:${h}`),$Qe(),a.disconnect()}),a.on("disconnectReason",h=>{Bc.error(`${ks}链接断开:${h}`),a.disconnect()});const c=h=>{const[g,...y]=h,v={};for(let w=0;w<y.length;w+=2){const b=y[w],C=y[w+1];v[Lw[b]??b]=C}return v},d=h=>{var C;const[g,...y]=h;if(g!=="m")return;const v={};for(let E=1;E<h.length;E+=2){const _=h[E],A=h[E+1];v[Lw[_]??_]=A}const w=v.matchid;if(w)if(!r0.has(w))r0.set(w,v);else{const E=r0.get(w);Object.keys(v).forEach(_=>{E[_]=v[_]})}if(!w)return;const b=r0.get(w);if(b!=null&&b.leagueid){const E=(C=wy.get(b.leagueid))==null?void 0:C.leaguegroupid;E&&(b.gameId=E)}return b},f=h=>{const[g,...y]=h;if(g!=="l")return;const v={};for(let b=1;b<h.length;b+=2){const C=h[b],E=h[b+1];v[Lw[C]??C]=E}const w=v.leagueid;if(w)if(!wy.has(w))wy.set(w,v);else{const b=wy.get(w);Object.keys(v).forEach(C=>{b[C]=v[C]})}return w&&wy.get(w)||void 0},p=h=>{const g=c(h),y=g.oddsid;if(y){const v=Uw.get(y);v?Object.keys(g).forEach(w=>{v[w]=g[w]}):Uw.set(y,g)}else return;return Uw.get(y)};a.on("m",async(h,g,y)=>{g.forEach(async v=>{const[w,...b]=v;switch(w){case"c":break;case"f":const[C,E]=b;E.forEach((_,A)=>{const T=C+A;Lw[T]=_});break;case 0:switch(b[0]){case"reset":r0.clear();break;case"done":const _=[];r0.forEach(A=>{const T=NQe(A);T&&_.push(T)}),await s.saveMatch(ks,_),_.forEach(A=>{const T=[];[...Uw.values()].filter(S=>S.matchid===A.SourceMatchID).forEach(S=>{const B=RQe(S,A);B&&T.push(B)}),s.saveBets(ks,A.SourceMatchID,T)});break;case"l":f(b);break;case"m":d(b);break;case"-m":{const A=d(b);A==null||A.matchid}break;case"o":{const A=p(b),T=(A==null?void 0:A.oddsstatus)!=="running";A!=null&&A.oddsid&&(A!=null&&A.odds1a)&&n.save(ks,new Jn(`${A.oddsid}:Home`,Pr.convertMyToEU(A.odds1a),T,A.oddsid)),A!=null&&A.oddsid&&(A!=null&&A.odds2a)&&n.save(ks,new Jn(`${A.oddsid}:Away`,Pr.convertMyToEU(A.odds2a),T,A.oddsid))}break;case"-o":{const A=p(b),T=A==null?void 0:A.oddsid;T&&n.updateBetLock(ks,T,!0)}break}break}})})});const i=Date.now();for(;;)if(await pt.wait(3e3),await VQe(r.config),a.connected){Date.now()-i>300*1e3&&a.disconnect();continue}else if(a.disconnected){n.clean(ks);break}await U2()},VQe=async t=>{const e=`${t.gateway}/${t.token}/LoginCheckin/Index`;await Yn.post(e,null,{headers:{username:""}})},Qa=Xt.IMT;let Ba;const zQe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},o$=t=>`https://ipis-cdn.kemehkemeh.xyz/TeamImage/${t}.png`,jQe=t=>{if(!t||t.length!==2)return 0;const e=/gamenr=(\d)/;if(!e.test(t[0].s))return 0;const r=e.exec(t[0].s);return r?Number(r[1]):0},Cee=t=>{if(!t)return;const e=zQe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}};let V2;const HQe=async()=>{if(!Ba||!fb)return;const t=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/GetAllLiveEvents`,e={AllLiveEventsRequestGroups:fb.games.map(o=>({SportId:Number(o),EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),IsCombo:!1,OddsType:3,BetTypes:[283],Periods:[1],SortingType:2,PanelType:2},r=await mr.post(Ba,t,e,{headers:Cee(Ba)},Cr.http),n=r.data;if((n==null?void 0:n.StatusCode)!==100)return;const s=[];return n.d&&(V2=n.d),n.ale.forEach(o=>{o.sels.forEach(a=>{const i=`${a.st}:${a.eid}`,l=[];a.mls.forEach(u=>{if(!u.ws||u.ws.length!==2)return;const c=u.ws.find(h=>h.si===707),d=u.ws.find(h=>h.si===708);if(!c||!d)return;const f=jQe(u.ws);if(f===0)return;const p=`${f}:${u.bti}:${u.mi}`;l.push({Type:Qa,SourceMatchID:i,SourceBetID:p,SourceHomeID:`${c.si}:${c.wsi}`,HomeName:a.htn,HomeOdds:c.o,SourceAwayID:`${d.si}:${d.wsi}`,AwayName:a.atn,AwayOdds:d.o,BetName:u.btn,Map:f,Status:u.il?"Locked":"Normal"})}),s.push({SourceMatchID:i,SourceGameID:a.st,Type:Qa,StartTime:new Date(a.edt).getTime(),HomeID:a.htid,Home:a.htn,AwayID:a.atid,Away:a.atn,Teams:[{Type:Qa,TeamID:a.htid,Name:a.htn,GameID:a.st,Logo:o$(a.htid)},{Type:Qa,TeamID:a.atid,Name:a.atn,GameID:a.st,Logo:o$(a.atid)}],Bets:l})})}),s},GQe=async()=>{const t=fo();if(!V2||!fb||!Ba||z2.length===0){t.clean(Qa);return}const e={AllLiveEventsDeltaRequestGroups:z2.map(o=>({SportId:o,EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),CompetitionIds:[],SortingType:2,Delta:V2,BetTypes:[283],Periods:[1],OddsType:3,SportIds:z2,IsCombo:!1,PanelType:2},r=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta`,n=await mr.post(Ba,r,e,{headers:Cee(Ba)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){t.clean(Qa);return}V2=s.Delta,s.dc.forEach(o=>{o.v.forEach(a=>{a.ws.forEach(i=>{const l=`${i.si}:${i.wsi}`;t.save(Qa,new Jn(l,i.o,a.il))})})})};let fb=null,s$=0,z2=[];const Eee=async()=>{try{if(fb=await Vt.getPlatform(Qa),!fb)return;Ba=Io().accounts.find(n=>n.provider===Qa&&n.balance!==void 0);const t=fo(),e=Tf();if(!Ba){console.log(Qa,"当前未检测到账号"),t.clean(Qa),await pt.wait(3*1e3);return}if(Date.now()-s$>60*1e3){const n=await HQe();if(!n)return;await e.saveMatch(Qa,n)&&n.forEach(async s=>{s.Bets&&await e.saveBets(Qa,s.SourceMatchID,s.Bets)}),z2=[...new Set(n.map(s=>s.SourceGameID))],s$=Date.now()}await GQe()}finally{await pt.wait(1e3),Eee()}},Vw=Xt.XBet,KQe=async()=>{const t=fo(),e=Vg();ph["XBet:Score"]=r=>{console.log(Vw,r),e.updateScore(Xt.XBet,r)},ph[Vw]=r=>{r.bets.forEach(s=>{const o=`${s.betId}:1`,a=`${s.betId}:3`;t.save(Vw,new Jn(o,s.home,!1)),t.save(Vw,new Jn(a,s.away,!1))})}},gB=kL(sJe).use(Yre());gB.use(JC).use(Cke);const qQe=t=>{if(!t)return;const e=document.getElementById("app");e&&(document.body.classList.add("checking"),e.innerHTML=`<h1>插件检测中...</h1> <a href="./extensions/${t}.zip" target="_blank">下载插件</a>`)},YQe=async()=>{const t=await Nr.get(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`),e=t.data.version;for(let r=0;r<10;r++){const n=await Yn.init();if(n){const s=`${n.name} ${n.version}`;document.body.classList.remove("checking"),no({message:s,type:"success",dangerouslyUseHTMLString:!0,duration:5*1e3}),document.title=s,n.error?Lc.alert(`${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>`,"插件发生错误",{type:"error",showConfirmButton:!1,dangerouslyUseHTMLString:!0,draggable:!0}):(gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),gB.mount("#app"));break}qQe(e),await pt.wait(3e3)}};YQe()});export default ZQe();
        

// ---- SABA 平台逻辑 / anchor 7: Xt.SABA / approx line 54535 ----
row Wn(bt())}xr+=bt()},start(){switch(qr){case"{":case"[":return Fn("punctuator",bt())}Br="value"},beforePropertyName(){switch(qr){case"$":case"_":xr=bt(),Br="identifierName";return;case"\\":bt(),Br="identifierNameStartEscape";return;case"}":return Fn("punctuator",bt());case'"':case"'":Uy=bt()==='"',Br="string";return}if(ho.isIdStartChar(qr)){xr+=bt(),Br="identifierName";return}throw Wn(bt())},afterPropertyName(){if(qr===":")return Fn("punctuator",bt());throw Wn(bt())},beforePropertyValue(){Br="value"},afterPropertyValue(){switch(qr){case",":case"}":return Fn("punctuator",bt())}throw Wn(bt())},beforeArrayValue(){if(qr==="]")return Fn("punctuator",bt());Br="value"},afterArrayValue(){switch(qr){case",":case"]":return Fn("punctuator",bt())}throw Wn(bt())},end(){throw Wn(bt())}};function Fn(t,e){return{type:t,value:e,line:bf,column:bl}}function Zf(t){for(const e of t){if(Nc()!==e)throw Wn(bt());bt()}}function _Qe(){switch(Nc()){case"b":return bt(),"\b";case"f":return bt(),"\f";case"n":return bt(),``;case"r":return bt(),"\r";case"t":return bt(),"	";case"v":return bt(),"\v";case"0":if(bt(),ho.isDigit(Nc()))throw Wn(bt());return"\0";case"x":return bt(),PQe();case"u":return bt(),hB();case``:case"\u2028":case"\u2029":return bt(),"";case"\r":return bt(),Nc()===``&&bt(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":throw Wn(bt());case void 0:throw Wn(bt())}return bt()}function PQe(){let t="",e=Nc();if(!ho.isHexDigit(e)||(t+=bt(),e=Nc(),!ho.isHexDigit(e)))throw Wn(bt());return t+=bt(),String.fromCodePoint(parseInt(t,16))}function hB(){let t="",e=4;for(;e-- >0;){const r=Nc();if(!ho.isHexDigit(r))throw Wn(bt());t+=bt()}return String.fromCodePoint(parseInt(t,16))}const kQe={start(){if(Go.type==="eof")throw Jf();QS()},beforePropertyName(){switch(Go.type){case"identifier":case"string":d6=Go.value,na="afterPropertyName";return;case"punctuator":Ww();return;case"eof":throw Jf()}},afterPropertyName(){if(Go.type==="eof")throw Jf();na="beforePropertyValue"},beforePropertyValue(){if(Go.type==="eof")throw Jf();QS()},beforeArrayValue(){if(Go.type==="eof")throw Jf();if(Go.type==="punctuator"&&Go.value==="]"){Ww();return}QS()},afterPropertyValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforePropertyName";return;case"}":Ww()}},afterArrayValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforeArrayValue";return;case"]":Ww()}},end(){}};function QS(){let t;switch(Go.type){case"punctuator":switch(Go.value){case"{":t={};break;case"[":t=[];break}break;case"null":case"boolean":case"numeric":case"string":t=Go.value;break}if(wv===void 0)wv=t;else{const e=Ac[Ac.length-1];Array.isArray(e)?e.push(t):Object.defineProperty(e,d6,{value:t,writable:!0,enumerable:!0,configurable:!0})}if(t!==null&&typeof t=="object")Ac.push(t),Array.isArray(t)?na="beforeArrayValue":na="beforePropertyName";else{const e=Ac[Ac.length-1];e==null?na="end":Array.isArray(e)?na="afterArrayValue":na="afterPropertyValue"}}function Ww(){Ac.pop();const t=Ac[Ac.length-1];t==null?na="end":Array.isArray(t)?na="afterArrayValue":na="afterPropertyValue"}function Wn(t){return nE(t===void 0?`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `:`JSON5: invalid character '${bee(t)}' at ${
        bf
      }
      :${
        bl
      }
      `)}function Jf(){return nE(`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `)}function n$(){return bl-=5,nE(`JSON5: invalid identifier character at ${
        bf
      }
      :${
        bl
      }
      `)}function IQe(t){console.warn(`JSON5: '${bee(t)}' in strings is not valid ECMAScript;
      consider escaping`)}function bee(t){const e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[t])return e[t];if(t<" "){const r=t.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return t}function nE(t){const e=new SyntaxError(t);return e.lineNumber=bf,e.columnNumber=bl,e}var BQe=function(e,r,n){const s=[];let o="",a,i,l="",u;if(r!=null&&typeof r=="object"&&!Array.isArray(r)&&(n=r.space,u=r.quote,r=r.replacer),typeof r=="function")i=r;else if(Array.isArray(r)){a=[];for(const g of r){let y;typeof g=="string"?y=g:(typeof g=="number"||g instanceof String||g instanceof Number)&&(y=String(g)),y!==void 0&&a.indexOf(y)<0&&a.push(y)}}return n instanceof Number?n=Number(n):n instanceof String&&(n=String(n)),typeof n=="number"?n>0&&(n=Math.min(10,Math.floor(n)),l="          ".substr(0,n)):typeof n=="string"&&(l=n.substr(0,10)),c("",{"":e});function c(g,y){let v=y[g];switch(v!=null&&(typeof v.toJSON5=="function"?v=v.toJSON5(g):typeof v.toJSON=="function"&&(v=v.toJSON(g))),i&&(v=i.call(y,g,v)),v instanceof Number?v=Number(v):v instanceof String?v=String(v):v instanceof Boolean&&(v=v.valueOf()),v){case null:return"null";case!0:return"true";case!1:return"false"}if(typeof v=="string")return d(v);if(typeof v=="number")return String(v);if(typeof v=="object")return Array.isArray(v)?h(v):f(v)}function d(g){const y={"'":.1,'"':.2},v={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};let w="";for(let C=0;C<g.length;C++){const E=g[C];switch(E){case"'":case'"':y[E]++,w+=E;continue;case"\0":if(ho.isDigit(g[C+1])){w+="\\x00";continue}}if(v[E]){w+=v[E];continue}if(E<" "){let _=E.charCodeAt(0).toString(16);w+="\\x"+("00"+_).substring(_.length);continue}w+=E}const b=u||Object.keys(y).reduce((C,E)=>y[C]<y[E]?C:E);return w=w.replace(new RegExp(b,"g"),v[b]),b+w+b}function f(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=a||Object.keys(g),w=[];for(const C of v){const E=c(C,g);if(E!==void 0){let _=p(C)+":";l!==""&&(_+=" "),_+=E,w.push(_)}}let b;if(w.length===0)b="{}";else{let C;if(l==="")C=w.join(","),b="{"+C+"}";else{let E=`,
      `+o;C=w.join(E),b=`{
        `+o+C+`,
        `+y+"}"}}return s.pop(),o=y,b}function p(g){if(g.length===0)return d(g);const y=String.fromCodePoint(g.codePointAt(0));if(!ho.isIdStartChar(y))return d(g);for(let v=y.length;v<g.length;v++)if(!ho.isIdContinueChar(String.fromCodePoint(g.codePointAt(v))))return d(g);return g}function h(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=[];for(let b=0;b<g.length;b++){const C=c(String(b),g);v.push(C!==void 0?C:"null")}let w;if(v.length===0)w="[]";else if(l==="")w="["+v.join(",")+"]";else{let b=`,
        `+o,C=v.join(b);w=`[`+o+C+`,
        `+y+"]"}return s.pop(),o=y,w}};const OQe={parse:AQe,stringify:BQe};var DQe=OQe;const $w=(t,e)=>{const r=new RegExp(`ES.${
          e
        }
        = (.+);
        `);if(!r.test(t))return;const n=r.exec(t);if(n)return n[1]},ks=Xt.SABA;let wee=[];const MQe={20:"Moneyline",9001:"Map X Moneyline"},NQe=t=>{if(!t)return;const e=t.gameId;if(!e||!wee.includes(e.toString()))return;const r=Date.now();if(!(t.kickofftime>r/1e3+3600))return{SourceMatchID:t.matchid,SourceGameID:e,Type:ks,StartTime:t.kickofftime*1e3,HomeID:t.homeid,Home:t.hteamnamecn,AwayID:t.awayid,Away:t.ateamnamecn,Teams:[{TeamID:t.homeid,Type:ks,GameID:e,Name:t.hteamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.homeid}&ha=h`},{TeamID:t.awayid,Type:ks,GameID:e,Name:t.ateamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.awayid}&ha=a`}]}},RQe=(t,e)=>{if(!t)return;const r=MQe[t.bettype];if(!r)return;const n=t.resourceid&&Number(t.resourceid)||0,s=`${t.oddsid}:Home`,o=Pr.convertMyToEU(t.odds1a),a=`${t.oddsid}:Away`,i=Pr.convertMyToEU(t.odds2a),l=t.oddsstatus!=="running",u=fo();return u.save(ks,new Jn(s,o,l)),u.save(ks,new Jn(a,i,l)),{Type:ks,SourceMatchID:t.matchid,SourceBetID:t.oddsid,Map:n,BetName:r.replace("Map X",`Map ${n}`),SourceHomeID:s,HomeName:e.Home,HomeOdds:o,SourceAwayID:a,AwayName:e.Away,AwayOdds:i,Status:l?"Locked":"Normal"}},f6="SABA:CONTENT",FQe=()=>sessionStorage.getItem(f6),WQe=t=>{t&&sessionStorage.setItem(f6,t)},$Qe=()=>{sessionStorage.removeItem(f6)},LQe=async()=>{var c,d,f,p;const t=await Vt.getPlatform(Xt.SABA);if(!t)return;wee=t.games;let e=FQe();const r=`${t.gateway}/${t.token}/ESports/43/ALL?mode=m0&market=L`;if(e||(e=(await Yn.get(r)).data,WQe(e)),!e)return;const n=$w(e,"url");if(!n)return;const s=(c=DQe.parse(n))==null?void 0:c.p,o=(d=$w(e,"id"))==null?void 0:d.replace(/\"/g,"");if(!o)return;const a=(f=$w(e,"logo"))==null?void 0:f.replace(/\"/g,"");if(!a)return;const i=$w(e,"account");if(!i)return;const l=JSON.parse(i),u=(p=l==null?void 0:l.pnv)==null?void 0:p.tk;if(u)return{gateway:r,url:s,gid:pt.uuid("N").substring(0,16),token:u,id:o,rid:"1",ext:1,logo:a,config:t}},UQe=async()=>{const e=Io().accounts.find(r=>r.provider===Xt.SABA);e&&await Vt.updatePlatform({provider:Xt.SABA,token:e.token,gateway:e.gateway})},Lw=[],wy=new Map,r0=new Map,Uw=new Map,U2=async()=>{if(!Io().accounts.some(l=>l.provider===Xt.SABA)){await pt.wait(60*1e3),await U2();return}const r=await LQe();if(!r){Bc.error(`${ks}配置读取失败，等待60秒后重试`),await UQe(),await pt.wait(60*1e3),await U2();return}console.log(ks,r);const n=fo(),s=Tf(),o=new URL(r.gateway),a=G0(`wss://${r.url}`,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${o.host}`},query:{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext}});a.on("connect",()=>{a.emit("init",{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext,dr:"transport close",rc:1,v:2}),a.on("init",h=>{console.log(`SABA init 链接成功 => ${JSON.stringify(h)}`),a.emit("subscribe",u)});const u=[["odds",{spread:[{id:"c0",rev:"DM4WT",sorting:0,condition:{},r:"c1627df7-r3928",p:"d530b060d500b34b-b2074"}],odds:[{id:"c2",rev:"Gwz9v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"},{id:"c4",rev:"Gwz0v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"}]}.odds]];a.on("err",h=>{Bc.error(`${ks}连接发生错误:${h}`),$Qe(),a.disconnect()}),a.on("disconnectReason",h=>{Bc.error(`${ks}链接断开:${h}`),a.disconnect()});const c=h=>{const[g,...y]=h,v={};for(let w=0;w<y.length;w+=2){const b=y[w],C=y[w+1];v[Lw[b]??b]=C}return v},d=h=>{var C;const[g,...y]=h;if(g!=="m")return;const v={};for(let E=1;E<h.length;E+=2){const _=h[E],A=h[E+1];v[Lw[_]??_]=A}const w=v.matchid;if(w)if(!r0.has(w))r0.set(w,v);else{const E=r0.get(w);Object.keys(v).forEach(_=>{E[_]=v[_]})}if(!w)return;const b=r0.get(w);if(b!=null&&b.leagueid){const E=(C=wy.get(b.leagueid))==null?void 0:C.leaguegroupid;E&&(b.gameId=E)}return b},f=h=>{const[g,...y]=h;if(g!=="l")return;const v={};for(let b=1;b<h.length;b+=2){const C=h[b],E=h[b+1];v[Lw[C]??C]=E}const w=v.leagueid;if(w)if(!wy.has(w))wy.set(w,v);else{const b=wy.get(w);Object.keys(v).forEach(C=>{b[C]=v[C]})}return w&&wy.get(w)||void 0},p=h=>{const g=c(h),y=g.oddsid;if(y){const v=Uw.get(y);v?Object.keys(g).forEach(w=>{v[w]=g[w]}):Uw.set(y,g)}else return;return Uw.get(y)};a.on("m",async(h,g,y)=>{g.forEach(async v=>{const[w,...b]=v;switch(w){case"c":break;case"f":const[C,E]=b;E.forEach((_,A)=>{const T=C+A;Lw[T]=_});break;case 0:switch(b[0]){case"reset":r0.clear();break;case"done":const _=[];r0.forEach(A=>{const T=NQe(A);T&&_.push(T)}),await s.saveMatch(ks,_),_.forEach(A=>{const T=[];[...Uw.values()].filter(S=>S.matchid===A.SourceMatchID).forEach(S=>{const B=RQe(S,A);B&&T.push(B)}),s.saveBets(ks,A.SourceMatchID,T)});break;case"l":f(b);break;case"m":d(b);break;case"-m":{const A=d(b);A==null||A.matchid}break;case"o":{const A=p(b),T=(A==null?void 0:A.oddsstatus)!=="running";A!=null&&A.oddsid&&(A!=null&&A.odds1a)&&n.save(ks,new Jn(`${A.oddsid}:Home`,Pr.convertMyToEU(A.odds1a),T,A.oddsid)),A!=null&&A.oddsid&&(A!=null&&A.odds2a)&&n.save(ks,new Jn(`${A.oddsid}:Away`,Pr.convertMyToEU(A.odds2a),T,A.oddsid))}break;case"-o":{const A=p(b),T=A==null?void 0:A.oddsid;T&&n.updateBetLock(ks,T,!0)}break}break}})})});const i=Date.now();for(;;)if(await pt.wait(3e3),await VQe(r.config),a.connected){Date.now()-i>300*1e3&&a.disconnect();continue}else if(a.disconnected){n.clean(ks);break}await U2()},VQe=async t=>{const e=`${t.gateway}/${t.token}/LoginCheckin/Index`;await Yn.post(e,null,{headers:{username:""}})},Qa=Xt.IMT;let Ba;const zQe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},o$=t=>`https://ipis-cdn.kemehkemeh.xyz/TeamImage/${t}.png`,jQe=t=>{if(!t||t.length!==2)return 0;const e=/gamenr=(\d)/;if(!e.test(t[0].s))return 0;const r=e.exec(t[0].s);return r?Number(r[1]):0},Cee=t=>{if(!t)return;const e=zQe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}};let V2;const HQe=async()=>{if(!Ba||!fb)return;const t=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/GetAllLiveEvents`,e={AllLiveEventsRequestGroups:fb.games.map(o=>({SportId:Number(o),EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),IsCombo:!1,OddsType:3,BetTypes:[283],Periods:[1],SortingType:2,PanelType:2},r=await mr.post(Ba,t,e,{headers:Cee(Ba)},Cr.http),n=r.data;if((n==null?void 0:n.StatusCode)!==100)return;const s=[];return n.d&&(V2=n.d),n.ale.forEach(o=>{o.sels.forEach(a=>{const i=`${a.st}:${a.eid}`,l=[];a.mls.forEach(u=>{if(!u.ws||u.ws.length!==2)return;const c=u.ws.find(h=>h.si===707),d=u.ws.find(h=>h.si===708);if(!c||!d)return;const f=jQe(u.ws);if(f===0)return;const p=`${f}:${u.bti}:${u.mi}`;l.push({Type:Qa,SourceMatchID:i,SourceBetID:p,SourceHomeID:`${c.si}:${c.wsi}`,HomeName:a.htn,HomeOdds:c.o,SourceAwayID:`${d.si}:${d.wsi}`,AwayName:a.atn,AwayOdds:d.o,BetName:u.btn,Map:f,Status:u.il?"Locked":"Normal"})}),s.push({SourceMatchID:i,SourceGameID:a.st,Type:Qa,StartTime:new Date(a.edt).getTime(),HomeID:a.htid,Home:a.htn,AwayID:a.atid,Away:a.atn,Teams:[{Type:Qa,TeamID:a.htid,Name:a.htn,GameID:a.st,Logo:o$(a.htid)},{Type:Qa,TeamID:a.atid,Name:a.atn,GameID:a.st,Logo:o$(a.atid)}],Bets:l})})}),s},GQe=async()=>{const t=fo();if(!V2||!fb||!Ba||z2.length===0){t.clean(Qa);return}const e={AllLiveEventsDeltaRequestGroups:z2.map(o=>({SportId:o,EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),CompetitionIds:[],SortingType:2,Delta:V2,BetTypes:[283],Periods:[1],OddsType:3,SportIds:z2,IsCombo:!1,PanelType:2},r=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta`,n=await mr.post(Ba,r,e,{headers:Cee(Ba)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){t.clean(Qa);return}V2=s.Delta,s.dc.forEach(o=>{o.v.forEach(a=>{a.ws.forEach(i=>{const l=`${i.si}:${i.wsi}`;t.save(Qa,new Jn(l,i.o,a.il))})})})};let fb=null,s$=0,z2=[];const Eee=async()=>{try{if(fb=await Vt.getPlatform(Qa),!fb)return;Ba=Io().accounts.find(n=>n.provider===Qa&&n.balance!==void 0);const t=fo(),e=Tf();if(!Ba){console.log(Qa,"当前未检测到账号"),t.clean(Qa),await pt.wait(3*1e3);return}if(Date.now()-s$>60*1e3){const n=await HQe();if(!n)return;await e.saveMatch(Qa,n)&&n.forEach(async s=>{s.Bets&&await e.saveBets(Qa,s.SourceMatchID,s.Bets)}),z2=[...new Set(n.map(s=>s.SourceGameID))],s$=Date.now()}await GQe()}finally{await pt.wait(1e3),Eee()}},Vw=Xt.XBet,KQe=async()=>{const t=fo(),e=Vg();ph["XBet:Score"]=r=>{console.log(Vw,r),e.updateScore(Xt.XBet,r)},ph[Vw]=r=>{r.bets.forEach(s=>{const o=`${s.betId}:1`,a=`${s.betId}:3`;t.save(Vw,new Jn(o,s.home,!1)),t.save(Vw,new Jn(a,s.away,!1))})}},gB=kL(sJe).use(Yre());gB.use(JC).use(Cke);const qQe=t=>{if(!t)return;const e=document.getElementById("app");e&&(document.body.classList.add("checking"),e.innerHTML=`<h1>插件检测中...</h1> <a href="./extensions/${t}.zip" target="_blank">下载插件</a>`)},YQe=async()=>{const t=await Nr.get(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`),e=t.data.version;for(let r=0;r<10;r++){const n=await Yn.init();if(n){const s=`${n.name} ${n.version}`;document.body.classList.remove("checking"),no({message:s,type:"success",dangerouslyUseHTMLString:!0,duration:5*1e3}),document.title=s,n.error?Lc.alert(`${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>`,"插件发生错误",{type:"error",showConfirmButton:!1,dangerouslyUseHTMLString:!0,draggable:!0}):(gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),gB.mount("#app"));break}qQe(e),await pt.wait(3e3)}};YQe()});export default ZQe();
        

// ---- SABA 平台逻辑 / anchor 8: bettype:[20,9001] / approx line 54535 ----
":return bt(),``;case"r":return bt(),"\r";case"t":return bt(),"	";case"v":return bt(),"\v";case"0":if(bt(),ho.isDigit(Nc()))throw Wn(bt());return"\0";case"x":return bt(),PQe();case"u":return bt(),hB();case``:case"\u2028":case"\u2029":return bt(),"";case"\r":return bt(),Nc()===``&&bt(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":throw Wn(bt());case void 0:throw Wn(bt())}return bt()}function PQe(){let t="",e=Nc();if(!ho.isHexDigit(e)||(t+=bt(),e=Nc(),!ho.isHexDigit(e)))throw Wn(bt());return t+=bt(),String.fromCodePoint(parseInt(t,16))}function hB(){let t="",e=4;for(;e-- >0;){const r=Nc();if(!ho.isHexDigit(r))throw Wn(bt());t+=bt()}return String.fromCodePoint(parseInt(t,16))}const kQe={start(){if(Go.type==="eof")throw Jf();QS()},beforePropertyName(){switch(Go.type){case"identifier":case"string":d6=Go.value,na="afterPropertyName";return;case"punctuator":Ww();return;case"eof":throw Jf()}},afterPropertyName(){if(Go.type==="eof")throw Jf();na="beforePropertyValue"},beforePropertyValue(){if(Go.type==="eof")throw Jf();QS()},beforeArrayValue(){if(Go.type==="eof")throw Jf();if(Go.type==="punctuator"&&Go.value==="]"){Ww();return}QS()},afterPropertyValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforePropertyName";return;case"}":Ww()}},afterArrayValue(){if(Go.type==="eof")throw Jf();switch(Go.value){case",":na="beforeArrayValue";return;case"]":Ww()}},end(){}};function QS(){let t;switch(Go.type){case"punctuator":switch(Go.value){case"{":t={};break;case"[":t=[];break}break;case"null":case"boolean":case"numeric":case"string":t=Go.value;break}if(wv===void 0)wv=t;else{const e=Ac[Ac.length-1];Array.isArray(e)?e.push(t):Object.defineProperty(e,d6,{value:t,writable:!0,enumerable:!0,configurable:!0})}if(t!==null&&typeof t=="object")Ac.push(t),Array.isArray(t)?na="beforeArrayValue":na="beforePropertyName";else{const e=Ac[Ac.length-1];e==null?na="end":Array.isArray(e)?na="afterArrayValue":na="afterPropertyValue"}}function Ww(){Ac.pop();const t=Ac[Ac.length-1];t==null?na="end":Array.isArray(t)?na="afterArrayValue":na="afterPropertyValue"}function Wn(t){return nE(t===void 0?`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `:`JSON5: invalid character '${bee(t)}' at ${
        bf
      }
      :${
        bl
      }
      `)}function Jf(){return nE(`JSON5: invalid end of input at ${
        bf
      }
      :${
        bl
      }
      `)}function n$(){return bl-=5,nE(`JSON5: invalid identifier character at ${
        bf
      }
      :${
        bl
      }
      `)}function IQe(t){console.warn(`JSON5: '${bee(t)}' in strings is not valid ECMAScript;
      consider escaping`)}function bee(t){const e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[t])return e[t];if(t<" "){const r=t.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return t}function nE(t){const e=new SyntaxError(t);return e.lineNumber=bf,e.columnNumber=bl,e}var BQe=function(e,r,n){const s=[];let o="",a,i,l="",u;if(r!=null&&typeof r=="object"&&!Array.isArray(r)&&(n=r.space,u=r.quote,r=r.replacer),typeof r=="function")i=r;else if(Array.isArray(r)){a=[];for(const g of r){let y;typeof g=="string"?y=g:(typeof g=="number"||g instanceof String||g instanceof Number)&&(y=String(g)),y!==void 0&&a.indexOf(y)<0&&a.push(y)}}return n instanceof Number?n=Number(n):n instanceof String&&(n=String(n)),typeof n=="number"?n>0&&(n=Math.min(10,Math.floor(n)),l="          ".substr(0,n)):typeof n=="string"&&(l=n.substr(0,10)),c("",{"":e});function c(g,y){let v=y[g];switch(v!=null&&(typeof v.toJSON5=="function"?v=v.toJSON5(g):typeof v.toJSON=="function"&&(v=v.toJSON(g))),i&&(v=i.call(y,g,v)),v instanceof Number?v=Number(v):v instanceof String?v=String(v):v instanceof Boolean&&(v=v.valueOf()),v){case null:return"null";case!0:return"true";case!1:return"false"}if(typeof v=="string")return d(v);if(typeof v=="number")return String(v);if(typeof v=="object")return Array.isArray(v)?h(v):f(v)}function d(g){const y={"'":.1,'"':.2},v={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","	":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};let w="";for(let C=0;C<g.length;C++){const E=g[C];switch(E){case"'":case'"':y[E]++,w+=E;continue;case"\0":if(ho.isDigit(g[C+1])){w+="\\x00";continue}}if(v[E]){w+=v[E];continue}if(E<" "){let _=E.charCodeAt(0).toString(16);w+="\\x"+("00"+_).substring(_.length);continue}w+=E}const b=u||Object.keys(y).reduce((C,E)=>y[C]<y[E]?C:E);return w=w.replace(new RegExp(b,"g"),v[b]),b+w+b}function f(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=a||Object.keys(g),w=[];for(const C of v){const E=c(C,g);if(E!==void 0){let _=p(C)+":";l!==""&&(_+=" "),_+=E,w.push(_)}}let b;if(w.length===0)b="{}";else{let C;if(l==="")C=w.join(","),b="{"+C+"}";else{let E=`,
      `+o;C=w.join(E),b=`{
        `+o+C+`,
        `+y+"}"}}return s.pop(),o=y,b}function p(g){if(g.length===0)return d(g);const y=String.fromCodePoint(g.codePointAt(0));if(!ho.isIdStartChar(y))return d(g);for(let v=y.length;v<g.length;v++)if(!ho.isIdContinueChar(String.fromCodePoint(g.codePointAt(v))))return d(g);return g}function h(g){if(s.indexOf(g)>=0)throw TypeError("Converting circular structure to JSON5");s.push(g);let y=o;o=o+l;let v=[];for(let b=0;b<g.length;b++){const C=c(String(b),g);v.push(C!==void 0?C:"null")}let w;if(v.length===0)w="[]";else if(l==="")w="["+v.join(",")+"]";else{let b=`,
        `+o,C=v.join(b);w=`[`+o+C+`,
        `+y+"]"}return s.pop(),o=y,w}};const OQe={parse:AQe,stringify:BQe};var DQe=OQe;const $w=(t,e)=>{const r=new RegExp(`ES.${
          e
        }
        = (.+);
        `);if(!r.test(t))return;const n=r.exec(t);if(n)return n[1]},ks=Xt.SABA;let wee=[];const MQe={20:"Moneyline",9001:"Map X Moneyline"},NQe=t=>{if(!t)return;const e=t.gameId;if(!e||!wee.includes(e.toString()))return;const r=Date.now();if(!(t.kickofftime>r/1e3+3600))return{SourceMatchID:t.matchid,SourceGameID:e,Type:ks,StartTime:t.kickofftime*1e3,HomeID:t.homeid,Home:t.hteamnamecn,AwayID:t.awayid,Away:t.ateamnamecn,Teams:[{TeamID:t.homeid,Type:ks,GameID:e,Name:t.hteamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.homeid}&ha=h`},{TeamID:t.awayid,Type:ks,GameID:e,Name:t.ateamnamecn,Logo:`https://esports.egmscentral.net/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/(S(ESportWeb2grh4bkvz4quqeosmtetdiri1))/ESportsWeb/GetLogoImage?type=t&id=${t.awayid}&ha=a`}]}},RQe=(t,e)=>{if(!t)return;const r=MQe[t.bettype];if(!r)return;const n=t.resourceid&&Number(t.resourceid)||0,s=`${t.oddsid}:Home`,o=Pr.convertMyToEU(t.odds1a),a=`${t.oddsid}:Away`,i=Pr.convertMyToEU(t.odds2a),l=t.oddsstatus!=="running",u=fo();return u.save(ks,new Jn(s,o,l)),u.save(ks,new Jn(a,i,l)),{Type:ks,SourceMatchID:t.matchid,SourceBetID:t.oddsid,Map:n,BetName:r.replace("Map X",`Map ${n}`),SourceHomeID:s,HomeName:e.Home,HomeOdds:o,SourceAwayID:a,AwayName:e.Away,AwayOdds:i,Status:l?"Locked":"Normal"}},f6="SABA:CONTENT",FQe=()=>sessionStorage.getItem(f6),WQe=t=>{t&&sessionStorage.setItem(f6,t)},$Qe=()=>{sessionStorage.removeItem(f6)},LQe=async()=>{var c,d,f,p;const t=await Vt.getPlatform(Xt.SABA);if(!t)return;wee=t.games;let e=FQe();const r=`${t.gateway}/${t.token}/ESports/43/ALL?mode=m0&market=L`;if(e||(e=(await Yn.get(r)).data,WQe(e)),!e)return;const n=$w(e,"url");if(!n)return;const s=(c=DQe.parse(n))==null?void 0:c.p,o=(d=$w(e,"id"))==null?void 0:d.replace(/\"/g,"");if(!o)return;const a=(f=$w(e,"logo"))==null?void 0:f.replace(/\"/g,"");if(!a)return;const i=$w(e,"account");if(!i)return;const l=JSON.parse(i),u=(p=l==null?void 0:l.pnv)==null?void 0:p.tk;if(u)return{gateway:r,url:s,gid:pt.uuid("N").substring(0,16),token:u,id:o,rid:"1",ext:1,logo:a,config:t}},UQe=async()=>{const e=Io().accounts.find(r=>r.provider===Xt.SABA);e&&await Vt.updatePlatform({provider:Xt.SABA,token:e.token,gateway:e.gateway})},Lw=[],wy=new Map,r0=new Map,Uw=new Map,U2=async()=>{if(!Io().accounts.some(l=>l.provider===Xt.SABA)){await pt.wait(60*1e3),await U2();return}const r=await LQe();if(!r){Bc.error(`${ks}配置读取失败，等待60秒后重试`),await UQe(),await pt.wait(60*1e3),await U2();return}console.log(ks,r);const n=fo(),s=Tf(),o=new URL(r.gateway),a=G0(`wss://${r.url}`,{transports:["websocket"],withCredentials:!0,extraHeaders:{Origin:`https://${o.host}`},query:{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext}});a.on("connect",()=>{a.emit("init",{gid:r.gid,token:r.token,id:r.id,rid:r.rid,ext:r.ext,dr:"transport close",rc:1,v:2}),a.on("init",h=>{console.log(`SABA init 链接成功 => ${JSON.stringify(h)}`),a.emit("subscribe",u)});const u=[["odds",{spread:[{id:"c0",rev:"DM4WT",sorting:0,condition:{},r:"c1627df7-r3928",p:"d530b060d500b34b-b2074"}],odds:[{id:"c2",rev:"Gwz9v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"},{id:"c4",rev:"Gwz0v",sorting:"n",condition:{sporttype:"43",marketid:"L",no_stream:!0,bettype:[20,9001]},r:"be2e717c-r4560",p:"d530b060d500b34b-b783"}]}.odds]];a.on("err",h=>{Bc.error(`${ks}连接发生错误:${h}`),$Qe(),a.disconnect()}),a.on("disconnectReason",h=>{Bc.error(`${ks}链接断开:${h}`),a.disconnect()});const c=h=>{const[g,...y]=h,v={};for(let w=0;w<y.length;w+=2){const b=y[w],C=y[w+1];v[Lw[b]??b]=C}return v},d=h=>{var C;const[g,...y]=h;if(g!=="m")return;const v={};for(let E=1;E<h.length;E+=2){const _=h[E],A=h[E+1];v[Lw[_]??_]=A}const w=v.matchid;if(w)if(!r0.has(w))r0.set(w,v);else{const E=r0.get(w);Object.keys(v).forEach(_=>{E[_]=v[_]})}if(!w)return;const b=r0.get(w);if(b!=null&&b.leagueid){const E=(C=wy.get(b.leagueid))==null?void 0:C.leaguegroupid;E&&(b.gameId=E)}return b},f=h=>{const[g,...y]=h;if(g!=="l")return;const v={};for(let b=1;b<h.length;b+=2){const C=h[b],E=h[b+1];v[Lw[C]??C]=E}const w=v.leagueid;if(w)if(!wy.has(w))wy.set(w,v);else{const b=wy.get(w);Object.keys(v).forEach(C=>{b[C]=v[C]})}return w&&wy.get(w)||void 0},p=h=>{const g=c(h),y=g.oddsid;if(y){const v=Uw.get(y);v?Object.keys(g).forEach(w=>{v[w]=g[w]}):Uw.set(y,g)}else return;return Uw.get(y)};a.on("m",async(h,g,y)=>{g.forEach(async v=>{const[w,...b]=v;switch(w){case"c":break;case"f":const[C,E]=b;E.forEach((_,A)=>{const T=C+A;Lw[T]=_});break;case 0:switch(b[0]){case"reset":r0.clear();break;case"done":const _=[];r0.forEach(A=>{const T=NQe(A);T&&_.push(T)}),await s.saveMatch(ks,_),_.forEach(A=>{const T=[];[...Uw.values()].filter(S=>S.matchid===A.SourceMatchID).forEach(S=>{const B=RQe(S,A);B&&T.push(B)}),s.saveBets(ks,A.SourceMatchID,T)});break;case"l":f(b);break;case"m":d(b);break;case"-m":{const A=d(b);A==null||A.matchid}break;case"o":{const A=p(b),T=(A==null?void 0:A.oddsstatus)!=="running";A!=null&&A.oddsid&&(A!=null&&A.odds1a)&&n.save(ks,new Jn(`${A.oddsid}:Home`,Pr.convertMyToEU(A.odds1a),T,A.oddsid)),A!=null&&A.oddsid&&(A!=null&&A.odds2a)&&n.save(ks,new Jn(`${A.oddsid}:Away`,Pr.convertMyToEU(A.odds2a),T,A.oddsid))}break;case"-o":{const A=p(b),T=A==null?void 0:A.oddsid;T&&n.updateBetLock(ks,T,!0)}break}break}})})});const i=Date.now();for(;;)if(await pt.wait(3e3),await VQe(r.config),a.connected){Date.now()-i>300*1e3&&a.disconnect();continue}else if(a.disconnected){n.clean(ks);break}await U2()},VQe=async t=>{const e=`${t.gateway}/${t.token}/LoginCheckin/Index`;await Yn.post(e,null,{headers:{username:""}})},Qa=Xt.IMT;let Ba;const zQe=t=>{if(t)try{const e=window.atob(t);return JSON.parse(e)}catch{return}},o$=t=>`https://ipis-cdn.kemehkemeh.xyz/TeamImage/${t}.png`,jQe=t=>{if(!t||t.length!==2)return 0;const e=/gamenr=(\d)/;if(!e.test(t[0].s))return 0;const r=e.exec(t[0].s);return r?Number(r[1]):0},Cee=t=>{if(!t)return;const e=zQe(t.token);return{"content-type":"application/json; charset=utf-8",referer:t.referer,"user-agent":t.userAgent,"x-isfacelift":"true","x-lang":"hans","x-platform":"1","x-sc":"AlcIWQJYUwMIBwEFVAkLVAECBw9QVV0BDQpXWAAHAVIABB0DACFIbmFVIlI9BCw6OBBxXANsEzZZ","x-token":e==null?void 0:e.tk,"x-v":e==null?void 0:e.v,"x-viewtype":"1"}};let V2;const HQe=async()=>{if(!Ba||!fb)return;const t=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/GetAllLiveEvents`,e={AllLiveEventsRequestGroups:fb.games.map(o=>({SportId:Number(o),EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),IsCombo:!1,OddsType:3,BetTypes:[283],Periods:[1],SortingType:2,PanelType:2},r=await mr.post(Ba,t,e,{headers:Cee(Ba)},Cr.http),n=r.data;if((n==null?void 0:n.StatusCode)!==100)return;const s=[];return n.d&&(V2=n.d),n.ale.forEach(o=>{o.sels.forEach(a=>{const i=`${a.st}:${a.eid}`,l=[];a.mls.forEach(u=>{if(!u.ws||u.ws.length!==2)return;const c=u.ws.find(h=>h.si===707),d=u.ws.find(h=>h.si===708);if(!c||!d)return;const f=jQe(u.ws);if(f===0)return;const p=`${f}:${u.bti}:${u.mi}`;l.push({Type:Qa,SourceMatchID:i,SourceBetID:p,SourceHomeID:`${c.si}:${c.wsi}`,HomeName:a.htn,HomeOdds:c.o,SourceAwayID:`${d.si}:${d.wsi}`,AwayName:a.atn,AwayOdds:d.o,BetName:u.btn,Map:f,Status:u.il?"Locked":"Normal"})}),s.push({SourceMatchID:i,SourceGameID:a.st,Type:Qa,StartTime:new Date(a.edt).getTime(),HomeID:a.htid,Home:a.htn,AwayID:a.atid,Away:a.atn,Teams:[{Type:Qa,TeamID:a.htid,Name:a.htn,GameID:a.st,Logo:o$(a.htid)},{Type:Qa,TeamID:a.atid,Name:a.atn,GameID:a.st,Logo:o$(a.atid)}],Bets:l})})}),s},GQe=async()=>{const t=fo();if(!V2||!fb||!Ba||z2.length===0){t.clean(Qa);return}const e={AllLiveEventsDeltaRequestGroups:z2.map(o=>({SportId:o,EventGroupTypeIds:[],OddsTemplateBetType:0,OddsTemplate:16})),CompetitionIds:[],SortingType:2,Delta:V2,BetTypes:[283],Periods:[1],OddsType:3,SportIds:z2,IsCombo:!1,PanelType:2},r=`${Ba==null?void 0:Ba.gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta`,n=await mr.post(Ba,r,e,{headers:Cee(Ba)},Cr.http),s=n.data;if((s==null?void 0:s.StatusCode)!==100){t.clean(Qa);return}V2=s.Delta,s.dc.forEach(o=>{o.v.forEach(a=>{a.ws.forEach(i=>{const l=`${i.si}:${i.wsi}`;t.save(Qa,new Jn(l,i.o,a.il))})})})};let fb=null,s$=0,z2=[];const Eee=async()=>{try{if(fb=await Vt.getPlatform(Qa),!fb)return;Ba=Io().accounts.find(n=>n.provider===Qa&&n.balance!==void 0);const t=fo(),e=Tf();if(!Ba){console.log(Qa,"当前未检测到账号"),t.clean(Qa),await pt.wait(3*1e3);return}if(Date.now()-s$>60*1e3){const n=await HQe();if(!n)return;await e.saveMatch(Qa,n)&&n.forEach(async s=>{s.Bets&&await e.saveBets(Qa,s.SourceMatchID,s.Bets)}),z2=[...new Set(n.map(s=>s.SourceGameID))],s$=Date.now()}await GQe()}finally{await pt.wait(1e3),Eee()}},Vw=Xt.XBet,KQe=async()=>{const t=fo(),e=Vg();ph["XBet:Score"]=r=>{console.log(Vw,r),e.updateScore(Xt.XBet,r)},ph[Vw]=r=>{r.bets.forEach(s=>{const o=`${s.betId}:1`,a=`${s.betId}:3`;t.save(Vw,new Jn(o,s.home,!1)),t.save(Vw,new Jn(a,s.away,!1))})}},gB=kL(sJe).use(Yre());gB.use(JC).use(Cke);const qQe=t=>{if(!t)return;const e=document.getElementById("app");e&&(document.body.classList.add("checking"),e.innerHTML=`<h1>插件检测中...</h1> <a href="./extensions/${t}.zip" target="_blank">下载插件</a>`)},YQe=async()=>{const t=await Nr.get(`https://api.a8.to/esport2/assets/version.json?${Date.now()}`),e=t.data.version;for(let r=0;r<10;r++){const n=await Yn.init();if(n){const s=`${n.name} ${n.version}`;document.body.classList.remove("checking"),no({message:s,type:"success",dangerouslyUseHTMLString:!0,duration:5*1e3}),document.title=s,n.error?Lc.alert(`${n.error}<br /><a href="esport-extensions.zip">点击下载最新版本</a>`,"插件发生错误",{type:"error",showConfirmButton:!1,dangerouslyUseHTMLString:!0,draggable:!0}):(gB.use(W8e).use(NMe).use(bQe).use(NBe).use(CQe).use(U2).use(bQ).use(Eee).use(SQ).use(KQe).use(EZe).use(PQ).use(yZe),gB.mount("#app"));break}qQe(e),await pt.wait(3e3)}};YQe()});export default ZQe();
        