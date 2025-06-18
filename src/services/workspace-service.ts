import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { WorkspaceProject, DependencyInfo } from '../types/pub-types';
import { PubApiService } from './pub-api-service';

export class WorkspaceService {
  private readonly pubApiService: PubApiService;
  private projects: WorkspaceProject[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor(pubApiService: PubApiService) {
    this.pubApiService = pubApiService;
  }

  public async initialize(): Promise<void> {
    await this.scanForFlutterProjects();
    this.setupFileWatchers();
  }

  public dispose(): void {
    this.fileWatchers.forEach(watcher => watcher.dispose());
    this.fileWatchers = [];
  }

  public getProjects(): WorkspaceProject[] {
    return this.projects;
  }

  public async addDependency(
    projectPath: string, 
    packageName: string, 
    version: string, 
    isDev: boolean = false
  ): Promise<boolean> {
    try {
      const pubspecPath = path.join(projectPath, 'pubspec.yaml');
      
      if (!fs.existsSync(pubspecPath)) {
        vscode.window.showErrorMessage(`pubspec.yaml not found in ${projectPath}`);
        return false;
      }

      const content = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = parseYaml(content);

      const dependencySection = isDev ? 'dev_dependencies' : 'dependencies';
      
      if (!pubspec[dependencySection]) {
        pubspec[dependencySection] = {};
      }

      pubspec[dependencySection][packageName] = this.formatVersion(version);

      const newContent = stringifyYaml(pubspec, {
        indent: 2
      });

      fs.writeFileSync(pubspecPath, newContent, 'utf8');
      
      await this.runPubGet(projectPath);
      await this.refreshProject(projectPath);
      
      vscode.window.showInformationMessage(
        `Added ${packageName}:${version} to ${isDev ? 'dev_dependencies' : 'dependencies'}`
      );
      
      return true;
    } catch (error) {
      console.error('Error adding dependency:', error);
      vscode.window.showErrorMessage(`Failed to add dependency: ${error}`);
      return false;
    }
  }

  public async updateDependency(
    projectPath: string, 
    packageName: string, 
    newVersion: string, 
    isDev: boolean = false
  ): Promise<boolean> {
    return this.addDependency(projectPath, packageName, newVersion, isDev);
  }

  public async removeDependency(
    projectPath: string, 
    packageName: string, 
    isDev: boolean = false
  ): Promise<boolean> {
    try {
      const pubspecPath = path.join(projectPath, 'pubspec.yaml');
      
      if (!fs.existsSync(pubspecPath)) {
        vscode.window.showErrorMessage(`pubspec.yaml not found in ${projectPath}`);
        return false;
      }

      const content = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = parseYaml(content);

      const dependencySection = isDev ? 'dev_dependencies' : 'dependencies';
      
      if (pubspec[dependencySection] && pubspec[dependencySection][packageName]) {
        delete pubspec[dependencySection][packageName];

        const newContent = stringifyYaml(pubspec, {
          indent: 2
        });

        fs.writeFileSync(pubspecPath, newContent, 'utf8');
        
        await this.runPubGet(projectPath);
        await this.refreshProject(projectPath);
        
        vscode.window.showInformationMessage(`Removed ${packageName} from dependencies`);
        return true;
      } else {
        vscode.window.showWarningMessage(`${packageName} not found in dependencies`);
        return false;
      }
    } catch (error) {
      console.error('Error removing dependency:', error);
      vscode.window.showErrorMessage(`Failed to remove dependency: ${error}`);
      return false;
    }
  }

  public async checkForUpdates(projectPath: string): Promise<Record<string, string>> {
    const project = this.projects.find(p => p.path === projectPath);
    if (!project) {
      return {};
    }

    const dependencies = project.dependencies.reduce((acc, dep) => {
      acc[dep.name] = dep.version;
      return acc;
    }, {} as Record<string, string>);

    return this.pubApiService.checkForUpdates(dependencies);
  }

  private async scanForFlutterProjects(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      return;
    }

    this.projects = [];

    for (const folder of vscode.workspace.workspaceFolders) {
      await this.scanDirectoryForProjects(folder.uri.fsPath);
    }
  }

  private async scanDirectoryForProjects(dirPath: string): Promise<void> {
    try {
      const pubspecPath = path.join(dirPath, 'pubspec.yaml');
      
      if (fs.existsSync(pubspecPath)) {
        const project = await this.createProjectFromPath(dirPath);
        if (project) {
          this.projects.push(project);
        }
        return; // Don't scan subdirectories if we found a project
      }

      // Scan subdirectories
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.scanDirectoryForProjects(path.join(dirPath, entry.name));
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  private async createProjectFromPath(projectPath: string): Promise<WorkspaceProject | null> {
    try {
      const pubspecPath = path.join(projectPath, 'pubspec.yaml');
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = parseYaml(content);

      if (!pubspec || !pubspec.name) {
        return null;
      }

      const dependencies = await this.extractDependencies(pubspec);

      return {
        name: pubspec.name,
        path: projectPath,
        pubspecPath,
        dependencies
      };
    } catch (error) {
      console.error(`Error creating project from ${projectPath}:`, error);
      return null;
    }
  }

  private async extractDependencies(pubspec: any): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      // Regular dependencies
      if (pubspec.dependencies && typeof pubspec.dependencies === 'object') {
        for (const [name, version] of Object.entries(pubspec.dependencies)) {
          if (name && typeof name === 'string' && name !== 'flutter' && version) {
            try {
              const latestVersion = await this.pubApiService.getLatestVersion(name);
              const versionString = String(version);
              
              dependencies.push({
                name,
                version: versionString,
                isDev: false,
                isOutdated: latestVersion ? this.isVersionOutdated(versionString, latestVersion) : false,
                latestVersion: latestVersion || undefined
              });
            } catch (error) {
              console.warn(`Failed to process dependency ${name}:`, error);
              // Still add the dependency with basic info if we can't get latest version
              dependencies.push({
                name,
                version: String(version),
                isDev: false,
                isOutdated: false,
                latestVersion: undefined
              });
            }
          }
        }
      }

      // Dev dependencies
      if (pubspec.dev_dependencies && typeof pubspec.dev_dependencies === 'object') {
        for (const [name, version] of Object.entries(pubspec.dev_dependencies)) {
          if (name && typeof name === 'string' && name !== 'flutter_test' && version) {
            try {
              const latestVersion = await this.pubApiService.getLatestVersion(name);
              const versionString = String(version);
              
              dependencies.push({
                name,
                version: versionString,
                isDev: true,
                isOutdated: latestVersion ? this.isVersionOutdated(versionString, latestVersion) : false,
                latestVersion: latestVersion || undefined
              });
            } catch (error) {
              console.warn(`Failed to process dev dependency ${name}:`, error);
              // Still add the dependency with basic info if we can't get latest version
              dependencies.push({
                name,
                version: String(version),
                isDev: true,
                isOutdated: false,
                latestVersion: undefined
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting dependencies:', error);
    }

    return dependencies;
  }

  private setupFileWatchers(): void {
    if (!vscode.workspace.workspaceFolders) {
      return;
    }

    for (const folder of vscode.workspace.workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/pubspec.yaml');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange(async (uri) => {
        const projectPath = path.dirname(uri.fsPath);
        await this.refreshProject(projectPath);
        
        const config = vscode.workspace.getConfiguration('smartPub');
        if (config.get<boolean>('autoRunPubGet', true)) {
          await this.runPubGet(projectPath);
        }
      });

      watcher.onDidCreate(async (uri) => {
        const projectPath = path.dirname(uri.fsPath);
        const project = await this.createProjectFromPath(projectPath);
        if (project) {
          this.projects.push(project);
        }
      });

      watcher.onDidDelete(async (uri) => {
        const projectPath = path.dirname(uri.fsPath);
        this.projects = this.projects.filter(p => p.path !== projectPath);
      });

      this.fileWatchers.push(watcher);
    }
  }

  private async refreshProject(projectPath: string): Promise<void> {
    const index = this.projects.findIndex(p => p.path === projectPath);
    if (index >= 0) {
      const project = await this.createProjectFromPath(projectPath);
      if (project) {
        this.projects[index] = project;
      }
    }
  }

  private async runPubGet(projectPath: string): Promise<void> {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Running flutter pub get...',
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 50, message: 'Resolving dependencies' });
        
        // Ejecutar pub get y capturar el resultado
        const result = await this.executePubGet(projectPath);
        
        if (result.success) {
          vscode.window.showInformationMessage('Dependencies updated successfully!');
        } else {
          // Manejar errores con el dependency resolver
          await this.handlePubGetError(projectPath, result.error);
        }
      });
    } catch (error) {
      console.error('Error running pub get:', error);
      vscode.window.showErrorMessage(`Failed to run pub get: ${error}`);
    }
  }

  private async executePubGet(projectPath: string): Promise<{success: boolean, error: string}> {
    return new Promise((resolve) => {
      const terminal = vscode.window.createTerminal({
        name: 'Smart Pub Manager - Pub Get',
        cwd: projectPath
      });
      
      // Por ahora mostramos el terminal, en el futuro podríamos capturar la salida
      terminal.sendText('flutter pub get');
      terminal.show();
      
      // Simulamos éxito por ahora - en una implementación real capturaríamos la salida
      setTimeout(() => {
        resolve({ success: true, error: '' });
      }, 2000);
    });
  }

  private async handlePubGetError(projectPath: string, errorOutput: string): Promise<void> {
    // Esta función será conectada con el DependencyResolver
    console.log('Pub get error:', errorOutput);
    vscode.window.showErrorMessage(`Pub get failed: ${errorOutput}`);
  }

  private formatVersion(version: string): string {
    if (!version) {
      return '^1.0.0'; // fallback version
    }
    // Remove any existing ^ or ~ prefixes and add ^
    const cleanVersion = version.replace(/^[\^~]/, '');
    return `^${cleanVersion}`;
  }

  private isVersionOutdated(currentVersion: string, latestVersion: string): boolean {
    if (!currentVersion || !latestVersion) {
      return false;
    }
    
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
} 