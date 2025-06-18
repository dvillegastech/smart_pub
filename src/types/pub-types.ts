export interface PubPackage {
  name: string;
  version: string;
  description: string;
  homepage?: string;
  repository?: string;
  popularity: number;
  likes: number;
  points: number;
  tags: string[];
  isFlutterPackage: boolean;
  isDartPackage: boolean;
}

export interface PubSearchResponse {
  packages: PubPackageSearchResult[];
  next?: string;
}

export interface PubPackageSearchResult {
  package: string;
  description?: string;
  tags?: string[];
  version?: string;
  score?: {
    grantedPoints?: number;
    maxPoints?: number;
    likeCount?: number;
    popularityScore?: number;
  };
}

export interface PubPackageDetails {
  name: string;
  latest: {
    version: string;
    pubspec: {
      name: string;
      description?: string;
      homepage?: string;
      repository?: string;
      environment?: {
        sdk?: string;
        flutter?: string;
      };
      dependencies?: Record<string, string>;
      dev_dependencies?: Record<string, string>;
    };
  };
  metrics?: {
    score?: {
      grantedPoints?: number;
      maxPoints?: number;
      likeCount?: number;
      popularityScore?: number;
    };
  };
}

export interface DependencyInfo {
  name: string;
  version: string;
  isDev: boolean;
  isOutdated: boolean;
  latestVersion?: string;
  description?: string;
}

export interface WorkspaceProject {
  name: string;
  path: string;
  pubspecPath: string;
  dependencies: DependencyInfo[];
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
} 