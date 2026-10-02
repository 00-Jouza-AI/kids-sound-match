import type { LoadedPack } from '../../content/types';
import { KidExplore } from './KidExplore';
import { KidGame } from './KidGame';
import { KidMemory } from './KidMemory';
import { KidPeekaboo } from './KidPeekaboo';
import { KidPoint } from './KidPoint';
import { KidScene } from './KidScene';
import type { KidConfig, KidSnapshot } from './kidSnapshot';

interface Props {
  pack: LoadedPack;
  /** Every pack, for the sticker album (and the scenes, which take things from several). */
  packs: readonly LoadedPack[];
  config: KidConfig;
  snapshot: KidSnapshot | null;
  telemetryEnabled: boolean;
  onExit: () => void;
}

/** Kid Mode: the question game (also Odd one out), Explore, Memory, Peekaboo, a scene, or Where's your nose? */
export function KidMode(props: Props) {
  const { pack, packs, config, snapshot, onExit } = props;
  switch (config.kind) {
    case 'explore':
      return <KidExplore pack={pack} config={config} snapshot={snapshot} onExit={onExit} />;
    case 'memory':
      return <KidMemory pack={pack} packs={packs} config={config} snapshot={snapshot} onExit={onExit} />;
    case 'peekaboo':
      return (
        <KidPeekaboo
          pack={pack}
          packs={packs}
          config={config}
          snapshot={snapshot}
          // "بَخ!" lives with the shared game lines, whichever pack is being played.
          lines={pack.feedback.peekaboo ?? packs.find((p) => p.feedback.peekaboo)?.feedback.peekaboo}
          onExit={onExit}
        />
      );
    case 'scene':
      return <KidScene pack={pack} packs={packs} config={config} snapshot={snapshot} onExit={onExit} />;
    case 'point':
      return <KidPoint pack={pack} packs={packs} config={config} snapshot={snapshot} onExit={onExit} />;
    default:
      return <KidGame {...props} />;
  }
}
