import * as vscode from 'vscode';
import * as path from 'path';
import { CacheService } from './services/cache-service';
import { PubApiService } from './services/pub-api-service';
import { WorkspaceService } from './services/workspace-service';
import { DependencyResolver } from './services/dependency-resolver';
import { VisualSearchService } from './services/visual-search-service';
import { DependencyTreeProvider } from './providers/dependency-tree-provider';
import { PubspecAnalyzer } from './providers/pubspec-analyzer';
import { PubspecHoverProvider } from './providers/pubspec-hover-provider';
import { PubspecCodeActionProvider } from './providers/pubspec-code-action-provider';
import { SearchPackagesCommand } from './commands/search-packages-command';

// Global services
let cacheService: CacheService;
let pubApiService: PubApiService;
let workspaceService: WorkspaceService;
let dependencyResolver: DependencyResolver;
let visualSearchService: VisualSearchService;
let dependencyTreeProvider: DependencyTreeProvider;
let pubspecAnalyzer: PubspecAnalyzer;
let pubspecHoverProvider: PubspecHoverProvider;
let pubspecCodeActionProvider: PubspecCodeActionProvider;
let searchPackagesCommand: SearchPackagesCommand;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Smart Pub Manager extension is now active!');

  // Initialize services
  await initializeServices(context);

  // Register commands
  registerCommands(context);

  // Register providers
  registerProviders(context);

  // Register completion providers for pubspec.yaml
  registerCompletionProviders(context);

  // Show welcome message
  showWelcomeMessage(context);
}

export function deactivate(): void {
  if (workspaceService) {
    workspaceService.dispose();
  }
  if (pubspecAnalyzer) {
    pubspecAnalyzer.dispose();
  }
  console.log('Smart Pub Manager extension has been deactivated');
}

async function initializeServices(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Initialize cache service
    cacheService = new CacheService(context);
    
    // Initialize pub.dev API service
    pubApiService = new PubApiService(cacheService);
    
    // Initialize workspace service
    workspaceService = new WorkspaceService(pubApiService);
    await workspaceService.initialize();
    
    // Initialize dependency resolver
    dependencyResolver = new DependencyResolver(workspaceService, pubApiService);
    
    // Initialize tree provider
    dependencyTreeProvider = new DependencyTreeProvider(workspaceService);
    
    // Initialize visual search service
    visualSearchService = new VisualSearchService(context, pubApiService, workspaceService);
    
    // Initialize pubspec analyzer and providers
    pubspecAnalyzer = new PubspecAnalyzer(pubApiService, workspaceService);
    pubspecHoverProvider = new PubspecHoverProvider(pubspecAnalyzer);
    pubspecCodeActionProvider = new PubspecCodeActionProvider(pubspecAnalyzer, workspaceService);
    
    // Initialize commands
    searchPackagesCommand = new SearchPackagesCommand(pubApiService, workspaceService);
    
    console.log('Smart Pub Manager services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Smart Pub Manager services:', error);
    vscode.window.showErrorMessage('Failed to initialize Smart Pub Manager');
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Original search packages command (text-based)
  const searchPackagesCmd = vscode.commands.registerCommand(
    'smartPub.searchPackages',
    () => searchPackagesCommand.execute()
  );

  // New visual search command
  const visualSearchCmd = vscode.commands.registerCommand(
    'smartPub.visualSearch',
    () => visualSearchService.showSearchInterface()
  );

  // Panel filter commands
  const searchDependenciesCmd = vscode.commands.registerCommand(
    'smartPub.searchDependencies',
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search dependencies',
        placeHolder: 'Enter package name or keywords...',
        value: dependencyTreeProvider.getActiveFilters().includes('all') ? '' : undefined
      });

      if (query !== undefined) {
        dependencyTreeProvider.setSearchQuery(query);
      }
    }
  );

  const toggleFilterCmd = vscode.commands.registerCommand(
    'smartPub.toggleFilter',
    (filterId: string) => {
      dependencyTreeProvider.toggleFilter(filterId);
    }
  );

  const changeSortingCmd = vscode.commands.registerCommand(
    'smartPub.changeSorting',
    async () => {
      const options = [
        { label: '📝 Name (A-Z)', value: 'name' },
        { label: '⚠️ Status (Outdated first)', value: 'status' },
        { label: '🏷️ Category', value: 'category' }
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select sorting method'
      });

      if (selected) {
        dependencyTreeProvider.setSortBy(selected.value as any);
      }
    }
  );

  const clearFiltersCmd = vscode.commands.registerCommand(
    'smartPub.clearFilters',
    () => {
      dependencyTreeProvider.setSearchQuery('');
      dependencyTreeProvider.toggleFilter('all');
    }
  );

  // Add dependency command
  const addDependencyCmd = vscode.commands.registerCommand(
    'smartPub.addDependency',
    async (packageName?: string, version?: string, isDev?: boolean) => {
      if (packageName && version) {
        const projects = workspaceService.getProjects();
        if (projects.length === 1) {
          await workspaceService.addDependency(projects[0].path, packageName, version, isDev || false);
        } else {
          // Show project selection if multiple projects
          const projectItems = projects.map(project => ({
            label: project.name,
            description: project.path,
            project
          }));

          const selectedProject = await vscode.window.showQuickPick(projectItems, {
            placeHolder: 'Select project to add the package to'
          });

          if (selectedProject) {
            await workspaceService.addDependency(selectedProject.project.path, packageName, version, isDev || false);
          }
        }
      } else {
        // Show visual search interface
        await visualSearchService.showSearchInterface();
      }
    }
  );

  // Update dependencies command
  const updateDependenciesCmd = vscode.commands.registerCommand(
    'smartPub.updateDependencies',
    async (projectPath?: string) => {
      if (!projectPath) {
        const projects = workspaceService.getProjects();
        if (projects.length === 1) {
          projectPath = projects[0].path;
        } else {
          const projectItems = projects.map(project => ({
            label: project.name,
            description: project.path,
            project
          }));

          const selectedProject = await vscode.window.showQuickPick(projectItems, {
            placeHolder: 'Select project to update dependencies'
          });

          if (selectedProject) {
            projectPath = selectedProject.project.path;
          }
        }
      }

      if (projectPath) {
        await updateProjectDependencies(projectPath);
      }
    }
  );

  // Update all dependencies command
  const updateAllDependenciesCmd = vscode.commands.registerCommand(
    'smartPub.updateAllDependencies',
    async (projectPath?: string) => {
      if (projectPath) {
        await updateProjectDependencies(projectPath);
      }
    }
  );

  // Show dependency actions command
  const showDependencyActionsCmd = vscode.commands.registerCommand(
    'smartPub.showDependencyActions',
    async (projectPath: string, dependency: any) => {
      // Validate parameters
      if (!projectPath || !dependency || !dependency.name) {
        vscode.window.showErrorMessage('Invalid dependency information');
        return;
      }

      const actions = [
        {
          label: '$(arrow-up) Update to Latest',
          action: 'update'
        },
        {
          label: '$(trash) Remove Dependency',
          action: 'remove'
        },
        {
          label: '$(link-external) View on pub.dev',
          action: 'view'
        }
      ];

      const selected = await vscode.window.showQuickPick(actions, {
        placeHolder: `Actions for ${dependency.name}`
      });

      if (selected) {
        switch (selected.action) {
          case 'update':
            if (dependency.latestVersion) {
              await workspaceService.updateDependency(
                projectPath,
                dependency.name,
                dependency.latestVersion,
                dependency.isDev || false
              );
              dependencyTreeProvider.refresh();
            } else {
              vscode.window.showWarningMessage(`No latest version available for ${dependency.name}`);
            }
            break;
          case 'remove':
            const confirmRemove = await vscode.window.showWarningMessage(
              `Remove ${dependency.name} from dependencies?`,
              'Yes', 'No'
            );
            if (confirmRemove === 'Yes') {
              await workspaceService.removeDependency(projectPath, dependency.name, dependency.isDev || false);
              dependencyTreeProvider.refresh();
            }
            break;
          case 'view':
            vscode.env.openExternal(vscode.Uri.parse(`https://pub.dev/packages/${dependency.name}`));
            break;
        }
      }
    }
  );

  // Refresh dependencies command
  const refreshDependenciesCmd = vscode.commands.registerCommand(
    'smartPub.refreshDependencies',
    () => {
      dependencyTreeProvider.refresh();
      vscode.window.showInformationMessage('Dependencies refreshed');
    }
  );

  // Clear cache command
  const clearCacheCmd = vscode.commands.registerCommand(
    'smartPub.clearCache',
    () => {
      cacheService.clear();
      vscode.window.showInformationMessage('Cache cleared');
    }
  );

  // Resolve dependency conflicts command
  const resolveDependencyConflictsCmd = vscode.commands.registerCommand(
    'smartPub.resolveDependencyConflicts',
    async (projectPath?: string) => {
      if (!projectPath) {
        const projects = workspaceService.getProjects();
        if (projects.length === 1) {
          projectPath = projects[0].path;
        } else {
          const projectItems = projects.map(project => ({
            label: project.name,
            description: project.path,
            project
          }));

          const selectedProject = await vscode.window.showQuickPick(projectItems, {
            placeHolder: 'Select project to resolve conflicts'
          });

          if (selectedProject) {
            projectPath = selectedProject.project.path;
          }
        }
      }

      if (projectPath) {
        await dependencyResolver.resolveDependencyConflicts(projectPath);
      }
    }
  );

  // Update package command
  const updatePackageCmd = vscode.commands.registerCommand(
    'smartPub.updatePackage',
    async (...args: any[]) => {
      try {
        let packageName: string;
        let newVersion: string;
        let isDev: boolean;
        let documentUri: string | undefined;

        // Handle different call patterns
        if (args.length === 1 && typeof args[0] === 'object') {
          // Called from URI command with JSON object
          const params = args[0];
          packageName = params.packageName;
          newVersion = params.newVersion;
          isDev = params.isDev;
          documentUri = params.documentUri;
        } else {
          // Called with separate parameters
          [packageName, newVersion, isDev, documentUri] = args;
        }

        // Validate required parameters
        if (!packageName || !newVersion) {
          vscode.window.showErrorMessage('Package name and version are required');
          return;
        }

        const uri = documentUri ? vscode.Uri.parse(documentUri) : vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage('No active document found');
          return;
        }

        const projectPath = path.dirname(uri.fsPath);
        const success = await workspaceService.updateDependency(
          projectPath, 
          packageName, 
          newVersion, 
          isDev || false
        );
        
        if (success) {
          // Refresh analysis
          const document = await vscode.workspace.openTextDocument(uri);
          await pubspecAnalyzer.analyzePubspecFile(document);
          dependencyTreeProvider.refresh();
          vscode.window.showInformationMessage(`✅ Updated ${packageName} to ${newVersion}`);
        }
      } catch (error) {
        console.error('Error updating package:', error);
        vscode.window.showErrorMessage(`Failed to update package: ${error}`);
      }
    }
  );

  // Analyze current file command
  const analyzeCurrentFileCmd = vscode.commands.registerCommand(
    'smartPub.analyzeCurrentFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.fileName.endsWith('pubspec.yaml')) {
        vscode.window.showWarningMessage('Please open a pubspec.yaml file to analyze');
        return;
      }

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Analyzing pubspec.yaml...',
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 50, message: 'Checking for outdated packages' });
          
          const analyses = await pubspecAnalyzer.analyzePubspecFile(editor.document);
          const outdated = analyses.filter(a => a.isOutdated);
          
          if (outdated.length === 0) {
            vscode.window.showInformationMessage('✅ All packages are up to date!');
          } else {
            vscode.window.showInformationMessage(
              `Found ${outdated.length} outdated package${outdated.length > 1 ? 's' : ''}. Check the Problems panel for details.`
            );
          }
        });
      } catch (error) {
        console.error('Error analyzing file:', error);
        vscode.window.showErrorMessage(`Failed to analyze file: ${error}`);
      }
    }
  );

  // Register all commands
  context.subscriptions.push(
    searchPackagesCmd,
    visualSearchCmd,
    searchDependenciesCmd,
    toggleFilterCmd,
    changeSortingCmd,
    clearFiltersCmd,
    addDependencyCmd,
    updateDependenciesCmd,
    updateAllDependenciesCmd,
    showDependencyActionsCmd,
    refreshDependenciesCmd,
    clearCacheCmd,
    resolveDependencyConflictsCmd,
    updatePackageCmd,
    analyzeCurrentFileCmd
  );
}

function registerProviders(context: vscode.ExtensionContext): void {
  // Register tree data provider
  const treeView = vscode.window.createTreeView('smartPubDependencies', {
    treeDataProvider: dependencyTreeProvider,
    showCollapseAll: true
  });

  // Register pubspec.yaml providers
  const pubspecSelector = { scheme: 'file', language: 'yaml', pattern: '**/pubspec.yaml' };
  
  const hoverProvider = vscode.languages.registerHoverProvider(
    pubspecSelector,
    pubspecHoverProvider
  );
  
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    pubspecSelector,
    pubspecCodeActionProvider,
    {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Source
      ]
    }
  );

  // Auto-analyze pubspec.yaml files when opened or changed
  const documentWatcher = vscode.workspace.onDidOpenTextDocument(async (document) => {
    if (document.fileName.endsWith('pubspec.yaml')) {
      await pubspecAnalyzer.analyzePubspecFile(document);
    }
  });

  const documentChangeWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (document.fileName.endsWith('pubspec.yaml')) {
      await pubspecAnalyzer.analyzePubspecFile(document);
      dependencyTreeProvider.refresh();
    }
  });

  // Refresh tree when workspace changes
  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    workspaceService.initialize().then(() => {
      dependencyTreeProvider.refresh();
    });
  });

  // Analyze all currently open pubspec.yaml files
  vscode.workspace.textDocuments.forEach(async (document) => {
    if (document.fileName.endsWith('pubspec.yaml')) {
      await pubspecAnalyzer.analyzePubspecFile(document);
    }
  });

  context.subscriptions.push(
    treeView, 
    workspaceWatcher,
    hoverProvider,
    codeActionProvider,
    documentWatcher,
    documentChangeWatcher
  );
}

function registerCompletionProviders(context: vscode.ExtensionContext): void {
  const pubspecSelector = { scheme: 'file', language: 'yaml', pattern: '**/pubspec.yaml' };
  
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    pubspecSelector,
    {
      async provideCompletionItems(document, position, token, context) {
        if (!isInDependenciesSection(document, position)) {
          return undefined;
        }

        const lineText = document.lineAt(position.line).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // Check if we're typing a package name (not a version)
        if (beforeCursor.includes(':')) {
          return undefined;
        }

        // Get the word being typed
        const wordRange = document.getWordRangeAtPosition(position);
        const word = wordRange ? document.getText(wordRange) : '';
        
        if (word.length < 2) {
          return undefined;
        }

        try {
          const packages = await pubApiService.searchPackages(word);
          
          return packages.slice(0, 10).map(pkg => {
            const item = new vscode.CompletionItem(pkg.name, vscode.CompletionItemKind.Module);
            item.detail = `v${pkg.version}`;
            item.documentation = new vscode.MarkdownString(
              `${pkg.description}\n\n` +
              `**Latest Version:** ${pkg.version}\n` +
              `**Popularity:** ${pkg.popularity}%\n` +
              `**Likes:** ${pkg.likes}\n` +
              `**Pub Points:** ${pkg.points}\n\n` +
              `[View on pub.dev](https://pub.dev/packages/${pkg.name})`
            );
            item.insertText = `${pkg.name}: ^${pkg.version}`;
            item.sortText = `${100 - pkg.popularity}${pkg.name}`;
            
            return item;
          });
        } catch (error) {
          console.error('Error providing completions:', error);
          return undefined;
        }
      }
    },
    ' ', // Trigger on space
    '\n' // Trigger on new line
  );

  context.subscriptions.push(completionProvider);
}

function isInDependenciesSection(document: vscode.TextDocument, position: vscode.Position): boolean {
  let currentLine = position.line;
  let inDependencies = false;

  // Search backwards to find if we're in a dependencies section
  while (currentLine >= 0) {
    const lineText = document.lineAt(currentLine).text.trim();
    
    if (lineText === 'dependencies:' || lineText === 'dev_dependencies:') {
      inDependencies = true;
      break;
    }
    
    // If we hit another top-level section, we're not in dependencies
    if (lineText.endsWith(':') && !lineText.startsWith(' ') && !lineText.startsWith('\t')) {
      break;
    }

    currentLine--;
  }

  return inDependencies;
}

async function updateProjectDependencies(projectPath: string): Promise<void> {
  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Checking for dependency updates...',
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 20, message: 'Analyzing dependencies' });
      
      const updates = await workspaceService.checkForUpdates(projectPath);
      const updateCount = Object.keys(updates).length;

      if (updateCount === 0) {
        vscode.window.showInformationMessage('All dependencies are up to date!');
        return;
      }

      progress.report({ increment: 60, message: `Found ${updateCount} updates` });

      const updateList = Object.entries(updates)
        .map(([name, version]) => `• ${name}: ${version}`)
        .join('\n');

      const choice = await vscode.window.showInformationMessage(
        `Found ${updateCount} dependency update${updateCount > 1 ? 's' : ''}:\n\n${updateList}`,
        'Update All',
        'Update Individually',
        'Cancel'
      );

      if (choice === 'Update All') {
        progress.report({ increment: 20, message: 'Updating dependencies' });
        
        for (const [name, version] of Object.entries(updates)) {
          await workspaceService.updateDependency(projectPath, name, version);
        }
        
        dependencyTreeProvider.refresh();
        vscode.window.showInformationMessage(`Updated ${updateCount} dependencies!`);
      } else if (choice === 'Update Individually') {
        await showIndividualUpdatePicker(projectPath, updates);
      }
    });
  } catch (error) {
    console.error('Error updating dependencies:', error);
    vscode.window.showErrorMessage(`Failed to update dependencies: ${error}`);
  }
}

async function showIndividualUpdatePicker(projectPath: string, updates: Record<string, string>): Promise<void> {
  const items = Object.entries(updates).map(([name, version]) => ({
    label: `$(package) ${name}`,
    description: `Update to ${version}`,
    picked: true,
    name,
    version
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select dependencies to update',
    canPickMany: true,
    ignoreFocusOut: true
  });

  if (selected && selected.length > 0) {
    for (const item of selected) {
      await workspaceService.updateDependency(projectPath, item.name, item.version);
    }
    
    dependencyTreeProvider.refresh();
    vscode.window.showInformationMessage(`Updated ${selected.length} dependencies!`);
  }
}

function showWelcomeMessage(context: vscode.ExtensionContext): void {
  const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
  
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'Welcome to Smart Pub Manager! 🚀 Manage your Flutter dependencies with ease.',
      'Open Visual Search',
      'View Dependencies'
    ).then(selection => {
      if (selection === 'Open Visual Search') {
        vscode.commands.executeCommand('smartPub.visualSearch');
      } else if (selection === 'View Dependencies') {
        vscode.commands.executeCommand('workbench.view.extension.smartPubManager');
      }
    });
    
    context.globalState.update('hasShownWelcome', true);
  }
} 