'use client';

import React, { useEffect, useRef } from 'react';

type Props = { onGameOver: (score: number) => void };

type Orb = { id: number; x: number; y: number; r: number; vx: number; vy: number };
type Hazard = { id: number; x: number; y: number; w: number; h: number; vx: number; vy: number; rot: number; vrot: number };
type Trail = { x: number; y: number; a: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; z: number; hue: number };
type Wave = { x: number; y: number; r: number; life: number; max: number };

const W = 560, H = 640;

export default function NeonDodge({ onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const phaseRef = useRef<'idle'|'running'|'over'>('idle');
  const scoreRef = useRef(0);

  const px = useRef(W/2); const py = useRef(H*0.75);
  const pvx = useRef(0);  const pvy = useRef(0);

  const orbs = useRef<Orb[]>([]);
  const hazards = useRef<Hazard[]>([]);
  const nextId = useRef(1);
  const lastSpawnOrb = useRef(0);
  const lastSpawnHaz = useRef(0);
  const rafRef = useRef<number | null>(null);
  const keys = useRef<Record<string, boolean>>({});

  // FX state
  const trails = useRef<Trail[]>([]);
  const particles = useRef<Particle[]>([]);
  const waves = useRef<Wave[]>([]);

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctxRef.current = ctx;

    const onKey = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = e.type === 'keydown'; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    drawFrame(performance.now());

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    phaseRef.current = 'running';
    scoreRef.current = 0;
    px.current = W/2; py.current = H*0.75; pvx.current = 0; pvy.current = 0;
    orbs.current = []; hazards.current = []; nextId.current = 1; lastSpawnOrb.current = 0; lastSpawnHaz.current = 0;
    trails.current = []; particles.current = []; waves.current = [];
    drawFrame(performance.now());
    loop(performance.now());
  }

  function end() {
    if (phaseRef.current !== 'running') return;
    phaseRef.current = 'over';
    onGameOver(scoreRef.current);
    drawFrame(performance.now()); // overlay via HUD
  }

  function loop(t: number) {
    if (phaseRef.current !== 'running') return;
    const ctx = ctxRef.current!;

    // spawn cadence
    if (t - lastSpawnOrb.current > 700) { spawnOrb(); lastSpawnOrb.current = t; }
    if (t - lastSpawnHaz.current > Math.max(520, 1200 - scoreRef.current * 20)) { spawnHazard(); lastSpawnHaz.current = t; }

    // player physics
    const spd = 0.9, max = 4.2, friction = 0.92;
    const up = keys.current['w'] || keys.current['arrowup'];
    const down = keys.current['s'] || keys.current['arrowdown'];
    const left = keys.current['a'] || keys.current['arrowleft'];
    const right = keys.current['d'] || keys.current['arrowright'];
    if (up)    pvy.current -= spd;
    if (down)  pvy.current += spd;
    if (left)  pvx.current -= spd;
    if (right) pvx.current += spd;
    pvx.current = Math.max(-max, Math.min(max, pvx.current));
    pvy.current = Math.max(-max, Math.min(max, pvy.current));
    px.current += pvx.current; py.current += pvy.current;
    pvx.current *= friction;   pvy.current *= friction;

    // clamp
    const pr = 12;
    px.current = Math.max(pr, Math.min(W - pr, px.current));
    py.current = Math.max(pr, Math.min(H - pr, py.current));

    // trail update
    trails.current.unshift({ x: px.current, y: py.current, a: 1 });
    if (trails.current.length > 14) trails.current.pop();
    for (let i = 0; i < trails.current.length; i++) trails.current[i].a = 1 - i / 14;

    // move entities
    for (const o of orbs.current) { o.x += o.vx; o.y += o.vy; }
    for (const hz of hazards.current) { hz.x += hz.vx; hz.y += hz.vy; hz.rot += hz.vrot; }

    // collect & collide
    for (let i = orbs.current.length - 1; i >= 0; i--) {
      const o = orbs.current[i];
      const dx = o.x - px.current, dy = o.y - py.current;
      if (dx*dx + dy*dy <= (o.r + pr)*(o.r + pr)) {
        scoreRef.current += 1;
        spawnPickupFX(o.x, o.y);
        orbs.current.splice(i, 1);
      }
    }
    for (let i = hazards.current.length - 1; i >= 0; i--) {
      const h = hazards.current[i];
      const rx = h.x - h.w/2, ry = h.y - h.h/2; // center → top-left
      if (rectCircleCollide(rx, ry, h.w, h.h, px.current, py.current, pr)) { end(); return; }
    }

    // update FX
    for (const p of particles.current) { p.x += p.vx; p.y += p.vy; p.life -= 1.6; }
    particles.current = particles.current.filter(p => p.life > 0);
    for (const w of waves.current) { w.r += 5.4; w.life -= 1.6; }
    waves.current = waves.current.filter(w => w.life > 0);

    // cull offscreen
    orbs.current = orbs.current.filter(o => inView(o.x, o.y, 40));
    hazards.current = hazards.current.filter(h => inView(h.x, h.y, 80));

    // draw
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, t);
    drawFloor3D(ctx, t);
    drawFXBehind(ctx);
    for (const o of orbs.current) drawOrb(ctx, o);
    for (const hz of hazards.current) drawHazardExtruded(ctx, hz);
    drawPlayerWithTrail(ctx, px.current, py.current, pr, t);
    drawFXFront(ctx);
    drawHUD(ctx);

    rafRef.current = requestAnimationFrame(loop);
  }

  function inView(x:number, y:number, pad:number){ return x>-pad && y>-pad && x<W+pad && y<H+pad; }

  function spawnOrb() {
    const r = 7 + Math.random()*6;
    const side = Math.floor(Math.random()*4);
    let x=0,y=0,vx=0,vy=0;
    const s = 1 + Math.random()*1.5;
    if (side===0){ x = Math.random()*W; y = -10; vx = (Math.random()-0.5)*0.6; vy = s; }
    else if (side===1){ x = W+10; y = Math.random()*H; vx = -s; vy = (Math.random()-0.5)*0.6; }
    else if (side===2){ x = Math.random()*W; y = H+10; vx = (Math.random()-0.5)*0.6; vy = -s; }
    else { x = -10; y = Math.random()*H; vx = s; vy = (Math.random()-0.5)*0.6; }
    orbs.current.push({ id: nextId.current++, x, y, r, vx, vy });
  }

  function spawnHazard() {
    const w = 24 + Math.random()*26;
    const h = 10 + Math.random()*12;
    const v = 1.6 + Math.random()*1.2;
    const side = Math.floor(Math.random()*4);
    let x=0,y=0,vx=0,vy=0;
    if (side===0){ x = Math.random()*W; y = -20; vx = (Math.random()-0.5)*0.4; vy = v; }
    else if (side===1){ x = W+20; y = Math.random()*H; vx = -v; vy = (Math.random()-0.5)*0.4; }
    else if (side===2){ x = Math.random()*W; y = H+20; vx = (Math.random()-0.5)*0.4; vy = -v; }
    else { x = -20; y = Math.random()*H; vx = v; vy = (Math.random()-0.5)*0.4; }
    hazards.current.push({ id: nextId.current++, x, y, w, h, vx, vy, rot: Math.random()*Math.PI, vrot: (Math.random()-0.5)*0.06 });
  }

  function onClick() {
    if (phaseRef.current !== 'running') { start(); return; }
  }

  // ===== FX creators =====
  function spawnPickupFX(x:number, y:number) {
    // sparks
    for (let i=0;i<14;i++){
      const ang = Math.random()*Math.PI*2;
      const sp = 1.2 + Math.random()*2.2;
      particles.current.push({
        x, y,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp,
        life: 26 + Math.random()*10,
        max: 36,
        z: Math.random()*0.8 + 0.2,
        hue: 210 + Math.random()*60
      });
    }
    // wave ring
    waves.current.push({ x, y, r: 10, life: 22, max: 22 });
  }

  // ===== drawing =====
  function drawFrame(t:number){
    const ctx = ctxRef.current; if(!ctx) return;
    ctx.clearRect(0,0,W,H);
    drawBackground(ctx, t);
    drawFloor3D(ctx, t);
    drawHUD(ctx);
  }

  function drawBackground(ctx:CanvasRenderingContext2D, t:number){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#05060c'); g.addColorStop(1,'#0a0f1b');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    const glow = ctx.createRadialGradient(W*0.5, H*0.22, 20, W*0.5, H*0.22, 360);
    glow.addColorStop(0,'rgba(139,92,246,0.25)');
    glow.addColorStop(1,'rgba(139,92,246,0.0)');
    ctx.fillStyle = glow; ctx.fillRect(0,0,W,H);
    // subtle scanline shimmer
    ctx.save();
    ctx.globalAlpha = 0.04;
    for(let y=0;y<H;y+=3){ ctx.fillRect(0,y,W,1); }
    ctx.restore();
  }

  function drawFloor3D(ctx:CanvasRenderingContext2D, t:number){
    const vpX = W*0.5, vpY = H*0.28;
    const speed = 0.0018;
    const phase = (t*speed)%1;

    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;

    const rows = 22;
    for(let i=1;i<=rows;i++){
      const z = (i+phase)/rows;
      const y = vpY + (H - vpY) * z*z;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    const cols = 14;
    for(let c=0;c<=cols;c++){
      const xb = (c/cols)*W;
      ctx.beginPath(); ctx.moveTo(xb, H); ctx.lineTo(vpX, vpY); ctx.stroke();
    }
    const h = ctx.createLinearGradient(0, vpY-6, 0, vpY+60);
    h.addColorStop(0, 'rgba(124,58,237,0.35)');
    h.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = h; ctx.fillRect(0, vpY-6, W, 80);
    ctx.restore();
  }

  function drawPlayerWithTrail(ctx:CanvasRenderingContext2D, x:number, y:number, r:number, t:number){
    // trail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i=trails.current.length-1;i>=0;i--){
      const tr = trails.current[i];
      const a = tr.a * 0.55;
      const rad = r * (1 + (1 - tr.a) * 0.8);
      const g = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, rad*2.6);
      g.addColorStop(0, `rgba(34,211,238,${0.55*a})`);
      g.addColorStop(1, `rgba(34,211,238,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, rad*2.6, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // body
    ctx.save();
    const a = ctx.createRadialGradient(x, y, r*0.3, x, y, r*3);
    a.addColorStop(0, 'rgba(34,211,238,0.85)');
    a.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.arc(x, y, r*3, 0, Math.PI*2); ctx.fill();

    ctx.shadowColor = 'rgba(34,211,238,0.9)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    const pr = r + 6 + Math.sin(t * 0.01) * 2;
    ctx.strokeStyle = 'rgba(139,92,246,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  function drawOrb(ctx:CanvasRenderingContext2D, o:Orb){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(o.x-2,o.y-2,1,o.x,o.y,o.r+6);
    g.addColorStop(0,'rgba(240,171,252,0.95)');
    g.addColorStop(1,'rgba(124,58,237,0.3)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawHazardExtruded(ctx:CanvasRenderingContext2D, h:Hazard){
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(h.rot);

    const depth = 6;
    ctx.fillStyle = 'rgba(31,41,55,0.8)';
    ctx.beginPath();
    ctx.moveTo(-h.w/2, -h.h/2);
    ctx.lineTo(-h.w/2 + depth, -h.h/2 - depth);
    ctx.lineTo(h.w/2 + depth, -h.h/2 - depth);
    ctx.lineTo(h.w/2, -h.h/2);
    ctx.closePath(); ctx.fill();

    const g = ctx.createLinearGradient(-h.w/2,0,h.w/2,0);
    g.addColorStop(0,'#ef4444'); g.addColorStop(1,'#f59e0b');
    ctx.shadowColor = 'rgba(239,68,68,0.6)'; ctx.shadowBlur = 14;
    ctx.fillStyle = g; ctx.fillRect(-h.w/2,-h.h/2,h.w,h.h);

    ctx.restore();
  }

  function drawFXBehind(ctx:CanvasRenderingContext2D){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles.current){
      const a = p.life / p.max;
      const rad = (1.2 - p.z*0.6) * (3 + (1-a)*3);
      ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${0.55*a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFXFront(ctx:CanvasRenderingContext2D){
    ctx.save();
    for (const w of waves.current){
      const a = w.life / w.max;
      ctx.strokeStyle = `rgba(124,58,237,${0.35*a})`;
      ctx.lineWidth = 2 + (1-a)*4;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD(ctx:CanvasRenderingContext2D){
    ctx.save();
    ctx.font = '800 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = '#e5e7eb'; ctx.fillText(`Score: ${scoreRef.current}`, 14, 26);
    ctx.textAlign = 'right'; ctx.fillStyle='#94a3b8'; ctx.fillText('WASD or Arrow Keys', W-14, 26);
    ctx.restore();

    if (phaseRef.current === 'idle'){
      const cx = W/2, cy = H/2, w=360, h=120, x=cx-w/2, y=cy-h/2;
      const c = ctx.createLinearGradient(0,y,0,y+h);
      c.addColorStop(0,'rgba(17,24,39,0.85)'); c.addColorStop(1,'rgba(31,41,55,0.85)');
      ctx.fillStyle = c; ctx.strokeStyle = 'rgba(124,58,237,0.5)'; ctx.lineWidth = 1.2;
      roundRect(ctx, x,y,w,h,16,true,true);
      ctx.textAlign='center';
      ctx.fillStyle='#e5e7eb'; ctx.font='900 22px ui-sans-serif, system-ui'; ctx.fillText('Neon Dodge', cx, y+44);
      ctx.fillStyle='#a5b4fc'; ctx.font='500 13px ui-sans-serif, system-ui'; ctx.fillText('Click to start — collect orbs and dodge hazards', cx, y+70);
    }

    if (phaseRef.current === 'over'){
      const cx = W/2, cy = H/2, w=320, h=150, x=cx-w/2, y=cy-h/2;
      ctx.fillStyle='rgba(8,10,18,0.68)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#0f172acc'; ctx.strokeStyle='rgba(59,130,246,0.4)'; ctx.lineWidth=1.2;
      roundRect(ctx, x,y,w,h,16,true,true);
      ctx.textAlign='center';
      ctx.fillStyle='#e5e7eb'; ctx.font='900 22px ui-sans-serif, system-ui'; ctx.fillText('Game Over', cx, y+40);
      ctx.fillStyle='#a5b4fc'; ctx.font='500 13px ui-sans-serif, system-ui'; ctx.fillText(`Score: ${scoreRef.current} — click to play again`, cx, y+70);
    }
  }

  function rectCircleCollide(rx:number, ry:number, rw:number, rh:number, cx:number, cy:number, cr:number){
    const dx = Math.max(rx - cx, 0, cx - (rx + rw));
    const dy = Math.max(ry - cy, 0, cy - (ry + rh));
    return (dx*dx + dy*dy) <= cr*cr;
  }
  function roundRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number, fill:boolean, stroke:boolean){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath(); ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr);
    if(fill) ctx.fill(); if(stroke) ctx.stroke();
  }

  return (
    <div className="canvasWrap" /* Efek tilt dihapus agar tidak mengganggu */>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={() => onClick()}
        style={{ borderRadius: 18, background: 'transparent', display: 'block', margin: '0 auto' }}
      />
    </div>
  );
}
