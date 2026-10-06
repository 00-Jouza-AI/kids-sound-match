export interface EngineItem {
  readonly key: string;
  readonly confusableWith: readonly string[];
  /**
   * Association games ("Who eats what?"): the prompt items this answer goes with (the animals
   * that eat it). Each question is about one of them.
   */
  readonly prompts?: readonly string[];
  /** Mixed game: wrong answers only come from the right answer's group (the parent's own packs stay together). */
  readonly group?: string;
}

/** Pictures in a question. Small packs show fewer when there aren't enough different ones. */
export type ChoiceCount = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10;
