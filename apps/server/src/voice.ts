/**
 * Voices. A citizen's letter home, read aloud by Gemini's text-to-speech in a voice chosen once, from their name,
 * so the same person always sounds the same. Nothing is generated until an owner asks to hear a letter, and each
 * reading is kept, so a letter costs one call ever. No key, no voice: the button simply is not there.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Persona } from "@unwatched/protocol";

const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr", "Achird", "Algenib", "Callirrhoe", "Despina", "Enceladus", "Gacrux", "Iapetus", "Laomedeia", "Rasalgethi", "Sadachbia", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix", "Zubenelgenubi"];
const MODEL = process.env.UW_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

export function voiceOf(name: string): string { let h = 7; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return VOICES[h % VOICES.length]!; }
export function voicesEnabled(): boolean { return !!(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY); }

function wav(pcm: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const header = Buffer.alloc(44); const dataLen = pcm.length;
  header.write("RIFF", 0); header.writeUInt32LE(36 + dataLen, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

export class Voices {
  private cache = new Map<string, Buffer>(); private inflight = new Map<string, Promise<Buffer>>();
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }); }
  /** The reading of one letter, made once. Throws when there is no key or the model declines. */
  read(key: string, persona: Persona, text: string): Promise<Buffer> {
    const hit = this.cache.get(key); if (hit) return Promise.resolve(hit);
    const file = join(this.dir, `${key}.wav`); if (existsSync(file)) { const b = readFileSync(file); this.cache.set(key, b); return Promise.resolve(b); }
    const going = this.inflight.get(key); if (going) return going;
    const p = this.speak(persona, text).then((b) => { this.cache.set(key, b); try { writeFileSync(file, b); } catch { /* memory is enough */ } this.inflight.delete(key); return b; }).catch((e: Error) => { this.inflight.delete(key); throw e; });
    this.inflight.set(key, p); return p;
  }
  private async speak(persona: Persona, text: string): Promise<Buffer> {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY; if (!apiKey) throw new Error("no voice: set GEMINI_API_KEY");
    const prompt = `Read this letter home aloud as ${persona.name}, ${persona.age}, from ${persona.origin}: quietly, unhurried, to someone far away who cares. Do not add anything.\n\n${text.slice(0, 1800)}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf(persona.name) } } } } }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`the voice did not come: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[] };
    const part = data.candidates?.[0]?.content?.parts?.find((x) => x.inlineData); if (!part?.inlineData) throw new Error("the voice came back empty");
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
    return wav(Buffer.from(part.inlineData.data, "base64"), rate);
  }
}
