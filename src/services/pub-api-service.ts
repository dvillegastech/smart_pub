import axios, { AxiosResponse } from 'axios';
import * as vscode from 'vscode';
import { PubSearchResponse, PubPackageDetails, PubPackage, PubPackageSearchResult } from '../types/pub-types';
import { CacheService } from './cache-service';

export class PubApiService {
  private readonly baseUrl = 'https://pub.dev/api';
  private readonly cacheService: CacheService;

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
  }

  public async searchPackages(query: string, page: number = 1): Promise<PubPackage[]> {
    const cacheKey = `search:${query}:${page}`;
    
    if (this.cacheService.isEnabled() && this.cacheService.has(cacheKey)) {
      return this.cacheService.get<PubPackage[]>(cacheKey) || [];
    }

    try {
      const config = vscode.workspace.getConfiguration('smartPub');
      const maxResults = config.get<number>('maxSearchResults', 20);
      
      const response: AxiosResponse<PubSearchResponse> = await axios.get(
        `${this.baseUrl}/search`,
        {
          params: {
            q: query,
            page: page,
            size: Math.min(maxResults, 50)
          },
          timeout: 10000
        }
      );

      const packages = await this.convertSearchResultsToPackages(response.data.packages);
      
      if (this.cacheService.isEnabled()) {
        this.cacheService.set(cacheKey, packages, 1800); // 30 minutes cache for search
      }

      return packages;
    } catch (error) {
      console.error('Error searching packages:', error);
      vscode.window.showErrorMessage(`Failed to search packages: ${this.getErrorMessage(error)}`);
      return [];
    }
  }

  public async getPackageDetails(packageName: string): Promise<PubPackageDetails | null> {
    const cacheKey = `package:${packageName}`;
    
    if (this.cacheService.isEnabled() && this.cacheService.has(cacheKey)) {
      return this.cacheService.get<PubPackageDetails>(cacheKey);
    }

    try {
      const response: AxiosResponse<PubPackageDetails> = await axios.get(
        `${this.baseUrl}/packages/${packageName}`,
        { timeout: 10000 }
      );

      if (this.cacheService.isEnabled()) {
        this.cacheService.set(cacheKey, response.data, 3600); // 1 hour cache for package details
      }

      return response.data;
    } catch (error) {
      console.error(`Error getting package details for ${packageName}:`, error);
      return null;
    }
  }

  public async getLatestVersion(packageName: string): Promise<string | null> {
    const details = await this.getPackageDetails(packageName);
    return details?.latest?.version || null;
  }

  public async checkForUpdates(dependencies: Record<string, string>): Promise<Record<string, string>> {
    const updates: Record<string, string> = {};
    const promises = Object.keys(dependencies).map(async (packageName) => {
      const latestVersion = await this.getLatestVersion(packageName);
      if (latestVersion && this.isVersionOutdated(dependencies[packageName], latestVersion)) {
        updates[packageName] = latestVersion;
      }
    });

    await Promise.all(promises);
    return updates;
  }

  private async convertSearchResultsToPackages(searchResults: PubPackageSearchResult[]): Promise<PubPackage[]> {
    const packages: PubPackage[] = [];
    
    for (const result of searchResults) {
      const packageDetails = await this.getPackageDetails(result.package);
      
      if (packageDetails) {
        const pubPackage: PubPackage = {
          name: result.package,
          version: packageDetails.latest.version,
          description: result.description || packageDetails.latest.pubspec.description || '',
          homepage: packageDetails.latest.pubspec.homepage,
          repository: packageDetails.latest.pubspec.repository,
          popularity: Math.round((result.score?.popularityScore || 0) * 100),
          likes: result.score?.likeCount || 0,
          points: result.score?.grantedPoints || 0,
          tags: result.tags || [],
          isFlutterPackage: this.isFlutterPackage(result.tags, packageDetails),
          isDartPackage: this.isDartPackage(result.tags, packageDetails)
        };
        
        packages.push(pubPackage);
      }
    }

    return packages;
  }

  private isFlutterPackage(tags: string[] = [], details: PubPackageDetails): boolean {
    return tags.includes('flutter') || 
           tags.includes('flutter-package') ||
           Boolean(details.latest.pubspec.environment?.flutter);
  }

  private isDartPackage(tags: string[] = [], details: PubPackageDetails): boolean {
    return tags.includes('dart') || 
           tags.includes('dart-package') ||
           Boolean(details.latest.pubspec.environment?.sdk);
  }

  private isVersionOutdated(currentVersion: string, latestVersion: string): boolean {
    if (!currentVersion || !latestVersion) {
      return false;
    }
    
    // Simple version comparison - could be enhanced with semver library
    const cleanCurrent = currentVersion.replace(/[^0-9.]/g, '');
    const cleanLatest = latestVersion.replace(/[^0-9.]/g, '');
    
    if (!cleanCurrent || !cleanLatest) {
      return false;
    }
    
    const currentParts = cleanCurrent.split('.').map(Number);
    const latestParts = cleanLatest.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const current = currentParts[i] || 0;
      const latest = latestParts[i] || 0;
      
      if (latest > current) {
        return true;
      }
      if (current > latest) {
        return false;
      }
    }
    
    return false;
  }

  private getErrorMessage(error: any): string {
    if (error.response) {
      return `HTTP ${error.response.status}: ${error.response.statusText}`;
    }
    if (error.request) {
      return 'Network error - check your internet connection';
    }
    return error.message || 'Unknown error occurred';
  }
} 