/**
 * Performance profiler for Ren'Py projects.
 * Static analysis of scripts to detect performance bottlenecks.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode } from '../parser/types';
import { localize } from '../language/i18n';

export interface ResourceLoad {
  type: 'image' | 'audio';
  name: string;
  line: number;
}

export interface ProfileWarning {
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface SceneProfile {
  file: string;
  labelCount: number;
  dialogueCount: number;
  resourceLoads: ResourceLoad[];
  transitionCount: number;
  pythonBlockCount: number;
  choicePoints: number;
  branchDepth: number;
  estimatedComplexity: 'low' | 'medium' | 'high' | 'critical';
  warnings: ProfileWarning[];
}

export class ProjectProfiler {
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(private getIndex: () => ProjectIndex) {}

  /**
   * Profile all files in the project and display results.
   */
  profileAndShow(): void {
    const index = this.getIndex();
    const profiles: SceneProfile[] = [];

    for (const [file, parsed] of index.files) {
      const profile = this.profileFile(file, parsed.nodes);
      profiles.push(profile);
    }

    // Sort by complexity (critical first)
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    profiles.sort((a, b) => order[a.estimatedComplexity] - order[b.estimatedComplexity]);

    this.showResults(profiles);
  }

  private profileFile(file: string, nodes: RenpyNode[]): SceneProfile {
    const profile: SceneProfile = {
      file,
      labelCount: 0,
      dialogueCount: 0,
      resourceLoads: [],
      transitionCount: 0,
      pythonBlockCount: 0,
      choicePoints: 0,
      branchDepth: 0,
      estimatedComplexity: 'low',
      warnings: [],
    };

    this.walkNodes(nodes, profile, 0);
    profile.estimatedComplexity = this.calculateComplexity(profile);
    this.generateWarnings(profile);

    return profile;
  }

  private walkNodes(nodes: RenpyNode[], profile: SceneProfile, depth: number): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'label':
          profile.labelCount++;
          break;
        case 'dialogue':
        case 'narration':
          profile.dialogueCount++;
          break;
        case 'command':
          if (node.command === 'scene' || node.command === 'show') {
            profile.resourceLoads.push({
              type: 'image',
              name: node.target || node.raw,
              line: node.line,
            });
          } else if (node.command === 'play' || node.command === 'queue') {
            profile.resourceLoads.push({
              type: 'audio',
              name: node.args || node.raw,
              line: node.line,
            });
          } else if (node.command === 'with') {
            profile.transitionCount++;
          }
          break;
        case 'python_block':
          profile.pythonBlockCount++;
          break;
        case 'python_line':
          profile.pythonBlockCount++;
          break;
        case 'menu':
          profile.choicePoints++;
          break;
        case 'if_block':
          if (depth + 1 > profile.branchDepth) {
            profile.branchDepth = depth + 1;
          }
          break;
      }

      if (node.children.length > 0) {
        const nextDepth = node.type === 'if_block' ? depth + 1 : depth;
        this.walkNodes(node.children, profile, nextDepth);
      }
    }
  }

  private calculateComplexity(profile: SceneProfile): 'low' | 'medium' | 'high' | 'critical' {
    const loads = profile.resourceLoads.length;
    const transitions = profile.transitionCount;
    const labels = profile.labelCount;

    if (labels > 50 || loads > 30 || transitions > 50) return 'critical';
    if (labels > 20 || loads > 15 || transitions > 20) return 'high';
    if (labels > 10 || transitions > 10) return 'medium';
    return 'low';
  }

  private generateWarnings(profile: SceneProfile): void {
    if (profile.transitionCount > 20) {
      profile.warnings.push({
        message: localize(
          `High transition density (${profile.transitionCount} transitions)`,
          `トランジション密度が高い (${profile.transitionCount} トランジション)`,
        ),
        severity: 'warning',
      });
    }

    if (profile.pythonBlockCount > 15) {
      profile.warnings.push({
        message: localize(
          `Many Python blocks (${profile.pythonBlockCount} blocks)`,
          `Pythonブロックが多い (${profile.pythonBlockCount} ブロック)`,
        ),
        severity: 'warning',
      });
    }

    const imageLoads = profile.resourceLoads.filter(r => r.type === 'image').length;
    if (imageLoads > 20) {
      profile.warnings.push({
        message: localize(
          `Many image loads in one file (${imageLoads} images)`,
          `1ファイル内の画像読み込みが多い (${imageLoads} 画像)`,
        ),
        severity: 'warning',
      });
    }

    if (profile.branchDepth > 5) {
      profile.warnings.push({
        message: localize(
          `Deep branch nesting (depth ${profile.branchDepth})`,
          `分岐のネストが深い (深さ ${profile.branchDepth})`,
        ),
        severity: 'critical',
      });
    }
  }

  private showResults(profiles: SceneProfile[]): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('RenPy Code Profiler');
    }
    const ch = this.outputChannel;
    ch.clear();

    ch.appendLine(localize(
      '=== RenPy Code: Project Performance Profile ===',
      '=== RenPy Code: プロジェクトパフォーマンスプロファイル ===',
    ));
    ch.appendLine('');

    // Summary
    const totalLabels = profiles.reduce((s, p) => s + p.labelCount, 0);
    const totalDialogue = profiles.reduce((s, p) => s + p.dialogueCount, 0);
    const totalResources = profiles.reduce((s, p) => s + p.resourceLoads.length, 0);
    const totalTransitions = profiles.reduce((s, p) => s + p.transitionCount, 0);
    const totalPython = profiles.reduce((s, p) => s + p.pythonBlockCount, 0);

    ch.appendLine(localize('Project Summary:', 'プロジェクト概要:'));
    ch.appendLine(`  ${localize('Files', 'ファイル')}: ${profiles.length}`);
    ch.appendLine(`  ${localize('Labels', 'ラベル')}: ${totalLabels}`);
    ch.appendLine(`  ${localize('Dialogue lines', 'ダイアログ行')}: ${totalDialogue}`);
    ch.appendLine(`  ${localize('Resource loads', 'リソース読み込み')}: ${totalResources}`);
    ch.appendLine(`  ${localize('Transitions', 'トランジション')}: ${totalTransitions}`);
    ch.appendLine(`  ${localize('Python blocks', 'Pythonブロック')}: ${totalPython}`);
    ch.appendLine('');

    // Per-file breakdown
    ch.appendLine(localize('Per-file Complexity Ranking:', 'ファイル別複雑度ランキング:'));
    ch.appendLine('─'.repeat(60));

    for (const p of profiles) {
      const icon = p.estimatedComplexity === 'critical' ? '[!!!]'
        : p.estimatedComplexity === 'high' ? '[!!]'
        : p.estimatedComplexity === 'medium' ? '[!]'
        : '[OK]';

      ch.appendLine(`${icon} ${p.file}  (${p.estimatedComplexity})`);
      ch.appendLine(`    ${localize('Labels', 'ラベル')}: ${p.labelCount}  ${localize('Dialogue', 'ダイアログ')}: ${p.dialogueCount}  ${localize('Resources', 'リソース')}: ${p.resourceLoads.length}  ${localize('Transitions', 'トランジション')}: ${p.transitionCount}  ${localize('Python', 'Python')}: ${p.pythonBlockCount}  ${localize('Choices', '選択肢')}: ${p.choicePoints}  ${localize('Branch depth', '分岐深度')}: ${p.branchDepth}`);

      for (const w of p.warnings) {
        const wIcon = w.severity === 'critical' ? '!!!' : '!!';
        ch.appendLine(`    [${wIcon}] ${w.message}`);
      }

      ch.appendLine('');
    }

    ch.show();
  }
}
