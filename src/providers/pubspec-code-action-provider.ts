import * as vscode from 'vscode';
import { PubspecAnalyzer, PackageAnalysis } from './pubspec-analyzer';
import { WorkspaceService } from '../services/workspace-service';
import * as path from 'path';

export class PubspecCodeActionProvider implements vscode.CodeActionProvider {
  constructor(
    private pubspecAnalyzer: PubspecAnalyzer,
    private workspaceService: WorkspaceService
  ) {}

  public async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    if (!document.fileName.endsWith('pubspec.yaml')) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // Revisar todos los diagnósticos de Smart Pub Manager en el rango
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'Smart Pub Manager' && diagnostic.code === 'package-update-available') {
        const packageActions = await this.createPackageUpdateActions(document, diagnostic);
        actions.push(...packageActions);
      }
    }

    // También revisar si hay análisis disponible para la posición actual
    const position = range instanceof vscode.Selection ? range.active : range.start;
    const analysis = this.pubspecAnalyzer.getAnalysisForPosition(document, position);
    
    if (analysis && analysis.isOutdated) {
      const additionalActions = await this.createPackageUpdateActions(document, undefined, analysis);
      // Evitar duplicados
      for (const action of additionalActions) {
        if (!actions.some(existing => existing.title === action.title)) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  private async createPackageUpdateActions(
    document: vscode.TextDocument,
    diagnostic?: vscode.Diagnostic,
    analysis?: PackageAnalysis
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];
    
    // Si no tenemos análisis, tratamos de obtenerlo del diagnóstico
    if (!analysis && diagnostic) {
      analysis = this.pubspecAnalyzer.getAnalysisForPosition(document, diagnostic.range.start);
    }

    if (!analysis) {
      return actions;
    }

    // Acción para actualizar a la última versión
    const updateToLatestAction = new vscode.CodeAction(
      `Update ${analysis.name} to ${analysis.latestVersion}`,
      vscode.CodeActionKind.QuickFix
    );
    updateToLatestAction.edit = this.createUpdateEdit(document, analysis, analysis.latestVersion);
    updateToLatestAction.isPreferred = true;
    if (diagnostic) {
      updateToLatestAction.diagnostics = [diagnostic];
    }
    actions.push(updateToLatestAction);

    // Acción para actualizar usando compatible version (^version)
    const compatibleVersion = `^${analysis.latestVersion}`;
    if (compatibleVersion !== analysis.latestVersion) {
      const updateCompatibleAction = new vscode.CodeAction(
        `Update ${analysis.name} to ${compatibleVersion} (compatible)`,
        vscode.CodeActionKind.QuickFix
      );
      updateCompatibleAction.edit = this.createUpdateEdit(document, analysis, compatibleVersion);
      if (diagnostic) {
        updateCompatibleAction.diagnostics = [diagnostic];
      }
      actions.push(updateCompatibleAction);
    }

    // Acción para ver detalles en pub.dev
    const viewOnPubDevAction = new vscode.CodeAction(
      `View ${analysis.name} on pub.dev`,
      vscode.CodeActionKind.Empty
    );
    viewOnPubDevAction.command = {
      title: 'View on pub.dev',
      command: 'vscode.open',
      arguments: [vscode.Uri.parse(`https://pub.dev/packages/${analysis.name}`)]
    };
    actions.push(viewOnPubDevAction);

    // Acción para actualizar todas las dependencias del proyecto
    const updateAllAction = new vscode.CodeAction(
      'Update all outdated packages in this project',
      vscode.CodeActionKind.Source
    );
    updateAllAction.command = {
      title: 'Update all packages',
      command: 'smartPub.updateAllDependencies',
      arguments: [path.dirname(document.uri.fsPath)]
    };
    actions.push(updateAllAction);

    return actions;
  }

  private createUpdateEdit(
    document: vscode.TextDocument,
    analysis: PackageAnalysis,
    newVersion: string
  ): vscode.WorkspaceEdit {
    const edit = new vscode.WorkspaceEdit();
    
    // Encontrar el rango exacto de la versión para reemplazar
    const line = document.lineAt(analysis.range.start.line);
    const lineText = line.text;
    
    // Buscar la versión en la línea
    const versionMatch = lineText.match(/:\s*(.+)$/);
    if (versionMatch) {
      const versionStart = lineText.indexOf(versionMatch[1]);
      const versionEnd = versionStart + versionMatch[1].length;
      
      const versionRange = new vscode.Range(
        analysis.range.start.line,
        versionStart,
        analysis.range.start.line,
        versionEnd
      );
      
      // Preservar el formato original (quotes, etc.)
      let newVersionText = newVersion;
      const originalVersion = versionMatch[1].trim();
      
      // Si la versión original tenía quotes, mantenerlas
      if (originalVersion.startsWith('"') && originalVersion.endsWith('"')) {
        newVersionText = `"${newVersion}"`;
      } else if (originalVersion.startsWith("'") && originalVersion.endsWith("'")) {
        newVersionText = `'${newVersion}'`;
      }
      
      edit.replace(document.uri, versionRange, newVersionText);
    }
    
    return edit;
  }
} 