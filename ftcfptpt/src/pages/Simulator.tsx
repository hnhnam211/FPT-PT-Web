import { Component, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import SimulatorScene, { useGame } from "../simulator/Scene";
import type { CameraInfo, CameraMode } from "../simulator/Scene";
import { COLORS, DEFAULT_CONFIG, FLOWERS, Game, loading } from "../simulator/game";
import type { Config, Team } from "../simulator/game";
import "../simulator/simulator.css";

const PHASE_NAMES = { ready: "SẴN SÀNG", auto: "AUTO", settling: "CHỐT ĐIỂM AUTO", ended: "KẾT THÚC AUTO" };
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
    const down = (e: KeyboardEvent) => {
      if (actionsRef.current.blocked) return;
      if ((e.target as HTMLElement)?.closest("input,select,textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Enter" && !(e.target as HTMLElement)?.closest("button,a")) e.preventDefault();
      if (e.repeat) return;
      if (e.code === "KeyP" || e.code === "Enter" && !(e.target as HTMLElement)?.closest("button,a")) game.start();
      if (e.code === "KeyC") actionsRef.current.camera();
      if (e.code === "KeyR") actionsRef.current.reset();
      if (e.code === "KeyH") actionsRef.current.hud();
      if (e.code === "Escape") actionsRef.current.menu();
      if (/^Digit[1-4]$/.test(e.code)) game.selectRobot(Number(e.code.slice(-1)) - 1);
    };
    const blur = () => { if (!game.paused) game.start(); };
    const hidden = () => { if (document.hidden) blur(); };
    const poll = () => {
      if (actionsRef.current.blocked) { previousButtons = []; raf = requestAnimationFrame(poll); return; }
      let pad: Gamepad | null = null;
      try { pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null; } catch { /* Keyboard remains available. */ }
      const device = pad ? pad.id : "keyboard";
      if (device !== game.device) { game.device = device; game.emit(); }
      if (pad) {
        const pressed = pad.buttons.map(b => b.pressed);
        if (pressed[4] && !previousButtons[4]) game.selectRobot((game.controlled + 1) % 4);
        if (pressed[5] && !previousButtons[5]) actionsRef.current.camera();
        if (pressed[9] && !previousButtons[9]) game.start();
        previousButtons = pressed;
      } else previousButtons = [];
      raf = requestAnimationFrame(poll);
    };
    window.addEventListener("keydown", down); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden); raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("keydown", down);
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
      <span>BOT TỐI ƯU · {{ idle: "SẴN SÀNG", move: "ĐẾN ĐIỂM NÉM", collect: "LẤY BÓNG", aim: "CĂN NÉM", wait: "CHỜ HIVE", park: "VỀ VÙNG ĐỖ" }[r.task]}</span>
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
  </aside>;
}
function FlowerPanel({ game }: { game: Game }) {
  return <aside className="sim-panel sim-flowers">
    <div className="sim-panel-title"><h2>FLOWER</h2><span className="sim-muted">NGUỒN POLLEN · AUTO</span></div>
    <div className="sim-flower-columns">{game.flowers.map((flower, i) => {
      return <div key={i} className="sim-flower-slot" aria-label={`Flower ${i + 1}: ${flower.stack.length} bóng`}>
        <div className="sim-flower-tube">
          {flower.stack.map(id => <i key={id} style={{ background: COLORS[game.ball(id).kind], height: game.ball(id).kind === "pollen" ? "13%" : "17%" }} />)}
        </div>
        <strong>{flower.stack.length}</strong>
        <small>{FLOWERS[i].name}</small>
      </div>;
    })}</div>
  </aside>;
}
const HELP = [
  ["1 / 2 / 3 / 4", "Chọn robot để theo dõi"], ["C", "Đổi góc camera"],
  ["P / ENTER", "Bắt đầu / tạm dừng"], ["R", "Đặt lại toàn bộ trận đấu"], ["H / ESC", "Ẩn giao diện / mở cài đặt"],
];
function Help({ close }: { close: () => void }) {
  return <div className="sim-modal-backdrop" onClick={close}><section className="sim-dialog sim-help" role="dialog" aria-modal="true" aria-labelledby="sim-help-title" onClick={e => e.stopPropagation()}>
    <div className="sim-dialog-header"><div><span className="sim-eyebrow">AUTO · 30 GIÂY</span><h2 id="sim-help-title">THEO DÕI ROBOT.</h2></div><button onClick={close} aria-label="Đóng hướng dẫn">×</button></div>
    <div className="sim-help-keys">{HELP.map(([key, description]) => <div key={key}><kbd>{key}</kbd><span>{description}</span></div>)}</div>
    <div className="sim-help-pad"><b>TAY CẦM</b><p>Start: bắt đầu / tạm dừng · LB: chọn robot theo dõi · RB: đổi camera.</p></div>
    <p className="sim-help-note">Bot tự tìm đường tránh khung sân và các robot khác, chia nhau nguồn bóng, rồi dừng để căn ném vào HIVE. Bot chờ bóng đang bay và HIVE lật trước khi ném tiếp. Đường đi vẫn thay đổi giữa các lượt. AUTO kết thúc sau 30 giây và hệ thống chốt điểm.</p>
    <button className="sim-primary" onClick={close}>ĐÃ HIỂU · VÀO SÂN →</button>
  </section></div>;
}
function Settings({ game, close, reset, camera, setCamera }: {
  game: Game; close: () => void; reset: () => void;
  camera: CameraMode; setCamera: (mode: CameraMode) => void;
}) {
  const update = <K extends keyof Config>(key: K, value: Config[K]) => { game.config[key] = value; game.emit(); };
  return <div className="sim-modal-backdrop" onClick={close}><section className="sim-dialog sim-settings" role="dialog" aria-modal="true" aria-labelledby="sim-settings-title" onClick={e => e.stopPropagation()}>
    <div className="sim-dialog-header"><div><span className="sim-eyebrow">BIOBUZZ · TU09</span><h2 id="sim-settings-title">TRẠM ĐIỀU KHIỂN.</h2></div><button onClick={close} aria-label="Đóng cài đặt">×</button></div>
    <label>ROBOT THEO DÕI<select value={game.controlled} onChange={e => game.selectRobot(Number(e.target.value))}>{game.robots.map(r => <option key={r.id} value={r.id}>{r.team === "red" ? "Đỏ" : "Xanh"} {r.id % 2 + 1} · #{r.number}</option>)}</select></label>
    <label>GÓC NHÌN<select value={camera} onChange={e => setCamera(e.target.value as CameraMode)}>{CAMERAS.map(c => <option key={c} value={c}>{CAMERA_NAMES[c]}</option>)}</select></label>
    <label className="sim-toggle-row">HIỂN THỊ ĐƯỜNG ĐẠN<input type="checkbox" checked={game.config.trajectory} onChange={e => update("trajectory", e.target.checked)} /></label>
    <label>TỐC ĐỘ ROBOT AUTO <b>{game.config.speed.toFixed(2)} m/s</b><input type="range" min="0.4" max="2.8" step="0.05" value={game.config.speed} onChange={e => update("speed", Number(e.target.value))} /></label>
    <label>LỰC BẮN <b>{game.config.power.toFixed(1)} m/s</b><input type="range" min="3.5" max="8" step="0.1" value={game.config.power} onChange={e => update("power", Number(e.target.value))} /></label>
    <label>NGƯỠNG LẬT HIVE <b>{game.config.tipLoad} tải quy đổi</b><input type="range" min="5" max="15" step="0.5" value={game.config.tipLoad} onChange={e => update("tipLoad", Number(e.target.value))} /><small>Thông số mô phỏng: POLLEN = 1, NECTAR = 1,5. Manual không quy định lực lật; cần hiệu chỉnh từ sân thật.</small></label>
    <label>ĐỒ HỌA<select value={game.config.quality} onChange={e => update("quality", e.target.value as Config["quality"])}><option value="high">Cao · bóng đổ</option><option value="low">Nhẹ · ưu tiên tốc độ</option></select></label>
    <div className="sim-manual-note"><b>AUTO · 30 GIÂY</b><p>HIVE TIP +20 · LEAVE +3 mỗi robot · AUTO PARK +5 mỗi robot. Điểm FLOWER, GARDEN và bóng còn trong CELL thuộc phần sau của trận đấu nên không cộng trong lượt AUTO.</p><p>Sân và vật thể dựng theo kích thước TU09. Cơ cấu robot, lực lật, ma sát và camera định vị được mô hình hóa; hệ thống không thay thế trọng tài.</p></div>
    <button className="sim-primary" onClick={() => reset()}>↻ ĐẶT LẠI TRẬN ĐẤU</button>
  </section></div>;
}
function Results({ game, reset }: { game: Game; reset: () => void }) {
  const winner = game.score.red === game.score.blue ? "TRẬN ĐẤU HÒA" : `LIÊN MINH ${game.score.red > game.score.blue ? "ĐỎ" : "XANH"} CHIẾN THẮNG`;
  const exportLog = () => {
    const data = { game: "BIOBUZZ TU09", simulated: true, score: game.score, config: game.config, movement: game.movement,
      period: "AUTO", duration: 30, hive: game.earned, penalties: game.penalties, events: game.events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "biobuzz-auto.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="sim-modal-backdrop"><section className="sim-dialog sim-results" role="dialog" aria-modal="true" aria-labelledby="sim-results-title">
    <span className="sim-eyebrow">KẾT QUẢ AUTO · 30 GIÂY</span><h2 id="sim-results-title">{winner}</h2>
    <div className="sim-final-score"><strong className="red">{game.score.red}</strong><span>:</span><strong className="blue">{game.score.blue}</strong></div>
    <table><thead><tr><th>THÀNH TÍCH</th><th>ĐỎ</th><th>XANH</th></tr></thead><tbody>
      <tr><td>HIVE TIP</td><td>{game.earned.red}</td><td>{game.earned.blue}</td></tr>
      <tr><td>LEAVE + AUTO PARK</td><td>{game.movement.red}</td><td>{game.movement.blue}</td></tr>
      <tr><td>ĐIỂM PHẠT ĐỐI PHƯƠNG</td><td>{game.penalties.red}</td><td>{game.penalties.blue}</td></tr>
    </tbody></table>
    <button className="sim-primary" onClick={reset}>CHẠY LẠI AUTO →</button><button className="sim-secondary" onClick={exportLog}>Tải nhật ký AUTO</button>
  </section></div>;
}

export default function Simulator() {
  const [game, setGame] = useState(() => new Game(savedConfig()));
  const revision = useGame(game);
  const [camera, setCamera] = useState<CameraMode>("follow");
  const [hud, setHud] = useState(true), [help, setHelp] = useState(false), [menu, setMenu] = useState(false);
  const [cameraInfo, setCameraInfo] = useState<CameraInfo>({ visible: false, distance: 0, yaw: 0, tag: "34–37" });
  const root = useRef<HTMLDivElement>(null), feed = useRef<HTMLDivElement>(null);
  const reset = useCallback(() => {
    setGame(current => new Game({ ...current.config }));
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
  return <div ref={root} className={`biobuzz-sim sim-auto-only ${hud ? "" : "hud-hidden"}`}>
    <div className="sim-world" aria-label="Sân mô phỏng BIOBUZZ 3D"><SceneBoundary><Suspense fallback={<div className="sim-loading"><span />ĐANG KHỞI TẠO SÂN BIOBUZZ…</div>}>
      <SimulatorScene game={game} mode={camera} feedRef={feed} hud={hud} onCamera={setCameraInfo} />
    </Suspense></SceneBoundary></div>
    <div className="sim-vignette" />
    <div className="sim-top-left"><button className="sim-outline" onClick={toggleHud}>{hud ? "ẨN GIAO DIỆN" : "HIỆN GIAO DIỆN"}<kbd>H</kbd></button></div>
    <div className="sim-top-right"><button className="sim-icon" onClick={showHelp} aria-label="Hướng dẫn điều khiển">?</button><button className="sim-icon" onClick={toggleMenu} aria-label="Mở cài đặt">☰</button><a className="sim-icon" href="/#home" aria-label="Về website">×</a></div>
    {hud && <>
      <header className="sim-scoreboard"><ScoreSide game={game} team="red" />
        <div className={`sim-clock ${game.phase === "auto" && game.remaining <= 5 ? "urgent" : ""}`}><span>{PHASE_NAMES[game.phase]}</span><strong data-testid="match-clock">{time(game.phase === "settling" ? 0 : game.remaining)}</strong><small>{game.paused ? "ĐÃ DỪNG" : "● LIVE"}</small></div>
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
      <p>{game.phase === "ready" ? "Bốn bot tự tìm đường, phối hợp lấy bóng và dừng căn ném vào HIVE trong 30 giây AUTO." : "Sân đấu và đồng hồ đang dừng. Tiếp tục khi bạn sẵn sàng."}</p>
      <button className="sim-primary" onClick={() => game.start()}>{game.phase === "ready" ? "BẮT ĐẦU AUTO" : "TIẾP TỤC AUTO"} <span>→</span></button>
      {game.phase === "ready" && <div className="sim-start-options"><button onClick={showHelp}>Hướng dẫn theo dõi</button></div>}
      {game.phase === "ready" && <small>AUTO 0:30 · 4 BOT TỐI ƯU · CHỐT ĐIỂM</small>}
    </div>}
    <div className="sim-bottom-bar"><div className="sim-brand"><i />BIOBUZZ <span>SIMULATOR</span><small>TU09</small></div>
      <div className="sim-toolbar"><button onClick={() => game.start()} disabled={game.phase === "ended"} title="Bắt đầu / tạm dừng (P)" aria-label={game.paused ? "Bắt đầu hoặc tiếp tục" : "Tạm dừng"}>{game.paused ? "▶" : "Ⅱ"}</button><button onClick={reset} title="Chạy lại AUTO (R)" aria-label="Chạy lại AUTO">↻</button><span className="sim-toolbar-divider" /><button className="sim-robot-switch" onClick={() => game.selectRobot((game.controlled + 1) % 4)} title="Chọn robot theo dõi (1–4)">#{game.robot.number}</button><button className="sim-camera-switch" onClick={cycleCamera} title="Đổi camera (C)">◉ <span>{CAMERA_NAMES[camera]}</span></button><button onClick={() => { game.config.trajectory = !game.config.trajectory; game.emit(); }} className={game.config.trajectory ? "active" : ""} title="Hiển thị đường đạn">⊕ <span>ĐƯỜNG ĐẠN</span></button><button onClick={fullScreen} title="Toàn màn hình" aria-label="Toàn màn hình">⛶</button></div>
      <span className="sim-bottom-status">AUTO / {PHASE_NAMES[game.phase]}</span>
    </div>
    {help && <Help close={() => setHelp(false)} />}
    {menu && <Settings game={game} close={() => setMenu(false)} reset={reset} camera={camera} setCamera={setCamera} />}
    {game.phase === "ended" && <Results game={game} reset={() => reset()} />}
  </div>;
}
