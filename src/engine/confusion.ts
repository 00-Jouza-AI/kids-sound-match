import type { EngineItem } from './types';

/**
 * Which items must never appear together. Treated as symmetric even if a manifest lists a
 * pair on one side only (validation reports that separately), so a content mistake can never
 * put a sheep next to a goat.
 */
export class ConfusionGraph {
  private readonly edges = new Map<string, Set<string>>();

  constructor(items: readonly EngineItem[]) {
    for (const item of items) this.edges.set(item.key, new Set());
    for (const item of items) {
      for (const other of item.confusableWith) {
        if (!this.edges.has(other) || other === item.key) continue;
        this.edges.get(item.key)!.add(other);
        this.edges.get(other)!.add(item.key);
      }
    }
  }

  areConfusable(a: string, b: string): boolean {
    return this.edges.get(a)?.has(b) ?? false;
  }
}
