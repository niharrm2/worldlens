"use client";

import type { OceanHeatVariable, SeaIceStats } from "@/types/earth";

import { gradientCss } from "../lib/scales";
import { shiftIsoDate, useEarthStore } from "../store";

const OCEAN_LEGENDS: Record<OceanHeatVariable, { label: string; stops: [number, string][]; from: string; to: string }> = {
  anomaly: {
    label: "Temperature anomaly",
    stops: [[-4, "#2a4fd6"], [-1, "#9cc3ff"], [0, "#ffffff"], [1, "#ffb3a3"], [4, "#d6232a"]],
    from: "−4 °C (cooler)",
    to: "+4 °C (warmer)",
  },
  dhw: {
    label: "Bleaching heat stress (Degree Heating Weeks)",
    stops: [[0, "#ffffff"], [4, "#ff9a7a"], [8, "#d6232a"], [16, "#2a0000"]],
    from: "0",
    to: "16+ °C-weeks",
  },
  sst: {
    label: "Sea-surface temperature",
    stops: [[-2, "#5a2fd0"], [8, "#2b8fe0"], [16, "#4fd1a5"], [24, "#ffd166"], [32, "#e0293a"]],
    from: "−2 °C",
    to: "32 °C",
  },
};

function GradientLegend({ stops, from, to }: { stops: [number, string][]; from: string; to: string }) {
  return (
    <div className="earth-legend">
      <i style={{ background: gradientCss(stops) }} />
      <span>{from}</span>
      <span>{to}</span>
    </div>
  );
}

/** Product selector, 7-day slider and legend for NOAA Coral Reef Watch. */
export function OceanHeatControls() {
  const variable = useEarthStore((s) => s.oceanVariable);
  const daysAgo = useEarthStore((s) => s.oceanDaysAgo);
  const latest = useEarthStore((s) => s.data.oceanheat?.items.latest[s.oceanVariable]);
  const { setOceanVariable, setOceanDaysAgo } = useEarthStore.getState();
  const legend = OCEAN_LEGENDS[variable];
  return (
    <>
      <select aria-label="Ocean heat product" value={variable} onChange={(e) => setOceanVariable(e.target.value as OceanHeatVariable)}>
        <option value="anomaly">Temperature anomaly</option>
        <option value="dhw">Coral bleaching heat stress</option>
        <option value="sst">Sea-surface temperature</option>
      </select>
      <label className="earth-slider">
        <span>{latest ? shiftIsoDate(latest, daysAgo) : "—"}</span>
        <input
          type="range"
          min={0}
          max={6}
          value={6 - daysAgo}
          onChange={(e) => setOceanDaysAgo(6 - Number(e.target.value))}
          aria-label="Ocean heat date"
        />
      </label>
      <GradientLegend stops={legend.stops} from={legend.from} to={legend.to} />
      <small>Click any ocean point for its exact values.</small>
    </>
  );
}

function extentRow(stats: SeaIceStats | undefined, label: string) {
  if (!stats?.series.length) return null;
  const [date, extent] = stats.series[stats.series.length - 1];
  const median = stats.median[stats.median.length - 1];
  const diff = median === null ? null : extent - median;
  return (
    <div className="earth-stat">
      <span>{label}</span>
      <strong>{extent.toFixed(2)} M km²</strong>
      <small>
        {date}
        {diff !== null && ` · ${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(2)} vs 1981–2010 median`}
      </small>
    </div>
  );
}

/** Date slider plus NSIDC Sea Ice Index extent for both hemispheres. */
export function SeaIceControls() {
  const daysAgo = useEarthStore((s) => s.seaIceDaysAgo);
  const seaice = useEarthStore((s) => s.data.seaice?.items);
  const setSeaIceDaysAgo = useEarthStore.getState().setSeaIceDaysAgo;
  const latest = seaice?.imagery.latestDate;
  return (
    <>
      <label className="earth-slider">
        <span>{latest ? shiftIsoDate(latest, daysAgo) : "—"}</span>
        <input
          type="range"
          min={0}
          max={14}
          value={14 - daysAgo}
          onChange={(e) => setSeaIceDaysAgo(14 - Number(e.target.value))}
          aria-label="Sea ice date"
        />
      </label>
      <div className="earth-stats">
        {extentRow(seaice?.north, "Arctic extent")}
        {extentRow(seaice?.south, "Antarctic extent")}
      </div>
    </>
  );
}

const scaleClass = (value: string) => (Number(value) >= 3 ? "high" : Number(value) >= 1 ? "mid" : "low");

/** Live solar-wind and geomagnetic conditions from NOAA SWPC. */
export function SolarDashboard() {
  const solar = useEarthStore((s) => s.data.solar?.items);
  if (!solar) return null;
  const { wind, mag, scales, kp, series } = solar;
  const latestKp = kp.at(-1)?.[1] ?? null;
  const speeds = series.map((p) => p[1]).filter((v): v is number => v !== null);
  const min = Math.min(...speeds, 300);
  const max = Math.max(...speeds, 700);
  const path = series
    .map((p, i) => (p[1] === null ? null : `${(i / Math.max(1, series.length - 1)) * 100},${30 - ((p[1] - min) / (max - min)) * 28}`))
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <div className="earth-scales">
        {(
          [
            ["G", scales.g, scales.gText, "Geomagnetic storm"],
            ["S", scales.s, scales.sText, "Solar radiation storm"],
            ["R", scales.r, scales.rText, "Radio blackout"],
          ] as const
        ).map(([k, v, text, title]) => (
          <span key={k} className={`earth-scale ${scaleClass(v)}`} title={`${title}: ${text}`}>
            {k}
            {v}
          </span>
        ))}
        <span className="earth-scale-note">NOAA space-weather scales (0 = none, 5 = extreme)</span>
      </div>
      <div className="earth-stats">
        <div className="earth-stat">
          <span>Solar wind</span>
          <strong>{wind.speed === null ? "—" : `${Math.round(wind.speed)} km/s`}</strong>
          <small>{wind.density === null ? "" : `${wind.density.toFixed(1)} p/cm³`}</small>
        </div>
        <div className="earth-stat">
          <span>Magnetic field Bz</span>
          <strong>{mag.bz === null ? "—" : `${mag.bz > 0 ? "+" : ""}${mag.bz.toFixed(1)} nT`}</strong>
          <small>{mag.bt === null ? "" : `Bt ${mag.bt.toFixed(1)} nT · southward Bz drives storms`}</small>
        </div>
        <div className="earth-stat">
          <span>Planetary Kp</span>
          <strong>{latestKp === null ? "—" : latestKp.toFixed(1)}</strong>
          <small>{latestKp !== null && latestKp >= 5 ? "Geomagnetic storm level" : "Below storm level (Kp 5)"}</small>
        </div>
      </div>
      {path && (
        <figure className="earth-spark" aria-label="Solar wind speed, last 6 hours">
          <svg viewBox="0 0 100 32" preserveAspectRatio="none">
            <polyline points={path} fill="none" stroke="#ff9f6b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <figcaption>Solar wind speed · last 6 h</figcaption>
        </figure>
      )}
      <div className="earth-kp" aria-label="Kp index, last 24 hours">
        {kp.map(([t, v]) => (
          <span key={t} title={`${new Date(t).toUTCString().slice(17, 22)} UTC · Kp ${v.toFixed(1)}`}>
            <i style={{ height: `${Math.max(6, (v / 9) * 100)}%`, background: v >= 5 ? "#e03a3a" : v >= 4 ? "#e0a21f" : "#4fd1a5" }} />
          </span>
        ))}
        <small>Kp, last 24 h</small>
      </div>
    </>
  );
}
