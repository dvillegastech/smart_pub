import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { PubApiService } from '../services/pub-api-service';
import { WorkspaceService } from '../services/workspace-service';

export interface PackageAnalysis {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  isDev: boolean;
  range: vscode.Range;
  description?: string;
}

export class PubspecAnalyzer {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private analysisCache: Map<string, PackageAnalysis[]> = new Map();

  constructor(
    private pubApiService: PubApiService,
    private workspaceService: WorkspaceService
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('smartPub');
  }

  public async analyzePubspecFile(document: vscode.TextDocument): Promise<PackageAnalysis[]> {
    if (!this.isPubspecFile(document)) {
      return [];
    }

    const cacheKey = `${document.uri.fsPath}:${document.version}`;
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    try {
      const content = document.getText();
      const pubspec = yaml.parse(content);
      
      if (!pubspec) {
        return [];
      }

      const analyses: PackageAnalysis[] = [];
      
      // Analizar dependencies regulares
      if (pubspec.dependencies) {
        const depAnalyses = await this.analyzeDependencySection(
          document, 
          pubspec.dependencies, 
          'dependencies',
          false
        );
        analyses.push(...depAnalyses);
      }

      // Analizar dev_dependencies
      if (pubspec.dev_dependencies) {
        const devDepAnalyses = await this.analyzeDependencySection(
          document, 
          pubspec.dev_dependencies, 
          'dev_dependencies',
          true
        );
        analyses.push(...devDepAnalyses);
      }

      this.analysisCache.set(cacheKey, analyses);
      this.updateDiagnostics(document, analyses);
      
      return analyses;
    } catch (error) {
      console.error('Error analyzing pubspec:', error);
      return [];
    }
  }

  private async analyzeDependencySection(
    document: vscode.TextDocument,
    dependencies: any,
    sectionName: string,
    isDev: boolean
  ): Promise<PackageAnalysis[]> {
    const analyses: PackageAnalysis[] = [];
    
    for (const [packageName, versionConstraint] of Object.entries(dependencies)) {
      // Saltar dependencias del SDK
      if (packageName === 'flutter' || packageName === 'flutter_test') {
        continue;
      }

      // Saltar dependencias que no son strings (ej: path, git)
      if (typeof versionConstraint !== 'string') {
        continue;
      }

      try {
        const latestVersion = await this.pubApiService.getLatestVersion(packageName);
        if (!latestVersion) {
          continue;
        }

        const currentVersion = this.extractVersionFromConstraint(versionConstraint as string);
        const isOutdated = latestVersion ? this.isVersionOutdated(currentVersion, latestVersion) : false;
        
        const range = this.findPackageRange(document, packageName, sectionName);
        if (!range) {
          continue;
        }

        const packageDetails = await this.pubApiService.getPackageDetails(packageName);
        
        const analysis: PackageAnalysis = {
          name: packageName,
          currentVersion,
          latestVersion,
          isOutdated,
          isDev,
          range,
          description: packageDetails?.latest?.pubspec?.description
        };

        analyses.push(analysis);
      } catch (error) {
        console.error(`Error analyzing package ${packageName}:`, error);
      }
    }

    return analyses;
  }

  private findPackageRange(
    document: vscode.TextDocument,
    packageName: string,
    sectionName: string
  ): vscode.Range | null {
    const text = document.getText();
    const lines = text.split('\n');
    
    let inSection = false;
    let sectionIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const lineIndent = line.search(/\S/);

      // Buscar la sección
      if (trimmedLine === `${sectionName}:`) {
        inSection = true;
        sectionIndent = lineIndent;
        continue;
      }

      // Si estamos en la sección correcta
      if (inSection) {
        // Si encontramos otra sección del mismo nivel, salimos
        if (lineIndent <= sectionIndent && trimmedLine.endsWith(':')) {
          break;
        }

        // Buscar el package específico
        if (trimmedLine.startsWith(`${packageName}:`)) {
          const startPos = new vscode.Position(i, lineIndent);
          const endPos = new vscode.Position(i, line.length);
          return new vscode.Range(startPos, endPos);
        }
      }
    }

    return null;
  }

  private extractVersionFromConstraint(constraint: string): string {
    if (!constraint || typeof constraint !== 'string') {
      return '1.0.0'; // fallback version
    }
    
    // Extraer la versión de constraints como "^1.2.3", ">=1.0.0 <2.0.0", etc.
    const match = constraint.match(/[\d]+\.[\d]+\.[\d]+/);
    return match ? match[0] : (constraint.trim() || '1.0.0');
  }

  private isVersionOutdated(currentVersion: string, latestVersion: string): boolean {
    if (!currentVersion || !latestVersion) {
      return false;
    }
    
    // Comparación simple de versiones
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

  private updateDiagnostics(document: vscode.TextDocument, analyses: PackageAnalysis[]): void {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const analysis of analyses) {
      if (analysis.isOutdated) {
        const diagnostic = new vscode.Diagnostic(
          analysis.range,
          `Package '${analysis.name}' has an update available: ${analysis.currentVersion} → ${analysis.latestVersion}`,
          vscode.DiagnosticSeverity.Information
        );
        
        diagnostic.code = 'package-update-available';
        diagnostic.source = 'Smart Pub Manager';
        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
        
        diagnostics.push(diagnostic);
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private isPubspecFile(document: vscode.TextDocument): boolean {
    return document.fileName.endsWith('pubspec.yaml');
  }

  public getAnalysisForPosition(document: vscode.TextDocument, position: vscode.Position): PackageAnalysis | undefined {
    const cacheKey = `${document.uri.fsPath}:${document.version}`;
    const analyses = this.analysisCache.get(cacheKey);
    
    if (!analyses) {
      return undefined;
    }

    return analyses.find(analysis => analysis.range.contains(position));
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
    this.analysisCache.clear();
  }
} 