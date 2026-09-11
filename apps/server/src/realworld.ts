import type { Town } from "@ferrytown/engine";

/**
 * The island keeps our time. Its weather is a real Adriatic island's weather, its seasons are the calendar's,
 * its clock is that island's clock, its dawn and dusk are that island's sunrise and sunset, and its ferry keeps a
 * timetable shaped like the real Split to Stari Grad crossing. Open-Meteo answers with no key.
 */
export interface RealPlace { id: string; name: string; lat: number; lon: number; tz: string }
export const PLACES: Record<string, RealPlace> = {
  hvar: { id: "hvar", name: "Hvar", lat: 43.17, lon: 16.44, tz: "Europe/Zagreb" },
  vis: { id: "vis", name: "Vis", lat: 43.06, lon: 16.18, tz: "Europe/Zagreb" },
  korcula: { id: "korcula", name: "Korčula", lat: 42.96, lon: 17.13, tz: "Europe/Zagreb" },
};
/** Ferry departures from the mainland, by season, in the island's local hours. Shaped like the Jadrolinija Split to Stari Grad line, not copied from it. */
export const TIMETABLE: Record<string, number[]> = {
  winter: [8, 11, 14, 17, 20],
  spring: [7, 10, 13, 16, 19, 21],
  autumn: [7, 10, 13, 16, 19, 21],
  summer: [6, 8, 10, 12, 14, 16, 18, 20, 22],
};

/** WMO weather codes into the island's words. */
export function weatherWord(code: number, windKmh: number): string {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return windKmh > 45 ? "storm" : "rain";
  if (code === 45 || code === 48) return "fog";
  if (windKmh > 35) return "wind";
  return "clear";
}
export function seasonOf(date: Date, tz: string): string {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(date));
  return month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
}
export function minuteOfDayIn(tz: string, date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24, m = Number(parts.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export interface RealState { place: string; temperatureC: number | null; sunrise: string | null; sunset: string | null; code: number | null; wind: number | null; fetchedAt: number | null; ok: boolean }

export class RealWorld {
  readonly state: RealState;
  private timer: NodeJS.Timeout | null = null;
  /** Called after every fetch, so the clock the clients read carries the new sky at once. */
  onUpdate: (() => void) | null = null;
  constructor(readonly town: Town, readonly place: RealPlace, private log: (l: string) => void) {
    this.state = { place: place.name, temperatureC: null, sunrise: null, sunset: null, code: null, wind: null, fetchedAt: null, ok: false };
    town.weatherSource = "real";
    this.applyCalendar();
  }
  /** Season from the calendar and the ferry timetable that goes with it. */
  applyCalendar(): void {
    const season = seasonOf(new Date(), this.place.tz);
    this.town.seasonOverride = season; this.town.ferryTimes = TIMETABLE[season] ?? TIMETABLE.spring!;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: this.place.tz, weekday: "short", day: "numeric" }).formatToParts(new Date());
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((x) => x.type === "weekday")?.value ?? "Mon");
    this.town.weekdayOverride = wd >= 0 ? wd : null; this.town.dayOfMonthOverride = Number(parts.find((x) => x.type === "day")?.value ?? 1);
  }
  /** Bring the island's clock to the island's real time of day, forward only, without anyone thinking through the gap. */
  alignClock(): number {
    const target = minuteOfDayIn(this.place.tz);
    const delta = (target - this.town.minuteOfDay + 1440) % 1440;
    if (delta > 0 && delta < 1440) this.town.skip(delta);
    return delta;
  }
  /** How far behind the real clock the island is, in minutes, when the ticks have been slow. */
  lag(): number { const d = (minuteOfDayIn(this.place.tz) - this.town.minuteOfDay + 1440) % 1440; return d > 720 ? 0 : d; }
  async fetchOnce(): Promise<void> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.place.lat}&longitude=${this.place.lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=sunrise,sunset&timezone=${encodeURIComponent(this.place.tz)}&forecast_days=1`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!res.ok) throw new Error(`open-meteo ${res.status}`);
      const d = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number }; daily?: { sunrise?: string[]; sunset?: string[] } };
      const code = d.current?.weather_code ?? 0, wind = d.current?.wind_speed_10m ?? 0;
      const word = weatherWord(code, wind);
      this.state.temperatureC = d.current?.temperature_2m ?? null; this.state.code = code; this.state.wind = wind; this.state.fetchedAt = Date.now(); this.state.ok = true;
      this.state.sunrise = d.daily?.sunrise?.[0]?.slice(11, 16) ?? null; this.state.sunset = d.daily?.sunset?.[0]?.slice(11, 16) ?? null;
      this.town.temperatureC = this.state.temperatureC;
      this.town.setWeather(word, `The sky over ${this.place.name} turned to ${word}${this.state.temperatureC !== null ? `, ${Math.round(this.state.temperatureC)} degrees` : ""}.`);
      this.onUpdate?.();
    } catch (err) { this.state.ok = false; this.log(`real world: ${(err as Error).message}; the island keeps the last sky it saw`); }
  }
  start(everyMs = 15 * 60 * 1000): void { void this.fetchOnce(); this.timer = setInterval(() => { this.applyCalendar(); void this.fetchOnce(); }, everyMs); }
  stop(): void { if (this.timer) clearInterval(this.timer); }
}
