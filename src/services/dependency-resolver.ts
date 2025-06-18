import * as vscode from 'vscode';
import { WorkspaceService } from './workspace-service';
import { PubApiService } from './pub-api-service';

export interface DependencyConflict {
  packageName: string;
  conflictingVersions: string[];
  suggestedResolution: string;
  reason: string;
}

export class DependencyResolver {
  constructor(
    private workspaceService: WorkspaceService,
    private pubApiService: PubApiService
  ) {}

  public async resolveDependencyConflicts(projectPath: string): Promise<void> {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Resolving dependency conflicts...',
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 20, message: 'Analyzing dependencies' });
        
        const conflicts = await this.detectConflicts(projectPath);
        
        if (conflicts.length === 0) {
          vscode.window.showInformationMessage('No dependency conflicts detected!');
          return;
        }

        progress.report({ increment: 40, message: 'Found conflicts, preparing solutions' });
        
        await this.showConflictResolutionOptions(projectPath, conflicts);
      });
    } catch (error) {
      console.error('Error resolving conflicts:', error);
      vscode.window.showErrorMessage(`Failed to resolve conflicts: ${error}`);
    }
  }

  private async detectConflicts(projectPath: string): Promise<DependencyConflict[]> {
    // Simulamos detección de conflictos común en Flutter
    const conflicts: DependencyConflict[] = [];
    
    // Aquí iríamos a buscar conflictos reales, por ahora detectamos patrones comunes
    const commonConflicts = [
      {
        packageName: 'flutter_lints',
        conflictingVersions: ['^6.0.0', '^5.0.0'],
        suggestedResolution: '^5.0.0',
        reason: 'Incompatible version ranges between direct and transitive dependencies'
      }
    ];

    return commonConflicts;
  }

  private async showConflictResolutionOptions(
    projectPath: string, 
    conflicts: DependencyConflict[]
  ): Promise<void> {
    const items = conflicts.map(conflict => ({
      label: `🔧 Fix ${conflict.packageName}`,
      description: `${conflict.conflictingVersions.join(' vs ')} → ${conflict.suggestedResolution}`,
      detail: conflict.reason,
      conflict
    }));

    // Agregar opción para resolver todos
    items.unshift({
      label: '🚀 Fix All Conflicts',
      description: `Resolve ${conflicts.length} dependency conflicts`,
      detail: 'Apply suggested resolutions for all conflicts',
      conflict: null as any
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select conflicts to resolve',
      ignoreFocusOut: true
    });

    if (!selected) {
      return;
    }

    if (selected.conflict === null) {
      // Resolver todos los conflictos
      for (const conflict of conflicts) {
        await this.applyResolution(projectPath, conflict);
      }
      vscode.window.showInformationMessage(`Resolved ${conflicts.length} dependency conflicts!`);
    } else {
      // Resolver conflicto específico
      await this.applyResolution(projectPath, selected.conflict);
      vscode.window.showInformationMessage(`Resolved conflict for ${selected.conflict.packageName}!`);
    }
  }

  private async applyResolution(projectPath: string, conflict: DependencyConflict): Promise<void> {
    try {
      // Determinar si es dev dependency
      const isDev = await this.isDevDependency(projectPath, conflict.packageName);
      
      // Aplicar la resolución sugerida
      await this.workspaceService.updateDependency(
        projectPath,
        conflict.packageName,
        conflict.suggestedResolution,
        isDev
      );

      console.log(`Applied resolution: ${conflict.packageName} → ${conflict.suggestedResolution}`);
    } catch (error) {
      console.error(`Failed to apply resolution for ${conflict.packageName}:`, error);
      vscode.window.showErrorMessage(`Failed to resolve ${conflict.packageName}: ${error}`);
    }
  }

  private async isDevDependency(projectPath: string, packageName: string): Promise<boolean> {
    const projects = this.workspaceService.getProjects();
    const project = projects.find(p => p.path === projectPath);
    
    if (!project) {
      return false;
    }

    const dependency = project.dependencies.find(d => d.name === packageName);
    return dependency?.isDev || false;
  }

  public async handlePubGetError(projectPath: string, errorOutput: string): Promise<void> {
    // Parsear errores comunes de pub get
    if (errorOutput.includes('version solving failed')) {
      await this.handleVersionSolvingError(projectPath, errorOutput);
    } else if (errorOutput.includes('sdk constraint')) {
      await this.handleSdkConstraintError(projectPath, errorOutput);
    } else {
      vscode.window.showErrorMessage(`Pub get failed: ${errorOutput}`);
    }
  }

  private async handleVersionSolvingError(projectPath: string, errorOutput: string): Promise<void> {
    const action = await vscode.window.showErrorMessage(
      'Dependency version conflict detected!',
      'Auto-Resolve',
      'Manual Fix',
      'View Details'
    );

    switch (action) {
      case 'Auto-Resolve':
        await this.resolveDependencyConflicts(projectPath);
        break;
      case 'Manual Fix':
        await this.showManualFixGuidance(errorOutput);
        break;
      case 'View Details':
        await this.showErrorDetails(errorOutput);
        break;
    }
  }

  private async handleSdkConstraintError(projectPath: string, errorOutput: string): Promise<void> {
    const action = await vscode.window.showErrorMessage(
      'SDK constraint error detected!',
      'Update SDK Constraints',
      'View Flutter Version',
      'Get Help'
    );

    switch (action) {
      case 'Update SDK Constraints':
        await this.updateSdkConstraints(projectPath);
        break;
      case 'View Flutter Version':
        vscode.commands.executeCommand('workbench.action.terminal.new');
        break;
      case 'Get Help':
        vscode.env.openExternal(vscode.Uri.parse('https://flutter.dev/docs/development/tools/sdk/releases'));
        break;
    }
  }

  private async showManualFixGuidance(errorOutput: string): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'dependencyConflictHelp',
      'Dependency Conflict Help',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    panel.webview.html = this.generateConflictHelpHtml(errorOutput);
  }

  private async showErrorDetails(errorOutput: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      content: errorOutput,
      language: 'text'
    });
    vscode.window.showTextDocument(document);
  }

  private async updateSdkConstraints(projectPath: string): Promise<void> {
    // Implementar lógica para actualizar constraints del SDK
    vscode.window.showInformationMessage('SDK constraint update not implemented yet');
  }

  private generateConflictHelpHtml(errorOutput: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dependency Conflict Help</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .error { background: #ffe6e6; border-left: 4px solid #ff4444; padding: 10px; margin: 10px 0; }
            .solution { background: #e6f7ff; border-left: 4px solid #1890ff; padding: 10px; margin: 10px 0; }
            .code { background: #f5f5f5; padding: 5px; font-family: monospace; }
        </style>
    </head>
    <body>
        <h1>🔧 Dependency Conflict Resolution Guide</h1>
        
        <div class="error">
            <h3>Error Details:</h3>
            <pre class="code">${errorOutput}</pre>
        </div>

        <div class="solution">
            <h3>💡 Manual Solutions:</h3>
            <ol>
                <li><strong>Check version constraints:</strong> Look for conflicting version ranges in pubspec.yaml</li>
                <li><strong>Use dependency_overrides:</strong> Add overrides section to force specific versions</li>
                <li><strong>Update packages:</strong> Run <code>flutter pub upgrade</code> to get compatible versions</li>
                <li><strong>Check transitive dependencies:</strong> Use <code>flutter pub deps</code> to see the dependency tree</li>
            </ol>
        </div>

        <h3>🛠️ Common Commands:</h3>
        <ul>
            <li><code class="code">flutter pub get</code> - Get dependencies</li>
            <li><code class="code">flutter pub upgrade</code> - Upgrade to latest compatible versions</li>
            <li><code class="code">flutter pub deps</code> - Show dependency tree</li>
            <li><code class="code">flutter pub downgrade</code> - Downgrade to lowest compatible versions</li>
        </ul>
    </body>
    </html>
    `;
  }
} 