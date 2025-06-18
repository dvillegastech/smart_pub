import * as vscode from 'vscode';
import { PubApiService } from '../services/pub-api-service';
import { WorkspaceService } from '../services/workspace-service';
import { PubPackage } from '../types/pub-types';

export class SearchPackagesCommand {
  constructor(
    private pubApiService: PubApiService,
    private workspaceService: WorkspaceService
  ) {}

  public async execute(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search Flutter packages',
      placeHolder: 'Enter package name or keywords...',
      validateInput: (value) => {
        if (!value || value.trim().length < 2) {
          return 'Please enter at least 2 characters';
        }
        return null;
      }
    });

    if (!query) {
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Searching packages...',
      cancellable: true
    }, async (progress, token) => {
      try {
        progress.report({ increment: 20, message: 'Fetching results from pub.dev' });
        
        const packages = await this.pubApiService.searchPackages(query.trim());
        
        if (token.isCancellationRequested) {
          return;
        }

        progress.report({ increment: 80, message: 'Processing results' });

        if (packages.length === 0) {
          vscode.window.showInformationMessage(`No packages found for "${query}"`);
          return;
        }

        await this.showPackageQuickPick(packages);
        
      } catch (error) {
        console.error('Error searching packages:', error);
        vscode.window.showErrorMessage(`Failed to search packages: ${error}`);
      }
    });
  }

  private async showPackageQuickPick(packages: PubPackage[]): Promise<void> {
    const items: PackageQuickPickItem[] = packages.map(pkg => ({
      label: `$(package) ${pkg.name}`,
      description: `v${pkg.version}`,
      detail: this.createPackageDetail(pkg),
      package: pkg
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a package to add to your project',
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: true
    });

    if (selected) {
      await this.handlePackageSelection(selected.package);
    }
  }

  private createPackageDetail(pkg: PubPackage): string {
    let detail = pkg.description || 'No description available';
    
    const badges: string[] = [];
    
    if (pkg.isFlutterPackage) {
      badges.push('Flutter');
    }
    if (pkg.isDartPackage) {
      badges.push('Dart');
    }
    
    if (pkg.popularity > 0) {
      badges.push(`${pkg.popularity}% popular`);
    }
    
    if (pkg.likes > 0) {
      badges.push(`${pkg.likes} likes`);
    }

    if (badges.length > 0) {
      detail += ` • ${badges.join(', ')}`;
    }

    return detail;
  }

  private async handlePackageSelection(pkg: PubPackage): Promise<void> {
    const projects = this.workspaceService.getProjects();
    
    if (projects.length === 0) {
      vscode.window.showErrorMessage('No Flutter projects found in workspace');
      return;
    }

    // If only one project, use it directly
    if (projects.length === 1) {
      await this.addPackageToProject(projects[0].path, pkg);
      return;
    }

    // Multiple projects - let user choose
    const projectItems = projects.map(project => ({
      label: `$(folder) ${project.name}`,
      description: project.path,
      project
    }));

    const selectedProject = await vscode.window.showQuickPick(projectItems, {
      placeHolder: 'Select project to add the package to',
      ignoreFocusOut: true
    });

    if (selectedProject) {
      await this.addPackageToProject(selectedProject.project.path, pkg);
    }
  }

  private async addPackageToProject(projectPath: string, pkg: PubPackage): Promise<void> {
    // Ask if it's a dev dependency
    const dependencyType = await vscode.window.showQuickPick([
      {
        label: '$(package) Regular Dependency',
        description: 'Add to dependencies section',
        isDev: false
      },
      {
        label: '$(tools) Dev Dependency',
        description: 'Add to dev_dependencies section',
        isDev: true
      }
    ], {
      placeHolder: 'Select dependency type',
      ignoreFocusOut: true
    });

    if (!dependencyType) {
      return;
    }

    // Ask for version constraint
    const versionOptions = [
      {
        label: `$(arrow-up) Latest (^${pkg.version})`,
        description: 'Compatible version updates allowed',
        version: `^${pkg.version}`
      },
      {
        label: `$(lock) Exact (${pkg.version})`,
        description: 'Exact version only',
        version: pkg.version
      },
      {
        label: '$(edit) Custom Version',
        description: 'Enter custom version constraint',
        version: 'custom'
      }
    ];

    const selectedVersion = await vscode.window.showQuickPick(versionOptions, {
      placeHolder: 'Select version constraint',
      ignoreFocusOut: true
    });

    if (!selectedVersion) {
      return;
    }

    let version = selectedVersion.version;
    
    if (version === 'custom') {
      const customVersion = await vscode.window.showInputBox({
        prompt: 'Enter version constraint',
        placeHolder: 'e.g., ^1.0.0, >=1.0.0 <2.0.0',
        value: `^${pkg.version}`,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Version constraint cannot be empty';
          }
          return null;
        }
      });

      if (!customVersion) {
        return;
      }

      version = customVersion.trim();
    }

    // Add the dependency
    const success = await this.workspaceService.addDependency(
      projectPath,
      pkg.name,
      version,
      dependencyType.isDev
    );

    if (success) {
      // Show package info with links
      const actions = ['View on pub.dev'];
      if (pkg.repository) {
        actions.push('View Repository');
      }
      if (pkg.homepage) {
        actions.push('View Homepage');
      }

      const action = await vscode.window.showInformationMessage(
        `Added ${pkg.name} to your project!`,
        ...actions
      );

      if (action === 'View on pub.dev') {
        vscode.env.openExternal(vscode.Uri.parse(`https://pub.dev/packages/${pkg.name}`));
      } else if (action === 'View Repository' && pkg.repository) {
        vscode.env.openExternal(vscode.Uri.parse(pkg.repository));
      } else if (action === 'View Homepage' && pkg.homepage) {
        vscode.env.openExternal(vscode.Uri.parse(pkg.homepage));
      }
    }
  }
}

interface PackageQuickPickItem extends vscode.QuickPickItem {
  package: PubPackage;
} 