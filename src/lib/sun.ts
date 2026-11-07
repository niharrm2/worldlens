/**
 * Solar position (NOAA Solar Calculator algorithm): sub-solar point, solar elevation, the
 * day/night terminator, and sunrise/sunset for any place. Accurate to about a minute.
 */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

interface SolarState {
  /** Declination, degrees. */
  declination: number;
  /** Equation of time, minutes. */
  equationOfTime: number;
}

function solarState(time: number): SolarState {
  const jd = time / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { declination, equationOfTime: eqTime };
}

const minutesOfDayUtc = (time: number) => {
  const d = new Date(time);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
};

/** Point on Earth where the sun is directly overhead. */
export function subsolarPoint(time: number): { lat: number; lng: number } {
  const { declination, equationOfTime } = solarState(time);
  let lng = -15 * ((minutesOfDayUtc(time) + equationOfTime) / 60 - 12);
  lng = ((lng + 540) % 360) - 180;
  return { lat: declination, lng };
}

/** Sun elevation above the horizon in degrees (no refraction). */
export function solarElevation(lat: number, lng: number, time: number): number {
  const sun = subsolarPoint(time);
  const cos =
    Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lng - sun.lng) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, cos))) * DEG;
}

/** Day/night boundary as points every `step` degrees of longitude. */
export function terminator(time: number, step = 2): { lat: number; lng: number }[] {
  const sun = subsolarPoint(time);
  const tanDec = Math.tan(sun.lat * RAD) || 1e-9;
  const points: { lat: number; lng: number }[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    const lat = Math.atan(-Math.cos((lng - sun.lng) * RAD) / tanDec) * DEG;
    points.push({ lat, lng });
  }
  return points;
}

/** Local mean solar time ("HH:MM") at a longitude. */
export function solarClock(lng: number, time: number): string {
  const { equationOfTime } = solarState(time);
  const minutes = (((minutesOfDayUtc(time) + equationOfTime + lng * 4) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
}

export interface SunTimes {
  /** Epoch ms, or null during polar day/night. */
  sunrise: number | null;
  sunset: number | null;
  solarNoon: number;
  /** Minutes of daylight (0 polar night, 1440 polar day). */
  dayLength: number;
}

/** Sunrise, sunset and solar noon on the UTC day of `time` at a place. */
export function sunTimes(lat: number, lng: number, time: number): SunTimes {
  const day = new Date(time);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  // Iterate once with the noon-time solar state for accuracy.
  let { declination, equationOfTime } = solarState(midnight + 12 * 3_600_000 - lng * 240_000);
  const noonMinutes = 720 - 4 * lng - equationOfTime;
  ({ declination, equationOfTime } = solarState(midnight + noonMinutes * 60_000));
  const solarNoon = midnight + (720 - 4 * lng - equationOfTime) * 60_000;
  const zenith = 90.833 * RAD; // includes refraction and the sun's radius
  const cosH = (Math.cos(zenith) - Math.sin(lat * RAD) * Math.sin(declination * RAD)) / (Math.cos(lat * RAD) * Math.cos(declination * RAD));
  if (cosH > 1) return { sunrise: null, sunset: null, solarNoon, dayLength: 0 };
  if (cosH < -1) return { sunrise: null, sunset: null, solarNoon, dayLength: 1440 };
  const halfDayMinutes = Math.acos(cosH) * DEG * 4;
  return {
    sunrise: solarNoon - halfDayMinutes * 60_000,
    sunset: solarNoon + halfDayMinutes * 60_000,
    solarNoon,
    dayLength: halfDayMinutes * 2,
  };
}

/** Approximate standard time-zone offset from longitude (nautical time zones). */
export const nauticalOffset = (lng: number) => Math.round(lng / 15);
