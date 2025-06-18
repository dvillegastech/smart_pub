import * as vscode from 'vscode';
import { PubApiService } from './pub-api-service';
import { WorkspaceService } from './workspace-service';
import { PubPackage } from '../types/pub-types';

export class VisualSearchService {
  private panel: vscode.WebviewPanel | undefined;
  private readonly packageCategories = {
    'UI Components': ['flutter', 'material', 'cupertino', 'flutter_staggered_grid_view', 'card_swiper', 'carousel_slider', 'animations', 'flutter_svg'],
    'State Management': ['provider', 'bloc', 'riverpod', 'get', 'mobx', 'redux', 'flutter_bloc'],
    'Networking': ['http', 'dio', 'chopper', 'retrofit', 'graphql', 'connectivity_plus'],
    'Storage': ['shared_preferences', 'sqflite', 'hive', 'isar', 'drift', 'path_provider'],
    'Navigation': ['go_router', 'auto_route', 'fluro', 'page_transition', 'beamer'],
    'Firebase': ['firebase_core', 'firebase_auth', 'cloud_firestore', 'firebase_storage', 'firebase_messaging'],
    'Media': ['image_picker', 'video_player', 'camera', 'permission_handler', 'image', 'photo_view'],
    'Utilities': ['intl', 'uuid', 'crypto', 'path', 'collection', 'meta', 'equatable'],
    'Testing': ['test', 'flutter_test', 'mockito', 'integration_test', 'golden_toolkit'],
    'Architecture': ['injectable', 'get_it', 'freezed', 'json_annotation', 'build_runner']
  };

  constructor(
    private context: vscode.ExtensionContext,
    private pubApiService: PubApiService,
    private workspaceService: WorkspaceService
  ) {}

  public async showSearchInterface(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'smartPubVisualSearch',
      'Smart Pub - Package Search',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.joinPath(this.context.extensionUri, 'images', 'search-light.svg'),
      dark: vscode.Uri.joinPath(this.context.extensionUri, 'images', 'search-dark.svg')
    };
    this.panel.webview.html = this.getWebviewContent();
    this.setupWebviewMessageHandling();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private setupWebviewMessageHandling(): void {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'search':
          await this.handleSearch(message.query, message.category);
          break;
        case 'getCategories':
          await this.sendCategories();
          break;
        case 'addPackage':
          await this.handleAddPackage(message.package);
          break;
        case 'viewPackage':
          vscode.env.openExternal(vscode.Uri.parse(`https://pub.dev/packages/${message.packageName}`));
          break;
      }
    });
  }

  private async handleSearch(query: string, category?: string): Promise<void> {
    try {
      let packages: PubPackage[];
      
      if (category && category !== 'all') {
        // Filter by category
        const categoryPackages = this.packageCategories[category as keyof typeof this.packageCategories] || [];
        if (query.trim()) {
          // Search within category
          packages = await this.pubApiService.searchPackages(query);
          packages = packages.filter(pkg => 
            categoryPackages.some(catPkg => pkg.name.toLowerCase().includes(catPkg.toLowerCase()))
          );
        } else {
          // Get all packages in category
          const searchPromises = categoryPackages.map(pkgName => 
            this.pubApiService.searchPackages(pkgName).then(results => results[0]).catch(() => null)
          );
          const results = await Promise.all(searchPromises);
          packages = results.filter(pkg => pkg !== null) as PubPackage[];
        }
      } else {
        // General search
        packages = await this.pubApiService.searchPackages(query);
      }

      // Enhance packages with category information
      const enhancedPackages = packages.map(pkg => ({
        ...pkg,
        category: this.getPackageCategory(pkg.name),
        popularityScore: this.calculatePopularityScore(pkg),
        healthScore: this.calculateHealthScore(pkg)
      }));

      this.panel?.webview.postMessage({
        type: 'searchResults',
        packages: enhancedPackages,
        query
      });
    } catch (error) {
      console.error('Search error:', error);
      this.panel?.webview.postMessage({
        type: 'searchError',
        error: 'Failed to search packages'
      });
    }
  }

  private async sendCategories(): Promise<void> {
    this.panel?.webview.postMessage({
      type: 'categories',
      categories: Object.keys(this.packageCategories)
    });
  }

  private async handleAddPackage(packageData: any): Promise<void> {
    const projects = this.workspaceService.getProjects();
    
    if (projects.length === 0) {
      vscode.window.showErrorMessage('No Flutter projects found in workspace');
      return;
    }

    // Show project selection if multiple projects
    let selectedProject = projects[0];
    if (projects.length > 1) {
      const projectItems = projects.map(project => ({
        label: `$(folder) ${project.name}`,
        description: project.path,
        project
      }));

      const selection = await vscode.window.showQuickPick(projectItems, {
        placeHolder: 'Select project to add the package to'
      });

      if (!selection) return;
      selectedProject = selection.project;
    }

    // Show dependency type selection
    const dependencyType = await vscode.window.showQuickPick([
      {
        label: '$(package) Production Dependency',
        description: 'Add to dependencies section',
        isDev: false
      },
      {
        label: '$(tools) Development Dependency', 
        description: 'Add to dev_dependencies section',
        isDev: true
      }
    ], {
      placeHolder: 'Select dependency type'
    });

    if (!dependencyType) return;

    // Add the package
    const success = await this.workspaceService.addDependency(
      selectedProject.path,
      packageData.name,
      `^${packageData.version}`,
      dependencyType.isDev
    );

    if (success) {
      vscode.window.showInformationMessage(`✅ Added ${packageData.name} to ${selectedProject.name}`);
      // Update the webview to show the package as added
      this.panel?.webview.postMessage({
        type: 'packageAdded',
        packageName: packageData.name
      });
    }
  }

  private getPackageCategory(packageName: string): string {
    const lowerName = packageName.toLowerCase();
    for (const [category, packages] of Object.entries(this.packageCategories)) {
      if (packages.some(pkg => lowerName.includes(pkg.toLowerCase()))) {
        return category;
      }
    }
    return 'Other';
  }

  private calculatePopularityScore(pkg: PubPackage): number {
    // Combine likes, popularity, and points for a comprehensive score
    const likesScore = Math.min(pkg.likes / 1000, 1) * 30; // Max 30 points for likes
    const popularityScore = pkg.popularity * 0.4; // Max 40 points for popularity
    const pointsScore = Math.min(pkg.points / 140, 1) * 30; // Max 30 points for pub points
    
    return Math.round(likesScore + popularityScore + pointsScore);
  }

  private calculateHealthScore(pkg: PubPackage): number {
    // Basic health score based on available metrics
    let score = 50; // Base score
    
    if (pkg.points > 100) score += 20;
    if (pkg.likes > 100) score += 15;
    if (pkg.popularity > 80) score += 15;
    
    return Math.min(score, 100);
  }

  private getWebviewContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Pub - Package Search</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h1 {
            color: var(--vscode-textLink-foreground);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .search-container {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }

        .search-input {
            flex: 1;
            min-width: 300px;
            padding: 12px 16px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            font-size: 14px;
        }

        .category-select {
            padding: 12px 16px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 6px;
            font-size: 14px;
            min-width: 180px;
        }

        .search-btn {
            padding: 12px 24px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }

        .search-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .filters {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .filter-btn {
            padding: 8px 16px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }

        .filter-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .results-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .results-count {
            color: var(--vscode-descriptionForeground);
        }

        .sort-select {
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 4px;
            font-size: 12px;
        }

        .packages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 20px;
        }

        .package-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.2s;
            cursor: pointer;
        }

        .package-card:hover {
            border-color: var(--vscode-textLink-foreground);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .package-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }

        .package-name {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 5px;
        }

        .package-version {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            padding: 2px 8px;
            border-radius: 12px;
        }

        .package-category {
            font-size: 11px;
            color: var(--vscode-textLink-foreground);
            background: var(--vscode-textLink-foreground);
            color: var(--vscode-button-foreground);
            padding: 2px 8px;
            border-radius: 4px;
        }

        .package-description {
            color: var(--vscode-editor-foreground);
            line-height: 1.5;
            margin-bottom: 15px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .package-stats {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .stat {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .stat-icon {
            width: 16px;
            height: 16px;
        }

        .popularity-bar {
            width: 100%;
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin-bottom: 15px;
            overflow: hidden;
        }

        .popularity-fill {
            height: 100%;
            background: var(--vscode-progressBar-background);
            transition: width 0.3s;
        }

        .popularity-fill.high { background: #4CAF50; }
        .popularity-fill.medium { background: #FF9800; }
        .popularity-fill.low { background: #F44336; }

        .package-actions {
            display: flex;
            gap: 10px;
        }

        .btn-primary {
            flex: 1;
            padding: 10px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background-color 0.2s;
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            padding: 10px 16px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .no-results {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .tags {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            margin-bottom: 10px;
        }

        .tag {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
        }

        @media (max-width: 768px) {
            .packages-grid {
                grid-template-columns: 1fr;
            }
            
            .search-container {
                flex-direction: column;
            }
            
            .search-input {
                min-width: unset;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <span style="font-size: 24px;">🔍</span>
            Smart Pub Package Search
        </h1>
    </div>

    <div class="search-container">
        <input type="text" id="searchInput" class="search-input" placeholder="Search packages (e.g., 'http', 'state management', 'animation')..." />
        <select id="categorySelect" class="category-select">
            <option value="all">All Categories</option>
        </select>
        <button id="searchBtn" class="search-btn">Search</button>
    </div>

    <div class="filters" id="filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="flutter">Flutter</button>
        <button class="filter-btn" data-filter="dart">Dart</button>
        <button class="filter-btn" data-filter="popular">Popular</button>
        <button class="filter-btn" data-filter="recent">Recently Updated</button>
    </div>

    <div class="results-header">
        <div class="results-count" id="resultsCount"></div>
        <select id="sortSelect" class="sort-select">
            <option value="relevance">Sort by Relevance</option>
            <option value="popularity">Sort by Popularity</option>
            <option value="likes">Sort by Likes</option>
            <option value="points">Sort by Pub Points</option>
            <option value="name">Sort by Name</option>
        </select>
    </div>

    <div id="results" class="packages-grid"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentPackages = [];
        let filteredPackages = [];
        let currentFilter = 'all';
        let currentSort = 'relevance';

        // Request categories on load
        vscode.postMessage({ type: 'getCategories' });

        // Event listeners
        document.getElementById('searchBtn').addEventListener('click', performSearch);
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        document.getElementById('sortSelect').addEventListener('change', (e) => {
            currentSort = e.target.value;
            applySorting();
        });

        // Filter buttons
        document.getElementById('filters').addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.filter;
                applyFiltering();
            }
        });

        function performSearch() {
            const query = document.getElementById('searchInput').value.trim();
            const category = document.getElementById('categorySelect').value;
            
            if (!query && category === 'all') {
                return;
            }

            showLoading();
            vscode.postMessage({ 
                type: 'search', 
                query: query,
                category: category
            });
        }

        function showLoading() {
            document.getElementById('results').innerHTML = '<div class="loading">🔍 Searching packages...</div>';
            document.getElementById('resultsCount').textContent = '';
        }

        function applyFiltering() {
            filteredPackages = currentPackages.filter(pkg => {
                switch(currentFilter) {
                    case 'flutter': return pkg.isFlutterPackage;
                    case 'dart': return pkg.isDartPackage;
                    case 'popular': return pkg.popularityScore > 70;
                    case 'recent': return true; // Would need last updated date
                    default: return true;
                }
            });
            applySorting();
        }

        function applySorting() {
            filteredPackages.sort((a, b) => {
                switch(currentSort) {
                    case 'popularity': return b.popularityScore - a.popularityScore;
                    case 'likes': return b.likes - a.likes;
                    case 'points': return b.points - a.points;
                    case 'name': return a.name.localeCompare(b.name);
                    default: return 0; // relevance - keep search order
                }
            });
            displayPackages(filteredPackages);
        }

        function displayPackages(packages) {
            const resultsDiv = document.getElementById('results');
            const countDiv = document.getElementById('resultsCount');
            
            countDiv.textContent = \`\${packages.length} package\${packages.length !== 1 ? 's' : ''} found\`;

            if (packages.length === 0) {
                resultsDiv.innerHTML = '<div class="no-results">No packages found. Try different search terms or category.</div>';
                return;
            }

            resultsDiv.innerHTML = packages.map(pkg => createPackageCard(pkg)).join('');
        }

        function createPackageCard(pkg) {
            const popularityClass = pkg.popularityScore > 70 ? 'high' : pkg.popularityScore > 40 ? 'medium' : 'low';
            
            return \`
                <div class="package-card" onclick="viewPackage('\${pkg.name}')">
                    <div class="package-header">
                        <div>
                            <div class="package-name">\${pkg.name}</div>
                            <div class="package-version">v\${pkg.version}</div>
                        </div>
                        <div class="package-category">\${pkg.category || 'Other'}</div>
                    </div>
                    
                    <div class="tags">
                        \${pkg.isFlutterPackage ? '<span class="tag">Flutter</span>' : ''}
                        \${pkg.isDartPackage ? '<span class="tag">Dart</span>' : ''}
                        \${pkg.tags ? pkg.tags.slice(0, 3).map(tag => \`<span class="tag">\${tag}</span>\`).join('') : ''}
                    </div>

                    <div class="package-description">
                        \${pkg.description || 'No description available'}
                    </div>

                    <div class="package-stats">
                        <div class="stat">
                            <span>👍</span>
                            <span>\${pkg.likes}</span>
                        </div>
                        <div class="stat">
                            <span>📈</span>
                            <span>\${pkg.popularity}%</span>
                        </div>
                        <div class="stat">
                            <span>⭐</span>
                            <span>\${pkg.points}</span>
                        </div>
                        <div class="stat">
                            <span>💚</span>
                            <span>\${pkg.healthScore}%</span>
                        </div>
                    </div>

                    <div class="popularity-bar">
                        <div class="popularity-fill \${popularityClass}" style="width: \${pkg.popularityScore}%"></div>
                    </div>

                    <div class="package-actions">
                        <button class="btn-primary" onclick="event.stopPropagation(); addPackage('\${JSON.stringify(pkg).replace(/'/g, "\\'")}')">
                            ➕ Add to Project
                        </button>
                        <button class="btn-secondary" onclick="event.stopPropagation(); viewPackage('\${pkg.name}')">
                            🔗 View Details
                        </button>
                    </div>
                </div>
            \`;
        }

        function addPackage(packageJson) {
            const pkg = JSON.parse(packageJson);
            vscode.postMessage({ 
                type: 'addPackage', 
                package: pkg
            });
        }

        function viewPackage(packageName) {
            vscode.postMessage({ 
                type: 'viewPackage', 
                packageName: packageName
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'searchResults':
                    currentPackages = message.packages;
                    applyFiltering();
                    break;
                    
                case 'categories':
                    const select = document.getElementById('categorySelect');
                    message.categories.forEach(cat => {
                        const option = document.createElement('option');
                        option.value = cat;
                        option.textContent = cat;
                        select.appendChild(option);
                    });
                    break;
                    
                case 'packageAdded':
                    // Show visual feedback that package was added
                    const cards = document.querySelectorAll('.package-card');
                    cards.forEach(card => {
                        if (card.querySelector('.package-name').textContent === message.packageName) {
                            card.style.border = '2px solid #4CAF50';
                            card.querySelector('.btn-primary').textContent = '✅ Added';
                            card.querySelector('.btn-primary').disabled = true;
                        }
                    });
                    break;
                    
                case 'searchError':
                    document.getElementById('results').innerHTML = \`<div class="no-results">❌ \${message.error}</div>\`;
                    break;
            }
        });

        // Initial search for popular packages
        setTimeout(() => {
            document.getElementById('searchInput').value = '';
            document.getElementById('categorySelect').value = 'all';
            vscode.postMessage({ 
                type: 'search', 
                query: '',
                category: 'UI Components'
            });
        }, 500);
    </script>
</body>
</html>`;
  }
} 