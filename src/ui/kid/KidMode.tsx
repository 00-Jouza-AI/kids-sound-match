import type { LoadedPack } from '../../content/types';
import { KidExplore } from './KidExplore';
import { KidGame } from './KidGame';
import type { KidConfig, KidSnapshot } from './kidSnapshot';

interface Props {
  pack: LoadedPack;
  config: KidConfig;
  snapshot: KidSnapshot | null;
  telemetryEnabled: boolean;
  onExit: () => void;
}

/** Kid Mode: the question game, or Explore (tap any animal to hear it). */
export function KidMode(props: Props) {
  if (props.config.kind === 'explore') {
    return <KidExplore pack={props.pack} config={props.config} snapshot={props.snapshot} onExit={props.onExit} />;
  }
  return <KidGame {...props} />;
}
