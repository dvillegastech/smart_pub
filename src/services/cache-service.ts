import * as vscode from 'vscode';
import { CacheEntry } from '../types/pub-types';

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadCacheFromStorage();
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.saveCacheToStorage();
      return null;
    }

    return entry.data as T;
  }

  public set<T>(key: string, data: T, expirationSeconds?: number): void {
    const config = vscode.workspace.getConfiguration('smartPub');
    const defaultExpiration = config.get<number>('cacheExpiration', 3600);
    const expiration = expirationSeconds || defaultExpiration;
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + (expiration * 1000)
    };

    this.cache.set(key, entry);
    this.saveCacheToStorage();
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  public delete(key: string): void {
    this.cache.delete(key);
    this.saveCacheToStorage();
  }

  public clear(): void {
    this.cache.clear();
    this.saveCacheToStorage();
  }

  public isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('smartPub');
    return config.get<boolean>('enableCache', true);
  }

  private loadCacheFromStorage(): void {
    try {
      const stored = this.context.globalState.get<Record<string, CacheEntry<any>>>('smartPubCache', {});
      this.cache = new Map(Object.entries(stored));
      
      // Clean expired entries on load
      this.cleanExpiredEntries();
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
      this.cache = new Map();
    }
  }

  private saveCacheToStorage(): void {
    try {
      const cacheObject = Object.fromEntries(this.cache);
      this.context.globalState.update('smartPubCache', cacheObject);
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
    }
  }

  private cleanExpiredEntries(): void {
    const now = Date.now();
    let hasChanges = false;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.saveCacheToStorage();
    }
  }
} 