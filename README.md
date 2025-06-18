# Smart Pub Manager

**Intelligent Flutter dependency management for VS Code**

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://coff.ee/dvillegas)

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/villegas-john.smart-pub-manager?style=for-the-badge&logo=visual-studio-code&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=villegas-john.smart-pub-manager)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/villegas-john.smart-pub-manager?style=for-the-badge&logo=visual-studio-code&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=villegas-john.smart-pub-manager)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/villegas-john.smart-pub-manager?style=for-the-badge&logo=visual-studio-code&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=villegas-john.smart-pub-manager)

Transform your Flutter development workflow with **Smart Pub Manager** - the most comprehensive dependency management extension for VS Code. Featuring visual search, intelligent categorization, health monitoring, and automated conflict resolution.

---

## Key Features

### Visual Package Search
Advanced search interface with rich package information, popularity metrics, and one-click installation.

### Dependency Health Monitoring
Real-time health scores, outdated package detection, and visual status indicators.

### Smart Categorization
Automatic package categorization with visual icons for UI, State Management, Networking, and more.

### Intelligent Filtering
Powerful filtering system with search, category filters, and sorting options.

### Conflict Resolution
Automatic detection and resolution of dependency version conflicts.

---

## Screenshots & Features Gallery

<div align="center">

### Visual Package Browser
*Modern search interface with rich package information*

<img src="screenshots/Pub Dev In VS CODE.png" alt="Visual Package Search" width="800"/>

---

### Smart Dependency Tree
*Intelligent sidebar with categorization and health monitoring*

<img src="screenshots/Tree Package + Info.png" alt="Dependency Tree" width="800"/>

---

### Rich Package Information
*Detailed tooltips with version info, categories, and quick actions*

<img src="screenshots/Info Tooltip.png" alt="Package Information" width="800"/>

---

### One-Click Package Addition
*Streamlined workflow for adding dependencies to your project*

<img src="screenshots/Add Package.png" alt="Add Package" width="800"/>

</div>

---

## Getting Started

### Installation

1. **From VS Code Marketplace:**
   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X`)
   - Search for "Smart Pub Manager"
   - Click Install

2. **From Command Line:**
   ```bash
   code --install-extension villegas-john.smart-pub-manager
   ```

### Quick Start

1. **Open a Flutter project** with a `pubspec.yaml` file
2. **Access the Smart Pub panel** in the sidebar (package icon)
3. **Start searching** with the visual search interface
4. **Manage dependencies** with intelligent filters and sorting

---

## Comprehensive Usage Guide

### Visual Package Search

Access the modern search interface in multiple ways:

```
• Ctrl+Shift+P → "Smart Pub: Search Flutter Packages (Visual)"
• Click the search icon in the Smart Pub sidebar
• Right-click in pubspec.yaml → "Add Dependency"
```

**Features:**
- **Category Filtering**: UI Components, State Management, Networking, etc.
- **Visual Metrics**: Popularity bars, likes, pub points, health scores
- **Smart Tags**: Flutter, Dart, category badges
- **Live Sorting**: By relevance, popularity, name, or pub points
- **Quick Actions**: Add to project, view on pub.dev

### Dependency Management Sidebar

The Smart Pub sidebar provides comprehensive project overview:

#### Project Health Dashboard
- **Health Score**: Visual percentage of up-to-date dependencies
- **Update Alerts**: Clear indicators for outdated packages
- **Statistics**: Total packages, outdated count, dependency types

#### Advanced Filtering System
```
Search & Filters (expandable section)
├── Search Input - Filter by package name or description
├── All Dependencies - Show everything
├── Outdated - Show only packages needing updates
├── Production - Runtime dependencies only
├── Development - Dev dependencies only
├── UI Components - Flutter widgets and UI packages
├── State Management - Provider, Bloc, Riverpod, etc.
└── Networking - HTTP, API, and network packages
```

#### Smart Categorization
Every package is automatically categorized with appropriate icons:
- **UI Components**: Flutter widgets, animations, UI libraries
- **State Management**: Provider, Bloc, Riverpod, GetX
- **Networking**: HTTP, Dio, GraphQL, REST APIs
- **Storage**: SharedPreferences, SQLite, Hive, local storage
- **Navigation**: GoRouter, AutoRoute, routing solutions
- **Firebase**: Firebase services and integrations
- **Media**: Image/video handling, camera, permissions
- **Utilities**: Helper libraries, tools, utilities
- **Testing**: Testing frameworks and tools

### Configuration Options

Customize Smart Pub Manager in VS Code settings:

```json
{
  "smartPub.autoRunPubGet": true,
  "smartPub.enableCache": true,
  "smartPub.cacheExpiration": 3600,
  "smartPub.maxSearchResults": 20,
  "smartPub.defaultSearchMode": "visual"
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `autoRunPubGet` | Automatically run `flutter pub get` after changes | `true` |
| `enableCache` | Cache search results for better performance | `true` |
| `cacheExpiration` | Cache duration in seconds | `3600` (1 hour) |
| `maxSearchResults` | Maximum search results to display | `20` |
| `defaultSearchMode` | Default search interface (visual/text) | `visual` |

---

## Command Reference

### Main Commands
| Command | Shortcut | Description |
|---------|----------|-------------|
| `Smart Pub: Search Flutter Packages (Visual)` | `Ctrl+Shift+P` | Open visual search interface |
| `Smart Pub: Search Dependencies in Sidebar` | `Ctrl+F` (in sidebar) | Search within dependency tree |
| `Smart Pub: Add Dependency` | - | Add package to pubspec.yaml |
| `Smart Pub: Update All Dependencies` | - | Check and update all packages |
| `Smart Pub: Resolve Dependency Conflicts` | - | Auto-resolve version conflicts |

### Filter & Sort Commands
| Command | Description |
|---------|-------------|
| `Smart Pub: Change Dependency Sorting` | Switch between name, status, category sorting |
| `Smart Pub: Clear All Filters` | Reset all filters and search |
| `Smart Pub: Refresh Dependencies` | Reload dependency information |

### Utility Commands
| Command | Description |
|---------|-------------|
| `Smart Pub: Analyze Current pubspec.yaml` | Deep analysis of current file |
| `Smart Pub: Clear Cache` | Clear all cached search results |

---

## Developer Guide

### Architecture Overview

Smart Pub Manager is built with a modular architecture:

```
src/
├── services/
│   ├── visual-search-service.ts    # Modern webview search interface
│   ├── pub-api-service.ts          # pub.dev API integration
│   ├── workspace-service.ts        # Flutter project management
│   ├── cache-service.ts            # Performance caching layer
│   └── dependency-resolver.ts      # Conflict resolution engine
├── providers/
│   ├── dependency-tree-provider.ts # Sidebar tree view with filtering
│   ├── pubspec-analyzer.ts         # Real-time pubspec.yaml analysis
│   ├── pubspec-hover-provider.ts   # Rich hover information
│   └── pubspec-code-action-provider.ts # Quick fix suggestions
└── commands/
    └── search-packages-command.ts  # Legacy text-based search
```

### Key Technologies

- **TypeScript**: Type-safe development
- **VS Code Extension API**: Native IDE integration
- **Webview API**: Modern search interface
- **pub.dev REST API**: Package information and search
- **YAML Parser**: pubspec.yaml manipulation
- **Local Caching**: Performance optimization

### Extension Activation

The extension automatically activates when:
- A `pubspec.yaml` file is detected in the workspace
- Flutter project structure is identified
- User executes any Smart Pub command

### Performance Features

- **Smart Caching**: API responses cached for 1 hour by default
- **Lazy Loading**: Components loaded on demand
- **Efficient Filtering**: Client-side filtering for instant results
- **Optimized Queries**: Minimal API calls with intelligent batching

---

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dvillegastech/smart_pub.git
   cd smart_pub
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run compile
   ```

4. **Test in VS Code:**
   - Press `F5` to open Extension Development Host
   - Test your changes in the new VS Code window

### Project Structure

```
smart_pub/
├── src/                    # TypeScript source code
├── images/                 # Icons and visual assets
├── screenshots/            # Documentation screenshots
├── package.json            # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── README.md              # This documentation
```

### Contribution Guidelines

- **Bug Reports**: Use GitHub issues with detailed reproduction steps
- **Feature Requests**: Describe the use case and expected behavior
- **Pull Requests**: Include tests and update documentation
- **Code Style**: Follow existing TypeScript patterns and VS Code conventions

---

## Roadmap

### Upcoming Features

- **Security Scanning**: Automated vulnerability detection
- **Flutter Version Compatibility**: Version-specific package recommendations
- **Custom Themes**: Personalized UI themes for the search interface
- **Analytics Dashboard**: Dependency usage statistics and insights
- **AI Recommendations**: Smart package suggestions based on project type
- **Dependency Migration**: Automated migration between similar packages

### Community Requests

Vote for features on our [GitHub Discussions](https://github.com/dvillegastech/smart_pub/discussions)!

---

## Support & Troubleshooting

### Common Issues

<details>
<summary><strong>Search not working</strong></summary>

**Solution:**
1. Check internet connection
2. Clear cache: `Smart Pub: Clear Cache`
3. Restart VS Code
4. Verify pub.dev is accessible
</details>

<details>
<summary><strong>Dependencies not updating</strong></summary>

**Solution:**
1. Ensure `pubspec.yaml` is valid YAML
2. Check Flutter SDK is properly installed
3. Run `flutter pub get` manually
4. Verify write permissions in project directory
</details>

<details>
<summary><strong>Sidebar not showing</strong></summary>

**Solution:**
1. Open Flutter project with `pubspec.yaml`
2. Click the package icon in Activity Bar
3. Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"
</details>

### Getting Help

- **Documentation**: Check this README for detailed instructions
- **Bug Reports**: [GitHub Issues](https://github.com/dvillegastech/smart_pub/issues)
- **Discussions**: [GitHub Discussions](https://github.com/dvillegastech/smart_pub/discussions)
- **Contact**: dvillegastech@gmail.com

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Flutter Team**: For the amazing framework
- **pub.dev**: For the comprehensive package registry
- **VS Code Team**: For the excellent extension API
- **Community**: For feature requests and feedback

---

<div align="center">

**Made with ❤️ for the Flutter community**

[⭐ Star on GitHub](https://github.com/dvillegastech/smart_pub) • [📦 VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=villegas-john.smart-pub-manager) • [🐛 Report Issues](https://github.com/dvillegastech/smart_pub/issues)

</div> 
