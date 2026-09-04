// The wire-ready ChatSenderFlair derived from an account's operator-set flair:
// the AI-operated mark and the streamer links, or undefined when the account
// carries neither (so an unflagged sender adds nothing to the chat frame). A
// pure helper extracted from server/game.ts; tests/chat_sender_flair.test.ts
// pins the three shapes.

import {
  type AccountFlair,
  type ChatSenderFlair,
  wireStreamerLinks,
} from '../src/sim/account_flair';

export function chatSenderFlair(flair: AccountFlair): ChatSenderFlair | undefined {
  const links = wireStreamerLinks(flair);
  if (!flair.ai && !links) return undefined;
  const out: ChatSenderFlair = {};
  if (flair.ai) out.ai = true;
  if (links) out.links = links;
  return out;
}
