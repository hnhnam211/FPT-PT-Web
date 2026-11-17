import { Component, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import SimulatorScene, { useGame } from "../simulator/Scene";
import type { CameraInfo, CameraMode } from "../simulator/Scene";
import { COLORS, DEFAULT_CONFIG, FLOWERS, Game, loading } from "../simulator/game";
import type { Config, Team } from "../simulator/game";
import "../simulator/simulator.css";

const PHASE_NAMES = { ready: "SẴN SÀNG", auto: "AUTO", transition: "CHUYỂN TIẾP", teleop: "TELEOP", settling: "CHỐT ĐIỂM", ended: "KẾT THÚC" };
const MODE_NAMES = { auto: "AUTO", teleop: "TELEOP", full: "AUTO + TELEOP" };
const CAMERAS: CameraMode[] = ["follow", "overhead", "orbit", "driver"];
const CAMERA_NAMES = { follow: "Bám robot", overhead: "Từ trên cao", orbit: "Tự do", driver: "Góc người lái" };
const time = (seconds: number) => `${Math.floor(Math.max(0, Math.ceil(seconds)) / 60)}:${String(Math.max(0, Math.ceil(seconds)) % 60).padStart(2, "0")}`;
const SETTINGS_KEY = "biobuzz-simulator-settings";
function savedConfig(): Config {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (!value || typeof value !== "object") return { ...DEFAULT_CONFIG };
    const config = { ...DEFAULT_CONFIG };
    if (["red", "blue"].includes(value.team)) config.team = value.team;
    if (["high", "low"].includes(value.quality)) config.quality = value.quality;
    if (["auto", "teleop", "full"].includes(value.matchMode)) config.matchMode = value.matchMode;
    if ([1, 2, 3].includes(value.autoTipLimit)) config.autoTipLimit = value.autoTipLimit;
    if (["bots", "manual"].includes(value.teleopControl)) config.teleopControl = value.teleopControl;
    if (typeof value.trajectory === "boolean") config.trajectory = value.trajectory;
    for (const [key, min, max] of [["speed", 0.4, 2.8], ["power", 3.5, 8], ["tipLoad", 5, 15]] as const)
      if (typeof value[key] === "number" && Number.isFinite(value[key])) config[key] = Math.max(min, Math.min(max, value[key]));
    return config;
  } catch { return { ...DEFAULT_CONFIG }; }
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return <div className="sim-fallback"><strong>Không thể khởi tạo sân 3D</strong><p>Hãy bật tăng tốc đồ họa trong trình duyệt và tải lại trang.</p><button onClick={() => window.location.reload()}>Tải lại</button><a href="/#home">Về website</a></div>;
    return this.props.children;
  }
}
function useControls(game: Game, actions: {
  camera: () => void; reset: () => void; hud: () => void; menu: () => void; blocked: boolean;
}) {
  const actionsRef = useRef(actions); actionsRef.current = actions;
  useEffect(() => {
    let raf = 0, previousButtons: boolean[] = [];
    const held = new Set<string>();
    const clear = () => { held.clear(); game.clearInput(); previousButtons = []; };
    const down = (e: KeyboardEvent) => {
      if (actionsRef.current.blocked) return;
      if ((e.target as HTMLElement)?.closest("input,select,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Enter" && !(e.target as HTMLElement)?.closest("button,a")) e.preventDefault();
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "KeyQ", "KeyE", "Space"].includes(e.code)) {
        e.preventDefault(); held.add(e.code);
      }
      if (e.repeat) return;
      if (e.code === "KeyI") game.toggleIntake();
      if (e.code === "KeyF" && game.manualDriving) game.place();
      if (e.code === "KeyP" || e.code === "Enter" && !(e.target as HTMLElement)?.closest("button,a")) game.start();
      if (e.code === "KeyC") actionsRef.current.camera();
      if (e.code === "KeyR") actionsRef.current.reset();
      if (e.code === "KeyH") actionsRef.current.hud();
      if (e.code === "Escape") actionsRef.current.menu();
      if (/^Digit[1-4]$/.test(e.code)) game.selectRobot(Number(e.code.slice(-1)) - 1);
    };
    const up = (e: KeyboardEvent) => { held.delete(e.code); };
    const blur = () => { clear(); if (!game.paused) game.start(); };
    const hidden = () => { if (document.hidden) blur(); };
    const poll = () => {
      if (actionsRef.current.blocked) { clear(); raf = requestAnimationFrame(poll); return; }
      if (game.paused) { held.clear(); game.clearInput(); }
      let pad: Gamepad | null = null;
      try { pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null; } catch { /* Keyboard remains available. */ }
      const device = pad ? pad.id : "keyboard";
      if (device !== game.device) { game.device = device; game.emit(); }
      if (pad) {
        const pressed = pad.buttons.map(b => b.pressed);
        if (pressed[4] && !previousButtons[4]) game.selectRobot((game.controlled + 1) % 4);
        if (pressed[5] && !previousButtons[5]) actionsRef.current.camera();
        if (pressed[9] && !previousButtons[9]) game.start();
        if (pressed[2] && !previousButtons[2]) game.toggleIntake();
        if (pressed[1] && !previousButtons[1] && game.manualDriving) game.place();
        if (game.manualDriving && !game.paused) {
          const axis = (i: number) => Math.abs(pad!.axes[i] ?? 0) > .15 ? pad!.axes[i] : 0;
          game.input = { x: axis(0), z: -axis(1), turn: -axis(2), shoot: !!pressed[0] || !!pressed[7] };
        }
        previousButtons = pressed;
      } else {
        previousButtons = [];
        if (game.manualDriving && held.size) game.input = {
          x: Number(held.has("KeyD") || held.has("ArrowRight")) - Number(held.has("KeyA") || held.has("ArrowLeft")),
          z: Number(held.has("KeyW") || held.has("ArrowUp")) - Number(held.has("KeyS") || held.has("ArrowDown")),
          turn: Number(held.has("KeyQ")) - Number(held.has("KeyE")), shoot: held.has("Space"),
        };
        else game.input = { ...game.touchInput };
      }
      raf = requestAnimationFrame(poll);
    };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden); raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up); clear();
      window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", hidden);
    };
  }, [game]);
}
function ScoreSide({ game, team }: { game: Game; team: Team }) {
  const robots = game.robots.filter(r => r.team === team), hive = game.hives[team];
  const remaining = game.balls.filter(b => b.kind === team && b.status === "reserve").length;
  return <div className={`sim-score-side ${team}`}>
    <div className="sim-score-team"><strong>{robots.map(r => r.number).join(" · ")}</strong>
      <div className="sim-team-meter"><span className="sim-reserve-pips">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < 5 - remaining ? "used" : ""} />)}</span><span>{game.nectarAvailable(team)} MỞ</span></div>
    </div>
    <b className="sim-score-number" data-testid={`score-${team}`}>{game.score[team]}</b>
    <div className="sim-score-sub"><span className="sim-tip-pips">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < hive.tips ? "filled" : ""} />)}</span><span>HIVE {hive.tips} TIP · NECTAR {remaining}/5</span></div>
  </div>;
}
function RobotTelemetry({ game }: { game: Game }) {
  const r = game.robot, hive = game.hives[r.team], speed = r.speed * 39.3701;
  const load = hive.load.reduce((n, id) => n + (game.ball(id).kind === "pollen" ? 1 : 1.5), 0);
  const progress = Math.min(100, load / game.config.tipLoad * 100);
  const points = game.history.map((v, i, list) => `${i / Math.max(list.length - 1, 1) * 300},${38 - Math.min(v / game.config.speed, 1) * 30}`).join(" ");
  return <aside className="sim-panel sim-telemetry">
    <div className="sim-panel-title"><h2>THÁP PHÁO</h2><span className="sim-badge">MECANUM</span></div>
    <p className={`sim-team-name ${r.team}`}>{r.team === "red" ? "ĐỎ" : "XANH"} {r.id % 2 + 1} · #{r.number}</p>
    <div className="sim-inventory" aria-label={`${r.inventory.length} trên 4 bóng`}>
      {Array.from({ length: 4 }, (_, i) => <i key={i} style={r.inventory[i] ? { background: COLORS[game.ball(r.inventory[i]).kind], borderColor: COLORS[game.ball(r.inventory[i]).kind] } : undefined} />)}
      <span>{r.inventory.length} / 4</span>
    </div>
    <div className="sim-status-chips">
      <span className={loading(r.team, r.position, 0.2) ? "active" : ""}>{loading(r.team, r.position, 0.2) ? "TRONG" : "NGOÀI"} LOADING ZONE</span>
      <span className={r.intake ? "active" : ""}>INTAKE {r.intake ? "ON" : "OFF"}</span>
      <span className="active">TURRET TỰ BÁM</span>
      <span>{game.manualDriving ? "TỰ LÁI · WASD / SPACE" : `BOT TỐI ƯU · ${{ idle: "SẴN SÀNG", move: "ĐẾN ĐIỂM NÉM", collect: "LẤY BÓNG", aim: "CĂN NÉM", wait: "CHỜ HIVE", park: "VỀ VÙNG ĐỖ", deliver: "ĐẶT FLOWER", yield: "NHƯỜNG ĐƯỜNG" }[r.task]}`}</span>
      {game.scoringPeriod === "auto" && <span className={game.autoTipLimitReached(r.team) ? "active" : ""}>AUTO {game.autoTips[r.team]}/{game.config.autoTipLimit} TIP</span>}
    </div>
    <div className="sim-turret-row"><div className="sim-dial"><i style={{ transform: `rotate(${-r.turret * 180 / Math.PI}deg)` }} /></div>
      <div><span className="sim-muted">HIVE {r.team === "red" ? "ĐỎ" : "XANH"} · TURRET</span>
        <strong className={game.aimValid ? "sim-yellow" : ""}>{game.aimValid ? "CÓ ĐƯỜNG BẮN" : "CHƯA KHÓA MỤC TIÊU"}</strong>
        <small>{game.config.power.toFixed(1)} m/s · hood {(r.hood * 180 / Math.PI).toFixed(0)}°</small>
      </div>
    </div>
    <svg className="sim-sparkline" viewBox="0 0 300 42" role="img" aria-label="Biểu đồ vận tốc robot"><path d="M0 38H300 M0 21H300 M0 4H300" stroke="#ffffff0c" /><polyline points={points || "0,38 300,38"} fill="none" stroke="#d4cba8" strokeWidth="1.5" /></svg>
    <div className="sim-hive-progress"><span>HIVE {r.team === "red" ? "ĐỎ" : "XANH"} · CELL {hive.side === 1 ? "GẦN" : "XA"}</span><b>{hive.tipping ? "ĐANG LẬT" : `${progress.toFixed(0)}% tới TIP`}</b></div>
    <div className="sim-progress-track"><i style={{ width: `${progress}%` }} /></div>
    <div className="sim-telemetry-bottom"><span>BẮN {r.shots} · VÀO {r.hits} · {r.shots ? Math.round(r.hits / r.shots * 100) : 0}%</span><span title="Điện áp mô phỏng">{(12.6 - r.speed * 0.22).toFixed(1)} V · {speed.toFixed(0)} in/s</span></div>
    {game.config.trajectory && <div className="sim-path-key" aria-label="Chú thích đường bóng"><span><i style={{ background: "#ffe76b" }} />DỰ KIẾN</span><span><i style={{ background: "#ff7186" }} />ĐỎ</span><span><i style={{ background: "#66dcff" }} />XANH</span></div>}
  </aside>;
}
function FlowerPanel({ game }: { game: Game }) {
  const near = FLOWERS.some(flower => Math.hypot(flower.x - game.robot.position.x, flower.z - game.robot.position.z) < .38);
  return <aside className="sim-panel sim-flowers">
    <div className="sim-panel-title"><h2>FLOWER</h2><span className="sim-muted">{game.scoringPeriod === "auto" ? "NGUỒN POLLEN · AUTO" : game.remaining > 60 && game.phase === "teleop" ? "NECTAR MỞ LÚC 1:00" : "NECTAR ĐÃ MỞ"}</span></div>
    <div className="sim-flower-columns">{game.flowers.map((flower, i) => {
      return <div key={i} className="sim-flower-slot" aria-label={`Flower ${i + 1}: ${flower.stack.length} bóng`}>
        <div className="sim-flower-tube">
          {flower.stack.map(id => <i key={id} style={{ background: COLORS[game.ball(id).kind], height: game.ball(id).kind === "pollen" ? "13%" : "17%" }} />)}
        </div>
        <strong>{flower.stack.length}</strong>
        {game.flowerOwner(i) && <b className={game.flowerOwner(i)!}>{game.flowerOwner(i) === "red" ? "ĐỎ" : "XANH"}</b>}
        <small>{FLOWERS[i].name}</small>
      </div>;
    })}</div>
    <div className="sim-flower-deliveries">ĐÃ ĐẶT: POLLEN {game.flowerDeposits.pollen} · NECTAR {game.flowerDeposits.red + game.flowerDeposits.blue}</div>
    {game.manualDriving && <div className="sim-flower-actions"><small>{near ? "CHỌN BÓNG ĐẶT VÀO CỘT GẦN" : "ĐẾN GẦN CỘT ĐỂ ĐẶT BÓNG"}</small>{(["pollen", game.robot.team] as const).map(kind => <button key={kind} disabled={!near || game.paused || !game.robot.inventory.some(id => game.ball(id).kind === kind)} onClick={() => game.place(game.robot, kind)}>{kind === "pollen" ? "ĐẶT POLLEN" : "ĐẶT NECTAR"}</button>)}</div>}
  </aside>;
}
const HELP = [
  ["1 / 2 / 3 / 4", "Chọn robot để theo dõi"], ["C", "Đổi góc camera"],
  ["P / ENTER", "Bắt đầu / tạm dừng"], ["R", "Đặt lại toàn bộ trận đấu"], ["H / ESC", "Ẩn giao diện / mở cài đặt"],
  ["WASD / MŨI TÊN", "TELEOP tự lái: di chuyển"], ["Q / E", "TELEOP tự lái: xoay robot"],
  ["SPACE / I / F", "Bắn HIVE / bật hút / đặt vào FLOWER gần"],
];
function Help({ close }: { close: () => void }) {
  return <div className="sim-modal-backdrop" onClick={close}><section className="sim-dialog sim-help" role="dialog" aria-modal="true" aria-labelledby="sim-help-title" onClick={e => e.stopPropagation()}>
    <div className="sim-dialog-header"><div><span className="sim-eyebrow">AUTO · TELEOP</span><h2 id="sim-help-title">ĐIỀU KHIỂN ROBOT.</h2></div><button onClick={close} aria-label="Đóng hướng dẫn">×</button></div>
    <div className="sim-help-keys">{HELP.map(([key, description]) => <div key={key}><kbd>{key}</kbd><span>{description}</span></div>)}</div>
    <div className="sim-help-pad"><b>TAY CẦM</b><p>Start: chạy/dừng · LB: đổi robot · RB: camera. Khi tự lái: cần trái di chuyển, cần phải xoay, A/RT bắn, X hút, B đặt FLOWER.</p></div>
    <p className="sim-help-note">Chọn AUTO 30 giây, TELEOP 2 phút hoặc cả hai với 8 giây chuyển tiếp. AUTO có 4 bot và giới hạn 1/2/3 HIVE TIP mỗi liên minh; LEAVE + PARK tối đa 8 điểm mỗi liên minh. TELEOP có thể tự lái 1 robot hoặc để 4 bot chạy. Từ 1:00 còn lại, bot chia cột FLOWER, đặt POLLEN làm nền rồi NECTAR để giành quyền sở hữu. Khi tự lái, nhấn F hoặc nút ĐẶT POLLEN / ĐẶT NECTAR để đặt bóng vào cột gần.</p>
    <button className="sim-primary" onClick={close}>ĐÃ HIỂU · VÀO SÂN →</button>
  </section></div>;
}
function MatchOptions({ config, disabled = false, change }: { config: Config; disabled?: boolean; change: (patch: Partial<Config>) => void }) {
  return <div className="sim-match-options">
    <fieldset disabled={disabled}><legend>CHẾ ĐỘ CHẠY</legend><div className="sim-choice-row">{(["auto", "teleop", "full"] as const).map(mode => <button key={mode} type="button" aria-pressed={config.matchMode === mode} onClick={() => change({ matchMode: mode })}>{MODE_NAMES[mode]}</button>)}</div></fieldset>
    {config.matchMode !== "teleop" && <fieldset disabled={disabled}><legend>GIỚI HẠN HIVE TIP TRONG AUTO</legend><div className="sim-choice-row">{([1, 2, 3] as const).map(limit => <button key={limit} type="button" aria-pressed={config.autoTipLimit === limit} onClick={() => change({ autoTipLimit: limit })}>{limit} HIVE TIP</button>)}</div><small>Mỗi liên minh dừng ném AUTO khi đạt mức đã chọn.</small></fieldset>}
    {config.matchMode !== "auto" && <label>ĐIỀU KHIỂN TELEOP<select disabled={disabled} value={config.teleopControl} onChange={e => change({ teleopControl: e.target.value as Config["teleopControl"] })}><option value="bots">4 bot tự chạy</option><option value="manual">Tự lái 1 robot · 3 bot tự chạy</option></select></label>}
    {disabled && <small>Đặt lại trận để thay đổi chế độ và mục tiêu.</small>}
  </div>;
}
function Settings({ game, close, reset, camera, setCamera }: {
  game: Game; close: () => void; reset: (patch?: Partial<Config>) => void;
  camera: CameraMode; setCamera: (mode: CameraMode) => void;
}) {
  const update = <K extends keyof Config>(key: K, value: Config[K]) => { game.config[key] = value; game.emit(); };
  return <div className="sim-modal-backdrop" onClick={close}><section className="sim-dialog sim-settings" role="dialog" aria-modal="true" aria-labelledby="sim-settings-title" onClick={e => e.stopPropagation()}>
    <div className="sim-dialog-header"><div><span className="sim-eyebrow">BIOBUZZ · TU09</span><h2 id="sim-settings-title">TRẠM ĐIỀU KHIỂN.</h2></div><button onClick={close} aria-label="Đóng cài đặt">×</button></div>
    <MatchOptions config={game.config} disabled={game.phase !== "ready"} change={reset} />
    <label>ROBOT THEO DÕI<select value={game.controlled} onChange={e => game.selectRobot(Number(e.target.value))}>{game.robots.map(r => <option key={r.id} value={r.id}>{r.team === "red" ? "Đỏ" : "Xanh"} {r.id % 2 + 1} · #{r.number}</option>)}</select></label>
    <label>GÓC NHÌN<select value={camera} onChange={e => setCamera(e.target.value as CameraMode)}>{CAMERAS.map(c => <option key={c} value={c}>{CAMERA_NAMES[c]}</option>)}</select></label>
    <label className="sim-toggle-row">HIỂN THỊ ĐƯỜNG BÓNG<input type="checkbox" checked={game.config.trajectory} onChange={e => update("trajectory", e.target.checked)} /></label>
    <label>TỐC ĐỘ ROBOT <b>{game.config.speed.toFixed(2)} m/s</b><input type="range" min="0.4" max="2.8" step="0.05" value={game.config.speed} onChange={e => update("speed", Number(e.target.value))} /></label>
    <label>LỰC BẮN <b>{game.config.power.toFixed(1)} m/s</b><input type="range" min="3.5" max="8" step="0.1" value={game.config.power} onChange={e => update("power", Number(e.target.value))} /></label>
    <label>NGƯỠNG LẬT HIVE <b>{game.config.tipLoad} tải quy đổi</b><input type="range" min="5" max="15" step="0.5" value={game.config.tipLoad} onChange={e => update("tipLoad", Number(e.target.value))} /><small>Thông số mô phỏng: POLLEN = 1, NECTAR = 1,5. Manual không quy định lực lật; cần hiệu chỉnh từ sân thật.</small></label>
    <label>ĐỒ HỌA<select value={game.config.quality} onChange={e => update("quality", e.target.value as Config["quality"])}><option value="high">Cao · bóng đổ</option><option value="low">Nhẹ · ưu tiên tốc độ</option></select></label>
    <div className="sim-manual-note"><b>AUTO 0:30 · CHUYỂN TIẾP 0:08 · TELEOP 2:00</b><p>HIVE TIP +20 ở cả hai giai đoạn. AUTO: LEAVE +3, PARK +5, tổng tối đa 8 điểm mỗi liên minh theo thiết lập mô phỏng. TELEOP: PARK +5 mỗi robot, CELL +2, GARDEN +1; FLOWER có điểm sở hữu và NECTAR dưới cùng. Mở toàn bộ NECTAR còn lại khi TELEOP còn 1:00; bot bắt đầu đặt FLOWER.</p><p>Giới hạn 1/2/3 TIP là tùy chọn luyện tập AUTO. Chế độ chỉ TELEOP bắt đầu từ bố trí sân ban đầu. Cơ cấu robot, lực lật và vùng tính điểm FLOWER được mô hình hóa.</p></div>
    <button className="sim-primary" onClick={() => reset()}>↻ ĐẶT LẠI TRẬN ĐẤU</button>
  </section></div>;
}
function Results({ game, reset }: { game: Game; reset: () => void }) {
  const winner = game.score.red === game.score.blue ? "TRẬN ĐẤU HÒA" : `LIÊN MINH ${game.score.red > game.score.blue ? "ĐỎ" : "XANH"} CHIẾN THẮNG`;
  const exportLog = () => {
    const data = { game: "BIOBUZZ TU09", simulated: true, score: game.score, config: game.config, movement: game.movement,
      period: MODE_NAMES[game.config.matchMode], duration: game.config.matchMode === "full" ? 150 : game.config.matchMode === "teleop" ? 120 : 30,
      autoTips: game.autoTips, hive: game.earned, autoHive: game.autoEarned, teleopPark: game.teleopPark, cell: game.cellScore, flower: game.flowerScore, garden: game.gardenScore, penalties: game.penalties, events: game.events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `biobuzz-${game.config.matchMode}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="sim-modal-backdrop"><section className="sim-dialog sim-results" role="dialog" aria-modal="true" aria-labelledby="sim-results-title">
    <span className="sim-eyebrow">KẾT QUẢ {MODE_NAMES[game.config.matchMode]}</span><h2 id="sim-results-title">{winner}</h2>
    <div className="sim-final-score"><strong className="red">{game.score.red}</strong><span>:</span><strong className="blue">{game.score.blue}</strong></div>
    <table><thead><tr><th>THÀNH TÍCH</th><th>ĐỎ</th><th>XANH</th></tr></thead><tbody>
      {game.config.matchMode !== "teleop" && <><tr><td>HIVE TIP AUTO · MỨC {game.config.autoTipLimit}</td><td>{game.autoEarned.red}</td><td>{game.autoEarned.blue}</td></tr><tr><td>LEAVE + AUTO PARK · TỐI ĐA 8</td><td>{game.movement.red}</td><td>{game.movement.blue}</td></tr></>}
      {game.config.matchMode !== "auto" && <><tr><td>HIVE TIP TELEOP</td><td>{game.earned.red - game.autoEarned.red}</td><td>{game.earned.blue - game.autoEarned.blue}</td></tr><tr><td>TELEOP PARK</td><td>{game.teleopPark.red}</td><td>{game.teleopPark.blue}</td></tr><tr><td>BÓNG TRONG CELL</td><td>{game.cellScore.red}</td><td>{game.cellScore.blue}</td></tr><tr><td>FLOWER</td><td>{game.flowerScore.red}</td><td>{game.flowerScore.blue}</td></tr><tr><td>GARDEN</td><td>{game.gardenScore.red}</td><td>{game.gardenScore.blue}</td></tr></>}
      <tr><td>ĐIỂM PHẠT ĐỐI PHƯƠNG</td><td>{game.penalties.red}</td><td>{game.penalties.blue}</td></tr>
    </tbody></table>
    <button className="sim-primary" onClick={reset}>CHẠY LẠI →</button><button className="sim-secondary" onClick={exportLog}>Tải nhật ký trận đấu</button>
  </section></div>;
}
function TouchControls({ game }: { game: Game }) {
  const pressed = useRef(new Set<string>());
  const update = (key: string, down: boolean) => {
    if (down) pressed.current.add(key); else pressed.current.delete(key);
    const has = (value: string) => Number(pressed.current.has(value));
    game.touchInput = { x: has("right") - has("left"), z: has("up") - has("down"), turn: has("rotate-left") - has("rotate-right"), shoot: !!has("shoot") };
  };
  useEffect(() => () => game.clearInput(), [game]);
  const hold = (key: string, label: string, title: string) => <button key={key} className={key} aria-label={title}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); update(key, true); }}
    onPointerUp={() => update(key, false)} onPointerCancel={() => update(key, false)} onLostPointerCapture={() => update(key, false)}>{label}</button>;
  return <div className="sim-touch-controls"><div className="sim-dpad">{hold("up", "↑", "Tiến")}{hold("left", "←", "Sang trái")}{hold("down", "↓", "Lùi")}{hold("right", "→", "Sang phải")}{hold("rotate-left", "↶", "Xoay trái")}{hold("rotate-right", "↷", "Xoay phải")}</div><div className="sim-touch-actions"><button onClick={() => game.toggleIntake()}>HÚT {game.robot.intake ? "ON" : "OFF"}</button><button onClick={() => game.place()}>ĐẶT</button>{hold("shoot", "BẮN", "Bắn HIVE")}</div></div>;
}

export default function Simulator() {
  const [game, setGame] = useState(() => new Game(savedConfig()));
  const revision = useGame(game);
  const [camera, setCamera] = useState<CameraMode>("follow");
  const [hud, setHud] = useState(true), [help, setHelp] = useState(false), [menu, setMenu] = useState(false);
  const [cameraInfo, setCameraInfo] = useState<CameraInfo>({ visible: false, distance: 0, yaw: 0, tag: "34–37" });
  const root = useRef<HTMLDivElement>(null), feed = useRef<HTMLDivElement>(null);
  const reset = useCallback((patch: Partial<Config> = {}) => {
    setGame(current => new Game({ ...current.config, ...patch }));
  }, []);
  const cycleCamera = useCallback(() => setCamera(current => CAMERAS[(CAMERAS.indexOf(current) + 1) % CAMERAS.length]), []);
  const toggleHud = useCallback(() => setHud(current => !current), []);
  const toggleMenu = useCallback(() => { if (!game.paused) game.start(); setMenu(current => !current); }, [game]);
  useControls(game, { camera: cycleCamera, reset, hud: toggleHud, menu: toggleMenu, blocked: help || menu || game.phase === "ended" });
  const lastSettings = useRef("");
  useEffect(() => {
    const settings = JSON.stringify(game.config);
    if (settings !== lastSettings.current) {
      lastSettings.current = settings;
      try { localStorage.setItem(SETTINGS_KEY, settings); } catch { /* Private browsing can disable storage. */ }
    }
  }, [game, revision]);
  useEffect(() => {
    const oldTitle = document.title, overflow = document.body.style.overflow;
    document.title = "BIOBUZZ Simulator · FPT Robotics"; document.body.style.overflow = "hidden";
    return () => { document.title = oldTitle; document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    if (!help && !menu) return;
    const dialog = document.querySelector<HTMLElement>(".sim-dialog");
    const before = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => dialog?.querySelector<HTMLElement>("button,select,input")?.focus(), 0);
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setHelp(false); setMenu(false); e.stopImmediatePropagation(); }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button,select,input,a[href]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", trap, true);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", trap, true); before?.focus(); };
  }, [help, menu]);
  const showHelp = () => { if (!game.paused) game.start(); setHelp(true); };
  const fullScreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { game.note("Trình duyệt chưa cho phép toàn màn hình"); game.emit(); }
  };
  const latest = game.events[0];
  const isActive = game.phase !== "ready" && game.phase !== "ended";
  return <div ref={root} className={`biobuzz-sim ${game.manualDriving && !game.paused ? "sim-manual" : "sim-auto-only"} ${hud ? "" : "hud-hidden"}`}>
    <div className="sim-world" aria-label="Sân mô phỏng BIOBUZZ 3D"><SceneBoundary><Suspense fallback={<div className="sim-loading"><span />ĐANG KHỞI TẠO SÂN BIOBUZZ…</div>}>
      <SimulatorScene game={game} mode={camera} feedRef={feed} hud={hud} onCamera={setCameraInfo} />
    </Suspense></SceneBoundary></div>
    <div className="sim-vignette" />
    <div className="sim-top-left"><button className="sim-outline" onClick={toggleHud}>{hud ? "ẨN GIAO DIỆN" : "HIỆN GIAO DIỆN"}<kbd>H</kbd></button></div>
    <div className="sim-top-right"><button className="sim-icon" onClick={showHelp} aria-label="Hướng dẫn điều khiển">?</button><button className="sim-icon" onClick={toggleMenu} aria-label="Mở cài đặt">☰</button><a className="sim-icon" href="/#home" aria-label="Về website">×</a></div>
    {hud && <>
      <header className="sim-scoreboard"><ScoreSide game={game} team="red" />
        <div className={`sim-clock ${game.activePlay && game.remaining <= 5 ? "urgent" : ""}`}><span>{PHASE_NAMES[game.phase]}</span><strong data-testid="match-clock">{time(game.phase === "settling" ? 0 : game.remaining)}</strong><small>{game.paused ? "ĐÃ DỪNG" : "● LIVE"}</small></div>
        <ScoreSide game={game} team="blue" />
      </header>
      {latest && game.elapsed - latest.at < 4.5 && game.phase !== "ready" && <div key={latest.id} className={`sim-toast ${latest.team ?? ""}`} role="status">{latest.text}</div>}
      <RobotTelemetry game={game} /><FlowerPanel game={game} />
      <aside className="sim-panel sim-camera"><div className="sim-camera-header"><strong>CAMERA · MÔ PHỎNG</strong><span className={cameraInfo.visible ? "sim-green" : ""}>{cameraInfo.visible ? `TAG ${cameraInfo.tag}` : "ĐANG TÌM TAG"}</span></div>
        <div ref={feed} className="sim-camera-feed"><div className="sim-camera-crosshair" />{cameraInfo.visible && <div className="sim-tag-bracket" />}</div>
        <div className="sim-camera-footer"><span>{cameraInfo.distance.toFixed(2)} m · yaw {cameraInfo.yaw.toFixed(1)}°</span><span>POSE TỪ CẢNH 3D</span></div>
      </aside>
      <div className="sim-device"><i className={game.device !== "keyboard" ? "connected" : ""} /><span>{game.device !== "keyboard" ? "TAY CẦM ĐÃ KẾT NỐI" : "BÀN PHÍM SẴN SÀNG"}</span><button onClick={showHelp}>Xem phím điều khiển ↗</button></div>
    </>}
    {!help && !menu && (game.phase === "ready" || game.paused && isActive) && <div className="sim-start-card">
      <span className="sim-eyebrow">FPT ROBOTICS · 2026—2027</span><h1>{game.phase === "ready" ? <>BIO<span>BUZZ.</span></> : "TẠM DỪNG."}</h1>
      <p>{game.phase === "ready" ? game.config.matchMode === "auto" ? "Bốn bot tự tìm đường, lấy bóng và ném HIVE trong 30 giây AUTO." : game.config.matchMode === "teleop" ? "Chạy riêng TELEOP 2 phút từ bố trí sân ban đầu." : "Chạy AUTO 30 giây, chuyển tiếp 8 giây và TELEOP 2 phút trên cùng một sân." : "Sân đấu và đồng hồ đang dừng. Tiếp tục khi bạn sẵn sàng."}</p>
      {game.phase === "ready" && <MatchOptions config={game.config} change={reset} />}
      <button className="sim-primary" onClick={() => game.start()}>{game.phase === "ready" ? `BẮT ĐẦU ${MODE_NAMES[game.config.matchMode]}` : "TIẾP TỤC"} <span>→</span></button>
      {game.phase === "ready" && <div className="sim-start-options"><button onClick={showHelp}>Hướng dẫn điều khiển</button></div>}
    </div>}
    <div className="sim-bottom-bar"><div className="sim-brand"><i />BIOBUZZ <span>SIMULATOR</span><small>TU09</small></div>
      <div className="sim-toolbar"><button onClick={() => game.start()} disabled={game.phase === "ended"} title="Bắt đầu / tạm dừng (P)" aria-label={game.paused ? "Bắt đầu hoặc tiếp tục" : "Tạm dừng"}>{game.paused ? "▶" : "Ⅱ"}</button><button onClick={() => reset()} title="Đặt lại trận đấu (R)" aria-label="Đặt lại trận đấu">↻</button><span className="sim-toolbar-divider" /><button className="sim-robot-switch" onClick={() => game.selectRobot((game.controlled + 1) % 4)} title="Chọn robot theo dõi (1–4)">#{game.robot.number}</button><button className="sim-camera-switch" onClick={cycleCamera} title="Đổi camera (C)">◉ <span>{CAMERA_NAMES[camera]}</span></button><button onClick={() => { game.config.trajectory = !game.config.trajectory; game.emit(); }} className={game.config.trajectory ? "active" : ""} title="Hiển thị đường bóng" aria-pressed={game.config.trajectory}>⊕ <span>ĐƯỜNG BÓNG</span></button><button onClick={fullScreen} title="Toàn màn hình" aria-label="Toàn màn hình">⛶</button></div>
      <span className="sim-bottom-status">{MODE_NAMES[game.config.matchMode]} / {PHASE_NAMES[game.phase]}</span>
    </div>
    {help && <Help close={() => setHelp(false)} />}
    {menu && <Settings game={game} close={() => setMenu(false)} reset={reset} camera={camera} setCamera={setCamera} />}
    {!help && !menu && game.manualDriving && !game.paused && <TouchControls game={game} />}
    {game.phase === "ended" && <Results game={game} reset={() => reset()} />}
  </div>;
}
