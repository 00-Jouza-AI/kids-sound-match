export interface EngineItem {
  readonly key: string;
  readonly confusableWith: readonly string[];
}

export type ChoiceCount = 2 | 3 | 4;
