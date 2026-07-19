// Daily quests: a rotating pool of lightweight, repeatable bounties offered by
// Marshal Redbrook (zone1.ts). Only 3 of these are available to a character on
// any given server day; the roll (deterministic per character + day) and the
// day boundary live in src/sim/quests/daily_quest_pool.ts, and the availability
// gate lives in computeQuestState (quests/quest_commands.ts).
//
// Data-as-code only (no engine logic here). Merged into the flat QUESTS /
// QUEST_ORDER tables by data.ts exactly like ZONE1_QUESTS / ZONE1_QUEST_ORDER.
// Rewards are deliberately modest (roughly half a comparable Eastbrook Vale
// starter quest) because these repeat every day. Every entry uses
// marshal_redbrook as both giver and turn-in, repeatable + isDaily, and an
// empty itemRewards ({} is valid: itemRewards is Partial<Record<...>>).

import type { QuestDef } from '../types';

export const DAILY_QUESTS: Record<string, QuestDef> = {
  q_daily_wolves: {
    id: 'q_daily_wolves',
    name: 'Daily: Culling the Pack',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The wolves never stop testing the north road, $N. Thin them again today. Slay 6 Forest Wolves and I will see you paid.',
    completionText: 'Good. A day the wolves lose is a day Eastbrook wins.',
    objectives: [
      { type: 'kill', targetMobId: 'forest_wolf', count: 6, label: 'Forest Wolf slain' },
    ],
    xpReward: 120,
    copperReward: 40,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 2,
  },
  q_daily_boars: {
    id: 'q_daily_boars',
    name: 'Daily: Boar Trouble',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The boars in the western meadows root up the fields faster than the farmers can mend them. Put down 6 Wild Boars for me, $N.',
    completionText: 'The farmers will thank you, even if the boars will not.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 6, label: 'Wild Boar slain' }],
    xpReward: 120,
    copperReward: 40,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 2,
  },
  q_daily_spiders: {
    id: 'q_daily_spiders',
    name: 'Daily: Clearing the Webs',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The lurkers in the eastern woods breed faster than we can burn their webs. Cull 5 Sableweb Lurkers today, $N.',
    completionText: 'One less nest to worry about. My thanks.',
    objectives: [
      { type: 'kill', targetMobId: 'webwood_spider', count: 5, label: 'Sableweb Lurker slain' },
    ],
    xpReward: 140,
    copperReward: 50,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 3,
  },
  q_daily_murlocs: {
    id: 'q_daily_murlocs',
    name: 'Daily: Driving Back the Mudfin',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The mudfin creep further up from the lake each night. Drive 5 of them back into the shallows, $N.',
    completionText: 'The lakeshore is a little safer for it. Well done.',
    objectives: [
      { type: 'kill', targetMobId: 'mudfin_murloc', count: 5, label: 'Mudfin Skulker slain' },
    ],
    xpReward: 150,
    copperReward: 55,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 3,
  },
  q_daily_bandits: {
    id: 'q_daily_bandits',
    name: 'Daily: Highway Justice',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The road bandits grow bold again. Bring 4 of them to justice, $N, and the caravans will roll easier.',
    completionText: 'Four fewer knives on the road. The caravans owe you.',
    objectives: [
      { type: 'kill', targetMobId: 'vale_bandit', count: 4, label: 'Vale Bandit slain' },
    ],
    xpReward: 160,
    copperReward: 60,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 4,
  },
  q_daily_rats: {
    id: 'q_daily_rats',
    name: 'Daily: Vermin Control',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The miners cannot keep the burrowing vermin out of the dig. Put down 6 Deeprock Diggers today and they can work in peace.',
    completionText: 'Back to the pick and shovel for the miners. My thanks, $N.',
    objectives: [
      { type: 'kill', targetMobId: 'tunnel_rat', count: 6, label: 'Deeprock Digger slain' },
    ],
    xpReward: 160,
    copperReward: 60,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 4,
  },
  q_daily_fangs: {
    id: 'q_daily_fangs',
    name: 'Daily: A Trophy of Fangs',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The bounty board pays by the fang this season. Bring me 5 Wolf Fangs from the forest wolves, $N.',
    completionText: 'Five clean fangs. The bounty is yours.',
    objectives: [{ type: 'collect', itemId: 'wolf_fang', count: 5, label: 'Wolf Fang' }],
    xpReward: 130,
    copperReward: 45,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 2,
  },
  q_daily_legs: {
    id: 'q_daily_legs',
    name: 'Daily: Spider Parts',
    giverNpcId: 'marshal_redbrook',
    turnInNpcId: 'marshal_redbrook',
    text: 'The apothecary wants spider legs for her tinctures and pays a bounty on each. Gather 5 Spider Legs from the eastern woods, $N.',
    completionText: 'She will be pleased. Here is your share.',
    objectives: [{ type: 'collect', itemId: 'spider_leg', count: 5, label: 'Spider Leg' }],
    xpReward: 140,
    copperReward: 50,
    itemRewards: {},
    repeatable: true,
    isDaily: true,
    minLevel: 3,
  },
};

export const DAILY_QUEST_ORDER = [
  'q_daily_wolves',
  'q_daily_boars',
  'q_daily_spiders',
  'q_daily_murlocs',
  'q_daily_bandits',
  'q_daily_rats',
  'q_daily_fangs',
  'q_daily_legs',
];
