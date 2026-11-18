/** @filedesc Resolve revision pins from AppGraph effective Need trace origins. */

import type {
  EffectiveNeedTrace,
  RenderedNeedTraceSourcePointer,
} from "@formspec-org/types";
import type { SubjectNeedBinding } from "./types.js";

type Source = Pick<RenderedNeedTraceSourcePointer, "artifactSlot" | "jsonPointer">;
type NeedPin = Omit<SubjectNeedBinding, "subject">;

interface TraceNode {
  readonly source: Source;
  readonly anchors: readonly { needId: string; revision: number }[];
  readonly effective: {
    readonly needIds: Readonly<EffectiveNeedTrace["needIds"]>;
    readonly via: readonly Source[];
  };
}

function sourceKey({ artifactSlot, jsonPointer }: Source): string {
  return JSON.stringify([artifactSlot, jsonPointer]);
}

/**
 * Index graph nodes from a validated, digest-paired AppGraph. Run document lint
 * before deriving traces so duplicate item keys are refused (fs-03af).
 */
export function indexOutcomeNeedTraces(nodes: readonly TraceNode[]) {
  const bySource = new Map<string, TraceNode | undefined>();
  for (const node of nodes) {
    const key = sourceKey(node.source);
    bySource.set(key, bySource.has(key) ? undefined : node);
  }
  return (source: Source): NeedPin[] => {
    const effective = bySource.get(sourceKey(source))?.effective;
    if (!effective) return [];

    const pins = new Map<string, NeedPin>();
    for (const origin of effective.via) {
      const originNode = bySource.get(sourceKey(origin));
      for (const { needId, revision } of originNode?.anchors ?? []) {
        pins.set(`${needId}@${revision}`, { needId, needRevision: revision });
      }
    }
    return [...pins.values()];
  };
}
