import type { QuestProgress, QuestState } from '../sim/types';

export interface IWorldQuests {
  questLog: Map<string, QuestProgress>;
  questsDone: Set<string>;
  // The character's rolled daily quests for the current server day (Marshal
  // Redbrook's rotating dailies), or undefined before the first roll. Read-only
  // mirror: the offline Sim rolls it in talkToNpc; the online ClientWorld mirrors
  // the server's `daily` self field.
  dailyQuests: { day: number; questIds: string[] } | undefined;
  questState(questId: string): QuestState;
  acceptQuest(questId: string, selection?: string): void;
  turnInQuest(questId: string): void;
  abandonQuest(questId: string): void;
  acceptLinkedQuest(questId: string, fromPid: number): void;
}
