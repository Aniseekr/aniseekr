// NOAA solar position math (spec §13). Pure functions, zero dependencies.
//
// Implements the NOAA Solar Calculator's spreadsheet algorithm: Julian
// century → solar geometry → equation of time + declination → hour angles
// for arbitrary zenith. Accuracy is within ~1 minute of the published NOAA
// calculator for non-polar latitudes, which the unit tests pin against
// reference values. Times are returned as UTC instants; timezone concerns
// live entirely in timezone.ts.

import type { CivilDate } from './timezone';

export interface SunWindow {
  start: Date;
  end: Date;
}

export interface SunTimes {
  /** null only at polar latitudes (see `polar`). */
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Sunrise → sun altitude +6°. */
  goldenHourAm: SunWindow | null;
  /** Sun altitude +6° → sunset. */
  goldenHourPm: SunWindow | null;
  /** Sunset → sun altitude −6° (end of civil twilight). */
  civilDusk: Date | null;
  /** Set when the sun never crosses the horizon on this civil date. */
  polar: 'day' | 'night' | null;
}

const DEG = Math.PI / 180;

/** Zenith angles (degrees). Sunrise includes refraction + solar radius. */
const ZENITH_OFFICIAL = 90.833;
const ZENITH_GOLDEN = 84; // sun altitude +6°
const ZENITH_CIVIL = 96; // sun altitude −6°

interface SolarBasis {
  declinationRad: number;
  eqOfTimeMin: number;
}

function solarBasis(julianCentury: number): SolarBasis {
  const jc = julianCentury;
  const meanLong = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const meanAnom = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccent = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const eqOfCtr =
    Math.sin(meanAnom * DEG) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * meanAnom * DEG) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * meanAnom * DEG) * 0.000289;
  const trueLong = meanLong + eqOfCtr;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const meanObliq =
    23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(omega * DEG);
  const declinationRad = Math.asin(Math.sin(obliqCorr * DEG) * Math.sin(appLong * DEG));
  const varY = Math.tan((obliqCorr / 2) * DEG) ** 2;
  const eqOfTimeMin =
    4 *
    (1 / DEG) *
    (varY * Math.sin(2 * meanLong * DEG) -
      2 * eccent * Math.sin(meanAnom * DEG) +
      4 * eccent * varY * Math.sin(meanAnom * DEG) * Math.cos(2 * meanLong * DEG) -
      0.5 * varY * varY * Math.sin(4 * meanLong * DEG) -
      1.25 * eccent * eccent * Math.sin(2 * meanAnom * DEG));
  return { declinationRad, eqOfTimeMin };
}

/**
 * Hour angle (degrees) at which the sun reaches `zenithDeg`, or null when it
 * never does on this date (polar day/night for that zenith).
 */
function hourAngleDeg(latDeg: number, declinationRad: number, zenithDeg: number): number | null {
  const latRad = latDeg * DEG;
  const cosH =
    Math.cos(zenithDeg * DEG) / (Math.cos(latRad) * Math.cos(declinationRad)) -
    Math.tan(latRad) * Math.tan(declinationRad);
  if (cosH > 1 || cosH < -1) return null;
  return Math.acos(cosH) / DEG;
}

/** Sun times for a civil date at a coordinate. `civilDate` is the date in the spot's timezone. */
export function getSunTimes(lat: number, lng: number, civilDate: CivilDate): SunTimes {
  const midnightUtcMs = Date.UTC(civilDate.y, civilDate.m - 1, civilDate.d);
  // Evaluate solar geometry near local solar noon for best accuracy.
  const julianDay = midnightUtcMs / 86400000 + 2440587.5 + 0.5 - lng / 360;
  const jc = (julianDay - 2451545) / 36525;
  const { declinationRad, eqOfTimeMin } = solarBasis(jc);

  const solarNoonMin = 720 - 4 * lng - eqOfTimeMin;
  const toDate = (minutesFromUtcMidnight: number): Date =>
    new Date(midnightUtcMs + minutesFromUtcMidnight * 60000);
  const solarNoon = toDate(solarNoonMin);

  const haOfficial = hourAngleDeg(lat, declinationRad, ZENITH_OFFICIAL);
  if (haOfficial === null) {
    // Sun never crosses the horizon: polar day when it stays above (noon
    // altitude positive), polar night otherwise.
    const noonAltitudeSign =
      Math.sin(lat * DEG) * Math.sin(declinationRad) +
      Math.cos(lat * DEG) * Math.cos(declinationRad);
    return {
      sunrise: null,
      sunset: null,
      solarNoon,
      goldenHourAm: null,
      goldenHourPm: null,
      civilDusk: null,
      polar: noonAltitudeSign > 0 ? 'day' : 'night',
    };
  }

  const sunrise = toDate(solarNoonMin - 4 * haOfficial);
  const sunset = toDate(solarNoonMin + 4 * haOfficial);

  const haGolden = hourAngleDeg(lat, declinationRad, ZENITH_GOLDEN);
  const goldenHourAm = haGolden === null ? null : { start: sunrise, end: toDate(solarNoonMin - 4 * haGolden) };
  const goldenHourPm = haGolden === null ? null : { start: toDate(solarNoonMin + 4 * haGolden), end: sunset };

  const haCivil = hourAngleDeg(lat, declinationRad, ZENITH_CIVIL);
  const civilDusk = haCivil === null ? null : toDate(solarNoonMin + 4 * haCivil);

  return { sunrise, sunset, solarNoon, goldenHourAm, goldenHourPm, civilDusk, polar: null };
}
