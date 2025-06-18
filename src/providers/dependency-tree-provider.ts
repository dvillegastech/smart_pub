import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceProject, DependencyInfo } from '../types/pub-types';
import { WorkspaceService } from '../services/workspace-service';

export class DependencyTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Package categories for better visual organization
  private readonly packageCategories = {
    ui: ['flutter', 'material', 'cupertino', 'flutter_staggered_grid_view', 'card_swiper', 'carousel_slider'],
    state: ['provider', 'bloc', 'riverpod', 'get', 'mobx', 'redux'],
    network: ['http', 'dio', 'chopper', 'retrofit', 'graphql'],
    storage: ['shared_preferences', 'sqflite', 'hive', 'isar', 'drift'],
    navigation: ['go_router', 'auto_route', 'fluro', 'page_transition'],
    firebase: ['firebase_core', 'firebase_auth', 'cloud_firestore', 'firebase_storage'],
    media: ['image_picker', 'video_player', 'camera', 'permission_handler'],
    utils: ['intl', 'uuid', 'crypto', 'path', 'collection', 'meta'],
    testing: ['test', 'flutter_test', 'mockito', 'integration_test']
  };

  // Filters and search state
  private searchQuery: string = '';
  private activeFilters: Set<string> = new Set(['all']);
  private sortBy: 'name' | 'status' | 'category' = 'name';

  constructor(private workspaceService: WorkspaceService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // Public methods for filtering and searching
  public setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.refresh();
  }

  public toggleFilter(filter: string): void {
    if (filter === 'all') {
      this.activeFilters.clear();
      this.activeFilters.add('all');
    } else {
      this.activeFilters.delete('all');
      if (this.activeFilters.has(filter)) {
        this.activeFilters.delete(filter);
      } else {
        this.activeFilters.add(filter);
      }
      if (this.activeFilters.size === 0) {
        this.activeFilters.add('all');
      }
    }
    this.refresh();
  }

  public setSortBy(sortBy: 'name' | 'status' | 'category'): void {
    this.sortBy = sortBy;
    this.refresh();
  }

  public getActiveFilters(): string[] {
    return Array.from(this.activeFilters);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (!element) {
      // Root level - show projects and filter controls
      return this.getProjectItems();
    }

    if (element.type === 'project') {
      // Project level - show dependency categories and stats
      return this.getDependencyCategoryItems(element.projectPath!);
    }

    if (element.type === 'category') {
      // Category level - show dependencies
      return this.getDependencyItems(element.projectPath!, element.isDev!);
    }

    if (element.type === 'filters') {
      // Show filter options
      return this.getFilterItems();
    }

    return Promise.resolve([]);
  }

  private async getProjectItems(): Promise<TreeItem[]> {
    const projects = this.workspaceService.getProjects();
    const items: TreeItem[] = [];

    // Add search and filter controls at the top
    if (projects.length > 0) {
      const filtersItem = new TreeItem(
        '🔍 Search & Filters',
        vscode.TreeItemCollapsibleState.Expanded,
        'filters'
      );
      filtersItem.iconPath = new vscode.ThemeIcon('filter', new vscode.ThemeColor('charts.blue'));
      filtersItem.tooltip = 'Search and filter dependencies';
      items.push(filtersItem);
    }
    
    if (projects.length === 0) {
      const noProjectsItem = new TreeItem(
        '📱 No Flutter projects found',
        vscode.TreeItemCollapsibleState.None,
        'info'
      );
      noProjectsItem.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
      noProjectsItem.tooltip = 'Open a Flutter project to manage dependencies';
      return [noProjectsItem];
    }

    // Add project items
    projects.forEach(project => {
      const totalDeps = project.dependencies.length;
      const outdatedDeps = project.dependencies.filter(d => d.isOutdated).length;
      const filteredDeps = this.filterDependencies(project.dependencies);
      
      // Create enhanced project label with stats
      const statusEmoji = outdatedDeps > 0 ? '⚠️' : '✅';
      const label = `${statusEmoji} ${project.name}`;
      
      const item = new TreeItem(
        label,
        vscode.TreeItemCollapsibleState.Expanded,
        'project'
      );
      
      item.projectPath = project.path;
      item.iconPath = new vscode.ThemeIcon('folder-opened', 
        outdatedDeps > 0 
          ? new vscode.ThemeColor('charts.orange')
          : new vscode.ThemeColor('charts.blue')
      );
      
      // Enhanced tooltip with project stats
      item.tooltip = this.createProjectTooltip(project, totalDeps, outdatedDeps);
      
      // Show filtered count if search/filter is active
      if (this.searchQuery || !this.activeFilters.has('all')) {
        item.description = `${filteredDeps.length}/${totalDeps} deps${outdatedDeps > 0 ? `, ${outdatedDeps} outdated` : ''}`;
      } else {
        item.description = `${totalDeps} deps${outdatedDeps > 0 ? `, ${outdatedDeps} outdated` : ''}`;
      }
      
      items.push(item);
    });

    return items;
  }

  private async getFilterItems(): Promise<TreeItem[]> {
    const items: TreeItem[] = [];

    // Search input indicator
    const searchItem = new TreeItem(
      this.searchQuery ? `🔍 "${this.searchQuery}"` : '🔍 Click to search...',
      vscode.TreeItemCollapsibleState.None,
      'search'
    );
    searchItem.iconPath = new vscode.ThemeIcon('search');
    searchItem.tooltip = 'Click to search dependencies';
    searchItem.command = {
      command: 'smartPub.searchDependencies',
      title: 'Search Dependencies'
    };
    items.push(searchItem);

    // Filter options
    const filterOptions = [
      { id: 'all', label: '📦 All Dependencies', active: this.activeFilters.has('all') },
      { id: 'outdated', label: '⚠️ Outdated', active: this.activeFilters.has('outdated') },
      { id: 'production', label: '🚀 Production', active: this.activeFilters.has('production') },
      { id: 'dev', label: '🔧 Development', active: this.activeFilters.has('dev') },
      { id: 'ui', label: '🎨 UI Components', active: this.activeFilters.has('ui') },
      { id: 'state', label: '🗄️ State Management', active: this.activeFilters.has('state') },
      { id: 'network', label: '🌐 Networking', active: this.activeFilters.has('network') }
    ];

    filterOptions.forEach(filter => {
      const item = new TreeItem(
        filter.label,
        vscode.TreeItemCollapsibleState.None,
        'filter'
      );
      item.iconPath = new vscode.ThemeIcon(
        filter.active ? 'check' : 'circle-outline',
        filter.active ? new vscode.ThemeColor('charts.green') : undefined
      );
      item.tooltip = `${filter.active ? 'Disable' : 'Enable'} ${filter.label} filter`;
      item.command = {
        command: 'smartPub.toggleFilter',
        title: 'Toggle Filter',
        arguments: [filter.id]
      };
      items.push(item);
    });

    // Sort options
    const sortItem = new TreeItem(
      `📊 Sort: ${this.sortBy.charAt(0).toUpperCase() + this.sortBy.slice(1)}`,
      vscode.TreeItemCollapsibleState.None,
      'sort'
    );
    sortItem.iconPath = new vscode.ThemeIcon('sort-precedence');
    sortItem.tooltip = 'Change sorting order';
    sortItem.command = {
      command: 'smartPub.changeSorting',
      title: 'Change Sorting'
    };
    items.push(sortItem);

    return items;
  }

  private async getDependencyCategoryItems(projectPath: string): Promise<TreeItem[]> {
    const project = this.workspaceService.getProjects().find(p => p.path === projectPath);
    if (!project) {
      return [];
    }

    const allDeps = this.filterDependencies(project.dependencies);
    const regularDeps = allDeps.filter(d => !d.isDev);
    const devDeps = allDeps.filter(d => d.isDev);
    const outdatedCount = allDeps.filter(d => d.isOutdated).length;
    const upToDateCount = allDeps.filter(d => !d.isOutdated).length;

    const items: TreeItem[] = [];

    // Show search/filter status if active
    if (this.searchQuery || !this.activeFilters.has('all')) {
      const statusItem = new TreeItem(
        `🔍 Filtered View (${allDeps.length} of ${project.dependencies.length})`,
        vscode.TreeItemCollapsibleState.None,
        'filter-status'
      );
      statusItem.iconPath = new vscode.ThemeIcon('filter-filled', new vscode.ThemeColor('charts.blue'));
      statusItem.tooltip = 'Click to clear filters';
      statusItem.command = {
        command: 'smartPub.clearFilters',
        title: 'Clear Filters'
      };
      items.push(statusItem);
    }

    // Project health overview
    if (allDeps.length > 0) {
      const healthItem = new TreeItem(
        `📊 Project Health`,
        vscode.TreeItemCollapsibleState.None,
        'health'
      );
      healthItem.projectPath = projectPath;
      const healthScore = Math.round((upToDateCount / allDeps.length) * 100);
      healthItem.description = `${healthScore}% up-to-date`;
      healthItem.iconPath = new vscode.ThemeIcon('pulse', 
        healthScore >= 80 ? new vscode.ThemeColor('charts.green') :
        healthScore >= 60 ? new vscode.ThemeColor('charts.yellow') :
        new vscode.ThemeColor('charts.red')
      );
      healthItem.tooltip = this.createHealthTooltip(allDeps, healthScore);
      items.push(healthItem);
    }

    // Dependencies category
    if (regularDeps.length > 0) {
      const depsItem = new TreeItem(
        `📦 Production Dependencies`,
        vscode.TreeItemCollapsibleState.Expanded,
        'category'
      );
      depsItem.projectPath = projectPath;
      depsItem.isDev = false;
      depsItem.description = `${regularDeps.length} packages`;
      depsItem.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.blue'));
      depsItem.tooltip = `Production dependencies used in your app\n${regularDeps.length} packages total`;
      items.push(depsItem);
    }

    // Dev Dependencies category
    if (devDeps.length > 0) {
      const devDepsItem = new TreeItem(
        `🔧 Development Dependencies`,
        vscode.TreeItemCollapsibleState.Expanded,
        'category'
      );
      devDepsItem.projectPath = projectPath;
      devDepsItem.isDev = true;
      devDepsItem.description = `${devDeps.length} packages`;
      devDepsItem.iconPath = new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.purple'));
      devDepsItem.tooltip = `Development dependencies for testing and tooling\n${devDeps.length} packages total`;
      items.push(devDepsItem);
    }

    // Updates available notice
    if (outdatedCount > 0) {
      const updateItem = new TreeItem(
        `⚡ Updates Available`,
        vscode.TreeItemCollapsibleState.None,
        'updates'
      );
      updateItem.projectPath = projectPath;
      updateItem.description = `${outdatedCount} package${outdatedCount > 1 ? 's' : ''}`;
      updateItem.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.orange'));
      updateItem.tooltip = `Click to update all ${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''} at once`;
      updateItem.command = {
        command: 'smartPub.updateAllDependencies',
        title: 'Update All Dependencies',
        arguments: [projectPath]
      };
      items.push(updateItem);
    }

    return items;
  }

  private async getDependencyItems(projectPath: string, isDev: boolean): Promise<TreeItem[]> {
    const project = this.workspaceService.getProjects().find(p => p.path === projectPath);
    if (!project) {
      return [];
    }

    let dependencies = project.dependencies
      .filter(d => d.isDev === isDev)
      .filter(dep => dep && dep.name && dep.version); // Filter out invalid dependencies

    // Apply search and filters
    dependencies = this.filterDependencies(dependencies);

    // Apply sorting
    dependencies = this.sortDependencies(dependencies);
    
    return dependencies.map(dep => {
      const { icon, color, category } = this.getPackageVisualInfo(dep);
      const statusEmoji = dep.isOutdated ? '⚠️' : '✅';
      
      // Enhanced label with visual indicators
      const label = `${statusEmoji} ${dep.name}`;
      
      const item = new TreeItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        'dependency'
      );

      item.projectPath = projectPath;
      item.dependency = dep;
      
      // Rich description with version and category info
      const versionInfo = dep.isOutdated && dep.latestVersion 
        ? `${dep.version} → ${dep.latestVersion}`
        : dep.version;
      item.description = `${versionInfo}${category ? ` • ${category}` : ''}`;
      
      // Enhanced icon with color
      item.iconPath = new vscode.ThemeIcon(icon, color);
      
      // Rich tooltip with detailed information
      item.tooltip = this.createEnhancedDependencyTooltip(dep, category);
      
      // Context value for different actions
      item.contextValue = dep.isOutdated ? 'outdatedDependency' : 'dependency';

      // Add command for quick actions - only if dependency is valid
      if (dep.name && dep.version) {
        item.command = {
          command: 'smartPub.showDependencyActions',
          title: 'Show Dependency Actions',
          arguments: [projectPath, dep]
        };
      }

      return item;
    });
  }

  private filterDependencies(dependencies: DependencyInfo[]): DependencyInfo[] {
    let filtered = dependencies;

    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(dep => 
        dep.name.toLowerCase().includes(this.searchQuery) ||
        (dep.description && dep.description.toLowerCase().includes(this.searchQuery))
      );
    }

    // Apply category filters
    if (!this.activeFilters.has('all')) {
      filtered = filtered.filter(dep => {
        if (this.activeFilters.has('outdated') && dep.isOutdated) return true;
        if (this.activeFilters.has('production') && !dep.isDev) return true;
        if (this.activeFilters.has('dev') && dep.isDev) return true;
        
        // Category filters
        const category = this.getPackageCategoryType(dep.name);
        if (this.activeFilters.has(category)) return true;
        
        return false;
      });
    }

    return filtered;
  }

  private sortDependencies(dependencies: DependencyInfo[]): DependencyInfo[] {
    return dependencies.sort((a, b) => {
      switch (this.sortBy) {
        case 'status':
          if (a.isOutdated && !b.isOutdated) return -1;
          if (!a.isOutdated && b.isOutdated) return 1;
          return a.name.localeCompare(b.name);
        
        case 'category':
          const catA = this.getPackageCategoryType(a.name);
          const catB = this.getPackageCategoryType(b.name);
          if (catA !== catB) return catA.localeCompare(catB);
          return a.name.localeCompare(b.name);
        
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }

  private getPackageCategoryType(packageName: string): string {
    const lowerName = packageName.toLowerCase();
    for (const [categoryName, packages] of Object.entries(this.packageCategories)) {
      if (packages.some(pkg => lowerName.includes(pkg.toLowerCase()))) {
        return categoryName;
      }
    }
    return 'other';
  }

  private getPackageVisualInfo(dep: DependencyInfo): { icon: string, color: vscode.ThemeColor, category?: string } {
    const packageName = dep.name.toLowerCase();
    
    // Determine category and visual styling
    for (const [categoryName, packages] of Object.entries(this.packageCategories)) {
      if (packages.some(pkg => packageName.includes(pkg))) {
        switch (categoryName) {
          case 'ui':
            return { 
              icon: 'symbol-color', 
              color: new vscode.ThemeColor('charts.purple'), 
              category: 'UI' 
            };
          case 'state':
            return { 
              icon: 'database', 
              color: new vscode.ThemeColor('charts.blue'), 
              category: 'State Management' 
            };
          case 'network':
            return { 
              icon: 'cloud', 
              color: new vscode.ThemeColor('charts.green'), 
              category: 'Networking' 
            };
          case 'storage':
            return { 
              icon: 'archive', 
              color: new vscode.ThemeColor('charts.yellow'), 
              category: 'Storage' 
            };
          case 'navigation':
            return { 
              icon: 'navigation', 
              color: new vscode.ThemeColor('charts.orange'), 
              category: 'Navigation' 
            };
          case 'firebase':
            return { 
              icon: 'flame', 
              color: new vscode.ThemeColor('charts.red'), 
              category: 'Firebase' 
            };
          case 'media':
            return { 
              icon: 'device-camera', 
              color: new vscode.ThemeColor('charts.pink'), 
              category: 'Media' 
            };
          case 'utils':
            return { 
              icon: 'tools', 
              color: new vscode.ThemeColor('charts.foreground'), 
              category: 'Utilities' 
            };
          case 'testing':
            return { 
              icon: 'beaker', 
              color: new vscode.ThemeColor('testing.iconPassed'), 
              category: 'Testing' 
            };
        }
      }
    }

    // Default styling for unknown packages
    if (dep.isOutdated) {
      return { 
        icon: 'package', 
        color: new vscode.ThemeColor('charts.orange') 
      };
    } else {
      return { 
        icon: 'package', 
        color: new vscode.ThemeColor('charts.green') 
      };
    }
  }

  private createProjectTooltip(project: WorkspaceProject, totalDeps: number, outdatedDeps: number): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;

    tooltip.appendMarkdown(`**${project.name}** Flutter Project\n\n`);
    tooltip.appendMarkdown(`📁 **Location:** \`${project.path}\`\n\n`);
    tooltip.appendMarkdown(`📊 **Dependencies Summary:**\n`);
    tooltip.appendMarkdown(`• Total packages: **${totalDeps}**\n`);
    tooltip.appendMarkdown(`• Up to date: **${totalDeps - outdatedDeps}**\n`);
    if (outdatedDeps > 0) {
      tooltip.appendMarkdown(`• Outdated: **${outdatedDeps}** ⚠️\n`);
    }

    return tooltip;
  }

  private createHealthTooltip(dependencies: DependencyInfo[], healthScore: number): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    const total = dependencies.length;
    const outdated = dependencies.filter(d => d.isOutdated).length;
    const upToDate = total - outdated;

    tooltip.appendMarkdown(`**Project Health Score: ${healthScore}%**\n\n`);
    tooltip.appendMarkdown(`📊 **Dependency Status:**\n`);
    tooltip.appendMarkdown(`• ✅ Up to date: **${upToDate}** packages\n`);
    tooltip.appendMarkdown(`• ⚠️ Outdated: **${outdated}** packages\n\n`);
    
    if (healthScore >= 80) {
      tooltip.appendMarkdown(`🎉 **Excellent!** Your dependencies are well maintained.`);
    } else if (healthScore >= 60) {
      tooltip.appendMarkdown(`👍 **Good!** Consider updating some packages.`);
    } else {
      tooltip.appendMarkdown(`⚠️ **Needs attention!** Many packages need updates.`);
    }

    return tooltip;
  }

  private createEnhancedDependencyTooltip(dep: DependencyInfo, category?: string): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.supportHtml = true;

    // Package header with category
    tooltip.appendMarkdown(`**${dep.name}**`);
    if (category) {
      tooltip.appendMarkdown(` • *${category}*`);
    }
    tooltip.appendMarkdown(`\n\n`);

    // Version information
    tooltip.appendMarkdown(`📦 **Version Information:**\n`);
    tooltip.appendMarkdown(`• Current: \`${dep.version}\`\n`);
    
    if (dep.latestVersion) {
      tooltip.appendMarkdown(`• Latest: \`${dep.latestVersion}\`\n`);
      
      if (dep.isOutdated) {
        tooltip.appendMarkdown(`• Status: ⚠️ **Update available**\n`);
      } else {
        tooltip.appendMarkdown(`• Status: ✅ **Up to date**\n`);
      }
    }

    // Package type
    tooltip.appendMarkdown(`• Type: ${dep.isDev ? '🔧 Development' : '📱 Production'}\n\n`);
    
    // Description if available
    if (dep.description) {
      tooltip.appendMarkdown(`📝 **Description:**\n${dep.description}\n\n`);
    }

    // Quick actions
    tooltip.appendMarkdown(`🔗 **Quick Actions:**\n`);
    tooltip.appendMarkdown(`• Click to view package actions\n`);
    tooltip.appendMarkdown(`• [View on pub.dev](https://pub.dev/packages/${dep.name})\n`);

    return tooltip;
  }

  private createDependencyTooltip(dep: DependencyInfo): string {
    let tooltip = `${dep.name}\n`;
    tooltip += `Current: ${dep.version}\n`;
    
    if (dep.latestVersion) {
      tooltip += `Latest: ${dep.latestVersion}\n`;
    }
    
    if (dep.isOutdated) {
      tooltip += '\n🔄 Update available';
    } else {
      tooltip += '\n✅ Up to date';
    }
    
    if (dep.description) {
      tooltip += `\n\n${dep.description}`;
    }

    return tooltip;
  }
}

class TreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'project' | 'category' | 'dependency' | 'updates' | 'info' | 'health' | 'filters' | 'search' | 'filter' | 'sort' | 'filter-status'
  ) {
    super(label, collapsibleState);
  }

  projectPath?: string;
  isDev?: boolean;
  dependency?: DependencyInfo;
} 