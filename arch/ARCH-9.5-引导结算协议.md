# ARCH-9.5 引导结算协议（实现级规范）

- 对应 GDD v0.3 §9.5；服务端权威模拟 @20Hz（1 tick = 50ms）
- 状态：v1.0（待原型实现验证）
- 目标读者：游戏服务端 / 客户端网络层实现者

## 0. 目的

把所有"按键 → 引导 → 结算"的玩家交互统一到一套协议下，一次性消灭三类审查发现的问题：

1. **目标漂移**：引导期间目标状态变化（占用者出门/被逼出/主任入住/炸裆）导致结算无依据（状态机审查 #3/#4 的根因）；
2. **同帧无序**：裁决#5 只承诺"tick 串行"，未定义顺序与结果（规则审查 #7）；
3. **回滚缺失**：失败方的道具/冷却/骚扰值没有明确语义（多处 S2）。

## 1. 统一动作模型

一切玩家交互建模为 `ActionIntent`。瞬时动作 = 引导时长 0 的退化情形，**不另设代码路径**。

```
ActionIntent {
  intent_id:   u64            // 客户端生成，幂等键
  actor:       player_id
  issued_tick: u32            // 服务器受理 tick
  type:        ActionType
  target:      { kind: STALL | URINAL | PLAYER, id }
}

ActionType =
  // 隔间门类（目标 = 隔间）
  WIRE_BREAK | LADDER_CLIMB | POKE | PLUNGER_HIT | KNOCK_DOOR
  // 个人类
  SHOVE | SNIFF | PASS_PAPER | CLEAR_OBSTACLE | TURBO
  // 进入类
  ENTER_STALL | ENTER_URINAL | FLUSH_FAKE | RELIEF_START | GIVE_UP | LEAVE
```

动作生命周期三段：

```
INTENT(受理校验) → CHARGE(引导段, N tick) → RESOLVE(完成时采样结算)
                        │
                        ├─ 目标失效 → ABORT(全额回滚)
                        └─ 主动取消 → CANCEL(同 ABORT，见 §6 例外)
```

## 2. 动作注册表（单一事实源，服务端一张表驱动）

| type | 引导 | 采样目标 | 目标失效条件（任一即 ABORT） | 成功效果（RESOLVE 落账） | 消耗（RESOLVE 时才扣） |
|---|---|---|---|---|---|
| WIRE_BREAK 撬锁 | 1.2s | 隔间占用**真值** | 占用态变化（占用者出门/被逼出/炸裆/判负/主任入住/障碍刷新） | 门开 → 进入 2s 推门期（§5） | 铁丝×1 |
| LADDER_CLIMB 翻墙 | 2s | 同上 | 同上 | 同上（无视门锁） | 梯子×1 |
| POKE 门缝捅人 | 1.5s | 同上 | 同上 | 骚扰+1（隔门类） | 扫把充能×1；同门 CD 3s |
| PLUNGER_HIT 搋子拍晕 | 0.5s | 目标玩家位置 | 目标离开 2m | 骚扰+1（隔门类） | 搋子充能×1 |
| KNOCK_DOOR 空手拍门 | 1.5s | 隔间占用真值 | 同 WIRE_BREAK | 骚扰+1（隔门类） | CD 10s（中断收半额 CD，§6） |
| SHOVE 推搡 | 0 | 池位占用者 | 目标离开池位/已定型 | 进度清零+硬直 1s+霸体 2s（受害者第 4 次起改为 10s 霸体） | 对同一目标 CD 8s |
| SNIFF 嗅闻 | 1.5s | 隔间占用真值 | 占用态变化 | 三态结果+传染判定（结果仅发操作者） | 1 次/局（ABORT 不扣） |
| PASS_PAPER 递纸 | 1.5s | 受纸者 POST 态 | 受纸者被逼出/自破罐/定型/断线/第二张纸先到 | 受纸者立即完成+分层激励 | 卫生纸×1（ABORT 退还） |
| CLEAR_OBSTACLE 清障 | 3s/5s/8s | 障碍物存在 | 障碍被清除/隔间被优先锁持有者进入 | 障碍清除（恶臭脉冲见 GDD 5.3） | 隔间置占用标志（期间可被反骚扰） |
| ENTER_STALL / ENTER_URINAL | 0.5s | 目标无人（真值） | 有人先入（同 tick 先序）/优先锁他人持有 | 占用+置红 | — |
| FLUSH_FAKE 冲水伪装 | 1s | 标志=无人（**信息层**） | 标志翻转（真值变化或贴纸被服务器事件重置） | **无声失败**（有意的情报反制，见 GDD 7.1） | — |
| TURBO 涡轮增压 | 0 | 自身排便态 | 不在排便中 | 14s→9s+3 噪声脉冲 | 1 次/局 |
| GIVE_UP 弃坑/中止排便 | 0 | 自身 | — | 进度清零+重进 CD 3s+隔间释放 | — |

## 3. tick 三级流水（服务端主循环骨架）

```
on tick T:
  # ── 段① 定时器结算（最高优先级，天然实现"定型/完成优先于打断"）──
  for ev in due_timers(T):          # 排便完成/炸裆/主任入住与离场/铃/软收尾/定型
      resolve_timer(ev)             # 定型即封闭：此后本 tick 指向该玩家的意图全部丢弃

  # ── 段② 在途引导推进 ──
  for a in charging_actions:        # 按 resolve_tick 升序；同 tick 多个按 start_tick 升序
      if target_invalid(a):        # 见注册表"目标失效条件"
          abort(a); rollback(a); notify(a.actor, 'aborted', reason); continue
      if T >= a.resolve_tick:
          enter_resolve(a)          # 进入类转入推门期；其余立即结算落账

  # ── 段③ 新意图受理（确定性排序，保证回放一致）──
  for it in sorted(new_intents(T), key=i => (i.actor)):
      if actor_finalized(it.actor): drop(it)                    # 定型封闭
      if not server_perceivable(it.actor, it.target): reject(it) # 可见性校验，ARCH-13.2 §6
      if cooldown_active(it): reject(it)
      validate_and_start(it)                                    # 置 CD 预占槽；ABORT 时释放
```

**不变量**：段①改变的世界状态，段②在同一 tick 立即感知（目标失效）；段②的结算结果，段③在同一 tick 立即感知（"已被占用"）。因此不存在任何"跨段读到旧状态"的路径。

## 4. 冲突裁决表（穷举，验收基准）

| # | 冲突 | 裁决（由流水段序与注册表推导） |
|---|---|---|
| C1 | 排便完成 vs 打断 同 tick | 完成（段①先行）；打断意图在段③因目标定型被丢弃，CD 释放 |
| C2 | 两人同 tick 进同一空隔间/池位 | 段③按 actor_id 升序：先者成功，后者收 `已被占用` |
| C3 | 撬锁(1.2s) 与 翻墙(2s) 不同 tick 启动、同 tick 完成 | 两者都 RESOLVE：骚扰 +3+3 叠加；**溢出规则**：骚扰值达 3 即触发一次逼出并清零，余量丢弃；逼出优先锁给**先启动者** |
| C4 | 双递纸同 tick 完成 | 段②按 start_tick：先者成功；后者因受纸者已定型 ABORT 退纸，提示"手慢" |
| C5 | 霸体内的第二次推搡 | 段③校验受害者霸体 → 丢弃，**CD 不扣** |
| C6 | 逼出结算 tick，第三人闯入引导在途 | 段①逼出（标志回绿+优先锁）→ 段②闯入者目标失效（占用态变化）→ ABORT 回滚 → 优先锁持有者在段③进入 |
| C7 | 主任入住 roll 与撬锁完成同 tick | 段①主任入住（占用态变化）→ 段②撬锁 ABORT（铁丝退还）——**主任隔间只可能被新发起的操作命中，不存在"撬到一半主任搬进来"的即死** |
| C8 | 破罐与递纸同 tick 完成 | 段②按 start_tick：先完成者定型；后者 ABORT 退纸 |
| C9 | 清障在途，优先锁持有者进入该隔间 | 占用态变化 → 清障 ABORT（已耗时间不退，属风险） |
| C10 | 断线时存在在途引导 | 视为目标失效 ABORT + 全额回滚；重连后道具数 = 断线前 −（断线期间已结算项） |

## 5. 推门期（进入类特有的第二引导段）

撬锁/翻墙引导完成 → 转入 `PUSH_DOOR` 引导段（2s，可随时 CANCEL）：

| 时刻 | 状态 | 结果 |
|---|---|---|
| 引导完成 | 道具此时落账（铁丝/梯子已消耗） | 门锁已坏，进入推门演出 |
| 推门期中 | **可 CANCEL**：松手撤回 | 站在门外，不判负、不产生骚扰；道具不退（损失道具换情报） |
| 推门期结束采样 | 占用真值 = 主任 | 判负结算（0.8s"主任抬头对视"定格纯演出层） |
| | 占用真值 = 玩家 | 骚扰+3，闯入者进入对峙 |
| | 占用真值 = 无人（期间被逼出等） | 正常进入，占用归闯入者 |

- 推门期目标失效（占用态变化）**不触发 ABORT 回滚**——道具已消耗，只重采样：推门期结束时按新真值结算（无人→正常进入）。
- 主任独有预警音（报纸翻页+咳嗽）由可见性层在推门期**定向下发**给推门者（ARCH-13.2 §3），客户端无法提前获知。

## 6. 冷却 / 消耗 / 回滚矩阵

统一规则：

1. **一切消耗在 RESOLVE 成功瞬间落账**；ABORT/CANCEL = 全额回滚（道具/充能/技能次数），CD 预占槽释放。
2. 唯一例外：`KNOCK_DOOR` 中断仍启动 50% CD（5s）——防"无限白嫖引导期刷巨响当免费广播"。
3. `PASS_PAPER` 退还的是纸，不退还已播放的"来咯"喊话（如有）。
4. CD 预占在段③受理时发生，因此"引导被目标失效打断"不产生任何净消耗（KNOCK_DOOR 除外）。

## 7. 客户端契约

```
C→S: { intent_id, type, target }        # 受理
     { cancel: intent_id }              # 取消（引导期/推门期任意时刻）
S→C: { ack: intent_id, phase: 'charging' | 'push_door', resolve_tick }
     { aborted: intent_id, reason, refund }
     { resolved: intent_id, result }    # L3 结果仅单播操作者（ARCH-13.2）
```

- 客户端本地预测**仅限**：自身移动、自身进度条演出、自身引导条时间轴。
- 收到 `aborted` 必须回滚本地演出（含音效中止）。
- 断线重连后客户端不得重放旧 intent（intent_id 幂等去重，服务器保留最近 64 个/玩家）。

## 8. 验收用例（服务端单测清单）

1. 撬锁引导 1.2s 中占用者主动出门 → ABORT，铁丝保留，CD 释放
2. 推门期 CANCEL → 不判负、骚扰 0、铁丝已耗
3. 同 tick 双进一间 → actor_id 小者成功，大者收"已被占用"
4. 主任入住 tick == 撬锁完成 tick → 入住先（C7），撬锁 ABORT
5. 受纸者同 tick 破罐 → 递纸者退纸（C8），激励 0
6. 骚扰 +3+3 同 tick → 单次逼出、余量清零、优先锁给先启动者（C3 溢出规则）
7. 霸体推搡 → 丢弃且 CD 不扣（C5）
8. 断线重连 → 在途引导清空、道具账一致（C10）
9. **回放一致性**：同一 intent 序列跑两遍，逐 tick 状态哈希完全一致（段③ actor_id 排序保证）
10. SNIFF 被 ABORT → 技能次数保留
11. KNOCK_DOOR 中断 → CD = 5s（半额）
12. 同 tick 两个 SHOVE 同一目标（不同施暴者）→ 先序者结算清零，后序者命中霸体被丢弃

## 9. 实现建议

- 注册表用数据文件（JSON/TOML）驱动，GDD §15 数值表与本表同源生成，避免两处漂移。
- `charging_actions` 用小顶堆（按 resolve_tick），tick 内只弹到期项。
- 段③确定性排序 key 用 `(actor_id)` 即可；若未来加同 actor 多意图，扩展为 `(actor_id, intent_id)`。
- 所有 `resolved/aborted` 包同时写入对局录像流（复放/集锦/申诉取证三用）。
