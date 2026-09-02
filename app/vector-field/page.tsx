"use client";

/**
 * Web shell: the same computation core and the same canvas component as the MCP widget, driven by
 * a form instead of by Claude. Independent route; /mcp and /widget are untouched.
 */
import { useEffect, useMemo, useState } from "react";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { findEquilibria } from "@/lib/core/equilibria";
import { sampleField } from "@/lib/core/field";
import { integrateAdaptive } from "@/lib/core/integrate";
import { compileSystem, ParseError, type CompiledSystem } from "@/lib/core/parse";
import { firstOrderEquilibria, firstOrderToSystem } from "@/lib/core/slope-field";
import type { Box, SystemSpec, Vec2 } from "@/lib/core/types";
import { CLASS_ZH, STABILITY_ZH, STATUS_ZH, WARNING_ZH, formatEigenvalue, formatNumber } from "@/lib/labels";
import type { Scene, TrajectoryView } from "@/lib/scene";
import { PRESETS, type Preset, type PresetMode } from "./presets";

type Form = {
  mode: PresetMode;
  f: string;
  g: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  density: number;
  arrowMode: "unit" | "scaled";
};

type Analysis = { scene: Scene; sys: CompiledSystem; box: Box; error: null } | { scene: null; sys: null; box: null; error: string };

const CANVAS_W = 720;
const CANVAS_H = 520;

function fromPreset(p: Preset, density: number, arrowMode: Form["arrowMode"]): Form {
  return {
    mode: p.mode,
    f: p.f,
    g: p.g,
    xMin: String(p.box.xMin),
    xMax: String(p.box.xMax),
    yMin: String(p.box.yMin),
    yMax: String(p.box.yMax),
    density,
    arrowMode,
  };
}

function parseBox(form: Form): Box {
  const nums = [form.xMin, form.xMax, form.yMin, form.yMax].map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) throw new RangeError("范围必须是四个有限的数字。");
  const [xMin, xMax, yMin, yMax] = nums;
  if (!(xMin < xMax)) throw new RangeError(`x 范围无效：左端 ${xMin} 必须小于右端 ${xMax}。`);
  if (!(yMin < yMax)) throw new RangeError(`y 范围无效：下端 ${yMin} 必须小于上端 ${yMax}。`);
  return { x: { min: xMin, max: xMax }, y: { min: yMin, max: yMax } };
}

function explain(error: unknown): string {
  if (error instanceof ParseError) return `表达式「${error.expr}」有问题：${error.message}`;
  if (error instanceof RangeError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function analyze(form: Form): Analysis {
  try {
    const box = parseBox(form);
    const spec: SystemSpec = form.mode === "system" ? { f: form.f, g: form.g } : firstOrderToSystem(form.g);
    const sys = compileSystem(spec);
    const field = sampleField(sys, box, form.density, form.density);
    if (form.mode === "system") {
      const eq = findEquilibria(sys, box);
      return { scene: { kind: "analyze_system", system: spec, box, field, equilibria: eq.points, warning: eq.warning }, sys, box, error: null };
    }
    const fo = firstOrderEquilibria(form.g, box.y, { xRange: box.x });
    return {
      scene: { kind: "analyze_first_order", system: spec, box, field, firstOrder: { expr: form.g, autonomous: fo.autonomous, solutions: fo.solutions } },
      sys,
      box,
      error: null,
    };
  } catch (error) {
    return { scene: null, sys: null, box: null, error: explain(error) };
  }
}

export default function VectorFieldPage() {
  const [form, setForm] = useState<Form>(() => fromPreset(PRESETS[0], 20, "unit"));
  const [trajectories, setTrajectories] = useState<TrajectoryView[]>([]);
  const [presetNote, setPresetNote] = useState(PRESETS[0].note);
  const analysis = useMemo(() => analyze(form), [form]);

  // The system changed: old trajectories no longer belong to the picture.
  const systemKey = `${form.mode}|${form.f}|${form.g}`;
  useEffect(() => {
    setTrajectories([]);
  }, [systemKey]);

  const update = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  const loadPreset = (p: Preset) => {
    setForm(fromPreset(p, form.density, form.arrowMode));
    setPresetNote(p.note);
  };

  const addTrajectory = (start: Vec2) => {
    if (!analysis.sys || !analysis.box) return;
    const { sys, box } = analysis;
    const both = ([1, -1] as const).map((direction): TrajectoryView => {
      const tr = integrateAdaptive(sys, start, 50, { direction, box, h: 0.05 });
      return {
        direction: direction === 1 ? "forward" : "backward",
        points: tr.points,
        status: tr.status,
        steps: tr.steps,
        tEnd: tr.times[tr.times.length - 1],
      };
    });
    setTrajectories((prev) => [...prev, ...both]);
  };

  const scene: Scene | null = analysis.scene ? { ...analysis.scene, trajectories } : null;
  const lastPair = trajectories.slice(-2);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 48px", fontSize: 14, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>向量场 / 相图</h1>
      <p style={{ margin: "0 0 16px", color: "#52606d" }}>
        输入 x&apos; = f(x, y)，y&apos; = g(x, y)，或一阶方程 dy/dx = g(x, y)。点击画布添加轨线（正向蓝色、逆向橙色）。
      </p>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <span style={{ alignSelf: "center", color: "#52606d" }}>预设：</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" onClick={() => loadPreset(p)} style={buttonStyle} data-preset={p.name}>
            {p.name}
          </button>
        ))}
      </section>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <form style={{ width: 300, display: "grid", gap: 10 }} onSubmit={(e) => e.preventDefault()}>
          <label style={labelStyle}>
            <span>类型</span>
            <select value={form.mode} onChange={(e) => update({ mode: e.target.value as PresetMode })} style={inputStyle}>
              <option value="system">二维系统 x&apos; = f, y&apos; = g</option>
              <option value="first_order">一阶方程 dy/dx = g(x, y)</option>
            </select>
          </label>
          {form.mode === "system" ? (
            <label style={labelStyle}>
              <span>x&apos; = f(x, y)</span>
              <input value={form.f} onChange={(e) => update({ f: e.target.value })} style={inputStyle} spellCheck={false} name="f" />
            </label>
          ) : null}
          <label style={labelStyle}>
            <span>{form.mode === "system" ? "y' = g(x, y)" : "dy/dx = g(x, y)"}</span>
            <input value={form.g} onChange={(e) => update({ g: e.target.value })} style={inputStyle} spellCheck={false} name="g" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={labelStyle}>
              <span>x 最小</span>
              <input value={form.xMin} onChange={(e) => update({ xMin: e.target.value })} style={inputStyle} name="xMin" />
            </label>
            <label style={labelStyle}>
              <span>x 最大</span>
              <input value={form.xMax} onChange={(e) => update({ xMax: e.target.value })} style={inputStyle} name="xMax" />
            </label>
            <label style={labelStyle}>
              <span>y 最小</span>
              <input value={form.yMin} onChange={(e) => update({ yMin: e.target.value })} style={inputStyle} name="yMin" />
            </label>
            <label style={labelStyle}>
              <span>y 最大</span>
              <input value={form.yMax} onChange={(e) => update({ yMax: e.target.value })} style={inputStyle} name="yMax" />
            </label>
          </div>
          <label style={labelStyle}>
            <span>网格密度：{form.density} × {form.density}</span>
            <input type="range" min={5} max={40} value={form.density} onChange={(e) => update({ density: Number(e.target.value) })} name="density" />
          </label>
          <label style={labelStyle}>
            <span>箭头长度</span>
            <select value={form.arrowMode} onChange={(e) => update({ arrowMode: e.target.value as Form["arrowMode"] })} style={inputStyle}>
              <option value="unit">等长（颜色表示模长）</option>
              <option value="scaled">按模长缩放</option>
            </select>
          </label>
          <button type="button" onClick={() => setTrajectories([])} style={buttonStyle} disabled={trajectories.length === 0}>
            清除轨线（{trajectories.length / 2} 条）
          </button>
          <p style={{ margin: 0, color: "#52606d" }}>{presetNote}</p>
          <p style={{ margin: 0, color: "#52606d", fontSize: 12 }}>
            语法：乘号要写出来（x*y，不是 xy），幂用 ^，函数 sin cos exp log sqrt abs 等，常数 pi、e。
          </p>
        </form>

        <div style={{ flex: "1 1 720px", minWidth: 0 }}>
          {analysis.error ? (
            <div role="alert" style={{ padding: "10px 12px", marginBottom: 10, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 6 }}>
              {analysis.error}
            </div>
          ) : null}
          {scene ? (
            <VectorFieldCanvas scene={scene} width={CANVAS_W} height={CANVAS_H} arrowMode={form.arrowMode} onClickWorld={addTrajectory} />
          ) : (
            <div style={{ width: CANVAS_W, height: CANVAS_H, border: "1px dashed #d1d5db", borderRadius: 6, display: "grid", placeItems: "center", color: "#6b7280" }}>
              修正上面的错误后会重新绘图
            </div>
          )}
          {scene?.field && scene.field.singularCount > 0 ? (
            <p style={{ margin: "8px 0 0", color: "#92400e" }}>向量场在 {scene.field.singularCount} 个采样点上无定义或无穷大（画成灰色小圆环）。</p>
          ) : null}

          {scene?.kind === "analyze_system" ? <EquilibriaList scene={scene} /> : null}
          {scene?.kind === "analyze_first_order" ? <FirstOrderList scene={scene} /> : null}
          {lastPair.length ? (
            <p style={{ margin: "8px 0 0", color: "#52606d" }}>
              最近一条轨线：{lastPair.map((t) => `${t.direction === "forward" ? "正向" : "逆向"}到 t = ${formatNumber(t.tEnd, 2)}，${STATUS_ZH[t.status]}`).join("；")}。
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function EquilibriaList({ scene }: { scene: Scene }) {
  const eq = scene.equilibria ?? [];
  return (
    <section style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>平衡点</h2>
      {scene.warning ? <p style={{ margin: "0 0 6px", color: "#92400e" }}>{WARNING_ZH[scene.warning]}</p> : null}
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {eq.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <strong>
              ({formatNumber(p.at.x)}, {formatNumber(p.at.y)})
            </strong>{" "}
            {CLASS_ZH[p.classification]}；特征值 {p.eigenvalues.map((e) => formatEigenvalue(e)).join(", ") || "无法求出"}；迹 {formatNumber(p.trace, 5)}，行列式{" "}
            {formatNumber(p.determinant, 5)}。
            {p.caveat ? <span style={{ color: "#92400e" }}> {p.caveat}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FirstOrderList({ scene }: { scene: Scene }) {
  const fo = scene.firstOrder;
  if (!fo) return null;
  return (
    <section style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>平衡解</h2>
      {!fo.autonomous ? (
        <p style={{ margin: 0 }}>右端依赖 x，方程不是自治的，不存在常数形式的平衡解；请看斜率场。</p>
      ) : fo.solutions.length === 0 ? (
        <p style={{ margin: 0 }}>方程是自治的，但在观察范围内 g(y) 没有零点，因此没有平衡解。</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {fo.solutions.map((s) => (
            <li key={s.y}>
              y = {formatNumber(s.y, 6)}：{STABILITY_ZH[s.stability]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const labelStyle = { display: "grid", gap: 4, color: "#1f2933" } as const;
const inputStyle = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, font: "inherit" } as const;
const buttonStyle = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: "pointer", font: "inherit" } as const;
