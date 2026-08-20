/**
 * DOM-free dialogue-event graph and runner.
 *
 * Labyrinth conversations use this model; the engine presenter decides how a
 * node looks. Combat deliberately does not import it: combat speech remains a
 * short actor-anchored `CombatEvent` bark in combat-choreography.ts.
 */

export type DialogueTone = "speech" | "narration" | "warning" | "hostile";
export type DialogueAccent = "neutral" | "warm" | "cold" | "hostile";
export type DialoguePortraitSide = "left" | "right";

export interface DialogueSpeakerDef {
  /** Stable content id referenced by DialogueNodeDef.speakerId. */
  id: string;
  name: string;
  /** Short identity line displayed beside the name. */
  title: string;
  /** Short current bearing, e.g. "weary" or "bright-eyed". */
  mood: string;
  /** Stable portrait manifest id. Missing art renders an intentional card. */
  portraitId?: string;
  /** Short fallback used until portrait art ships (e.g. "RK", "OM"). */
  placeholderGlyph?: string;
  portraitSide?: DialoguePortraitSide;
  accent?: DialogueAccent;
}

export interface DialogueChoiceDef {
  /** Stable value reported to the host and recorded in session history. */
  id: string;
  label: string;
  /** Omit to end the event after this choice. */
  nextNodeId?: string;
}

export interface DialogueNodeDef {
  id: string;
  speakerId: string;
  text: string;
  tone?: DialogueTone;
  /** Per-beat overrides for reactions without duplicating a speaker. */
  mood?: string;
  accent?: DialogueAccent;
  /** Omit on a terminal line. Mutually exclusive with choices. */
  nextNodeId?: string;
  choices?: readonly DialogueChoiceDef[];
}

export interface DialogueEventDef {
  id: string;
  startNodeId: string;
  speakers: readonly DialogueSpeakerDef[];
  nodes: readonly DialogueNodeDef[];
  /** Story events swallow Escape by default so one accidental press cannot
   * consume a one-time scene. Set true for optional/repeatable conversations. */
  allowSkip?: boolean;
}

export interface DialogueSession {
  eventId: string;
  nodeId: string;
  visitedNodeIds: readonly string[];
  selectedChoiceIds: readonly string[];
}

export interface DialogueAdvanceResult {
  completed: boolean;
  session: DialogueSession;
  selectedChoiceId?: string;
}

export function speakerForNode(
  event: DialogueEventDef,
  node: DialogueNodeDef,
): DialogueSpeakerDef | undefined {
  return event.speakers.find((speaker) => speaker.id === node.speakerId);
}

export function nodeForSession(
  event: DialogueEventDef,
  session: DialogueSession,
): DialogueNodeDef | undefined {
  return event.nodes.find((node) => node.id === session.nodeId);
}

/** Return authoring errors without throwing, for tests/tools/CI validation. */
export function validateDialogueEvent(event: DialogueEventDef): string[] {
  const errors: string[] = [];
  const speakerIds = new Set<string>();
  const nodeIds = new Set<string>();

  if (!event.id.trim()) errors.push("event id must not be empty");
  if (event.speakers.length === 0) errors.push("event must define at least one speaker");
  if (event.nodes.length === 0) errors.push("event must define at least one node");

  for (const speaker of event.speakers) {
    if (!speaker.id.trim()) errors.push("speaker id must not be empty");
    if (speakerIds.has(speaker.id)) errors.push(`duplicate speaker id \"${speaker.id}\"`);
    speakerIds.add(speaker.id);
    if (!speaker.name.trim()) errors.push(`speaker \"${speaker.id}\" has an empty name`);
    if (!speaker.title.trim()) errors.push(`speaker \"${speaker.id}\" has an empty title`);
    if (!speaker.mood.trim()) errors.push(`speaker \"${speaker.id}\" has an empty mood`);
  }

  for (const node of event.nodes) {
    if (!node.id.trim()) errors.push("node id must not be empty");
    if (nodeIds.has(node.id)) errors.push(`duplicate node id \"${node.id}\"`);
    nodeIds.add(node.id);
  }

  if (!nodeIds.has(event.startNodeId)) {
    errors.push(`start node \"${event.startNodeId}\" does not exist`);
  }

  for (const node of event.nodes) {
    if (!speakerIds.has(node.speakerId)) {
      errors.push(`node \"${node.id}\" references unknown speaker \"${node.speakerId}\"`);
    }
    if (!node.text.trim()) errors.push(`node \"${node.id}\" has empty text`);
    if (node.nextNodeId && node.choices?.length) {
      errors.push(`node \"${node.id}\" cannot define both nextNodeId and choices`);
    }
    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      errors.push(`node \"${node.id}\" points to unknown node \"${node.nextNodeId}\"`);
    }
    if (node.choices) {
      if (node.choices.length === 0) errors.push(`node \"${node.id}\" has an empty choices list`);
      const choiceIds = new Set<string>();
      for (const choice of node.choices) {
        if (!choice.id.trim()) errors.push(`node \"${node.id}\" has a choice with an empty id`);
        if (choiceIds.has(choice.id)) {
          errors.push(`node \"${node.id}\" has duplicate choice id \"${choice.id}\"`);
        }
        choiceIds.add(choice.id);
        if (!choice.label.trim()) {
          errors.push(`node \"${node.id}\" choice \"${choice.id}\" has an empty label`);
        }
        if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId)) {
          errors.push(
            `node \"${node.id}\" choice \"${choice.id}\" points to unknown node \"${choice.nextNodeId}\"`,
          );
        }
      }
    }
  }

  // Unreachable nodes are almost always a misspelled edge or abandoned copy.
  // Cycles are allowed; the visited set keeps this authoring pass bounded.
  if (nodeIds.has(event.startNodeId)) {
    const reachable = new Set<string>();
    const pending = [event.startNodeId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const node = event.nodes.find((candidate) => candidate.id === id);
      if (!node) continue;
      if (node.nextNodeId) pending.push(node.nextNodeId);
      for (const choice of node.choices ?? []) {
        if (choice.nextNodeId) pending.push(choice.nextNodeId);
      }
    }
    for (const id of nodeIds) {
      if (!reachable.has(id)) errors.push(`node \"${id}\" is unreachable from \"${event.startNodeId}\"`);
    }
  }

  return errors;
}

export function startDialogue(event: DialogueEventDef): DialogueSession {
  const errors = validateDialogueEvent(event);
  if (errors.length > 0) {
    throw new Error(`Invalid dialogue event \"${event.id}\": ${errors.join("; ")}`);
  }
  return {
    eventId: event.id,
    nodeId: event.startNodeId,
    visitedNodeIds: [],
    selectedChoiceIds: [],
  };
}

/**
 * Advance after the current authored line has been read. Choice nodes require
 * a choice id; ordinary nodes reject one. The final session retains the last
 * node id so observers can still report which line completed the event.
 */
export function advanceDialogue(
  event: DialogueEventDef,
  session: DialogueSession,
  choiceId?: string,
): DialogueAdvanceResult {
  if (session.eventId !== event.id) {
    throw new Error(`Dialogue session belongs to \"${session.eventId}\", not \"${event.id}\"`);
  }
  const node = nodeForSession(event, session);
  if (!node) throw new Error(`Dialogue node \"${session.nodeId}\" does not exist`);

  const visitedNodeIds = [...session.visitedNodeIds, node.id];
  let nextNodeId: string | undefined;
  let selectedChoiceId: string | undefined;
  let selectedChoiceIds = session.selectedChoiceIds;

  if (node.choices?.length) {
    if (!choiceId) throw new Error(`Dialogue node \"${node.id}\" requires a choice`);
    const choice = node.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error(`Dialogue node \"${node.id}\" has no choice \"${choiceId}\"`);
    nextNodeId = choice.nextNodeId;
    selectedChoiceId = choice.id;
    selectedChoiceIds = [...session.selectedChoiceIds, choice.id];
  } else {
    if (choiceId) throw new Error(`Dialogue node \"${node.id}\" does not accept a choice`);
    nextNodeId = node.nextNodeId;
  }

  return {
    completed: nextNodeId === undefined,
    selectedChoiceId,
    session: {
      eventId: event.id,
      nodeId: nextNodeId ?? node.id,
      visitedNodeIds,
      selectedChoiceIds,
    },
  };
}
