import type { LoadedPack } from '../../content/types';
import { KidExplore } from './KidExplore';
import { KidGame } from './KidGame';
import { KidMemory } from './KidMemory';
import type { KidConfig, KidSnapshot } from './kidSnapshot';

interface Props {
  pack: LoadedPack;
  /** Every pack, for the sticker album. */
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  telemetryEnabled: boolean;
  onExit: () => void;
}

/** Kid Mode: the question game (also Odd one out), Explore, or the memory game. */
export function KidMode(props: Props) {
  if (props.config.kind === 'explore') {
    return <KidExplore pack={props.pack} config={props.config} snapshot={props.snapshot} onExit={props.onExit} />;
  }
  if (props.config.kind === 'memory') {
    return <KidMemory pack={props.pack} packs={props.packs} config={props.config} snapshot={props.snapshot} onExit={props.onExit} />;
  }
  return <KidGame {...props} />;
}
