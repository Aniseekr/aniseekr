import { Platform } from "react-native";

const BASE_URL = "https://api.jikan.moe/v4";

// Simple Rate Limiter
// Jikan allows 3 requests per second and 60 requests per minute fairly generously,
// but we should be polite.
class RateLimiter {
  private queue: Array<() => void> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private readonly minInterval = 350; // ~3 requests/sec

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < this.minInterval) {
        await new Promise((r) => setTimeout(r, this.minInterval - timeSinceLast));
      }

      const task = this.queue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        await task();
      }
    }
    
    this.isProcessing = false;
  }
}

const limiter = new RateLimiter();

export class JikanClient {
  static async get<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    return limiter.schedule(async () => {
      const url = new URL(`${BASE_URL}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });

      console.log(`➡️ Jikan GET: ${url.toString()}`);

      let retryCount = 0;
      const maxRetries = 3;

      while (true) {
        try {
          const response = await fetch(url.toString());

          if (response.status === 429) {
            if (retryCount >= maxRetries) {
              throw new Error("Jikan API Rate Limit Exceeded");
            }
            retryCount++;
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.log(`⚠️ Rate Limit 429. Retrying in ${waitTime}ms...`);
            await new Promise((r) => setTimeout(r, waitTime));
            continue;
          }

          if (!response.ok) {
            throw new Error(`Jikan API Error: ${response.status}`);
          }

          const data = await response.json();
          return data as T;
        } catch (error) {
            // If network error, maybe retry? For now, throw.
            console.error("❌ Jikan Request Failed:", error);
            throw error;
        }
      }
    });
  }
}
