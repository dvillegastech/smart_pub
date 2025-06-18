import * as vscode from 'vscode';
import { PubspecAnalyzer, PackageAnalysis } from './pubspec-analyzer';

export class PubspecHoverProvider implements vscode.HoverProvider {
  constructor(private pubspecAnalyzer: PubspecAnalyzer) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (!document.fileName.endsWith('pubspec.yaml')) {
      return undefined;
    }

    const analysis = this.pubspecAnalyzer.getAnalysisForPosition(document, position);
    if (!analysis) {
      return undefined;
    }

    const markdown = this.createHoverMarkdown(analysis);
    return new vscode.Hover(markdown, analysis.range);
  }

  private createHoverMarkdown(analysis: PackageAnalysis): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // Título del package
    markdown.appendMarkdown(`### 📦 ${analysis.name}\n\n`);

    // Información de versiones
    if (analysis.isOutdated) {
      markdown.appendMarkdown(`**🔄 Update Available**\n\n`);
      markdown.appendMarkdown(`- **Current:** \`${analysis.currentVersion}\`\n`);
      markdown.appendMarkdown(`- **Latest:** \`${analysis.latestVersion}\` ✨\n\n`);
    } else {
      markdown.appendMarkdown(`**✅ Up to date**\n\n`);
      markdown.appendMarkdown(`- **Version:** \`${analysis.currentVersion}\`\n\n`);
    }

    // Tipo de dependencia
    const depType = analysis.isDev ? 'Dev Dependency' : 'Dependency';
    markdown.appendMarkdown(`**Type:** ${depType}\n\n`);

    // Descripción si está disponible
    if (analysis.description) {
      markdown.appendMarkdown(`**Description:** ${analysis.description}\n\n`);
    }

    // Enlaces útiles
    markdown.appendMarkdown(`**Links:**\n`);
    markdown.appendMarkdown(`- [View on pub.dev](https://pub.dev/packages/${analysis.name})\n`);
    markdown.appendMarkdown(`- [Documentation](https://pub.dev/documentation/${analysis.name}/latest/)\n`);
    markdown.appendMarkdown(`- [Changelog](https://pub.dev/packages/${analysis.name}/changelog)\n\n`);

    // Acciones rápidas si está desactualizado
    if (analysis.isOutdated) {
      markdown.appendMarkdown(`---\n\n`);
      markdown.appendMarkdown(`**Quick Actions:**\n`);
      
      // Comando para actualizar (esto se conectará con code actions)
      const updateCommand = vscode.Uri.parse(
        `command:smartPub.updatePackage?${encodeURIComponent(JSON.stringify({
          packageName: analysis.name,
          newVersion: analysis.latestVersion,
          isDev: analysis.isDev,
          documentUri: vscode.window.activeTextEditor?.document.uri.toString()
        }))}`
      );
      
      markdown.appendMarkdown(`[🔄 Update to ${analysis.latestVersion}](${updateCommand})\n`);
    }

    return markdown;
  }
} 