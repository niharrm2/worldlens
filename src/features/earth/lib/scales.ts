/** Colour scales and legends for the Earth data layers. */

type Stop = [value: number, color: string];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear interpolation across colour stops. */
export function ramp(stops: Stop[]) {
  return (value: number): string => {
    if (!Number.isFinite(value)) return "#808080";
    if (value <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const [v1, c1] = stops[i];
      if (value <= v1) {
        const [v0, c0] = stops[i - 1];
        const t = (value - v0) / (v1 - v0);
        const a = hex(c0), b = hex(c1);
        const mix = a.map((x, k) => Math.round(x + (b[k] - x) * t));
        return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
      }
    }
    return stops[stops.length - 1][1];
  };
}

/** Discrete bands: first band whose upper bound is ≥ value. */
export function bands(stops: Stop[]) {
  return (value: number): string => (stops.find(([max]) => value <= max) ?? stops[stops.length - 1])[1];
}

export const TEMPERATURE_STOPS: Stop[] = [
  [-40, "#6a3fb5"], [-20, "#3a6fe0"], [-5, "#3fc6ff"], [5, "#55d68a"], [15, "#d8e04a"], [25, "#ffad3b"], [35, "#ff4b2b"], [45, "#9e0e2b"],
];
export const PRESSURE_STOPS: Stop[] = [[960, "#3a57d6"], [990, "#6cb8ff"], [1013, "#f2f2f2"], [1030, "#ff9e6b"], [1045, "#d6233c"]];
export const AQI_STOPS: Stop[] = [[50, "#00c853"], [100, "#ffe600"], [150, "#ff8a00"], [200, "#ff1f1f"], [300, "#8f3f97"], [9999, "#7e0023"]];
export const PM25_STOPS: Stop[] = [[12, "#00c853"], [35.4, "#ffe600"], [55.4, "#ff8a00"], [150.4, "#ff1f1f"], [250.4, "#8f3f97"], [9999, "#7e0023"]];
export const DUST_STOPS: Stop[] = [[0, "#f6efe0"], [50, "#e8c98d"], [200, "#c98f3c"], [800, "#7a4a1a"]];
export const OZONE_STOPS: Stop[] = [[0, "#d7f5ff"], [60, "#7fd1f0"], [120, "#3f8fe0"], [200, "#6a3fb5"]];
export const WAVE_STOPS: Stop[] = [[0, "#bfe8ff"], [1, "#6cc3f2"], [2.5, "#2b8fe0"], [4, "#3a4fd6"], [6, "#7a2fd0"], [9, "#d62faa"]];
export const DEPTH_STOPS: Stop[] = [[70, "#ff5a3c"], [300, "#ffb347"], [9999, "#ffe066"]];
export const FRP_STOPS: Stop[] = [[10, "#ffd166"], [50, "#ff9f1c"], [200, "#ff5400"], [99999, "#ff006e"]];

export const temperatureColor = ramp(TEMPERATURE_STOPS);
export const pressureColor = ramp(PRESSURE_STOPS);
export const aqiColor = bands(AQI_STOPS);
export const pm25Color = bands(PM25_STOPS);
export const dustColor = ramp(DUST_STOPS);
export const ozoneColor = ramp(OZONE_STOPS);
export const waveColor = ramp(WAVE_STOPS);
export const depthColor = bands(DEPTH_STOPS);
export const frpColor = bands(FRP_STOPS);

export function aqiCategory(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

export const EVENT_COLORS: Record<string, string> = {
  wildfires: "#ff7b39",
  severeStorms: "#7aa7ff",
  volcanoes: "#ff3b3b",
  seaLakeIce: "#bfefff",
  floods: "#3fa9f5",
  earthquakes: "#ffcc00",
  drought: "#d6a05b",
  dustHaze: "#c8a26b",
  landslides: "#a0785a",
  snow: "#ffffff",
  tempExtremes: "#ff5ea8",
  waterColor: "#4dd0c8",
  manmade: "#b0b0b0",
};

/** CSS gradient for a continuous legend bar. */
export const gradientCss = (stops: Stop[]) =>
  `linear-gradient(90deg, ${stops.map(([, c], i) => `${c} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(", ")})`;
